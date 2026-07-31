import { zValidator } from '@hono/zod-validator';
import { requireRole } from '@monorepo/core';
import { students, withTenantContext } from '@monorepo/db';
import { and, asc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { appDb } from '../db';
import { handleDbError } from '../lib/db-errors';
import type { TenantEnv } from '../middleware/tenant-context';

const idParam = z.object({ id: z.string().uuid() });

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sectionId: z.string().uuid().optional(),
  status: z.enum(['active', 'left', 'graduated']).optional(),
  search: z.string().trim().min(1).optional(),
  includeDeleted: z.coerce.boolean().default(false),
});

const createSchema = z.object({
  admissionNo: z.string().min(1),
  nameEn: z.string().min(1),
  nameAr: z.string().nullish(),
  dob: z.string(),
  gender: z.enum(['male', 'female']),
  sectionId: z.string().uuid(),
  joinedOn: z.string(),
});

const updateSchema = createSchema.partial().extend({
  status: z.enum(['active', 'left', 'graduated']).optional(),
});

const studentsRoutes = new Hono<TenantEnv>()
  .get('/', zValidator('query', listQuery), async (c) => {
    const { page, pageSize, sectionId, status, search, includeDeleted } = c.req.valid('query');
    const { schoolId, userId } = c.get('tenant');

    const conditions = [eq(students.schoolId, schoolId)];
    if (!includeDeleted) conditions.push(isNull(students.deletedAt));
    if (sectionId) conditions.push(eq(students.sectionId, sectionId));
    if (status) conditions.push(eq(students.status, status));
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(ilike(students.nameEn, pattern), ilike(students.nameAr, pattern), ilike(students.admissionNo, pattern))!
      );
    }
    const where = and(...conditions);

    const { rows, total } = await withTenantContext(appDb, { schoolId, userId }, async (tx) => {
      const [rows, [{ count }]] = await Promise.all([
        tx
          .select()
          .from(students)
          .where(where)
          .orderBy(asc(students.nameEn))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        tx.select({ count: sql<number>`count(*)::int` }).from(students).where(where),
      ]);
      return { rows, total: count };
    });

    return c.json({ data: rows, page, pageSize, total });
  })
  .get('/:id', zValidator('param', idParam), async (c) => {
    const { id } = c.req.valid('param');
    const { schoolId, userId } = c.get('tenant');
    const [row] = await withTenantContext(appDb, { schoolId, userId }, (tx) =>
      tx.select().from(students).where(and(eq(students.id, id), eq(students.schoolId, schoolId)))
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
        tx.insert(students).values({ ...body, schoolId: tenant.schoolId }).returning()
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
          .update(students)
          .set(body)
          .where(and(eq(students.id, id), eq(students.schoolId, tenant.schoolId)))
          .returning()
      );
      if (!row) return c.json({ error: 'Not found' }, 404);
      return c.json(row);
    } catch (err) {
      return handleDbError(c, err);
    }
  })
  // Soft delete: sets deleted_at rather than removing the row, since
  // attendance/marks/report_cards/student_guardians all reference students
  // and this project's convention is no cascade deletes (see rls-verify.ts
  // cleanup notes) - a real delete would just fail with a FK violation.
  .delete('/:id', zValidator('param', idParam), async (c) => {
    const tenant = c.get('tenant');
    requireRole('admin')(tenant);
    const { id } = c.req.valid('param');
    const [row] = await withTenantContext(appDb, { schoolId: tenant.schoolId, userId: tenant.userId }, (tx) =>
      tx
        .update(students)
        .set({ deletedAt: new Date() })
        .where(and(eq(students.id, id), eq(students.schoolId, tenant.schoolId), isNull(students.deletedAt)))
        .returning()
    );
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json({ status: 'ok' });
  });

export default studentsRoutes;
