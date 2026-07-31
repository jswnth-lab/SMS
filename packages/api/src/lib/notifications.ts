import { db, guardians, notifications, studentGuardians } from '@monorepo/db';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';

export interface AbsenceEvent {
  schoolId: string;
  studentId: string;
  attendanceRecordId: string;
  date: string;
}

/**
 * Writes a real `notifications` row for every verified, non-revoked
 * guardian of the student - delivery channels (SMS/push/email) come later;
 * this stage is just "the event happened, so a notification exists for
 * whoever should see it, and they can list/mark it read." A student with
 * no guardians on file yet (or none verified) gets no rows - there's
 * nobody to notify.
 *
 * Goes through the DB owner connection, not app_rw/RLS: resolving
 * guardians requires joining through `users`, and the users RLS policy
 * only lets app_rw see a user who is the caller or shares a school
 * membership - guardians routinely have neither (same reasoning as
 * guardians.ts and the guardians CSV import).
 */
export async function notifyGuardiansOfAbsence(event: AbsenceEvent) {
  const guardianLinks = await db
    .select({ guardianUserId: guardians.userId })
    .from(studentGuardians)
    .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
    .where(
      and(
        eq(studentGuardians.studentId, event.studentId),
        eq(studentGuardians.schoolId, event.schoolId),
        isNotNull(studentGuardians.verifiedAt),
        isNull(studentGuardians.revokedAt)
      )
    );
  if (guardianLinks.length === 0) return [];

  return db
    .insert(notifications)
    .values(
      guardianLinks.map((link) => ({
        userId: link.guardianUserId,
        schoolId: event.schoolId,
        type: 'attendance.absence',
        payload: { studentId: event.studentId, date: event.date, attendanceRecordId: event.attendanceRecordId },
      }))
    )
    .returning();
}
