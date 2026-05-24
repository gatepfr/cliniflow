import { describe, it, expect } from 'vitest';
import { verifyEvolutionWebhook } from '../webhook.js';

const validPayload = {
  event: 'messages.upsert',
  instance: 'test-instance',
  data: { key: { remoteJid: '+5543999999999@s.whatsapp.net' }, message: {} },
  destination: 'https://example.com/webhooks/evolution/tenant123',
  date_time: '2026-05-23T12:00:00.000Z',
  sender: '+5543999999999@s.whatsapp.net',
  server_url: 'http://localhost:8080',
  apikey: 'valid-api-key-123',
};

describe('verifyEvolutionWebhook', () => {
  it('returns true when apikey matches', () => {
    expect(verifyEvolutionWebhook(validPayload, 'valid-api-key-123')).toBe(true);
  });

  it('returns false when apikey does not match', () => {
    expect(verifyEvolutionWebhook(validPayload, 'wrong-key')).toBe(false);
  });

  it('returns false when apikey is missing from body', () => {
    const { apikey: _removed, ...noKey } = validPayload;
    expect(verifyEvolutionWebhook(noKey, 'valid-api-key-123')).toBe(false);
  });

  it('returns false for empty body', () => {
    expect(verifyEvolutionWebhook({}, 'valid-api-key-123')).toBe(false);
  });

  it('returns false for null body', () => {
    expect(verifyEvolutionWebhook(null, 'valid-api-key-123')).toBe(false);
  });

  it('returns false when apikey is an empty string', () => {
    const emptyKey = { ...validPayload, apikey: '' };
    expect(verifyEvolutionWebhook(emptyKey, 'valid-api-key-123')).toBe(false);
  });

  it('is a type guard — narrows to EvolutionWebhookPayload', () => {
    const result = verifyEvolutionWebhook(validPayload, 'valid-api-key-123');
    if (result) {
      expect(validPayload.event).toBe('messages.upsert');
    }
    expect(result).toBe(true);
  });
});
