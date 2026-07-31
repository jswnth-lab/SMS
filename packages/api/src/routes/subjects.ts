import { zValidator } from '@hono/zod-validator';
import { requireRole } from '@monorepo/core';
import { subjects, withTenantContext } from '@monorepo/db';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { appDb } from '../db';
import { handleDbError } from '../lib/db-errors';
import type { TenantEnv } from '../middleware/tenant-context';

const idParam = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  nameEn: z.string().min(1),
  nameAr: z.string().nullish(),
  code: z.string().min(1),
});

const updateSchema = createSchema.partial();

const subjectsRoutes = new Hono<TenantEnv>()
  .get('/', async (c) => {
    const { schoolId, userId } = c.get('tenant');
    const rows = await withTenantContext(appDb, { schoolId, userId }, (tx) =>
      tx.select().from(subjects).where(eq(subjects.schoolId, schoolId))
    );
    return c.json(rows);
  })
  .get('/:id', zValidator('param', idParam), async (c) => {
    const { id } = c.req.valid('param');
    const { schoolId, userId } = c.get('tenant');
    const [row] = await withTenantContext(appDb, { schoolId, userId }, (tx) =>
      tx.select().from(subjects).where(and(eq(subjects.id, id), eq(subjects.schoolId, schoolId)))
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
        tx.insert(subjects).values({ ...body, schoolId: tenant.schoolId }).returning()
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
          .update(subjects)
          .set(body)
          .where(and(eq(subjects.id, id), eq(subjects.schoolId, tenant.schoolId)))
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
          .delete(subjects)
          .where(and(eq(subjects.id, id), eq(subjects.schoolId, tenant.schoolId)))
          .returning()
      );
      if (!row) return c.json({ error: 'Not found' }, 404);
      return c.json({ status: 'ok' });
    } catch (err) {
      return handleDbError(c, err);
    }
  });

export default subjectsRoutes;
