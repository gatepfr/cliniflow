import { AppError } from '@clinicaflow/shared';
import type {
  SendTextRequest,
  SendTextResponse,
  CreateInstanceRequest,
  CreateInstanceResponse,
} from './types.js';

function getBaseUrl(): string {
  const url = process.env['EVOLUTION_API_URL'];
  if (!url) throw new AppError('WHATSAPP_CONFIG', 'EVOLUTION_API_URL is not set', 500);
  return url.replace(/\/$/, ''); // strip trailing slash
}

function getApiKey(): string {
  const key = process.env['EVOLUTION_API_KEY'];
  if (!key) throw new AppError('WHATSAPP_CONFIG', 'EVOLUTION_API_KEY is not set', 500);
  return key;
}

async function evolutionRequest<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': getApiKey(),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    // Never include response body in logs — may contain phone numbers or message content (LGPD)
    throw new AppError(
      'WHATSAPP_API_ERROR',
      `Evolution API error on ${method} ${path}: ${res.status}`,
      res.status >= 500 ? 502 : 400,
    );
  }

  return res.json() as Promise<T>;
}

/**
 * Send a text message via WhatsApp.
 * @param instanceName - Evolution API instance name (tenant-specific)
 * @param to - Phone number in E.164 WITHOUT '+' prefix (e.g. "5543991234567")
 * @param text - Message content (must be AI-rewritten for each recipient — see CLAUDE.md 2.2)
 * @param delayMs - Optional delay in milliseconds (used for typing indicator simulation)
 */
export async function sendTextMessage(
  instanceName: string,
  to: string,
  text: string,
  delayMs?: number,
): Promise<SendTextResponse> {
  const body: SendTextRequest = {
    number: to,
    text,
    ...(delayMs !== undefined ? { delay: delayMs } : {}),
  };
  return evolutionRequest<SendTextResponse>('POST', `/message/sendText/${instanceName}`, body);
}

/**
 * Send a typing indicator to simulate human-like typing.
 * Reduces WhatsApp ban risk by appearing more human (CLAUDE.md 2.2).
 * @param instanceName - Evolution API instance name
 * @param to - Phone in E.164 without '+' prefix
 * @param durationMs - Duration of typing indicator in milliseconds (default: 3000)
 */
export async function sendTypingIndicator(
  instanceName: string,
  to: string,
  durationMs: number = 3000,
): Promise<void> {
  await evolutionRequest('POST', `/chat/sendPresence/${instanceName}`, {
    number: to,
    options: {
      presence: 'composing',
      delay: durationMs,
    },
  });
}

/**
 * Create a new WhatsApp instance (used during tenant onboarding).
 */
export async function createInstance(
  params: CreateInstanceRequest,
): Promise<CreateInstanceResponse> {
  return evolutionRequest<CreateInstanceResponse>('POST', '/instance/create', params);
}
