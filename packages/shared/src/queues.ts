/**
 * Canonical queue names for BullMQ.
 * These must match exactly what the worker process registers.
 * Changing a name here requires updating all producers and consumers.
 */
export const QUEUE_NAMES = {
  CAMPAIGN_DISPATCH: 'campaign-dispatch',
  AI_CONVERSATION: 'ai-conversation',
  APPOINTMENT_CONFIRM: 'appointment-confirm',
  RECALL_SCHEDULER: 'recall-scheduler',
  WEBHOOK_EVOLUTION: 'webhook-evolution',
  DEAD_LETTER: 'dead-letter',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
