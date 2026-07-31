import { ForbiddenError } from '@monorepo/core';
import {
  academicYears,
  auditLogs,
  db,
  gradeLevels,
  guardians,
  schoolMemberships,
  schools,
  sections,
  studentGuardians,
  students,
  users,
} from '@monorepo/db';
import { eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog } from '../middleware/audit-log';
import type { TenantEnv } from '../middleware/tenant-context';
import guardiansRoutes from './guardians';
import studentsRoutes from './students';

describe('students + guardians routes', () => {
  let schoolId: string;
  let adminUserId: string;
  let adminMembershipId: string;
  let sectionAId: string;
  let sectionBId: string;

  function buildApp() {
    return new Hono<TenantEnv>()
      .use('*', async (c, next) => {
        c.set('tenant', { userId: adminUserId, schoolId, role: 'admin', membershipId: adminMembershipId });
        await next();
      })
      .use('*', auditLog())
      .route('/students', studentsRoutes)
      .route('/', guardiansRoutes)
      .onError((err, c) => {
        if (err instanceof ForbiddenError) return c.json({ error: err.message }, 403);
        throw err;
      });
  }

  const jsonReq = (method: string, body: unknown) => ({
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  beforeAll(async () => {
    const suffix = `vitest-sg-${Date.now()}`;
    const [school] = await db
      .insert(schools)
      .values({ name: `Students Test School ${suffix}`, slug: `students-test-${suffix}` })
      .returning();
    schoolId = school.id;

    const [adminUser] = await db
      .insert(users)
      .values({ phone: `+4000${suffix}`, passwordHash: 'x', nameEn: `Admin ${suffix}` })
      .returning();
    adminUserId = adminUser.id;

    const [adminMembership] = await db
      .insert(schoolMemberships)
      .values({ userId: adminUserId, schoolId, role: 'admin', status: 'active' })
      .returning();
    adminMembershipId = adminMembership.id;

    const [ay] = await db
      .insert(academicYears)
      .values({ schoolId, name: `AY ${suffix}`, startsOn: '2025-09-01', endsOn: '2026-06-30' })
      .returning();
    const [gl] = await db.insert(gradeLevels).values({ schoolId, name: `Grade ${suffix}`, sort: 1 }).returning();
    const [secA, secB] = await db
      .insert(sections)
      .values([
        { schoolId, gradeLevelId: gl.id, academicYearId: ay.id, name: `A ${suffix}` },
        { schoolId, gradeLevelId: gl.id, academicYearId: ay.id, name: `B ${suffix}` },
      ])
      .returning();
    sectionAId = secA.id;
    sectionBId = secB.id;
  });

  afterAll(async () => {
    const guardianRows = await db
      .select({ userId: guardians.userId })
      .from(guardians)
      .where(eq(guardians.schoolId, schoolId));

    await db.delete(auditLogs).where(eq(auditLogs.schoolId, schoolId));
    await db.delete(studentGuardians).where(eq(studentGuardians.schoolId, schoolId));
    await db.delete(guardians).where(eq(guardians.schoolId, schoolId));
    await db.delete(students).where(eq(students.schoolId, schoolId));
    await db.delete(sections).where(eq(sections.schoolId, schoolId));
    await db.delete(gradeLevels).where(eq(gradeLevels.schoolId, schoolId));
    await db.delete(academicYears).where(eq(academicYears.schoolId, schoolId));
    await db.delete(schoolMemberships).where(eq(schoolMemberships.schoolId, schoolId));
    await db.delete(schools).where(eq(schools.id, schoolId));
    await db.delete(users).where(inArray(users.id, [adminUserId, ...guardianRows.map((r) => r.userId)]));
  });

  it('creates a student, lists/filters/searches/paginates, gets detail, updates, and soft-deletes', async () => {
    const app = buildApp();

    const create = async (admissionNo: string, nameEn: string, sectionId = sectionAId) =>
      app.request(
        '/students',
        jsonReq('POST', {
          admissionNo,
          nameEn,
          dob: '2015-01-01',
          gender: 'male',
          sectionId,
          joinedOn: '2024-01-01',
        })
      );

    const r1 = await create('S-100', 'Ahmed Ali');
    expect(r1.status).toBe(201);
    const s1 = (await r1.json()) as { id: string };

    const r2 = await create('S-101', 'Sara Ahmed', sectionBId);
    expect(r2.status).toBe(201);
    const s2 = (await r2.json()) as { id: string };

    const listRes = await app.request('/students?pageSize=50');
    const list = (await listRes.json()) as { data: { id: string }[]; total: number };
    expect(list.data.some((s) => s.id === s1.id)).toBe(true);
    expect(list.data.some((s) => s.id === s2.id)).toBe(true);

    const filteredRes = await app.request(`/students?sectionId=${sectionBId}`);
    const filtered = (await filteredRes.json()) as { data: { id: string }[] };
    expect(filtered.data.map((s) => s.id)).toEqual([s2.id]);

    const searchRes = await app.request('/students?search=Ahmed');
    const searched = (await searchRes.json()) as { data: { id: string }[] };
    const searchedIds = searched.data.map((s) => s.id);
    expect(searchedIds).toContain(s1.id); // "Ahmed Ali"
    expect(searchedIds).toContain(s2.id); // "Sara Ahmed"

    const detailRes = await app.request(`/students/${s1.id}`);
    expect(detailRes.status).toBe(200);
    expect(((await detailRes.json()) as { admissionNo: string }).admissionNo).toBe('S-100');

    const updateRes = await app.request(`/students/${s1.id}`, jsonReq('PATCH', { nameEn: 'Ahmed Ali Renamed' }));
    expect(updateRes.status).toBe(200);
    expect(((await updateRes.json()) as { nameEn: string }).nameEn).toBe('Ahmed Ali Renamed');

    const deleteRes = await app.request(`/students/${s1.id}`, { method: 'DELETE' });
    expect(deleteRes.status).toBe(200);

    // Soft-deleted: excluded from the default list, still fetchable by id,
    // included when includeDeleted=true is passed.
    const listAfterDelete = (await (await app.request('/students?pageSize=50')).json()) as { data: { id: string }[] };
    expect(listAfterDelete.data.some((s) => s.id === s1.id)).toBe(false);

    const detailAfterDelete = await app.request(`/students/${s1.id}`);
    expect(detailAfterDelete.status).toBe(200);

    const listIncludingDeleted = (await (await app.request('/students?includeDeleted=true&pageSize=50')).json()) as {
      data: { id: string }[];
    };
    expect(listIncludingDeleted.data.some((s) => s.id === s1.id)).toBe(true);
  });

  it('rejects duplicate admission_no with 409', async () => {
    const app = buildApp();
    const payload = {
      admissionNo: 'DUP-1',
      nameEn: 'First',
      dob: '2015-01-01',
      gender: 'male' as const,
      sectionId: sectionAId,
      joinedOn: '2024-01-01',
    };
    await app.request('/students', jsonReq('POST', payload));
    const dupRes = await app.request('/students', jsonReq('POST', { ...payload, nameEn: 'Second' }));
    expect(dupRes.status).toBe(409);
  });

  it('creates a guardian, links to a student, verifies, and revokes', async () => {
    const app = buildApp();

    const studentRes = await app.request(
      '/students',
      jsonReq('POST', {
        admissionNo: `G-STU-${Date.now()}`,
        nameEn: 'Student For Guardian',
        dob: '2015-01-01',
        gender: 'female',
        sectionId: sectionAId,
        joinedOn: '2024-01-01',
      })
    );
    const student = (await studentRes.json()) as { id: string };

    const guardianRes = await app.request(
      '/guardians',
      jsonReq('POST', { nameEn: 'A Parent', phone: `+5000${Date.now()}` })
    );
    expect(guardianRes.status).toBe(201);
    const guardian = (await guardianRes.json()) as { id: string };

    const linkRes = await app.request(
      `/students/${student.id}/guardians`,
      jsonReq('POST', { guardianId: guardian.id, relation: 'mother', isPrimary: true })
    );
    expect(linkRes.status).toBe(201);
    const link = (await linkRes.json()) as { id: string; verifiedAt: string | null };
    expect(link.verifiedAt).toBeNull();

    const listLinksRes = await app.request(`/students/${student.id}/guardians`);
    const links = (await listLinksRes.json()) as { id: string }[];
    expect(links.some((l) => l.id === link.id)).toBe(true);

    const verifyRes = await app.request(`/student-guardians/${link.id}/verify`, { method: 'POST' });
    expect(verifyRes.status).toBe(200);
    expect(((await verifyRes.json()) as { verifiedAt: string | null }).verifiedAt).not.toBeNull();

    const revokeRes = await app.request(`/student-guardians/${link.id}/revoke`, { method: 'POST' });
    expect(revokeRes.status).toBe(200);
    expect(((await revokeRes.json()) as { revokedAt: string | null }).revokedAt).not.toBeNull();

    // Revoking an already-revoked link is a 404 (not a silent no-op).
    const revokeAgainRes = await app.request(`/student-guardians/${link.id}/revoke`, { method: 'POST' });
    expect(revokeAgainRes.status).toBe(404);
  });
});
