import { createDb, schools, withTenantContext } from '@monorepo/db';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from './auth';
import inviteRoutes from './invites';

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

// Runtime queries go through the restricted app_rw connection, which is
// subject to the row-level security policies in
// packages/db/migrations/0005_row_level_security.sql - unlike the owner
// connection that drizzle-kit/db:seed use, which bypasses RLS entirely.
const APP_DATABASE_URL =
  process.env.APP_DATABASE_URL ??
  'postgresql://app_rw:app_rw_dev_pass@localhost:5433/skldb';
const { db: appDb } = createDb(APP_DATABASE_URL);

app.get('/', (c) => c.json({ message: 'Hello from API' }));

// Placeholder until real auth/session middleware exists: reads tenant
// context straight off headers instead of a verified JWT/session. Once
// auth is built, a middleware should populate c.set('schoolId'/'userId')
// from the verified session and this route (and every other data route)
// should read from there instead.
app.get('/me/school', async (c) => {
  const schoolId = c.req.header('x-school-id');
  const userId = c.req.header('x-user-id');
  if (!schoolId) {
    return c.json({ error: 'x-school-id header required' }, 400);
  }

  const rows = await withTenantContext(appDb, { schoolId, userId }, (tx) =>
    tx.select().from(schools)
  );
  return c.json({ schools: rows });
});

export default app;
