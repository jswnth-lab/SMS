import { createDb, schools, withTenantContext } from '@monorepo/db';
import { Hono } from 'hono';

const app = new Hono();

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
