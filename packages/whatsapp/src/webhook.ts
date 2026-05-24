import { timingSafeEqual } from 'node:crypto';
import type { EvolutionWebhookPayload } from './types.js';

/**
 * Verifies an Evolution API webhook payload using the shared apikey.
 *
 * Evolution API v2 does NOT use HMAC-SHA256. It embeds the `apikey` field
 * directly in the webhook JSON body. We use constant-time comparison to
 * prevent timing attacks. Reference: RESEARCH.md Pattern 5 (MEDIUM confidence).
 *
 * SECURITY: The verification must happen over HTTPS in production to protect
 * the apikey from interception. The apikey in the body is equivalent to a
 * shared secret — not a cryptographic signature. (T-1-05 threat mitigation)
 *
 * @param body - The parsed webhook request body
 * @param expectedApiKey - The EVOLUTION_API_KEY env var value
 * @returns true if the apikey matches, false otherwise
 */
export function verifyEvolutionWebhook(
  body: unknown,
  expectedApiKey: string,
): body is EvolutionWebhookPayload {
  if (!body || typeof body !== 'object') return false;

  const payload = body as Record<string, unknown>;
  const receivedKey = payload['apikey'];

  if (typeof receivedKey !== 'string' || typeof expectedApiKey !== 'string') {
    return false;
  }

  // Constant-time comparison to prevent timing attacks (T-1-PLAN05-03)
  try {
    const a = Buffer.from(receivedKey);
    const b = Buffer.from(expectedApiKey);
    if (a.length !== b.length) {
      // Still do a dummy comparison to prevent length-timing attacks
      timingSafeEqual(Buffer.alloc(1), Buffer.alloc(1));
      return false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Extracts safe job data from a webhook payload for BullMQ enqueueing.
 *
 * LGPD compliance: NEVER includes body.data — that field may contain
 * WhatsApp message content (PII under LGPD art. 11). Only metadata
 * is stored in job queues. (T-1-PLAN05-01 threat mitigation)
 *
 * @param payload - Verified Evolution API webhook payload
 * @returns Safe job data containing only event metadata (no message content)
 */
export function extractWebhookJobData(payload: EvolutionWebhookPayload): {
  event: string;
  instance: string;
  receivedAt: string;
  // data field deliberately omitted to prevent PII from entering job storage (LGPD art. 11)
} {
  return {
    event: payload.event,
    instance: payload.instance,
    receivedAt: new Date().toISOString(),
  };
}
