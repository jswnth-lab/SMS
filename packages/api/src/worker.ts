import { claimPendingJobs } from './lib/jobs';
import { executeJob } from './lib/job-handlers';

const POLL_INTERVAL_MS = parseInt(process.env.JOB_POLL_INTERVAL_MS || '2000', 10);
const BATCH_SIZE = parseInt(process.env.JOB_BATCH_SIZE || '10', 10);

let stopping = false;

async function tick() {
  const claimed = await claimPendingJobs(BATCH_SIZE);
  if (claimed.length === 0) return;

  console.log(`[worker] Claimed ${claimed.length} job(s)`);
  // Run claimed jobs concurrently - each job type's handler is independent
  // and idempotent-ish (completeJob/failJob), so there's no ordering
  // requirement between them within a batch.
  await Promise.all(claimed.map((job) => executeJob(job.id, job.type, job.payload)));
}

async function loop() {
  console.log(`[worker] Started, polling every ${POLL_INTERVAL_MS}ms`);
  while (!stopping) {
    try {
      await tick();
    } catch (err) {
      console.error('[worker] Poll error:', err);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

process.on('SIGINT', () => {
  stopping = true;
});
process.on('SIGTERM', () => {
  stopping = true;
});

loop();
