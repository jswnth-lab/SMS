import { zValidator } from '@hono/zod-validator';
import { assessments, marks, students, withTenantContext } from '@monorepo/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { appDb } from '../db';
import type { TenantEnv } from '../middleware/tenant-context';
import { assertCanManageAssessment } from './assessments';

const bulkSchema = z.object({
  assessmentId: z.string().uuid(),
  marks: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        score: z.number().min(0),
        remark: z.string().nullish(),
      })
    )
    .min(1),
});

const marksRoutes = new Hono<TenantEnv>()
  // Upsert on (assessmentId, studentId) - unlike attendance's (studentId,
  // date, periodNo) key, neither column here is ever null, so a single
  // ON CONFLICT DO UPDATE statement is correct and doesn't need the
  // per-row select-then-insert-or-update dance attendance.ts needs.
  .post('/marks/bulk', zValidator('json', bulkSchema), async (c) => {
    const tenant = c.get('tenant');
    const { assessmentId, marks: entries } = c.req.valid('json');
    const { schoolId, userId, membershipId } = tenant;

    const result = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
      const [assessment] = await tx.select().from(assessments).where(and(eq(assessments.id, assessmentId), eq(assessments.schoolId, schoolId)));
      if (!assessment) return { status: 404 as const, error: 'Assessment not found' };

      await assertCanManageAssessment(tenant, assessment.sectionId, assessment.subjectId, assessment.termId, tx);

      const sectionStudents = await tx
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.sectionId, assessment.sectionId), eq(students.schoolId, schoolId)));
      const validStudentIds = new Set(sectionStudents.map((s) => s.id));

      const maxMarks = Number(assessment.maxMarks);
      const errors: { studentId: string; message: string }[] = [];
      for (const entry of entries) {
        if (!validStudentIds.has(entry.studentId)) {
          errors.push({ studentId: entry.studentId, message: 'student is not in this assessment\'s section' });
        } else if (entry.score > maxMarks) {
          errors.push({ studentId: entry.studentId, message: `score ${entry.score} exceeds max_marks ${maxMarks}` });
        }
      }
      if (errors.length > 0) return { status: 422 as const, errors };

      const saved = await tx
        .insert(marks)
        .values(
          entries.map((entry) => ({
            schoolId,
            assessmentId,
            studentId: entry.studentId,
            score: String(entry.score),
            remark: entry.remark,
            enteredBy: membershipId,
          }))
        )
        .onConflictDoUpdate({
          target: [marks.assessmentId, marks.studentId],
          set: {
            score: sql`excluded.score`,
            remark: sql`excluded.remark`,
            enteredBy: sql`excluded.entered_by`,
            updatedAt: new Date(),
          },
        })
        .returning();

      return { status: 200 as const, saved };
    });

    if (result.status === 404) return c.json({ error: result.error }, 404);
    if (result.status === 422) return c.json({ error: 'Invalid marks - nothing was saved', errors: result.errors }, 422);
    return c.json(result.saved);
  })
  // Roster for an assessment with any existing marks merged in - mirrors
  // the attendance roster endpoint's shape for the same reason: it's what
  // powers a marks-entry UI, one row per student whether or not they've
  // been graded yet.
  .get('/assessments/:assessmentId/marks', zValidator('param', z.object({ assessmentId: z.string().uuid() })), async (c) => {
    const tenant = c.get('tenant');
    const { assessmentId } = c.req.valid('param');
    const { schoolId, userId } = tenant;

    const result = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
      const [assessment] = await tx.select().from(assessments).where(and(eq(assessments.id, assessmentId), eq(assessments.schoolId, schoolId)));
      if (!assessment) return null;
      await assertCanManageAssessment(tenant, assessment.sectionId, assessment.subjectId, assessment.termId, tx);

      const sectionStudents = await tx
        .select({ id: students.id, nameEn: students.nameEn, admissionNo: students.admissionNo })
        .from(students)
        .where(and(eq(students.sectionId, assessment.sectionId), eq(students.schoolId, schoolId)));

      const existingMarks =
        sectionStudents.length === 0
          ? []
          : await tx
              .select()
              .from(marks)
              .where(and(eq(marks.assessmentId, assessmentId), inArray(marks.studentId, sectionStudents.map((s) => s.id))));
      const markByStudentId = new Map(existingMarks.map((m) => [m.studentId, m]));

      return sectionStudents.map((s) => {
        const mark = markByStudentId.get(s.id);
        return {
          studentId: s.id,
          nameEn: s.nameEn,
          admissionNo: s.admissionNo,
          score: mark?.score ?? null,
          remark: mark?.remark ?? null,
        };
      });
    });

    if (!result) return c.json({ error: 'Not found' }, 404);
    return c.json(result);
  });

export default marksRoutes;
