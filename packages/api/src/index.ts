import { createDb, schools, withTenantContext } from '@monorepo/db';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from './auth';
import inviteRoutes from './invites';
import meRoutes from './me';
import { auditLog } from './middleware/audit-log';
import { tenantContext, type TenantEnv } from './middleware/tenant-context';

const app = new Hono();

// Dev CORS: the web app and Expo's web dev server run on different
// origins/ports than the API. `credentials: true` is what lets the
// browser actually send/receive the better-auth session cookie
// cross-origin - the bearer-token path from mobile doesn't need cookies
// at all, but the web app does.
const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:8081')
  .split(',')
  .map((origin) => origin.trim());
app.use(
  '*',
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// better-auth handles its own routing under /api/auth/* (sign-up, sign-in,
// sign-out, session, etc.) - see src/auth.ts for the adapter/config.
app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));

// Invite-only registration: admin creates an invite, invitee redeems it.
app.route('/', inviteRoutes);

// GET /me: who am I, and which school(s)/role(s) do I belong to.
app.route('/', meRoutes);

// Every route mounted below this point runs with tenant context resolved:
// { userId, schoolId, role, membershipId } attached to c via tenantContext().
// This is the pattern future business routes (students, attendance, etc.)
// should follow.
const APP_DATABASE_URL =
  process.env.APP_DATABASE_URL ??
  'postgresql://app_rw:app_rw_dev_pass@localhost:5433/skldb';
const { db: appDb } = createDb(APP_DATABASE_URL);

const tenantRoutes = new Hono<TenantEnv>();
tenantRoutes.use('*', tenantContext());
// Every mutating request (POST/PUT/PATCH/DELETE) past this point writes an
// audit_logs row - see middleware/audit-log.ts for the entity/entityId rules.
tenantRoutes.use('*', auditLog());

// Demo route proving the middleware resolves context correctly AND that it
// actually drives an RLS-scoped query (not just decoration) - real business
// routes will look like this: read `tenant` off c, open the app_rw
// connection, wrap the query in withTenantContext.
tenantRoutes.get('/context', async (c) => {
  const tenant = c.get('tenant');
  // userId here must be the domain users.id (school_memberships.user_id),
  // not the better-auth authUserId - that's what the schools/users RLS
  // policies compare current_setting('app.user_id') against.
  const visibleSchools = await withTenantContext(appDb, { schoolId: tenant.schoolId, userId: tenant.userId }, (tx) =>
    tx.select().from(schools)
  );
  return c.json({ tenant, visibleSchools });
});

app.route('/', tenantRoutes);

app.get('/', (c) => c.json({ message: 'Hello from API' }));

export default app;
