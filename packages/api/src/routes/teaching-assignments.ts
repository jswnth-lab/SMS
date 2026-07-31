import { zValidator } from '@hono/zod-validator';
import { requireRole } from '@monorepo/core';
import { teachingAssignments, withTenantContext } from '@monorepo/db';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { appDb } from '../db';
import { handleDbError } from '../lib/db-errors';
import type { TenantEnv } from '../middleware/tenant-context';

const idParam = z.object({ id: z.string().uuid() });
const listQuery = z.object({
  teacherMembershipId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
});

const createSchema = z.object({
  teacherMembershipId: z.string().uuid(),
  sectionId: z.string().uuid(),
  subjectId: z.string().uuid(),
  academicYearId: z.string().uuid(),
});

const updateSchema = createSchema.partial();

const teachingAssignmentsRoutes = new Hono<TenantEnv>()
  .get('/', zValidator('query', listQuery), async (c) => {
    const { teacherMembershipId, sectionId, academicYearId } = c.req.valid('query');
    const { schoolId, userId } = c.get('tenant');
    const conditions = [eq(teachingAssignments.schoolId, schoolId)];
    if (teacherMembershipId) conditions.push(eq(teachingAssignments.teacherMembershipId, teacherMembershipId));
    if (sectionId) conditions.push(eq(teachingAssignments.sectionId, sectionId));
    if (academicYearId) conditions.push(eq(teachingAssignments.academicYearId, academicYearId));
    const rows = await withTenantContext(appDb, { schoolId, userId }, (tx) =>
      tx.select().from(teachingAssignments).where(and(...conditions))
    );
    return c.json(rows);
  })
  .get('/:id', zValidator('param', idParam), async (c) => {
    const { id } = c.req.valid('param');
    const { schoolId, userId } = c.get('tenant');
    const [row] = await withTenantContext(appDb, { schoolId, userId }, (tx) =>
      tx
        .select()
        .from(teachingAssignments)
        .where(and(eq(teachingAssignments.id, id), eq(teachingAssignments.schoolId, schoolId)))
    );
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json(row);
  })
  .post('/', zValidator('json', createSchema), async (c) => {
    const tenant = c.get('tenant');
    requireRole('admin')(tenant);
    const body = c.req.valid('json');
    try {
      const [row] = await withTenantContext(appDb, { schoolId: tenant.schoolId, userId: tenant.userId }, (tx) =>
        tx.insert(teachingAssignments).values({ ...body, schoolId: tenant.schoolId }).returning()
      );
      return c.json(row, 201);
    } catch (err) {
      return handleDbError(c, err);
    }
  })
  .patch('/:id', zValidator('param', idParam), zValidator('json', updateSchema), async (c) => {
    const tenant = c.get('tenant');
    requireRole('admin')(tenant);
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    try {
      const [row] = await withTenantContext(appDb, { schoolId: tenant.schoolId, userId: tenant.userId }, (tx) =>
        tx
          .update(teachingAssignments)
          .set(body)
          .where(and(eq(teachingAssignments.id, id), eq(teachingAssignments.schoolId, tenant.schoolId)))
          .returning()
      );
      if (!row) return c.json({ error: 'Not found' }, 404);
      return c.json(row);
    } catch (err) {
      return handleDbError(c, err);
    }
  })
  .delete('/:id', zValidator('param', idParam), async (c) => {
    const tenant = c.get('tenant');
    requireRole('admin')(tenant);
    const { id } = c.req.valid('param');
    try {
      const [row] = await withTenantContext(appDb, { schoolId: tenant.schoolId, userId: tenant.userId }, (tx) =>
        tx
          .delete(teachingAssignments)
          .where(and(eq(teachingAssignments.id, id), eq(teachingAssignments.schoolId, tenant.schoolId)))
          .returning()
      );
      if (!row) return c.json({ error: 'Not found' }, 404);
      return c.json({ status: 'ok' });
    } catch (err) {
      return handleDbError(c, err);
    }
  });

export default teachingAssignmentsRoutes;
