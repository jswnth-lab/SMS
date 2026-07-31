import { db, announcements } from '@monorepo/db';
import { eq } from 'drizzle-orm';
import { completeJob, failJob, type JobPayload, type JobType } from './jobs';
import { notifyGuardiansOfAbsence } from './notifications';

export interface JobHandler<T extends JobType> {
  (payload: JobPayload[T], jobId: string): Promise<unknown>;
}

const handlers: Partial<Record<JobType, JobHandler<any>>> = {
  'notify.absence': async (payload, jobId) => {
    console.log(`[job:notify.absence] Processing`, payload);
    const result = await notifyGuardiansOfAbsence(payload);
    await completeJob(jobId, { notificationsCreated: result.length });
    return result;
  },

  'notify.announcement': async (payload, jobId) => {
    console.log(`[job:notify.announcement] Processing`, payload);
    // For now, just log and mark complete.
    // In future: send emails, push notifications, SMS, etc.
    const [announcement] = await db
      .select()
      .from(announcements)
      .where(eq(announcements.id, payload.announcementId));
    if (!announcement) {
      await failJob(jobId, 'Announcement not found');
      return;
    }
    await completeJob(jobId, { announcementTitle: announcement.title });
  },

  'pdf.report-card': async (payload, jobId) => {
    console.log(`[job:pdf.report-card] Processing`, payload);
    // Stub: would call PDF generation library, upload to storage, update report_cards.pdf_url
    await completeJob(jobId, { pdfUrl: `s3://reports/${payload.reportCardId}.pdf` });
  },

  'import.students': async (payload, jobId) => {
    console.log(`[job:import.students] Processing`, payload);
    // Stub: would fetch from importFileUrl, parse CSV, insert students
    await completeJob(jobId, { imported: 0 });
  },
};

/**
 * Execute a single job by type, handling errors with retry.
 */
export async function executeJob(jobId: string, type: JobType, payload: unknown) {
  const handler = handlers[type];
  if (!handler) {
    await failJob(jobId, `No handler for job type: ${type}`);
    return;
  }

  try {
    await handler(payload as any, jobId);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[job:${type}] Error:`, error);
    await failJob(jobId, error);
  }
}
