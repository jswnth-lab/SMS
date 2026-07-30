import { db, schoolMemberships, users } from '@monorepo/db';
import { and, eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { auth } from '../auth';

export interface TenantContext {
  /** domain users.id, not the better-auth authUser id */
  userId: string;
  authUserId: string;
  schoolId: string;
  role: (typeof schoolMemberships.$inferSelect)['role'];
  membershipId: string;
}

export type TenantEnv = { Variables: { tenant: TenantContext } };

/**
 * Resolves { userId, schoolId, role, membershipId } for every request and
 * attaches it to context as `tenant`. Runs on the DB owner connection (not
 * app_rw) purely to look up *which* tenant applies - once schoolId is known,
 * route handlers should open their own app_rw connection and call
 * withTenantContext(appDb, { schoolId, userId: authUserId }, ...) to
 * actually query tenant data under RLS.
 *
 * Resolution:
 * - no session -> 401
 * - session but no linked domain profile -> 403 (auth identity exists,
 *   nothing tying it to a school yet)
 * - exactly one active membership -> that's the tenant, no header needed
 * - more than one -> the caller must send X-School-Id; missing or
 *   not-a-member-of-that-school both fail rather than silently guessing
 */
export const tenantContext = (): MiddlewareHandler<TenantEnv> => async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const [profile] = await db.select().from(users).where(eq(users.authUserId, session.user.id));
  if (!profile) {
    return c.json({ error: 'No school profile is linked to this account' }, 403);
  }

  const memberships = await db
    .select()
    .from(schoolMemberships)
    .where(and(eq(schoolMemberships.userId, profile.id), eq(schoolMemberships.status, 'active')));

  if (memberships.length === 0) {
    return c.json({ error: 'No active school membership' }, 403);
  }

  let membership = memberships[0];
  if (memberships.length > 1) {
    const requestedSchoolId = c.req.header('x-school-id');
    if (!requestedSchoolId) {
      return c.json(
        {
          error: 'Multiple school memberships - X-School-Id header is required',
          schools: memberships.map((m) => m.schoolId),
        },
        400
      );
    }
    const match = memberships.find((m) => m.schoolId === requestedSchoolId);
    if (!match) {
      return c.json({ error: 'Not a member of the requested school' }, 403);
    }
    membership = match;
  }

  c.set('tenant', {
    userId: profile.id,
    authUserId: session.user.id,
    schoolId: membership.schoolId,
    role: membership.role,
    membershipId: membership.id,
  });

  return next();
};
