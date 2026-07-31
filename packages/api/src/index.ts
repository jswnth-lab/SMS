import { ForbiddenError } from '@monorepo/core';
import { schools, withTenantContext } from '@monorepo/db';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from './auth';
import { appDb } from './db';
import inviteRoutes from './invites';
import meRoutes from './me';
import { auditLog } from './middleware/audit-log';
import { tenantContext, type TenantEnv } from './middleware/tenant-context';
import academicYearsRoutes from './routes/academic-years';
import gradeLevelsRoutes from './routes/grade-levels';
import guardiansRoutes from './routes/guardians';
import importRoutes from './routes/import';
import sectionsRoutes from './routes/sections';
import studentsRoutes from './routes/students';
import subjectsRoutes from './routes/subjects';
import teachingAssignmentsRoutes from './routes/teaching-assignments';
import termsRoutes from './routes/terms';

// Every route mounted on tenantRoutes runs with tenant context resolved
// ({ userId, schoolId, role, membershipId } attached to c via
// tenantContext()) and gets an audit_logs row written for free on any
// successful mutation (auditLog()) - see middleware/tenant-context.ts and
// middleware/audit-log.ts. Chained (not `const r = new Hono(); r.get(...)`)
// so the accumulated route/schema types flow into `AppType` below, which is
// what makes src/client.ts's hc<AppType>() client actually typed.
const tenantRoutes = new Hono<TenantEnv>()
  .use('*', tenantContext())
  .use('*', auditLog())
  .route('/academic-years', academicYearsRoutes)
  .route('/terms', termsRoutes)
  .route('/grade-levels', gradeLevelsRoutes)
  .route('/sections', sectionsRoutes)
  .route('/subjects', subjectsRoutes)
  .route('/teaching-assignments', teachingAssignmentsRoutes)
  .route('/students', studentsRoutes)
  // Absolute paths (guardians, nested /students/:id/guardians, and
  // /student-guardians/:id/verify|revoke) so they're mounted at '/' instead
  // of getting an extra prefix.
  .route('/', guardiansRoutes)
  .route('/', importRoutes)
  // Demo route proving the middleware resolves context correctly AND that it
  // actually drives an RLS-scoped query (not just decoration).
  .get('/context', async (c) => {
    const tenant = c.get('tenant');
    // userId here must be the domain users.id (school_memberships.user_id),
    // not the better-auth authUserId - that's what the schools/users RLS
    // policies compare current_setting('app.user_id') against.
    const visibleSchools = await withTenantContext(appDb, { schoolId: tenant.schoolId, userId: tenant.userId }, (tx) =>
      tx.select().from(schools)
    );
    return c.json({ tenant, visibleSchools });
  });

const app = new Hono()
  // Dev CORS: the web app and Expo's web dev server run on different
  // origins/ports than the API. `credentials: true` is what lets the
  // browser actually send/receive the better-auth session cookie
  // cross-origin - the bearer-token path from mobile doesn't need cookies
  // at all, but the web app does.
  .use(
    '*',
    cors({
      origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:8081')
        .split(',')
        .map((origin) => origin.trim()),
      credentials: true,
    })
  )
  // better-auth handles its own routing under /api/auth/* (sign-up, sign-in,
  // sign-out, session, etc.) - see src/auth.ts for the adapter/config.
  .on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw))
  // Invite-only registration: admin creates an invite, invitee redeems it.
  .route('/', inviteRoutes)
  // GET /me: who am I, and which school(s)/role(s) do I belong to.
  .route('/', meRoutes)
  .route('/', tenantRoutes)
  .get('/', (c) => c.json({ message: 'Hello from API' }))
  .onError((err, c) => {
    if (err instanceof ForbiddenError) {
      return c.json({ error: err.message }, 403);
    }
    console.error(err);
    return c.json({ error: 'Internal server error' }, 500);
  });

export type AppType = typeof app;
export default app;
