import { ForbiddenError } from '@monorepo/core';
import {
  academicYears,
  assessments,
  auditLogs,
  db,
  gradeLevels,
  marks,
  reportCards,
  schoolMemberships,
  schools,
  sections,
  students,
  subjects,
  teachingAssignments,
  terms,
  users,
} from '@monorepo/db';
import { eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import assessmentsRoutes from './assessments';
import { auditLog } from '../middleware/audit-log';
import type { TenantContext, TenantEnv } from '../middleware/tenant-context';
import marksRoutes from './marks';
import reportCardsRoutes from './report-cards';

describe('gradebook (assessments + marks + report cards)', () => {
  let schoolId: string;
  let adminUserId: string;
  let adminMembershipId: string;
  let assignedTeacherMembershipId: string;
  let unassignedTeacherMembershipId: string;
  let teacherUserIds: string[];
  let academicYearId: string;
  let termId: string;
  let sectionId: string;
  let subjectId: string;
  let studentAId: string;
  let studentBId: string;

  function buildApp(tenant: TenantContext) {
    return new Hono<TenantEnv>()
      .use('*', async (c, next) => {
        c.set('tenant', tenant);
        await next();
      })
      .use('*', auditLog())
      .route('/', assessmentsRoutes)
      .route('/', marksRoutes)
      .route('/', reportCardsRoutes)
      .onError((err, c) => {
        if (err instanceof ForbiddenError) return c.json({ error: err.message }, 403);
        throw err;
      });
  }

  const asAdmin = () => buildApp({ userId: adminUserId, schoolId, role: 'admin', membershipId: adminMembershipId });
  const asAssignedTeacher = () =>
    buildApp({ userId: adminUserId, schoolId, role: 'teacher', membershipId: assignedTeacherMembershipId });
  const asUnassignedTeacher = () =>
    buildApp({ userId: adminUserId, schoolId, role: 'teacher', membershipId: unassignedTeacherMembershipId });

  const jsonReq = (method: string, body: unknown) => ({
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  beforeAll(async () => {
    const suffix = `vitest-gb-${Date.now()}`;
    const [school] = await db
      .insert(schools)
      .values({ name: `Gradebook Test School ${suffix}`, slug: `gradebook-test-${suffix}` })
      .returning();
    schoolId = school.id;

    const [adminUser] = await db
      .insert(users)
      .values({ phone: `+9500${suffix}`, passwordHash: 'x', nameEn: `Admin ${suffix}` })
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
        { phone: `+9501${suffix}`, passwordHash: 'x', nameEn: `Assigned Teacher ${suffix}` },
        { phone: `+9502${suffix}`, passwordHash: 'x', nameEn: `Unassigned Teacher ${suffix}` },
      ])
      .returning();
    teacherUserIds = [teacherUser1.id, teacherUser2.id];
    const [assignedTeacher, unassignedTeacher] = await db
      .insert(schoolMemberships)
      .values([
        { userId: teacherUser1.id, schoolId, role: 'teacher', status: 'active' },
        { userId: teacherUser2.id, schoolId, role: 'teacher', status: 'active' },
      ])
      .returning();
    assignedTeacherMembershipId = assignedTeacher.id;
    unassignedTeacherMembershipId = unassignedTeacher.id;

    const [ay] = await db
      .insert(academicYears)
      .values({ schoolId, name: `AY ${suffix}`, startsOn: '2025-09-01', endsOn: '2026-06-30' })
      .returning();
    academicYearId = ay.id;
    const [term] = await db
      .insert(terms)
      .values({ schoolId, academicYearId, name: `Term ${suffix}`, startsOn: '2025-09-01', endsOn: '2025-12-31' })
      .returning();
    termId = term.id;
    const [gl] = await db.insert(gradeLevels).values({ schoolId, name: `Grade ${suffix}`, sort: 1 }).returning();
    const [section] = await db
      .insert(sections)
      .values({ schoolId, gradeLevelId: gl.id, academicYearId, name: `A ${suffix}` })
      .returning();
    sectionId = section.id;
    const [subject] = await db
      .insert(subjects)
      .values({ schoolId, nameEn: `Subject ${suffix}`, code: `SUB-${suffix}` })
      .returning();
    subjectId = subject.id;

    await db.insert(teachingAssignments).values({
      schoolId,
      teacherMembershipId: assignedTeacherMembershipId,
      sectionId,
      subjectId,
      academicYearId,
    });

    const [studentA, studentB] = await db
      .insert(students)
      .values([
        {
          schoolId,
          admissionNo: `GB-A-${suffix}`,
          nameEn: 'Gradebook Student A',
          dob: '2015-01-01',
          gender: 'female',
          sectionId,
          joinedOn: '2024-01-01',
        },
        {
          schoolId,
          admissionNo: `GB-B-${suffix}`,
          nameEn: 'Gradebook Student B',
          dob: '2015-01-01',
          gender: 'male',
          sectionId,
          joinedOn: '2024-01-01',
        },
      ])
      .returning();
    studentAId = studentA.id;
    studentBId = studentB.id;
  });

  afterAll(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.schoolId, schoolId));
    await db.delete(reportCards).where(eq(reportCards.schoolId, schoolId));
    await db.delete(marks).where(eq(marks.schoolId, schoolId));
    await db.delete(assessments).where(eq(assessments.schoolId, schoolId));
    await db.delete(teachingAssignments).where(eq(teachingAssignments.schoolId, schoolId));
    await db.delete(students).where(eq(students.schoolId, schoolId));
    await db.delete(subjects).where(eq(subjects.schoolId, schoolId));
    await db.delete(sections).where(eq(sections.schoolId, schoolId));
    await db.delete(gradeLevels).where(eq(gradeLevels.schoolId, schoolId));
    await db.delete(terms).where(eq(terms.schoolId, schoolId));
    await db.delete(academicYears).where(eq(academicYears.schoolId, schoolId));
    await db.delete(schoolMemberships).where(eq(schoolMemberships.schoolId, schoolId));
    await db.delete(schools).where(eq(schools.id, schoolId));
    await db.delete(users).where(inArray(users.id, [adminUserId, ...teacherUserIds]));
  });

  let midtermId: string;
  let finalId: string;

  it('lets the assigned teacher create assessments, blocks the unassigned teacher', async () => {
    const midtermRes = await asAssignedTeacher().request(
      '/assessments',
      jsonReq('POST', {
        sectionId,
        subjectId,
        termId,
        name: 'Midterm',
        type: 'exam',
        maxMarks: 50,
        weight: 30,
        date: '2025-10-15',
      })
    );
    expect(midtermRes.status).toBe(201);
    midtermId = ((await midtermRes.json()) as { id: string }).id;

    const finalRes = await asAdmin().request(
      '/assessments',
      jsonReq('POST', {
        sectionId,
        subjectId,
        termId,
        name: 'Final',
        type: 'exam',
        maxMarks: 50,
        weight: 70,
        date: '2025-12-10',
      })
    );
    expect(finalRes.status).toBe(201);
    finalId = ((await finalRes.json()) as { id: string }).id;

    const blockedRes = await asUnassignedTeacher().request(
      '/assessments',
      jsonReq('POST', {
        sectionId,
        subjectId,
        termId,
        name: 'Pop quiz',
        type: 'quiz',
        maxMarks: 10,
        weight: 5,
        date: '2025-10-01',
      })
    );
    expect(blockedRes.status).toBe(403);
  });

  it('bulk-enters marks, rejects out-of-range scores and students outside the section', async () => {
    const res = await asAssignedTeacher().request(
      '/marks/bulk',
      jsonReq('POST', {
        assessmentId: midtermId,
        marks: [
          { studentId: studentAId, score: 40 },
          { studentId: studentBId, score: 45 },
        ],
      })
    );
    expect(res.status).toBe(200);

    const rosterRes = await asAssignedTeacher().request(`/assessments/${midtermId}/marks`);
    const roster = (await rosterRes.json()) as { studentId: string; score: string | null }[];
    expect(roster.find((r) => r.studentId === studentAId)?.score).toBe('40');

    const overMaxRes = await asAssignedTeacher().request(
      '/marks/bulk',
      jsonReq('POST', { assessmentId: midtermId, marks: [{ studentId: studentAId, score: 999 }] })
    );
    expect(overMaxRes.status).toBe(422);

    const [otherSchool] = await db
      .insert(schools)
      .values({ name: 'Other school (throwaway)', slug: `other-school-${Date.now()}` })
      .returning();
    const bogusStudentId = '00000000-0000-0000-0000-000000000000';
    const outsideRes = await asAssignedTeacher().request(
      '/marks/bulk',
      jsonReq('POST', { assessmentId: midtermId, marks: [{ studentId: bogusStudentId, score: 10 }] })
    );
    expect(outsideRes.status).toBe(422);
    await db.delete(schools).where(eq(schools.id, otherSchool.id));

    // Re-submit final exam marks too, needed for the report card test below.
    const finalRes = await asAdmin().request(
      '/marks/bulk',
      jsonReq('POST', {
        assessmentId: finalId,
        marks: [
          { studentId: studentAId, score: 45 },
          { studentId: studentBId, score: 40 },
        ],
      })
    );
    expect(finalRes.status).toBe(200);
  });

  let reportCardId: string;

  it('computes a report card with the correct weighted total and grade', async () => {
    const res = await asAdmin().request('/report-cards/compute', jsonReq('POST', { studentId: studentAId, termId }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      status: string;
      payload: { subjects: { total: number; grade: string }[]; overallAverage: number; overallGrade: string };
    };
    reportCardId = body.id;
    expect(body.status).toBe('draft');

    // Student A: midterm 40/50 (80%) weight 30, final 45/50 (90%) weight 70
    // -> 0.3*80 + 0.7*90 = 87 -> grade B.
    expect(body.payload.subjects).toHaveLength(1);
    expect(body.payload.subjects[0].total).toBeCloseTo(87, 5);
    expect(body.payload.subjects[0].grade).toBe('B');
    expect(body.payload.overallAverage).toBeCloseTo(87, 5);
    expect(body.payload.overallGrade).toBe('B');
  });

  it('hides a draft report card from non-admins and allows admin to see it', async () => {
    const teacherRes = await asAssignedTeacher().request(`/report-cards/${reportCardId}`);
    expect(teacherRes.status).toBe(403);

    const adminRes = await asAdmin().request(`/report-cards/${reportCardId}`);
    expect(adminRes.status).toBe(200);
  });

  it('publishes, then blocks recompute and double-publish, then becomes visible to the assigned teacher', async () => {
    const publishRes = await asAdmin().request(`/report-cards/${reportCardId}/publish`, { method: 'POST' });
    expect(publishRes.status).toBe(200);
    expect(((await publishRes.json()) as { status: string }).status).toBe('published');

    const recomputeRes = await asAdmin().request(
      '/report-cards/compute',
      jsonReq('POST', { studentId: studentAId, termId })
    );
    expect(recomputeRes.status).toBe(409);

    const doublePublishRes = await asAdmin().request(`/report-cards/${reportCardId}/publish`, { method: 'POST' });
    expect(doublePublishRes.status).toBe(409);

    const teacherRes = await asAssignedTeacher().request(`/report-cards/${reportCardId}`);
    expect(teacherRes.status).toBe(200);

    const unassignedTeacherRes = await asUnassignedTeacher().request(`/report-cards/${reportCardId}`);
    expect(unassignedTeacherRes.status).toBe(403);
  });
});
