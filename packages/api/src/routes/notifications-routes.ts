import { zValidator } from '@hono/zod-validator';
import { notifications, withTenantContext } from '@monorepo/db';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { appDb } from '../db';
import type { TenantEnv } from '../middleware/tenant-context';

const idParam = z.object({ id: z.string().uuid() });
const listQuery = z.object({ unreadOnly: z.coerce.boolean().default(false) });

const notificationsRoutes = new Hono<TenantEnv>()
  .get('/notifications', zValidator('query', listQuery), async (c) => {
    const { unreadOnly } = c.req.valid('query');
    const { schoolId, userId } = c.get('tenant');
    const rows = await withTenantContext(appDb, { schoolId, userId }, (tx) => {
      const conditions = [eq(notifications.userId, userId), eq(notifications.schoolId, schoolId)];
      if (unreadOnly) conditions.push(isNull(notifications.readAt));
      return tx.select().from(notifications).where(and(...conditions)).orderBy(desc(notifications.createdAt));
    });
    return c.json(rows);
  })
  .post('/notifications/:id/read', zValidator('param', idParam), async (c) => {
    const { id } = c.req.valid('param');
    const { schoolId, userId } = c.get('tenant');
    const [row] = await withTenantContext(appDb, { schoolId, userId }, (tx) =>
      // Scoped to this caller's own userId, not just schoolId - otherwise
      // any member of the school could mark someone else's notification
      // read by guessing its id.
      tx
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.id, id), eq(notifications.userId, userId), eq(notifications.schoolId, schoolId)))
        .returning()
    );
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json(row);
  });

export default notificationsRoutes;
