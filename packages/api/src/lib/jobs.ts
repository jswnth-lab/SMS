import { db, jobs, type jobStatusEnum, type jobTypeEnum } from '@monorepo/db';
import { sql } from 'drizzle-orm';

export type JobType = typeof jobTypeEnum.enumValues[number];
export type JobStatus = typeof jobStatusEnum.enumValues[number];

export interface JobPayload {
  'notify.absence': { studentId: string; attendanceRecordId: string; date: string };
  'notify.announcement': { announcementId: string };
  'pdf.report-card': { reportCardId: string };
  'import.students': { importFileUrl: string; sectionId: string };
}

/**
 * Enqueue a job for background processing. The job immediately enters the
 * `pending` state and will be picked up by the worker process.
 */
export async function enqueueJob<T extends JobType>(
  schoolId: string,
  type: T,
  payload: JobPayload[T]
): Promise<{ id: string }> {
  const [row] = await db
    .insert(jobs)
    .values({ schoolId, type, payload })
    .returning({ id: jobs.id });
  return row;
}

/**
 * Claim the next job(s) for processing. Atomically marks them as
 * `processing` so only one worker will process each. Returns jobs that are
 * either pending and have a null nextRetryAt (brand new), or pending with a
 * nextRetryAt in the past (retry time has come).
 */
export async function claimPendingJobs(limit = 10) {
  const claimed = await db
    .update(jobs)
    .set({ status: 'processing' as const, startedAt: new Date() })
    .where(
      sql`
        "status" = 'pending'
        AND ("next_retry_at" IS NULL OR "next_retry_at" <= now())
      `
    )
    .returning();
  return claimed.slice(0, limit);
}

/**
 * Mark a job as completed, storing any result.
 */
export async function completeJob(jobId: string, result?: unknown) {
  const [updated] = await db
    .update(jobs)
    .set({ status: 'completed' as const, result, completedAt: new Date() })
    .where(sql`"id" = ${jobId}`)
    .returning();
  return updated;
}

/**
 * Mark a job as failed. If it hasn't exceeded max_attempts, schedule a
 * retry by setting nextRetryAt to exponential backoff (2^attempt seconds).
 * Otherwise, mark it as failed permanently.
 */
export async function failJob(jobId: string, error: string) {
  const [existing] = await db.select().from(jobs).where(sql`"id" = ${jobId}`);
  if (!existing) return null;

  const nextAttempt = existing.attempts + 1;
  if (nextAttempt >= existing.maxAttempts) {
    const [updated] = await db
      .update(jobs)
      .set({ status: 'failed' as const, error, completedAt: new Date() })
      .where(sql`"id" = ${jobId}`)
      .returning();
    return updated;
  }

  const backoffMs = Math.pow(2, nextAttempt) * 1000;
  const nextRetryAt = new Date(Date.now() + backoffMs);
  const [updated] = await db
    .update(jobs)
    .set({ status: 'pending' as const, error, nextRetryAt, attempts: nextAttempt })
    .where(sql`"id" = ${jobId}`)
    .returning();
  return updated;
}
