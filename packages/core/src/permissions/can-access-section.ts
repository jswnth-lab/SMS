import { type Database, sections, teachingAssignments } from '@monorepo/db';
import { and, eq } from 'drizzle-orm';
import type { PermissionContext } from '../types';

export async function canAccessSection(
  ctx: PermissionContext,
  sectionId: string,
  db: Database
): Promise<boolean> {
  switch (ctx.role) {
    case 'admin': {
      const rows = await db
        .select({ id: sections.id })
        .from(sections)
        .where(and(eq(sections.id, sectionId), eq(sections.schoolId, ctx.schoolId)));
      return rows.length > 0;
    }

    case 'teacher': {
      const rows = await db
        .select({ id: teachingAssignments.id })
        .from(teachingAssignments)
        .where(
          and(
            eq(teachingAssignments.sectionId, sectionId),
            eq(teachingAssignments.schoolId, ctx.schoolId),
            eq(teachingAssignments.teacherMembershipId, ctx.membershipId)
          )
        );
      return rows.length > 0;
    }

    default:
      return false;
  }
}
