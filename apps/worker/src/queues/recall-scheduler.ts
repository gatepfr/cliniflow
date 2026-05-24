import type { Job } from 'bullmq';

export interface RecallSchedulerJobData {
  tenantId: string;
  scheduledDate: string; // ISO date string
}

/**
 * Daily recall scheduler — finds patients due for recall and enqueues campaigns.
 * Phase 1: stub — full implementation in Phase 2/3.
 *
 * Job data contains only IDs and dates — no PII (LGPD art. 11).
 */
export async function processRecallScheduler(
  job: Job<RecallSchedulerJobData>,
): Promise<void> {
  job.log(
    `[recall-scheduler] Job ${job.id} received for date ${job.data.scheduledDate}. Phase 2/3 will implement recall logic.`,
  );
}
