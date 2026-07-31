import { zValidator } from '@hono/zod-validator';
import { requireRole } from '@monorepo/core';
import { academicYears, withTenantContext } from '@monorepo/db';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { appDb } from '../db';
import { handleDbError } from '../lib/db-errors';
import type { TenantEnv } from '../middleware/tenant-context';

const idParam = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  name: z.string().min(1),
  startsOn: z.string(),
  endsOn: z.string(),
});

const updateSchema = createSchema.partial();

// Chained (rather than `const r = new Hono(); r.get(...); r.post(...);`) so
// each call's route/schema type accumulates on the exported instance - that
// accumulated type is what makes the RPC-typed client in src/client.ts
// actually know about these routes instead of just `Hono<TenantEnv>`.
const academicYearsRoutes = new Hono<TenantEnv>()
  .get('/', async (c) => {
    const { schoolId, userId } = c.get('tenant');
    const rows = await withTenantContext(appDb, { schoolId, userId }, (tx) =>
      tx.select().from(academicYears).where(eq(academicYears.schoolId, schoolId))
    );
    return c.json(rows);
  })
  .get('/:id', zValidator('param', idParam), async (c) => {
    const { id } = c.req.valid('param');
    const { schoolId, userId } = c.get('tenant');
    const [row] = await withTenantContext(appDb, { schoolId, userId }, (tx) =>
      tx.select().from(academicYears).where(and(eq(academicYears.id, id), eq(academicYears.schoolId, schoolId)))
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
        tx.insert(academicYears).values({ ...body, schoolId: tenant.schoolId }).returning()
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
          .update(academicYears)
          .set(body)
          .where(and(eq(academicYears.id, id), eq(academicYears.schoolId, tenant.schoolId)))
          .returning()
      );
      if (!row) return c.json({ error: 'Not found' }, 404);
      return c.json(row);
    } catch (err) {
      return handleDbError(c, err);
    }
  })
  // Sets this academic year as current and unsets every other one for the
  // school, in a single transaction (there's no partial-unique-index for
  // "at most one current row" in the schema, so this is enforced here).
  .post('/:id/set-current', zValidator('param', idParam), async (c) => {
    const tenant = c.get('tenant');
    requireRole('admin')(tenant);
    const { id } = c.req.valid('param');
    const [row] = await withTenantContext(appDb, { schoolId: tenant.schoolId, userId: tenant.userId }, async (tx) => {
      const [target] = await tx
        .select()
        .from(academicYears)
        .where(and(eq(academicYears.id, id), eq(academicYears.schoolId, tenant.schoolId)));
      if (!target) return [undefined];

      await tx.update(academicYears).set({ isCurrent: false }).where(eq(academicYears.schoolId, tenant.schoolId));
      return tx.update(academicYears).set({ isCurrent: true }).where(eq(academicYears.id, id)).returning();
    });
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json(row);
  })
  .delete('/:id', zValidator('param', idParam), async (c) => {
    const tenant = c.get('tenant');
    requireRole('admin')(tenant);
    const { id } = c.req.valid('param');
    try {
      const [row] = await withTenantContext(appDb, { schoolId: tenant.schoolId, userId: tenant.userId }, (tx) =>
        tx
          .delete(academicYears)
          .where(and(eq(academicYears.id, id), eq(academicYears.schoolId, tenant.schoolId)))
          .returning()
      );
      if (!row) return c.json({ error: 'Not found' }, 404);
      return c.json({ status: 'ok' });
    } catch (err) {
      return handleDbError(c, err);
    }
  });

export default academicYearsRoutes;
