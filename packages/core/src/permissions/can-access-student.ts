import {
  type Database,
  guardians,
  students,
  studentGuardians,
  teachingAssignments,
} from '@monorepo/db';
import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import type { PermissionContext } from '../types';

export async function canAccessStudent(
  ctx: PermissionContext,
  studentId: string,
  db: Database
): Promise<boolean> {
  switch (ctx.role) {
    case 'admin': {
      const rows = await db
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.id, studentId), eq(students.schoolId, ctx.schoolId)));
      return rows.length > 0;
    }

    case 'teacher': {
      const rows = await db
        .select({ id: students.id })
        .from(students)
        .innerJoin(teachingAssignments, eq(teachingAssignments.sectionId, students.sectionId))
        .where(
          and(
            eq(students.id, studentId),
            eq(students.schoolId, ctx.schoolId),
            eq(teachingAssignments.teacherMembershipId, ctx.membershipId)
          )
        );
      return rows.length > 0;
    }

    case 'parent': {
      const rows = await db
        .select({ id: students.id })
        .from(students)
        .innerJoin(studentGuardians, eq(studentGuardians.studentId, students.id))
        .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
        .where(
          and(
            eq(students.id, studentId),
            eq(students.schoolId, ctx.schoolId),
            eq(guardians.userId, ctx.userId),
            isNotNull(studentGuardians.verifiedAt),
            isNull(studentGuardians.revokedAt)
          )
        );
      return rows.length > 0;
    }

    case 'student': {
      const rows = await db
        .select({ id: students.id })
        .from(students)
        .where(
          and(
            eq(students.id, studentId),
            eq(students.schoolId, ctx.schoolId),
            eq(students.userId, ctx.userId)
          )
        );
      return rows.length > 0;
    }

    default:
      return false;
  }
}
