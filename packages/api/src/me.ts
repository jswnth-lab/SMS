import { db, schoolMemberships, schools, users } from '@monorepo/db';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { auth } from './auth';

// Uses the DB owner connection, not the RLS-scoped app_rw one: this route's
// entire job is figuring out which school(s) the caller belongs to, so
// there's no single school_id to set as tenant context yet - same
// reasoning as auth.ts and invites.ts.
// Chained (not `const r = new Hono(); r.get(...)`) so the route's type
// flows into this module's export - and from there into `AppType` in
// index.ts, which is what makes the hc<AppType>() client see `.me` at all
// instead of typing it `never` (see index.ts's tenantRoutes for the same
// reasoning applied there).
const meRoutes = new Hono().get('/me', async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const [profile] = await db.select().from(users).where(eq(users.authUserId, session.user.id));

  const memberships = profile
    ? await db
        .select({
          schoolId: schools.id,
          schoolName: schools.name,
          schoolSlug: schools.slug,
          role: schoolMemberships.role,
          status: schoolMemberships.status,
        })
        .from(schoolMemberships)
        .innerJoin(schools, eq(schools.id, schoolMemberships.schoolId))
        .where(eq(schoolMemberships.userId, profile.id))
    : [];

  return c.json({
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      phoneNumber: session.user.phoneNumber ?? null,
    },
    profile: profile
      ? {
          id: profile.id,
          nameEn: profile.nameEn,
          nameAr: profile.nameAr,
          phone: profile.phone,
          email: profile.email,
        }
      : null,
    memberships,
  });
});

export default meRoutes;
