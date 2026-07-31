import { auditLogs, db } from '@monorepo/db';
import type { MiddlewareHandler } from 'hono';
import type { TenantEnv } from './tenant-context';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const ACTION_BY_METHOD: Record<string, string> = {
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value);

/** First path segment is treated as the resource/entity name, e.g. "/students/:id" -> "students". */
function extractEntity(pathname: string): string | null {
  return pathname.split('/').filter(Boolean)[0] ?? null;
}

/**
 * Writes one audit_logs row per successful mutating (POST/PUT/PATCH/DELETE)
 * request under tenantRoutes. Must run after tenantContext() - it reads
 * `tenant` off c to attribute the row to an actor/school; requests where
 * that isn't resolved (nothing under tenantRoutes should hit this) are
 * skipped rather than guessed at, since actor_user_id/school_id are NOT NULL.
 *
 * entity_id is also NOT NULL, so this only logs requests where an id can be
 * determined - from a route param (update/delete) or from an `id` field in
 * the JSON response body (create). Requests where neither is available
 * (e.g. bulk operations) are not logged; add an explicit id to the response
 * if that route needs an audit trail.
 */
export const auditLog = (): MiddlewareHandler<TenantEnv> => async (c, next) => {
  if (!MUTATING_METHODS.has(c.req.method)) {
    return next();
  }

  let requestBody: unknown = {};
  try {
    requestBody = await c.req.raw.clone().json();
  } catch {
    requestBody = {};
  }

  await next();

  if (c.res.status < 200 || c.res.status >= 300) {
    return;
  }

  const tenant = c.get('tenant');
  if (!tenant) {
    return;
  }

  const entity = extractEntity(new URL(c.req.url).pathname);
  if (!entity) {
    return;
  }

  let entityId = Object.values(c.req.param()).find(isUuid);
  if (!entityId) {
    try {
      const body = (await c.res.clone().json()) as { id?: unknown };
      if (isUuid(body?.id)) entityId = body.id;
    } catch {
      // response wasn't JSON, or had no `id` field
    }
  }
  if (!entityId) {
    return;
  }

  await db.insert(auditLogs).values({
    schoolId: tenant.schoolId,
    actorUserId: tenant.userId,
    action: ACTION_BY_METHOD[c.req.method] ?? c.req.method,
    entity,
    entityId,
    diff: (requestBody ?? {}) as object,
  });
};
