import { zValidator } from '@hono/zod-validator';
import { requireRole } from '@monorepo/core';
import { auditLogs, users, withTenantContext } from '@monorepo/db';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { appDb } from '../db';
import type { TenantEnv } from '../middleware/tenant-context';

const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });

// Admin-only "recent activity" feed - the audit_logs table is written to
// automatically by middleware/audit-log.ts on every mutation; this is the
// first (and only, so far) route that reads it back.
const auditLogsRoutes = new Hono<TenantEnv>().get('/audit-logs', zValidator('query', listQuery), async (c) => {
  const tenant = c.get('tenant');
  requireRole('admin')(tenant);
  const { limit } = c.req.valid('query');
  const { schoolId, userId } = tenant;

  const rows = await withTenantContext(appDb, { schoolId, userId }, (tx) =>
    tx
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entity: auditLogs.entity,
        entityId: auditLogs.entityId,
        at: auditLogs.at,
        actorName: users.nameEn,
      })
      .from(auditLogs)
      .innerJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(eq(auditLogs.schoolId, schoolId))
      .orderBy(desc(auditLogs.at))
      .limit(limit)
  );

  return c.json(rows);
});

export default auditLogsRoutes;
