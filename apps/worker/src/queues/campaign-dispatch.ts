import type { Job } from 'bullmq';

export interface CampaignDispatchJobData {
  campaignId: string;
  patientId: string;
  tenantId: string;
  messageTemplate: string;
}

/**
 * Processes a single campaign message dispatch.
 * Phase 1: stub — full implementation in Phase 3 (Campaign Engine).
 *
 * Job data contains only IDs — no PII (LGPD art. 11).
 */
export async function processCampaignDispatch(
  job: Job<CampaignDispatchJobData>,
): Promise<void> {
  job.log(
    `[campaign-dispatch] Job ${job.id} received for tenant ${job.data.tenantId}. Phase 3 will implement dispatch.`,
  );
}
