import { zValidator } from '@hono/zod-validator';
import { canAccessSection, canAccessStudent, ForbiddenError, requireRole } from '@monorepo/core';
import { attendanceRecords, sections, students, withTenantContext } from '@monorepo/db';
import { and, asc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { appDb } from '../db';
import { enqueueJob } from '../lib/jobs';
import type { TenantContext, TenantEnv } from '../middleware/tenant-context';

const sectionIdParam = z.object({ sectionId: z.string().uuid() });
const studentIdParam = z.object({ studentId: z.string().uuid() });

const dateQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodNo: z.coerce.number().int().optional(),
});

const reportQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

const historyQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const bulkSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodNo: z.number().int().nullish(),
  records: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        status: z.enum(['present', 'absent', 'late', 'excused']),
        note: z.string().nullish(),
      })
    )
    .min(1),
});

const STATUSES = ['present', 'absent', 'late', 'excused'] as const;

/** Only admins, or a teacher actually assigned to this section, may mark/read its attendance. */
async function assertCanMarkAttendance(tenant: TenantContext, sectionId: string) {
  if (tenant.role === 'admin') return;
  const allowed =
    tenant.role === 'teacher' &&
    (await withTenantContext(appDb, { schoolId: tenant.schoolId, userId: tenant.userId }, (tx) =>
      canAccessSection(tenant, sectionId, tx)
    ));
  if (!allowed) throw new ForbiddenError('Not allowed to manage attendance for this section');
}

const attendanceRoutes = new Hono<TenantEnv>()
  // Upserts on the (studentId, date, periodNo) unique key - but done as an
  // explicit select-then-insert-or-update per row rather than
  // `ON CONFLICT`, because Postgres treats every NULL periodNo as distinct
  // for uniqueness purposes: two whole-day (periodNo = null) rows for the
  // same student/date would NOT collide under the DB's own unique
  // constraint, so ON CONFLICT could never match them either.
  .post('/attendance/sections/:sectionId/bulk', zValidator('param', sectionIdParam), zValidator('json', bulkSchema), async (c) => {
    const tenant = c.get('tenant');
    const { sectionId } = c.req.valid('param');
    const { date, periodNo, records } = c.req.valid('json');
    await assertCanMarkAttendance(tenant, sectionId);

    const { schoolId, userId, membershipId } = tenant;
    const result = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
      const sectionStudents = await tx
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.sectionId, sectionId), eq(students.schoolId, schoolId)));
      const validStudentIds = new Set(sectionStudents.map((s) => s.id));
      const invalidStudentIds = records.map((r) => r.studentId).filter((id) => !validStudentIds.has(id));
      if (invalidStudentIds.length > 0) {
        return { error: `Students not in this section: ${invalidStudentIds.join(', ')}` as const };
      }

      const saved = [];
      const newAbsences: { studentId: string; attendanceRecordId: string; date: string }[] = [];
      for (const record of records) {
        const periodCondition = periodNo == null ? isNull(attendanceRecords.periodNo) : eq(attendanceRecords.periodNo, periodNo);
        const [existing] = await tx
          .select()
          .from(attendanceRecords)
          .where(and(eq(attendanceRecords.studentId, record.studentId), eq(attendanceRecords.date, date), periodCondition));

        if (existing) {
          const [updated] = await tx
            .update(attendanceRecords)
            .set({
              status: record.status,
              note: record.note,
              markedByMembershipId: membershipId,
              markedAt: new Date(),
            })
            .where(eq(attendanceRecords.id, existing.id))
            .returning();
          saved.push(updated);
        } else {
          const [inserted] = await tx
            .insert(attendanceRecords)
            .values({
              schoolId,
              studentId: record.studentId,
              date,
              periodNo: periodNo ?? null,
              status: record.status,
              note: record.note,
              markedByMembershipId: membershipId,
            })
            .returning();
          saved.push(inserted);

          // Only on a brand-new absent record, not on an update to an
          // existing one - matches "on absence insert" literally, so
          // correcting a typo from absent to present and back doesn't
          // re-fire a notification each time. Collected here and sent
          // after the transaction commits (see below), not from inside
          // it - notifyGuardiansOfAbsence writes through a different
          // connection (the DB owner, not app_rw - see lib/notifications.ts),
          // so firing it before this transaction is known to have
          // committed could notify guardians about an absence that then
          // got rolled back by a later error in the same batch.
          if (inserted.status === 'absent') {
            newAbsences.push({ studentId: inserted.studentId, attendanceRecordId: inserted.id, date: inserted.date });
          }
        }
      }
      return { saved, newAbsences };
    });

    if ('error' in result) return c.json({ error: result.error }, 400);
    for (const absence of result.newAbsences) {
      await enqueueJob(schoolId, 'notify.absence', { schoolId, studentId: absence.studentId, attendanceRecordId: absence.attendanceRecordId, date: absence.date });
    }
    return c.json(result.saved);
  })
  // Roster for a section/date(+period) with any existing marks merged in -
  // this is what powers the marking UI: every active student appears once,
  // whether or not they've been marked yet.
  .get('/attendance/sections/:sectionId', zValidator('param', sectionIdParam), zValidator('query', dateQuery), async (c) => {
    const tenant = c.get('tenant');
    const { sectionId } = c.req.valid('param');
    const { date, periodNo } = c.req.valid('query');
    await assertCanMarkAttendance(tenant, sectionId);

    const { schoolId, userId } = tenant;
    const roster = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
      const sectionStudents = await tx
        .select({ id: students.id, nameEn: students.nameEn, admissionNo: students.admissionNo })
        .from(students)
        .where(and(eq(students.sectionId, sectionId), eq(students.schoolId, schoolId), isNull(students.deletedAt)))
        .orderBy(asc(students.nameEn));

      const periodCondition = periodNo == null ? isNull(attendanceRecords.periodNo) : eq(attendanceRecords.periodNo, periodNo);
      const marks = await tx
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.schoolId, schoolId),
            eq(attendanceRecords.date, date),
            periodCondition,
            inArray(attendanceRecords.studentId, sectionStudents.map((s) => s.id))
          )
        );
      const markByStudentId = new Map(marks.map((m) => [m.studentId, m]));

      return sectionStudents.map((s) => {
        const mark = markByStudentId.get(s.id);
        return {
          studentId: s.id,
          nameEn: s.nameEn,
          admissionNo: s.admissionNo,
          attendanceRecordId: mark?.id ?? null,
          status: mark?.status ?? null,
          note: mark?.note ?? null,
        };
      });
    });

    return c.json({ date, periodNo: periodNo ?? null, roster });
  })
  // A section's daily counts by status, including students nobody has
  // marked yet ("unmarked") - powers a daily report view for one section.
  .get('/attendance/sections/:sectionId/report', zValidator('param', sectionIdParam), zValidator('query', reportQuery), async (c) => {
    const tenant = c.get('tenant');
    const { sectionId } = c.req.valid('param');
    const { date } = c.req.valid('query');
    await assertCanMarkAttendance(tenant, sectionId);

    const { schoolId, userId } = tenant;
    const report = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
      const sectionStudents = await tx
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.sectionId, sectionId), eq(students.schoolId, schoolId), isNull(students.deletedAt)));
      const studentIds = sectionStudents.map((s) => s.id);

      const marks =
        studentIds.length === 0
          ? []
          : await tx
              .select({ status: attendanceRecords.status })
              .from(attendanceRecords)
              .where(and(eq(attendanceRecords.date, date), inArray(attendanceRecords.studentId, studentIds)));

      return summarize(studentIds.length, marks.map((m) => m.status));
    });

    return c.json({ date, sectionId, ...report });
  })
  // Whole-school daily counts, broken down per section - a school-wide
  // aggregate, so admin-only (unlike the per-section endpoints, which a
  // teacher can also reach for sections they're assigned to).
  .get('/attendance/school/report', zValidator('query', reportQuery), async (c) => {
    const tenant = c.get('tenant');
    requireRole('admin')(tenant);
    const { date } = c.req.valid('query');
    const { schoolId, userId } = tenant;

    const { total, bySection } = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
      const allSections = await tx.select({ id: sections.id, name: sections.name }).from(sections).where(eq(sections.schoolId, schoolId));
      const allStudents = await tx
        .select({ id: students.id, sectionId: students.sectionId })
        .from(students)
        .where(and(eq(students.schoolId, schoolId), isNull(students.deletedAt)));
      const studentIds = allStudents.map((s) => s.id);
      const marks =
        studentIds.length === 0
          ? []
          : await tx
              .select({ studentId: attendanceRecords.studentId, status: attendanceRecords.status })
              .from(attendanceRecords)
              .where(and(eq(attendanceRecords.date, date), inArray(attendanceRecords.studentId, studentIds)));
      const statusByStudentId = new Map(marks.map((m) => [m.studentId, m.status]));

      const bySection = allSections.map((section) => {
        const studentsInSection = allStudents.filter((s) => s.sectionId === section.id);
        const statuses = studentsInSection.map((s) => statusByStudentId.get(s.id)).filter((s): s is (typeof STATUSES)[number] => !!s);
        return { sectionId: section.id, sectionName: section.name, ...summarize(studentsInSection.length, statuses) };
      });

      return { total: summarize(studentIds.length, marks.map((m) => m.status)), bySection };
    });

    return c.json({ date, ...total, bySection });
  })
  // One student's attendance history in a date range, plus a summary
  // (counts by status and a present-rate percentage) over that range.
  // Without a check here, any authenticated member of the school (any
  // role) could read any other student's attendance by guessing/enumerating
  // studentId - canAccessStudent enforces the same per-role rules used
  // everywhere else in the app (admin: same school; teacher: teaches the
  // student's section; parent: verified non-revoked guardian link;
  // student: self).
  .get('/attendance/students/:studentId/history', zValidator('param', studentIdParam), zValidator('query', historyQuery), async (c) => {
    const tenant = c.get('tenant');
    const { studentId } = c.req.valid('param');
    const { from, to } = c.req.valid('query');
    const { schoolId, userId } = tenant;

    const records = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
      const allowed = await canAccessStudent(tenant, studentId, tx);
      if (!allowed) throw new ForbiddenError('Not allowed to view this student’s attendance');

      const conditions = [eq(attendanceRecords.studentId, studentId), eq(attendanceRecords.schoolId, schoolId)];
      if (from) conditions.push(gte(attendanceRecords.date, from));
      if (to) conditions.push(lte(attendanceRecords.date, to));
      return tx.select().from(attendanceRecords).where(and(...conditions)).orderBy(asc(attendanceRecords.date));
    });

    const summary = summarize(records.length, records.map((r) => r.status));
    return c.json({ studentId, records, summary });
  });

function summarize(total: number, statuses: (typeof STATUSES)[number][]) {
  const counts: Record<(typeof STATUSES)[number], number> = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const status of statuses) counts[status] += 1;
  const marked = statuses.length;
  const presentRate = marked === 0 ? null : Math.round((counts.present / marked) * 1000) / 10;
  return { total, marked, unmarked: total - marked, counts, presentRate };
}

export default attendanceRoutes;
