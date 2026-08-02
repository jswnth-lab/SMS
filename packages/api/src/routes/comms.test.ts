import { ForbiddenError } from '@monorepo/core';
import {
  academicYears,
  announcementReads,
  announcements,
  auditLogs,
  db,
  gradeLevels,
  guardians,
  homework,
  jobs,
  notifications,
  schoolMemberships,
  schools,
  sections,
  studentGuardians,
  students,
  subjects,
  teachingAssignments,
  users,
} from '@monorepo/db';
import { and, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import announcementsRoutes from './announcements';
import homeworkRoutes from './homework';
import { auditLog } from '../middleware/audit-log';
import type { TenantContext, TenantEnv } from '../middleware/tenant-context';
import notificationsRoutes from './notifications-routes';

describe('comms (announcements, homework, notifications)', () => {
  let schoolId: string;
  let adminUserId: string;
  let adminMembershipId: string;
  let teacherUserId: string;
  let teacherMembershipId: string;
  let otherTeacherUserId: string;
  let otherTeacherMembershipId: string;
  let studentUserId: string;
  let parentUserId: string;
  let gradeLevelIdA: string;
  let gradeLevelIdB: string;
  let sectionId: string;
  let otherSectionId: string;
  let studentId: string;

  function buildApp(tenant: TenantContext) {
    return new Hono<TenantEnv>()
      .use('*', async (c, next) => {
        c.set('tenant', tenant);
        await next();
      })
      .use('*', auditLog())
      .route('/', announcementsRoutes)
      .route('/', homeworkRoutes)
      .route('/', notificationsRoutes)
      .onError((err, c) => {
        if (err instanceof ForbiddenError) return c.json({ error: err.message }, 403);
        throw err;
      });
  }

  const asAdmin = () => buildApp({ userId: adminUserId, schoolId, role: 'admin', membershipId: adminMembershipId });
  const asTeacher = () => buildApp({ userId: teacherUserId, schoolId, role: 'teacher', membershipId: teacherMembershipId });
  const asOtherTeacher = () =>
    buildApp({ userId: otherTeacherUserId, schoolId, role: 'teacher', membershipId: otherTeacherMembershipId });
  const asStudent = () => buildApp({ userId: studentUserId, schoolId, role: 'student', membershipId: '00000000-0000-0000-0000-000000000000' });
  const asParent = () => buildApp({ userId: parentUserId, schoolId, role: 'parent', membershipId: '00000000-0000-0000-0000-000000000000' });

  const jsonReq = (method: string, body: unknown) => ({
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  beforeAll(async () => {
    const suffix = `vitest-comms-${Date.now()}`;
    const [school] = await db.insert(schools).values({ name: `Comms Test School ${suffix}`, slug: `comms-test-${suffix}` }).returning();
    schoolId = school.id;

    const [adminUser, teacherUser, otherTeacherUser, studentUser, parentUser] = await db
      .insert(users)
      .values([
        { phone: `+9700${suffix}`, passwordHash: 'x', nameEn: `Admin ${suffix}` },
        { phone: `+9701${suffix}`, passwordHash: 'x', nameEn: `Teacher ${suffix}` },
        { phone: `+9702${suffix}`, passwordHash: 'x', nameEn: `Other Teacher ${suffix}` },
        { phone: `+9703${suffix}`, passwordHash: 'x', nameEn: `Student ${suffix}` },
        { phone: `+9704${suffix}`, passwordHash: 'x', nameEn: `Parent ${suffix}` },
      ])
      .returning();
    adminUserId = adminUser.id;
    teacherUserId = teacherUser.id;
    otherTeacherUserId = otherTeacherUser.id;
    studentUserId = studentUser.id;
    parentUserId = parentUser.id;

    const [adminMembership, teacherMembership, otherTeacherMembership] = await db
      .insert(schoolMemberships)
      .values([
        { userId: adminUserId, schoolId, role: 'admin', status: 'active' },
        { userId: teacherUserId, schoolId, role: 'teacher', status: 'active' },
        { userId: otherTeacherUserId, schoolId, role: 'teacher', status: 'active' },
      ])
      .returning();
    adminMembershipId = adminMembership.id;
    teacherMembershipId = teacherMembership.id;
    otherTeacherMembershipId = otherTeacherMembership.id;

    const [ay] = await db.insert(academicYears).values({ schoolId, name: `AY ${suffix}`, startsOn: '2025-09-01', endsOn: '2026-06-30' }).returning();
    const [glA, glB] = await db
      .insert(gradeLevels)
      .values([
        { schoolId, name: `Grade A ${suffix}`, sort: 1 },
        { schoolId, name: `Grade B ${suffix}`, sort: 2 },
      ])
      .returning();
    gradeLevelIdA = glA.id;
    gradeLevelIdB = glB.id;
    const [section, otherSection] = await db
      .insert(sections)
      .values([
        { schoolId, gradeLevelId: gradeLevelIdA, academicYearId: ay.id, name: `A ${suffix}` },
        { schoolId, gradeLevelId: gradeLevelIdB, academicYearId: ay.id, name: `B ${suffix}` },
      ])
      .returning();
    sectionId = section.id;
    otherSectionId = otherSection.id;

    const [subject] = await db.insert(subjects).values({ schoolId, nameEn: `Subject ${suffix}`, code: `SUB-${suffix}` }).returning();
    await db.insert(teachingAssignments).values({ schoolId, teacherMembershipId, sectionId, subjectId: subject.id, academicYearId: ay.id });

    const [student] = await db
      .insert(students)
      .values({
        schoolId,
        admissionNo: `COMM-${suffix}`,
        nameEn: 'Comms Student',
        dob: '2015-01-01',
        gender: 'male',
        sectionId,
        joinedOn: '2024-01-01',
        userId: studentUserId,
      })
      .returning();
    studentId = student.id;

    const [guardian] = await db.insert(guardians).values({ schoolId, userId: parentUserId }).returning();
    await db.insert(studentGuardians).values({
      schoolId,
      studentId,
      guardianId: guardian.id,
      relation: 'father',
      verifiedAt: new Date(),
    });
  });

  afterAll(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.schoolId, schoolId));
    await db.delete(jobs).where(eq(jobs.schoolId, schoolId));
    await db.delete(notifications).where(eq(notifications.schoolId, schoolId));
    await db.delete(announcementReads).where(eq(announcementReads.schoolId, schoolId));
    await db.delete(announcements).where(eq(announcements.schoolId, schoolId));
    await db.delete(homework).where(eq(homework.schoolId, schoolId));
    await db.delete(studentGuardians).where(eq(studentGuardians.schoolId, schoolId));
    await db.delete(guardians).where(eq(guardians.schoolId, schoolId));
    await db.delete(students).where(eq(students.schoolId, schoolId));
    await db.delete(teachingAssignments).where(eq(teachingAssignments.schoolId, schoolId));
    await db.delete(subjects).where(eq(subjects.schoolId, schoolId));
    await db.delete(sections).where(eq(sections.schoolId, schoolId));
    await db.delete(gradeLevels).where(eq(gradeLevels.schoolId, schoolId));
    await db.delete(academicYears).where(eq(academicYears.schoolId, schoolId));
    await db.delete(schoolMemberships).where(eq(schoolMemberships.schoolId, schoolId));
    await db.delete(schools).where(eq(schools.id, schoolId));
    await db.delete(users).where(inArray(users.id, [adminUserId, teacherUserId, otherTeacherUserId, studentUserId, parentUserId]));
  });

  let schoolAnnouncementId: string;
  let sectionAnnouncementId: string;
  let gradeAnnouncementId: string;

  it('creates announcements at each audience scope, blocking a teacher from an unassigned section', async () => {
    const schoolRes = await asAdmin().request(
      '/announcements',
      jsonReq('POST', { title: 'School-wide', body: 'Hello everyone', audience: { scope: 'school' } })
    );
    expect(schoolRes.status).toBe(201);
    schoolAnnouncementId = ((await schoolRes.json()) as { id: string }).id;

    const enqueuedJobs = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.schoolId, schoolId), eq(jobs.type, 'notify.announcement')));
    expect(enqueuedJobs).toHaveLength(1);
    expect(enqueuedJobs[0]).toMatchObject({
      status: 'pending',
      payload: { announcementId: schoolAnnouncementId },
    });

    const sectionRes = await asTeacher().request(
      '/announcements',
      jsonReq('POST', { title: 'Section note', body: 'For my section', audience: { scope: 'section', sectionId } })
    );
    expect(sectionRes.status).toBe(201);
    sectionAnnouncementId = ((await sectionRes.json()) as { id: string }).id;

    const gradeRes = await asAdmin().request(
      '/announcements',
      jsonReq('POST', { title: 'Grade note', body: 'For grade A', audience: { scope: 'grade', gradeLevelId: gradeLevelIdA } })
    );
    expect(gradeRes.status).toBe(201);
    gradeAnnouncementId = ((await gradeRes.json()) as { id: string }).id;

    const blockedRes = await asOtherTeacher().request(
      '/announcements',
      jsonReq('POST', { title: 'Not allowed', body: 'x', audience: { scope: 'section', sectionId } })
    );
    expect(blockedRes.status).toBe(403);
  });

  it("resolves each role's feed correctly (student and parent both see school+their section+their grade, not the other section)", async () => {
    const studentFeed = (await (await asStudent().request('/announcements/feed')).json()) as { id: string }[];
    const studentFeedIds = studentFeed.map((a) => a.id);
    expect(studentFeedIds).toContain(schoolAnnouncementId);
    expect(studentFeedIds).toContain(sectionAnnouncementId);
    expect(studentFeedIds).toContain(gradeAnnouncementId);

    const parentFeed = (await (await asParent().request('/announcements/feed')).json()) as { id: string }[];
    expect(parentFeed.map((a) => a.id)).toEqual(expect.arrayContaining(studentFeedIds));

    const otherTeacherFeed = (await (await asOtherTeacher().request('/announcements/feed')).json()) as { id: string }[];
    const otherFeedIds = otherTeacherFeed.map((a) => a.id);
    expect(otherFeedIds).toContain(schoolAnnouncementId);
    expect(otherFeedIds).not.toContain(sectionAnnouncementId); // not their section
    expect(otherFeedIds).not.toContain(gradeAnnouncementId); // not their grade
  });

  it('marks an announcement read for one caller without affecting another', async () => {
    const before = (await (await asStudent().request('/announcements/feed')).json()) as { id: string; isRead: boolean }[];
    expect(before.find((a) => a.id === schoolAnnouncementId)?.isRead).toBe(false);

    const readRes = await asStudent().request(`/announcements/${schoolAnnouncementId}/read`, { method: 'POST' });
    expect(readRes.status).toBe(200);

    const after = (await (await asStudent().request('/announcements/feed')).json()) as { id: string; isRead: boolean }[];
    expect(after.find((a) => a.id === schoolAnnouncementId)?.isRead).toBe(true);

    const parentView = (await (await asParent().request('/announcements/feed')).json()) as { id: string; isRead: boolean }[];
    expect(parentView.find((a) => a.id === schoolAnnouncementId)?.isRead).toBe(false);
  });

  let homeworkId: string;

  it('creates homework scoped to a teaching assignment, lists it per section and per student, blocks an unassigned teacher', async () => {
    const [subjectRow] = await db.select().from(subjects).where(eq(subjects.schoolId, schoolId));

    const createRes = await asTeacher().request(
      '/homework',
      jsonReq('POST', { sectionId, subjectId: subjectRow.id, title: 'Read chapter 1', body: 'Pages 1-10', dueOn: '2026-04-01' })
    );
    expect(createRes.status).toBe(201);
    homeworkId = ((await createRes.json()) as { id: string }).id;

    const blockedRes = await asOtherTeacher().request(
      '/homework',
      jsonReq('POST', { sectionId, subjectId: subjectRow.id, title: 'Not allowed', body: 'x', dueOn: '2026-04-01' })
    );
    expect(blockedRes.status).toBe(403);

    const bySectionRes = await asAdmin().request(`/homework/sections/${sectionId}`);
    const bySection = (await bySectionRes.json()) as { id: string }[];
    expect(bySection.map((h) => h.id)).toContain(homeworkId);

    const byStudentRes = await asParent().request(`/homework/students/${studentId}`);
    expect(byStudentRes.status).toBe(200);
    const byStudent = (await byStudentRes.json()) as { id: string }[];
    expect(byStudent.map((h) => h.id)).toContain(homeworkId);

    const blockedStudentRes = await asOtherTeacher().request(`/homework/students/${studentId}`);
    expect(blockedStudentRes.status).toBe(403);
  });

  it('lists my notifications and marks one read, scoped to the caller', async () => {
    const [notification] = await db
      .insert(notifications)
      .values({ userId: parentUserId, schoolId, type: 'test.event', payload: { foo: 'bar' } })
      .returning();

    const listRes = await asParent().request('/notifications');
    const list = (await listRes.json()) as { id: string; readAt: string | null }[];
    expect(list.some((n) => n.id === notification.id && n.readAt === null)).toBe(true);

    // Another user can't mark someone else's notification read.
    const wrongUserRes = await asStudent().request(`/notifications/${notification.id}/read`, { method: 'POST' });
    expect(wrongUserRes.status).toBe(404);

    const readRes = await asParent().request(`/notifications/${notification.id}/read`, { method: 'POST' });
    expect(readRes.status).toBe(200);

    const unreadOnlyRes = await asParent().request('/notifications?unreadOnly=true');
    const unreadOnly = (await unreadOnlyRes.json()) as { id: string }[];
    expect(unreadOnly.some((n) => n.id === notification.id)).toBe(false);
  });
});
