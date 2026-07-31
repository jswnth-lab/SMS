import { zValidator } from '@hono/zod-validator';
import {
  calculateWeightedTotal,
  canAccessStudent,
  ForbiddenError,
  mapGradeFromScheme,
  requireRole,
} from '@monorepo/core';
import { assessments, marks, reportCards, students, subjects, terms, withTenantContext, type Database } from '@monorepo/db';
import { and, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { appDb } from '../db';
import type { TenantEnv } from '../middleware/tenant-context';

const idParam = z.object({ id: z.string().uuid() });
const studentIdParam = z.object({ studentId: z.string().uuid() });
const termQuery = z.object({ termId: z.string().uuid().optional() });
const computeSchema = z.object({ studentId: z.string().uuid(), termId: z.string().uuid() });

interface SubjectResult {
  subjectId: string;
  subjectName: string;
  total: number | null;
  grade: string | null;
  assessments: { assessmentId: string; name: string; score: number; maxMarks: number; weight: number }[];
}

interface ReportCardPayload {
  studentId: string;
  termId: string;
  subjects: SubjectResult[];
  overallAverage: number | null;
  overallGrade: string | null;
  computedAt: string;
}

async function computePayload(tx: Database, schoolId: string, studentId: string, termId: string): Promise<ReportCardPayload> {
  const [student] = await tx.select().from(students).where(and(eq(students.id, studentId), eq(students.schoolId, schoolId)));
  if (!student) throw new Error('Student not found');

  const termAssessments = await tx
    .select()
    .from(assessments)
    .where(and(eq(assessments.schoolId, schoolId), eq(assessments.termId, termId), eq(assessments.sectionId, student.sectionId)));

  const assessmentIds = termAssessments.map((a) => a.id);
  const studentMarks =
    assessmentIds.length === 0
      ? []
      : await tx.select().from(marks).where(and(eq(marks.studentId, studentId), inArray(marks.assessmentId, assessmentIds)));
  const markByAssessmentId = new Map(studentMarks.map((m) => [m.assessmentId, m]));

  const subjectIds = [...new Set(termAssessments.map((a) => a.subjectId))];
  const subjectRows =
    subjectIds.length === 0 ? [] : await tx.select().from(subjects).where(inArray(subjects.id, subjectIds));
  const subjectNameById = new Map(subjectRows.map((s) => [s.id, s.nameEn]));

  const subjectResults: SubjectResult[] = subjectIds.map((subjectId) => {
    const subjectAssessments = termAssessments.filter((a) => a.subjectId === subjectId);
    const graded = subjectAssessments
      .map((a) => ({ assessment: a, mark: markByAssessmentId.get(a.id) }))
      .filter((x): x is { assessment: (typeof subjectAssessments)[number]; mark: NonNullable<typeof x.mark> } => !!x.mark);

    const total = calculateWeightedTotal(
      graded.map(({ assessment, mark }) => ({
        score: Number(mark.score),
        maxMarks: Number(assessment.maxMarks),
        weight: Number(assessment.weight),
      }))
    );

    return {
      subjectId,
      subjectName: subjectNameById.get(subjectId) ?? subjectId,
      total,
      grade: total == null ? null : mapGradeFromScheme(total),
      assessments: graded.map(({ assessment, mark }) => ({
        assessmentId: assessment.id,
        name: assessment.name,
        score: Number(mark.score),
        maxMarks: Number(assessment.maxMarks),
        weight: Number(assessment.weight),
      })),
    };
  });

  const gradedSubjectTotals = subjectResults.map((s) => s.total).filter((t): t is number => t != null);
  const overallAverage =
    gradedSubjectTotals.length === 0 ? null : gradedSubjectTotals.reduce((a, b) => a + b, 0) / gradedSubjectTotals.length;

  return {
    studentId,
    termId,
    subjects: subjectResults,
    overallAverage,
    overallGrade: overallAverage == null ? null : mapGradeFromScheme(overallAverage),
    computedAt: new Date().toISOString(),
  };
}

const reportCardsRoutes = new Hono<TenantEnv>()
  // Computing (and re-computing) a report card is an admin action - it's
  // the step that reviews/finalizes a student's grades for a term, not a
  // routine per-assessment task like entering marks.
  .post('/report-cards/compute', zValidator('json', computeSchema), async (c) => {
    const tenant = c.get('tenant');
    requireRole('admin')(tenant);
    const { studentId, termId } = c.req.valid('json');
    const { schoolId, userId } = tenant;

    const result = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
      const [term] = await tx.select().from(terms).where(and(eq(terms.id, termId), eq(terms.schoolId, schoolId)));
      if (!term) return { status: 404 as const };

      const [existing] = await tx
        .select()
        .from(reportCards)
        .where(and(eq(reportCards.studentId, studentId), eq(reportCards.termId, termId)));
      // Never silently overwrite a published report card's payload - a
      // parent may already have seen it. Re-opening one for correction is
      // a distinct, explicit action this endpoint doesn't perform.
      if (existing?.status === 'published') return { status: 409 as const };

      let payload: ReportCardPayload;
      try {
        payload = await computePayload(tx, schoolId, studentId, termId);
      } catch {
        return { status: 404 as const };
      }

      const [saved] = existing
        ? await tx.update(reportCards).set({ payload }).where(eq(reportCards.id, existing.id)).returning()
        : await tx.insert(reportCards).values({ schoolId, studentId, termId, status: 'draft', payload }).returning();
      return { status: 200 as const, row: saved };
    });

    if (result.status === 404) return c.json({ error: 'Student or term not found' }, 404);
    if (result.status === 409) return c.json({ error: 'This report card is already published' }, 409);
    return c.json(result.row);
  })
  .post('/report-cards/:id/publish', zValidator('param', idParam), async (c) => {
    const tenant = c.get('tenant');
    requireRole('admin')(tenant);
    const { id } = c.req.valid('param');
    const { schoolId, userId } = tenant;

    const result = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
      const [existing] = await tx.select().from(reportCards).where(and(eq(reportCards.id, id), eq(reportCards.schoolId, schoolId)));
      if (!existing) return { status: 404 as const };
      if (existing.status === 'published') return { status: 409 as const };

      const [updated] = await tx
        .update(reportCards)
        .set({ status: 'published', publishedAt: new Date() })
        .where(eq(reportCards.id, id))
        .returning();
      return { status: 200 as const, row: updated };
    });

    if (result.status === 404) return c.json({ error: 'Not found' }, 404);
    if (result.status === 409) return c.json({ error: 'Already published' }, 409);
    return c.json(result.row);
  })
  // Drafts are visible to admins only - a teacher/parent/student can only
  // see a report card once it's published, even if they'd otherwise pass
  // canAccessStudent for the underlying student.
  .get('/report-cards/:id', zValidator('param', idParam), async (c) => {
    const tenant = c.get('tenant');
    const { id } = c.req.valid('param');
    const { schoolId, userId } = tenant;

    const row = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
      const [reportCard] = await tx.select().from(reportCards).where(and(eq(reportCards.id, id), eq(reportCards.schoolId, schoolId)));
      if (!reportCard) return null;
      if (tenant.role !== 'admin') {
        const allowed = await canAccessStudent(tenant, reportCard.studentId, tx);
        if (!allowed || reportCard.status !== 'published') throw new ForbiddenError('Not allowed to view this report card');
      }
      return reportCard;
    });
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json(row);
  })
  .get('/report-cards/students/:studentId', zValidator('param', studentIdParam), zValidator('query', termQuery), async (c) => {
    const tenant = c.get('tenant');
    const { studentId } = c.req.valid('param');
    const { termId } = c.req.valid('query');
    const { schoolId, userId } = tenant;

    const rows = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
      if (tenant.role !== 'admin') {
        const allowed = await canAccessStudent(tenant, studentId, tx);
        if (!allowed) throw new ForbiddenError('Not allowed to view this student’s report cards');
      }
      const conditions = [eq(reportCards.studentId, studentId), eq(reportCards.schoolId, schoolId)];
      if (termId) conditions.push(eq(reportCards.termId, termId));
      const all = await tx.select().from(reportCards).where(and(...conditions));
      return tenant.role === 'admin' ? all : all.filter((r) => r.status === 'published');
    });

    return c.json(rows);
  });

export default reportCardsRoutes;
