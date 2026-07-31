export interface AbsenceNotificationJob {
  schoolId: string;
  studentId: string;
  attendanceRecordId: string;
  date: string;
}

// Stub queue: no real job runner (BullMQ/pg-boss/etc.) exists yet, so this
// just records the job in memory and logs it - enough for callers/tests to
// observe that a brand-new absence record actually triggers a notification
// attempt, without committing to a specific queue technology before one is
// chosen. Swap the body of enqueueAbsenceNotification for a real enqueue
// call when that infra exists; the call site in attendance.ts won't need to
// change.
const queue: AbsenceNotificationJob[] = [];

export function enqueueAbsenceNotification(job: AbsenceNotificationJob): void {
  queue.push(job);
  console.log('[stub] enqueued absence notification', job);
}

export function getEnqueuedAbsenceNotifications(): readonly AbsenceNotificationJob[] {
  return queue;
}
