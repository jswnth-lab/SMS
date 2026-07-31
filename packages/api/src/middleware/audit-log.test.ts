import { auditLogs, db, schools, users } from '@monorepo/db';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditLog } from './audit-log';
import type { TenantEnv } from './tenant-context';

// Exercises the middleware directly against a throwaway Hono app rather than
// the full API - it only depends on `tenant` being set on context (which
// tenantContext() normally does), so a fake `tenant`-injecting middleware
// is enough to test the audit-log behavior in isolation from auth/sessions.
describe('auditLog middleware', () => {
  let schoolId: string;
  let userId: string;

  beforeAll(async () => {
    const suffix = `vitest-audit-${Date.now()}`;
    const [school] = await db
      .insert(schools)
      .values({ name: `Audit Test School ${suffix}`, slug: `audit-test-${suffix}` })
      .returning();
    schoolId = school.id;

    const [user] = await db
      .insert(users)
      .values({ phone: `+2000${suffix}`, passwordHash: 'x', nameEn: `Actor ${suffix}` })
      .returning();
    userId = user.id;
  });

  afterAll(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.schoolId, schoolId));
    await db.delete(schools).where(eq(schools.id, schoolId));
    await db.delete(users).where(eq(users.id, userId));
  });

  beforeEach(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.schoolId, schoolId));
  });

  function buildApp() {
    const app = new Hono<TenantEnv>();
    app.use('*', async (c, next) => {
      c.set('tenant', { userId, schoolId, role: 'admin', membershipId: '00000000-0000-0000-0000-000000000000' });
      await next();
    });
    app.use('*', auditLog());
    app.post('/widgets', async (c) => c.json({ id: crypto.randomUUID(), created: true }));
    app.put('/widgets/:id', async (c) => c.json({ updated: true }));
    app.delete('/widgets/:id', async (c) => c.json({ deleted: true }));
    app.post('/widgets-fail', async (c) => c.json({ error: 'nope' }, 400));
    app.get('/widgets', async (c) => c.json({ list: [] }));
    return app;
  }

  it('logs a create with the response id and request body as diff', async () => {
    const app = buildApp();
    const res = await app.request('/widgets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'thing' }),
    });
    const body = (await res.json()) as { id: string };

    const rows = await db.select().from(auditLogs).where(eq(auditLogs.schoolId, schoolId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      schoolId,
      actorUserId: userId,
      action: 'create',
      entity: 'widgets',
      entityId: body.id,
      diff: { name: 'thing' },
    });
  });

  it('logs an update using the :id route param', async () => {
    const app = buildApp();
    const id = crypto.randomUUID();
    await app.request(`/widgets/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'renamed' }),
    });

    const rows = await db.select().from(auditLogs).where(eq(auditLogs.schoolId, schoolId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'update', entity: 'widgets', entityId: id });
  });

  it('logs a delete using the :id route param', async () => {
    const app = buildApp();
    const id = crypto.randomUUID();
    await app.request(`/widgets/${id}`, { method: 'DELETE' });

    const rows = await db.select().from(auditLogs).where(eq(auditLogs.schoolId, schoolId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'delete', entity: 'widgets', entityId: id });
  });

  it('does not log GET requests', async () => {
    const app = buildApp();
    await app.request('/widgets', { method: 'GET' });

    const rows = await db.select().from(auditLogs).where(eq(auditLogs.schoolId, schoolId));
    expect(rows).toHaveLength(0);
  });

  it('does not log a mutating request that failed', async () => {
    const app = buildApp();
    await app.request('/widgets-fail', { method: 'POST' });

    const rows = await db.select().from(auditLogs).where(eq(auditLogs.schoolId, schoolId));
    expect(rows).toHaveLength(0);
  });

  it('does not log when no tenant is resolved on context', async () => {
    const app = new Hono<TenantEnv>();
    app.use('*', auditLog());
    app.post('/widgets', async (c) => c.json({ id: crypto.randomUUID() }));

    await app.request('/widgets', { method: 'POST' });

    const rows = await db.select().from(auditLogs).where(eq(auditLogs.schoolId, schoolId));
    expect(rows).toHaveLength(0);
  });
});
