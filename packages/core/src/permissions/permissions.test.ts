import {
  db,
  schools,
  users,
  schoolMemberships,
  academicYears,
  gradeLevels,
  sections,
  subjects,
  students,
  guardians,
  studentGuardians,
  teachingAssignments,
} from '@monorepo/db';
import { inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PermissionContext } from '../types';
import { canAccessSection } from './can-access-section';
import { canAccessStudent } from './can-access-student';

// These are integration tests against a real Postgres instance (the local
// dev container), matching the rest of this repo's testing approach -
// permission logic is a set of joins across live tables, so mocking the
// query builder would just re-encode the same joins twice and let the
// mock silently drift from the real schema.
describe('permission helpers', () => {
  let schoolId: string;
  let teacherUserId: string;
  let teacherMembershipId: string;
  let sectionAssignedId: string;
  let sectionUnassignedId: string;
  let studentAId: string; // in the assigned section, parent A's child
  let studentBId: string; // in the assigned section, parent B's child
  let studentUnassignedSectionId: string; // in the unassigned section
  let parentAUserId: string;
  let parentBUserId: string;
  let parentAGuardianId: string;

  const cleanupIds = {
    schools: [] as string[],
    users: [] as string[],
  };

  beforeAll(async () => {
    const suffix = `vitest-${Date.now()}`;

    const [school] = await db
      .insert(schools)
      .values({ name: `Permissions Test School ${suffix}`, slug: `permissions-test-${suffix}` })
      .returning();
    schoolId = school.id;
    cleanupIds.schools.push(schoolId);

    const [academicYear] = await db
      .insert(academicYears)
      .values({ schoolId, name: `AY ${suffix}`, startsOn: '2025-09-01', endsOn: '2026-06-30' })
      .returning();

    const [gradeLevel] = await db
      .insert(gradeLevels)
      .values({ schoolId, name: `Grade ${suffix}`, sort: 1 })
      .returning();

    const [sectionAssigned, sectionUnassigned] = await db
      .insert(sections)
      .values([
        { schoolId, gradeLevelId: gradeLevel.id, academicYearId: academicYear.id, name: `A ${suffix}` },
        { schoolId, gradeLevelId: gradeLevel.id, academicYearId: academicYear.id, name: `B ${suffix}` },
      ])
      .returning();
    sectionAssignedId = sectionAssigned.id;
    sectionUnassignedId = sectionUnassigned.id;

    const [subject] = await db
      .insert(subjects)
      .values({ schoolId, nameEn: `Subject ${suffix}`, code: `SUBJ-${suffix}` })
      .returning();

    const [teacherUser, parentAUser, parentBUser] = await db
      .insert(users)
      .values([
        { phone: `+1000${suffix}`, passwordHash: 'x', nameEn: `Teacher ${suffix}` },
        { phone: `+1001${suffix}`, passwordHash: 'x', nameEn: `Parent A ${suffix}` },
        { phone: `+1002${suffix}`, passwordHash: 'x', nameEn: `Parent B ${suffix}` },
      ])
      .returning();
    teacherUserId = teacherUser.id;
    parentAUserId = parentAUser.id;
    parentBUserId = parentBUser.id;
    cleanupIds.users.push(teacherUser.id, parentAUser.id, parentBUser.id);

    const [teacherMembership] = await db
      .insert(schoolMemberships)
      .values({ userId: teacherUserId, schoolId, role: 'teacher', status: 'active' })
      .returning();
    teacherMembershipId = teacherMembership.id;

    // Teacher is only assigned to sectionAssigned, never sectionUnassigned.
    await db.insert(teachingAssignments).values({
      schoolId,
      teacherMembershipId,
      sectionId: sectionAssignedId,
      subjectId: subject.id,
      academicYearId: academicYear.id,
    });

    const [studentA, studentB, studentUnassignedSection] = await db
      .insert(students)
      .values([
        {
          schoolId,
          admissionNo: `A-${suffix}`,
          nameEn: `Student A ${suffix}`,
          dob: '2015-01-01',
          gender: 'male',
          sectionId: sectionAssignedId,
          joinedOn: '2024-01-01',
        },
        {
          schoolId,
          admissionNo: `B-${suffix}`,
          nameEn: `Student B ${suffix}`,
          dob: '2015-01-01',
          gender: 'female',
          sectionId: sectionAssignedId,
          joinedOn: '2024-01-01',
        },
        {
          schoolId,
          admissionNo: `C-${suffix}`,
          nameEn: `Student Unassigned-section ${suffix}`,
          dob: '2015-01-01',
          gender: 'male',
          sectionId: sectionUnassignedId,
          joinedOn: '2024-01-01',
        },
      ])
      .returning();
    studentAId = studentA.id;
    studentBId = studentB.id;
    studentUnassignedSectionId = studentUnassignedSection.id;

    const [guardianA] = await db.insert(guardians).values({ schoolId, userId: parentAUserId }).returning();
    const [guardianB] = await db.insert(guardians).values({ schoolId, userId: parentBUserId }).returning();
    parentAGuardianId = guardianA.id;

    await db.insert(studentGuardians).values([
      // Parent A: verified, active link to student A only.
      {
        schoolId,
        studentId: studentAId,
        guardianId: guardianA.id,
        relation: 'father',
        verifiedAt: new Date(),
      },
      // Parent B: verified, active link to student B.
      {
        schoolId,
        studentId: studentBId,
        guardianId: guardianB.id,
        relation: 'mother',
        verifiedAt: new Date(),
      },
      // Parent A also has a *revoked* link to student B - must not grant access.
      {
        schoolId,
        studentId: studentBId,
        guardianId: guardianA.id,
        relation: 'guardian',
        verifiedAt: new Date(),
        revokedAt: new Date(),
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(studentGuardians).where(inArray(studentGuardians.schoolId, cleanupIds.schools));
    await db.delete(teachingAssignments).where(inArray(teachingAssignments.schoolId, cleanupIds.schools));
    await db.delete(guardians).where(inArray(guardians.schoolId, cleanupIds.schools));
    await db.delete(students).where(inArray(students.schoolId, cleanupIds.schools));
    await db.delete(subjects).where(inArray(subjects.schoolId, cleanupIds.schools));
    await db.delete(sections).where(inArray(sections.schoolId, cleanupIds.schools));
    await db.delete(gradeLevels).where(inArray(gradeLevels.schoolId, cleanupIds.schools));
    await db.delete(academicYears).where(inArray(academicYears.schoolId, cleanupIds.schools));
    await db.delete(schoolMemberships).where(inArray(schoolMemberships.schoolId, cleanupIds.schools));
    await db.delete(schools).where(inArray(schools.id, cleanupIds.schools));
    await db.delete(users).where(inArray(users.id, cleanupIds.users));
  });

  function parentACtx(): PermissionContext {
    return { userId: parentAUserId, schoolId, role: 'parent', membershipId: '00000000-0000-0000-0000-000000000000' };
  }

  function teacherCtx(): PermissionContext {
    return { userId: teacherUserId, schoolId, role: 'teacher', membershipId: teacherMembershipId };
  }

  it('parent A cannot read parent B child', async () => {
    await expect(canAccessStudent(parentACtx(), studentBId, db)).resolves.toBe(false);
  });

  it('parent A can read her own child', async () => {
    await expect(canAccessStudent(parentACtx(), studentAId, db)).resolves.toBe(true);
  });

  it('teacher cannot read an un-assigned section', async () => {
    await expect(canAccessSection(teacherCtx(), sectionUnassignedId, db)).resolves.toBe(false);
  });

  it('teacher cannot read a student in an un-assigned section', async () => {
    await expect(canAccessStudent(teacherCtx(), studentUnassignedSectionId, db)).resolves.toBe(false);
  });

  it('teacher can read the section they are assigned to', async () => {
    await expect(canAccessSection(teacherCtx(), sectionAssignedId, db)).resolves.toBe(true);
  });

  it('revoked guardian link denies access even though it was once verified', async () => {
    // Parent A's link to student B exists and was verified, but is revoked.
    await expect(canAccessStudent(parentACtx(), studentBId, db)).resolves.toBe(false);
  });
});
