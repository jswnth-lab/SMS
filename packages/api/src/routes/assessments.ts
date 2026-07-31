import { zValidator } from '@hono/zod-validator';
import { ForbiddenError } from '@monorepo/core';
import { assessments, teachingAssignments, terms, withTenantContext, type Database } from '@monorepo/db';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { appDb } from '../db';
import { handleDbError } from '../lib/db-errors';
import type { TenantContext, TenantEnv } from '../middleware/tenant-context';

const idParam = z.object({ id: z.string().uuid() });
const listQuery = z.object({
  sectionId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  termId: z.string().uuid().optional(),
});

const createSchema = z.object({
  sectionId: z.string().uuid(),
  subjectId: z.string().uuid(),
  termId: z.string().uuid(),
  name: z.string().min(1),
  type: z.string().min(1),
  maxMarks: z.number().positive(),
  weight: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const updateSchema = createSchema.partial();

/**
 * Admin can manage any assessment in the school. A teacher may only manage
 * one for a (section, subject) they actually teach - resolved via
 * teaching_assignments for the *term's* academic year, not just any year,
 * so a teacher's assignment history doesn't grant access to terms they
 * never taught.
 */
export async function assertCanManageAssessment(
  tenant: TenantContext,
  sectionId: string,
  subjectId: string,
  termId: string,
  tx: Database
): Promise<void> {
  if (tenant.role === 'admin') return;
  if (tenant.role !== 'teacher') throw new ForbiddenError('Not allowed to manage this assessment');

  const [term] = await tx
    .select({ academicYearId: terms.academicYearId })
    .from(terms)
    .where(and(eq(terms.id, termId), eq(terms.schoolId, tenant.schoolId)));
  if (!term) throw new ForbiddenError('Not allowed to manage this assessment');

  const [assignment] = await tx
    .select({ id: teachingAssignments.id })
    .from(teachingAssignments)
    .where(
      and(
        eq(teachingAssignments.teacherMembershipId, tenant.membershipId),
        eq(teachingAssignments.sectionId, sectionId),
        eq(teachingAssignments.subjectId, subjectId),
        eq(teachingAssignments.academicYearId, term.academicYearId)
      )
    );
  if (!assignment) throw new ForbiddenError('Not allowed to manage this assessment');
}

/** (sectionId, subjectId) pairs this teacher is assigned to teach, for filtering list views. */
async function teacherAssignmentPairs(tenant: TenantContext, tx: Database): Promise<Set<string>> {
  const rows = await tx
    .select({ sectionId: teachingAssignments.sectionId, subjectId: teachingAssignments.subjectId })
    .from(teachingAssignments)
    .where(eq(teachingAssignments.teacherMembershipId, tenant.membershipId));
  return new Set(rows.map((r) => `${r.sectionId}:${r.subjectId}`));
}

const assessmentsRoutes = new Hono<TenantEnv>()
  .get('/assessments', zValidator('query', listQuery), async (c) => {
    const tenant = c.get('tenant');
    const { sectionId, subjectId, termId } = c.req.valid('query');
    const { schoolId, userId } = tenant;

    const rows = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
      const conditions = [eq(assessments.schoolId, schoolId)];
      if (sectionId) conditions.push(eq(assessments.sectionId, sectionId));
      if (subjectId) conditions.push(eq(assessments.subjectId, subjectId));
      if (termId) conditions.push(eq(assessments.termId, termId));
      const all = await tx.select().from(assessments).where(and(...conditions));

      if (tenant.role === 'admin') return all;
      const pairs = await teacherAssignmentPairs(tenant, tx);
      return all.filter((a) => pairs.has(`${a.sectionId}:${a.subjectId}`));
    });

    return c.json(rows);
  })
  .get('/assessments/:id', zValidator('param', idParam), async (c) => {
    const tenant = c.get('tenant');
    const { id } = c.req.valid('param');
    const { schoolId, userId } = tenant;

    const row = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
      const [assessment] = await tx.select().from(assessments).where(and(eq(assessments.id, id), eq(assessments.schoolId, schoolId)));
      if (!assessment) return null;
      await assertCanManageAssessment(tenant, assessment.sectionId, assessment.subjectId, assessment.termId, tx);
      return assessment;
    });
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json(row);
  })
  .post('/assessments', zValidator('json', createSchema), async (c) => {
    const tenant = c.get('tenant');
    const body = c.req.valid('json');
    const { schoolId, userId } = tenant;

    try {
      const row = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
        await assertCanManageAssessment(tenant, body.sectionId, body.subjectId, body.termId, tx);
        const [inserted] = await tx
          .insert(assessments)
          .values({
            schoolId,
            sectionId: body.sectionId,
            subjectId: body.subjectId,
            termId: body.termId,
            name: body.name,
            type: body.type,
            maxMarks: String(body.maxMarks),
            weight: String(body.weight),
            date: body.date,
          })
          .returning();
        return inserted;
      });
      return c.json(row, 201);
    } catch (err) {
      return handleDbError(c, err);
    }
  })
  .patch('/assessments/:id', zValidator('param', idParam), zValidator('json', updateSchema), async (c) => {
    const tenant = c.get('tenant');
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const { schoolId, userId } = tenant;

    try {
      const row = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
        const [existing] = await tx.select().from(assessments).where(and(eq(assessments.id, id), eq(assessments.schoolId, schoolId)));
        if (!existing) return null;

        const merged = {
          sectionId: body.sectionId ?? existing.sectionId,
          subjectId: body.subjectId ?? existing.subjectId,
          termId: body.termId ?? existing.termId,
        };
        await assertCanManageAssessment(tenant, merged.sectionId, merged.subjectId, merged.termId, tx);

        const [updated] = await tx
          .update(assessments)
          .set({
            ...body,
            maxMarks: body.maxMarks !== undefined ? String(body.maxMarks) : undefined,
            weight: body.weight !== undefined ? String(body.weight) : undefined,
          })
          .where(eq(assessments.id, id))
          .returning();
        return updated;
      });
      if (!row) return c.json({ error: 'Not found' }, 404);
      return c.json(row);
    } catch (err) {
      return handleDbError(c, err);
    }
  })
  .delete('/assessments/:id', zValidator('param', idParam), async (c) => {
    const tenant = c.get('tenant');
    const { id } = c.req.valid('param');
    const { schoolId, userId } = tenant;

    try {
      const row = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
        const [existing] = await tx.select().from(assessments).where(and(eq(assessments.id, id), eq(assessments.schoolId, schoolId)));
        if (!existing) return null;
        await assertCanManageAssessment(tenant, existing.sectionId, existing.subjectId, existing.termId, tx);
        const [deleted] = await tx.delete(assessments).where(eq(assessments.id, id)).returning();
        return deleted;
      });
      if (!row) return c.json({ error: 'Not found' }, 404);
      return c.json({ status: 'ok' });
    } catch (err) {
      return handleDbError(c, err);
    }
  });

export default assessmentsRoutes;
