import { ForbiddenError } from '@monorepo/core';
import {
  academicYears,
  auditLogs,
  db,
  gradeLevels,
  schoolMemberships,
  schools,
  sections,
  subjects,
  teachingAssignments,
  users,
} from '@monorepo/db';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog } from '../middleware/audit-log';
import type { TenantEnv } from '../middleware/tenant-context';
import academicYearsRoutes from './academic-years';
import gradeLevelsRoutes from './grade-levels';
import sectionsRoutes from './sections';
import subjectsRoutes from './subjects';
import teachingAssignmentsRoutes from './teaching-assignments';
import termsRoutes from './terms';

// Exercises the real route handlers (validation, requireRole, RLS-scoped
// queries, audit logging, db-error mapping) through a throwaway app that
// fakes `tenant` on context instead of going through better-auth - same
// approach as middleware/audit-log.test.ts, since these routes only depend
// on tenantContext() having already run, not on how it resolved.
describe('school-setup CRUD routes', () => {
  let schoolId: string;
  let adminUserId: string;
  let adminMembershipId: string;
  let teacherMembershipId: string;

  function buildApp(role: 'admin' | 'teacher' = 'admin') {
    return new Hono<TenantEnv>()
      .use('*', async (c, next) => {
        c.set('tenant', {
          userId: adminUserId,
          schoolId,
          role,
          membershipId: role === 'admin' ? adminMembershipId : teacherMembershipId,
        });
        await next();
      })
      .use('*', auditLog())
      .route('/academic-years', academicYearsRoutes)
      .route('/terms', termsRoutes)
      .route('/grade-levels', gradeLevelsRoutes)
      .route('/sections', sectionsRoutes)
      .route('/subjects', subjectsRoutes)
      .route('/teaching-assignments', teachingAssignmentsRoutes)
      .onError((err, c) => {
        if (err instanceof ForbiddenError) {
          return c.json({ error: err.message }, 403);
        }
        throw err;
      });
  }

  const json = (body: unknown) => ({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  beforeAll(async () => {
    const suffix = `vitest-crud-${Date.now()}`;
    const [school] = await db
      .insert(schools)
      .values({ name: `CRUD Test School ${suffix}`, slug: `crud-test-${suffix}` })
      .returning();
    schoolId = school.id;

    const [adminUser] = await db
      .insert(users)
      .values({ phone: `+3000${suffix}`, passwordHash: 'x', nameEn: `Admin ${suffix}` })
      .returning();
    adminUserId = adminUser.id;

    const [adminMembership] = await db
      .insert(schoolMemberships)
      .values({ userId: adminUserId, schoolId, role: 'admin', status: 'active' })
      .returning();
    adminMembershipId = adminMembership.id;

    const [teacherMembership] = await db
      .insert(schoolMemberships)
      .values({ userId: adminUserId, schoolId, role: 'teacher', status: 'active' })
      .returning();
    teacherMembershipId = teacherMembership.id;
  });

  afterAll(async () => {
    // No cascade deletes exist by design (see earlier RLS/rls-verify work),
    // so children must go before their parents: audit rows and teaching
    // assignments first, then sections/subjects/grade levels/academic
    // years, then memberships/school/user.
    await db.delete(auditLogs).where(eq(auditLogs.schoolId, schoolId));
    await db.delete(teachingAssignments).where(eq(teachingAssignments.schoolId, schoolId));
    await db.delete(sections).where(eq(sections.schoolId, schoolId));
    await db.delete(subjects).where(eq(subjects.schoolId, schoolId));
    await db.delete(gradeLevels).where(eq(gradeLevels.schoolId, schoolId));
    await db.delete(academicYears).where(eq(academicYears.schoolId, schoolId));
    await db.delete(schoolMemberships).where(eq(schoolMemberships.schoolId, schoolId));
    await db.delete(schools).where(eq(schools.id, schoolId));
    await db.delete(users).where(eq(users.id, adminUserId));
  });

  it('creates, reads, updates, and deletes an academic year; sets it current; writes audit rows', async () => {
    const app = buildApp('admin');

    const createRes = await app.request(
      '/academic-years',
      json({ name: 'AY 2025-2026', startsOn: '2025-09-01', endsOn: '2026-06-30' })
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string; isCurrent: boolean };
    expect(created.isCurrent).toBe(false);

    const getRes = await app.request(`/academic-years/${created.id}`);
    expect(getRes.status).toBe(200);

    const setCurrentRes = await app.request(`/academic-years/${created.id}/set-current`, { method: 'POST' });
    expect(setCurrentRes.status).toBe(200);
    expect(((await setCurrentRes.json()) as { isCurrent: boolean }).isCurrent).toBe(true);

    const updateRes = await app.request(`/academic-years/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'AY 2025-2026 (renamed)' }),
    });
    expect(updateRes.status).toBe(200);
    expect(((await updateRes.json()) as { name: string }).name).toBe('AY 2025-2026 (renamed)');

    const auditRows = await db.select().from(auditLogs).where(eq(auditLogs.schoolId, schoolId));
    expect(auditRows.some((r) => r.entity === 'academic-years' && r.action === 'create')).toBe(true);
    expect(auditRows.some((r) => r.entity === 'academic-years' && r.action === 'update')).toBe(true);

    const deleteRes = await app.request(`/academic-years/${created.id}`, { method: 'DELETE' });
    expect(deleteRes.status).toBe(200);

    const getAfterDeleteRes = await app.request(`/academic-years/${created.id}`);
    expect(getAfterDeleteRes.status).toBe(404);
  });

  it('rejects a duplicate academic year name for the same school with 409', async () => {
    const app = buildApp('admin');
    await app.request('/academic-years', json({ name: 'Dup AY', startsOn: '2025-09-01', endsOn: '2026-06-30' }));
    const dupRes = await app.request(
      '/academic-years',
      json({ name: 'Dup AY', startsOn: '2025-09-01', endsOn: '2026-06-30' })
    );
    expect(dupRes.status).toBe(409);
  });

  it('rejects invalid input with 400 before touching the database', async () => {
    const app = buildApp('admin');
    const res = await app.request('/academic-years', json({ name: '', startsOn: '2025-09-01' }));
    expect(res.status).toBe(400);
  });

  it('blocks a non-admin (teacher) from creating a grade level with 403', async () => {
    const app = buildApp('teacher');
    const res = await app.request('/grade-levels', json({ name: 'Grade 5', sort: 5 }));
    expect(res.status).toBe(403);
  });

  it('allows a full grade-level -> section -> subject -> teaching-assignment chain', async () => {
    const app = buildApp('admin');

    const ayRes = await app.request(
      '/academic-years',
      json({ name: `Chain AY ${Date.now()}`, startsOn: '2025-09-01', endsOn: '2026-06-30' })
    );
    const ay = (await ayRes.json()) as { id: string };

    const glRes = await app.request('/grade-levels', json({ name: `Grade ${Date.now()}`, sort: 1 }));
    const gl = (await glRes.json()) as { id: string };

    const sectionRes = await app.request(
      '/sections',
      json({ gradeLevelId: gl.id, academicYearId: ay.id, name: 'A' })
    );
    expect(sectionRes.status).toBe(201);
    const section = (await sectionRes.json()) as { id: string };

    const subjectRes = await app.request(
      '/subjects',
      json({ nameEn: `Math ${Date.now()}`, code: `MATH-${Date.now()}` })
    );
    const subject = (await subjectRes.json()) as { id: string };

    const taRes = await app.request(
      '/teaching-assignments',
      json({
        teacherMembershipId,
        sectionId: section.id,
        subjectId: subject.id,
        academicYearId: ay.id,
      })
    );
    expect(taRes.status).toBe(201);

    const listRes = await app.request(`/teaching-assignments?sectionId=${section.id}`);
    const list = (await listRes.json()) as unknown[];
    expect(list).toHaveLength(1);
  });
});
