import type { Job } from 'bullmq';

export interface AiConversationJobData {
  conversationId: string;
  patientId: string;
  tenantId: string;
  inboundMessageId?: string;
}

/**
 * Processes an inbound message through the AI conversation pipeline.
 * Phase 1: stub — full implementation in Phase 4 (AI Conversation).
 *
 * Job data contains only IDs — no PII (LGPD art. 11).
 */
export async function processAiConversation(
  job: Job<AiConversationJobData>,
): Promise<void> {
  job.log(
    `[ai-conversation] Job ${job.id} received for tenant ${job.data.tenantId}. Phase 4 will implement AI response.`,
  );
}
