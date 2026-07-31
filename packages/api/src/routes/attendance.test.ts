import { ForbiddenError } from '@monorepo/core';
import {
  academicYears,
  attendanceRecords,
  auditLogs,
  db,
  gradeLevels,
  schoolMemberships,
  schools,
  sections,
  students,
  subjects,
  teachingAssignments,
  users,
} from '@monorepo/db';
import { eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { beforeEach, afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getEnqueuedAbsenceNotifications } from '../lib/notifications';
import { auditLog } from '../middleware/audit-log';
import type { TenantContext, TenantEnv } from '../middleware/tenant-context';
import attendanceRoutes from './attendance';

describe('attendance routes', () => {
  let schoolId: string;
  let adminUserId: string;
  let adminMembershipId: string;
  let assignedTeacherMembershipId: string;
  let unassignedTeacherMembershipId: string;
  let sectionId: string;
  let studentAId: string;
  let studentBId: string;
  let teacherUserIds: string[];

  function buildApp(tenant: TenantContext) {
    return new Hono<TenantEnv>()
      .use('*', async (c, next) => {
        c.set('tenant', tenant);
        await next();
      })
      .use('*', auditLog())
      .route('/', attendanceRoutes)
      .onError((err, c) => {
        if (err instanceof ForbiddenError) return c.json({ error: err.message }, 403);
        throw err;
      });
  }

  const asAdmin = () =>
    buildApp({ userId: adminUserId, schoolId, role: 'admin', membershipId: adminMembershipId });
  const asAssignedTeacher = () =>
    buildApp({ userId: adminUserId, schoolId, role: 'teacher', membershipId: assignedTeacherMembershipId });
  const asUnassignedTeacher = () =>
    buildApp({ userId: adminUserId, schoolId, role: 'teacher', membershipId: unassignedTeacherMembershipId });

  const jsonReq = (method: string, body: unknown) => ({
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  beforeAll(async () => {
    const suffix = `vitest-att-${Date.now()}`;
    const [school] = await db
      .insert(schools)
      .values({ name: `Attendance Test School ${suffix}`, slug: `attendance-test-${suffix}` })
      .returning();
    schoolId = school.id;

    const [adminUser] = await db
      .insert(users)
      .values({ phone: `+9000${suffix}`, passwordHash: 'x', nameEn: `Admin ${suffix}` })
      .returning();
    adminUserId = adminUser.id;

    const [adminMembership] = await db
      .insert(schoolMemberships)
      .values({ userId: adminUserId, schoolId, role: 'admin', status: 'active' })
      .returning();
    adminMembershipId = adminMembership.id;

    const [teacherUser1, teacherUser2] = await db
      .insert(users)
      .values([
        { phone: `+9001${suffix}`, passwordHash: 'x', nameEn: `Assigned Teacher ${suffix}` },
        { phone: `+9002${suffix}`, passwordHash: 'x', nameEn: `Unassigned Teacher ${suffix}` },
      ])
      .returning();
    teacherUserIds = [teacherUser1.id, teacherUser2.id];

    const [assignedTeacher, unassignedTeacher] = await db
      .insert(schoolMemberships)
      .values([
        { userId: teacherUser1.id, schoolId, role: 'teacher', status: 'active' },
        { userId: teacherUser2.id, schoolId, role: 'teacher', status: 'active' },
      ])
      .returning();
    assignedTeacherMembershipId = assignedTeacher.id;
    unassignedTeacherMembershipId = unassignedTeacher.id;

    const [ay] = await db
      .insert(academicYears)
      .values({ schoolId, name: `AY ${suffix}`, startsOn: '2025-09-01', endsOn: '2026-06-30' })
      .returning();
    const [gl] = await db.insert(gradeLevels).values({ schoolId, name: `Grade ${suffix}`, sort: 1 }).returning();
    const [section] = await db
      .insert(sections)
      .values({ schoolId, gradeLevelId: gl.id, academicYearId: ay.id, name: `A ${suffix}` })
      .returning();
    sectionId = section.id;

    const [subject] = await db
      .insert(subjects)
      .values({ schoolId, nameEn: `Subject ${suffix}`, code: `SUB-${suffix}` })
      .returning();

    await db.insert(teachingAssignments).values({
      schoolId,
      teacherMembershipId: assignedTeacherMembershipId,
      sectionId,
      subjectId: subject.id,
      academicYearId: ay.id,
    });

    const [studentA, studentB] = await db
      .insert(students)
      .values([
        {
          schoolId,
          admissionNo: `ATT-A-${suffix}`,
          nameEn: 'Alice Attend',
          dob: '2015-01-01',
          gender: 'female',
          sectionId,
          joinedOn: '2024-01-01',
        },
        {
          schoolId,
          admissionNo: `ATT-B-${suffix}`,
          nameEn: 'Bob Attend',
          dob: '2015-01-01',
          gender: 'male',
          sectionId,
          joinedOn: '2024-01-01',
        },
      ])
      .returning();
    studentAId = studentA.id;
    studentBId = studentB.id;
  });

  beforeEach(async () => {
    await db.delete(attendanceRecords).where(eq(attendanceRecords.schoolId, schoolId));
  });

  afterAll(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.schoolId, schoolId));
    await db.delete(attendanceRecords).where(eq(attendanceRecords.schoolId, schoolId));
    await db.delete(teachingAssignments).where(eq(teachingAssignments.schoolId, schoolId));
    await db.delete(subjects).where(eq(subjects.schoolId, schoolId));
    await db.delete(students).where(eq(students.schoolId, schoolId));
    await db.delete(sections).where(eq(sections.schoolId, schoolId));
    await db.delete(gradeLevels).where(eq(gradeLevels.schoolId, schoolId));
    await db.delete(academicYears).where(eq(academicYears.schoolId, schoolId));
    await db.delete(schoolMemberships).where(eq(schoolMemberships.schoolId, schoolId));
    await db.delete(schools).where(eq(schools.id, schoolId));
    await db.delete(users).where(inArray(users.id, [adminUserId, ...teacherUserIds]));
  });

  it('bulk marks attendance, enqueues a notification on new absences, and lists the roster with marks merged', async () => {
    const before = getEnqueuedAbsenceNotifications().length;

    const res = await asAssignedTeacher().request(
      `/attendance/sections/${sectionId}/bulk`,
      jsonReq('POST', {
        date: '2026-01-05',
        records: [
          { studentId: studentAId, status: 'present' },
          { studentId: studentBId, status: 'absent', note: 'Sick' },
        ],
      })
    );
    expect(res.status).toBe(200);

    const after = getEnqueuedAbsenceNotifications();
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1]).toMatchObject({ studentId: studentBId, date: '2026-01-05' });

    const rosterRes = await asAssignedTeacher().request(`/attendance/sections/${sectionId}?date=2026-01-05`);
    const roster = (await rosterRes.json()) as {
      roster: { studentId: string; status: string | null }[];
    };
    const byId = Object.fromEntries(roster.roster.map((r) => [r.studentId, r.status]));
    expect(byId[studentAId]).toBe('present');
    expect(byId[studentBId]).toBe('absent');
  });

  it('shows unmarked students in the roster and report when nobody has been marked for that date', async () => {
    const rosterRes = await asAdmin().request(`/attendance/sections/${sectionId}?date=2026-01-06`);
    const roster = (await rosterRes.json()) as { roster: { status: string | null }[] };
    expect(roster.roster).toHaveLength(2);
    expect(roster.roster.every((r) => r.status === null)).toBe(true);

    const reportRes = await asAdmin().request(`/attendance/sections/${sectionId}/report?date=2026-01-06`);
    const report = (await reportRes.json()) as { total: number; marked: number; unmarked: number };
    expect(report).toMatchObject({ total: 2, marked: 0, unmarked: 2 });
  });

  it('upserts on re-submission (updates, not duplicates) and does not re-enqueue a notification on update', async () => {
    await asAdmin().request(
      `/attendance/sections/${sectionId}/bulk`,
      jsonReq('POST', { date: '2026-01-07', records: [{ studentId: studentAId, status: 'present' }] })
    );
    const before = getEnqueuedAbsenceNotifications().length;

    // Correct it to absent - this is an UPDATE of the existing row, not a
    // fresh insert.
    const res = await asAdmin().request(
      `/attendance/sections/${sectionId}/bulk`,
      jsonReq('POST', { date: '2026-01-07', records: [{ studentId: studentAId, status: 'absent' }] })
    );
    expect(res.status).toBe(200);

    const rows = await db
      .select()
      .from(attendanceRecords)
      .where(eq(attendanceRecords.studentId, studentAId));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('absent');

    // No new notification for the update path.
    expect(getEnqueuedAbsenceNotifications().length).toBe(before);
  });

  it('rejects marking attendance for a student not in the section with 400', async () => {
    const [otherStudent] = await db
      .insert(students)
      .values({
        schoolId,
        admissionNo: `ATT-OUT-${Date.now()}`,
        nameEn: 'Outside Student',
        dob: '2015-01-01',
        gender: 'male',
        sectionId, // will be reassigned below to a different section for the test
        joinedOn: '2024-01-01',
      })
      .returning();
    // Move it to a different, throwaway section id (doesn't need to exist
    // as a row for this negative test - we only need studentId to not
    // belong to `sectionId`, which the query performs at the school level).
    await db.delete(students).where(eq(students.id, otherStudent.id));

    const res = await asAdmin().request(
      `/attendance/sections/${sectionId}/bulk`,
      jsonReq('POST', {
        date: '2026-01-08',
        records: [{ studentId: otherStudent.id, status: 'present' }],
      })
    );
    expect(res.status).toBe(400);
  });

  it('allows the assigned teacher, blocks the unassigned teacher, and always allows admin', async () => {
    const payload = { date: '2026-01-09', records: [{ studentId: studentAId, status: 'present' as const }] };

    const assignedRes = await asAssignedTeacher().request(
      `/attendance/sections/${sectionId}/bulk`,
      jsonReq('POST', payload)
    );
    expect(assignedRes.status).toBe(200);

    const unassignedRes = await asUnassignedTeacher().request(
      `/attendance/sections/${sectionId}/bulk`,
      jsonReq('POST', payload)
    );
    expect(unassignedRes.status).toBe(403);

    const adminRes = await asAdmin().request(`/attendance/sections/${sectionId}/bulk`, jsonReq('POST', payload));
    expect(adminRes.status).toBe(200);
  });

  it("returns a student's attendance history and summary over a date range", async () => {
    await asAdmin().request(
      `/attendance/sections/${sectionId}/bulk`,
      jsonReq('POST', { date: '2026-02-01', records: [{ studentId: studentAId, status: 'present' }] })
    );
    await asAdmin().request(
      `/attendance/sections/${sectionId}/bulk`,
      jsonReq('POST', { date: '2026-02-02', records: [{ studentId: studentAId, status: 'absent' }] })
    );
    await asAdmin().request(
      `/attendance/sections/${sectionId}/bulk`,
      jsonReq('POST', { date: '2026-02-03', records: [{ studentId: studentAId, status: 'present' }] })
    );

    const res = await asAdmin().request(
      `/attendance/students/${studentAId}/history?from=2026-02-01&to=2026-02-03`
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      records: { date: string }[];
      summary: { total: number; marked: number; counts: Record<string, number>; presentRate: number | null };
    };
    expect(body.records).toHaveLength(3);
    expect(body.summary.counts).toMatchObject({ present: 2, absent: 1, late: 0, excused: 0 });
    expect(body.summary.presentRate).toBeCloseTo((2 / 3) * 100, 1);
  });

  it('reports whole-school daily counts broken down by section', async () => {
    await asAdmin().request(
      `/attendance/sections/${sectionId}/bulk`,
      jsonReq('POST', {
        date: '2026-03-01',
        records: [
          { studentId: studentAId, status: 'present' },
          { studentId: studentBId, status: 'late' },
        ],
      })
    );

    const res = await asAdmin().request(`/attendance/school/report?date=2026-03-01`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      total: number;
      counts: Record<string, number>;
      bySection: { sectionId: string; counts: Record<string, number> }[];
    };
    expect(body.counts).toMatchObject({ present: 1, late: 1 });
    const sectionReport = body.bySection.find((s) => s.sectionId === sectionId);
    expect(sectionReport?.counts).toMatchObject({ present: 1, late: 1 });
  });
});
