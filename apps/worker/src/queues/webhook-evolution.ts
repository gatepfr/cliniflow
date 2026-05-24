import type { Job } from 'bullmq';

export interface WebhookEvolutionJobData {
  event: string;
  instance: string;
  tenantId: string;
  receivedAt: string;
  // NOTE: message content is NOT stored here — LGPD art. 11
}

/**
 * Processes an incoming Evolution API webhook event.
 * Phase 1: stub — routing logic added in Phase 4.
 *
 * Job data intentionally omits message body content (LGPD art. 11).
 */
export async function processWebhookEvolution(
  job: Job<WebhookEvolutionJobData>,
): Promise<void> {
  job.log(
    `[webhook-evolution] Job ${job.id}: event=${job.data.event} instance=${job.data.instance}`,
  );
  // Phase 4 will route: messages.upsert → ai-conversation queue
  // Phase 3 will route: messages.update → message status update
}
