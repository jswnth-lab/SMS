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
  timetableSlots,
  users,
} from '@monorepo/db';
import { eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog } from '../middleware/audit-log';
import type { TenantEnv } from '../middleware/tenant-context';
import timetableRoutes from './timetable';

describe('timetable routes', () => {
  let schoolId: string;
  let adminUserId: string;
  let adminMembershipId: string;
  let sectionAId: string;
  let sectionBId: string;
  let subjectId: string;
  let teacher1MembershipId: string;
  let teacher2MembershipId: string;
  let teacherUserIds: string[];

  function buildApp() {
    return new Hono<TenantEnv>()
      .use('*', async (c, next) => {
        c.set('tenant', { userId: adminUserId, schoolId, role: 'admin', membershipId: adminMembershipId });
        await next();
      })
      .use('*', auditLog())
      .route('/', timetableRoutes)
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
    const suffix = `vitest-tt-${Date.now()}`;
    const [school] = await db
      .insert(schools)
      .values({ name: `Timetable Test School ${suffix}`, slug: `timetable-test-${suffix}` })
      .returning();
    schoolId = school.id;

    const [adminUser] = await db
      .insert(users)
      .values({ phone: `+8000${suffix}`, passwordHash: 'x', nameEn: `Admin ${suffix}` })
      .returning();
    adminUserId = adminUser.id;

    const [adminMembership] = await db
      .insert(schoolMemberships)
      .values({ userId: adminUserId, schoolId, role: 'admin', status: 'active' })
      .returning();
    adminMembershipId = adminMembership.id;

    const [teacherUser1, teacherUser2] = await db
      .insert(users)
      .values([
        { phone: `+8001${suffix}`, passwordHash: 'x', nameEn: `Teacher One ${suffix}` },
        { phone: `+8002${suffix}`, passwordHash: 'x', nameEn: `Teacher Two ${suffix}` },
      ])
      .returning();
    teacherUserIds = [teacherUser1.id, teacherUser2.id];

    const [teacher1, teacher2] = await db
      .insert(schoolMemberships)
      .values([
        { userId: teacherUser1.id, schoolId, role: 'teacher', status: 'active' },
        { userId: teacherUser2.id, schoolId, role: 'teacher', status: 'active' },
      ])
      .returning();
    teacher1MembershipId = teacher1.id;
    teacher2MembershipId = teacher2.id;

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

    const [subject] = await db
      .insert(subjects)
      .values({ schoolId, nameEn: `Subject ${suffix}`, code: `SUB-${suffix}` })
      .returning();
    subjectId = subject.id;
  });

  afterAll(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.schoolId, schoolId));
    await db.delete(timetableSlots).where(eq(timetableSlots.schoolId, schoolId));
    await db.delete(subjects).where(eq(subjects.schoolId, schoolId));
    await db.delete(sections).where(eq(sections.schoolId, schoolId));
    await db.delete(gradeLevels).where(eq(gradeLevels.schoolId, schoolId));
    await db.delete(academicYears).where(eq(academicYears.schoolId, schoolId));
    await db.delete(schoolMemberships).where(eq(schoolMemberships.schoolId, schoolId));
    await db.delete(schools).where(eq(schools.id, schoolId));
    await db.delete(users).where(inArray(users.id, [adminUserId, ...teacherUserIds]));
  });

  it('bulk upserts a section timetable and lists it by section and by teacher', async () => {
    const app = buildApp();
    const res = await app.request(
      `/timetable/sections/${sectionAId}`,
      jsonReq('POST', {
        slots: [
          {
            dayOfWeek: 1,
            periodNo: 1,
            subjectId,
            teacherMembershipId: teacher1MembershipId,
            room: 'R101',
            startsAt: '08:00',
            endsAt: '08:45',
          },
          {
            dayOfWeek: 1,
            periodNo: 2,
            subjectId,
            teacherMembershipId: teacher2MembershipId,
            room: 'R102',
            startsAt: '08:45',
            endsAt: '09:30',
          },
        ],
      })
    );
    expect(res.status).toBe(200);
    const inserted = (await res.json()) as { id: string }[];
    expect(inserted).toHaveLength(2);

    const bySection = (await (await app.request(`/timetable/sections/${sectionAId}`)).json()) as {
      periodNo: number;
    }[];
    expect(bySection.map((s) => s.periodNo)).toEqual([1, 2]);

    const byTeacher = (await (await app.request(`/timetable/teachers/${teacher1MembershipId}`)).json()) as {
      sectionId: string;
    }[];
    expect(byTeacher).toHaveLength(1);
    expect(byTeacher[0].sectionId).toBe(sectionAId);
  });

  it('replaces the whole section timetable on re-upsert instead of merging', async () => {
    const app = buildApp();
    await app.request(
      `/timetable/sections/${sectionAId}`,
      jsonReq('POST', {
        slots: [
          {
            dayOfWeek: 2,
            periodNo: 1,
            subjectId,
            teacherMembershipId: teacher1MembershipId,
            startsAt: '08:00',
            endsAt: '08:45',
          },
        ],
      })
    );

    const bySection = (await (await app.request(`/timetable/sections/${sectionAId}`)).json()) as {
      dayOfWeek: number;
      periodNo: number;
    }[];
    // Only the newly-submitted slot remains - the previous test's day-1
    // slots for this section are gone.
    expect(bySection).toEqual([{ dayOfWeek: 2, periodNo: 1 }].map((s) => expect.objectContaining(s)));
  });

  it('rejects a duplicate (dayOfWeek, periodNo) within the same submission with 409, saving nothing', async () => {
    const app = buildApp();
    const res = await app.request(
      `/timetable/sections/${sectionBId}`,
      jsonReq('POST', {
        slots: [
          {
            dayOfWeek: 3,
            periodNo: 1,
            subjectId,
            teacherMembershipId: teacher1MembershipId,
            startsAt: '08:00',
            endsAt: '08:45',
          },
          {
            dayOfWeek: 3,
            periodNo: 1,
            subjectId,
            teacherMembershipId: teacher2MembershipId,
            startsAt: '08:45',
            endsAt: '09:30',
          },
        ],
      })
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { conflicts: { type: string }[] };
    expect(body.conflicts.some((c) => c.type === 'duplicate_in_batch')).toBe(true);

    const rows = await db.select().from(timetableSlots).where(eq(timetableSlots.sectionId, sectionBId));
    expect(rows).toHaveLength(0);
  });

  it('rejects a teacher double-booked across sections with 409, saving nothing', async () => {
    const app = buildApp();
    // sectionA already has teacher1 booked on day 2 period 1 (from the
    // replace test above).
    const res = await app.request(
      `/timetable/sections/${sectionBId}`,
      jsonReq('POST', {
        slots: [
          {
            dayOfWeek: 2,
            periodNo: 1,
            subjectId,
            teacherMembershipId: teacher1MembershipId,
            startsAt: '08:00',
            endsAt: '08:45',
          },
        ],
      })
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { conflicts: { type: string }[] };
    expect(body.conflicts.some((c) => c.type === 'teacher_double_booked')).toBe(true);

    const rows = await db.select().from(timetableSlots).where(eq(timetableSlots.sectionId, sectionBId));
    expect(rows).toHaveLength(0);
  });

  it('rejects a room double-booked across sections with 409, saving nothing', async () => {
    const app = buildApp();
    // Give sectionA a room-booked slot on day 4 period 1 first.
    await app.request(
      `/timetable/sections/${sectionAId}`,
      jsonReq('POST', {
        slots: [
          {
            dayOfWeek: 4,
            periodNo: 1,
            subjectId,
            teacherMembershipId: teacher1MembershipId,
            room: 'SharedRoom',
            startsAt: '08:00',
            endsAt: '08:45',
          },
        ],
      })
    );

    const res = await app.request(
      `/timetable/sections/${sectionBId}`,
      jsonReq('POST', {
        slots: [
          {
            dayOfWeek: 4,
            periodNo: 1,
            subjectId,
            teacherMembershipId: teacher2MembershipId, // different teacher, same room
            room: 'SharedRoom',
            startsAt: '08:00',
            endsAt: '08:45',
          },
        ],
      })
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { conflicts: { type: string }[] };
    expect(body.conflicts.some((c) => c.type === 'room_double_booked')).toBe(true);

    const rows = await db.select().from(timetableSlots).where(eq(timetableSlots.sectionId, sectionBId));
    expect(rows).toHaveLength(0);
  });
});
