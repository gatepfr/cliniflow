/**
 * Evolution API v2.3.7 type definitions.
 * Based on REST API analysis — no npm SDK (deleted Dec 2023).
 * Reference: doc.evolution-api.com/v2
 * Docker image: evoapicloud/evolution-api:v2.3.7 (D-07)
 */

/** Payload received from Evolution API webhook */
export interface EvolutionWebhookPayload {
  event: string;                       // e.g. "messages.upsert", "connection.update", "qrcode.updated"
  instance: string;                    // instance name (tenant-specific)
  data: Record<string, unknown>;       // event-specific data — DO NOT log (may contain PII)
  destination: string;                 // webhook URL
  date_time: string;                   // ISO timestamp
  sender: string;                      // sender JID
  server_url: string;                  // Evolution API server URL
  apikey: string;                      // shared secret for verification — compare with EVOLUTION_API_KEY
}

/** Request body for sending a text message */
export interface SendTextRequest {
  number: string;       // Phone in E.164 without '+' prefix (e.g. "5543991234567")
  text: string;         // Message content
  delay?: number;       // Delay in milliseconds before sending
}

/** Response from sendText endpoint */
export interface SendTextResponse {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  message: Record<string, unknown>;
  messageTimestamp: number;
  status: string;
}

/** Request body for creating an instance */
export interface CreateInstanceRequest {
  instanceName: string;
  qrcode: boolean;
  number?: string;
  token?: string;
}

/** Response from create instance */
export interface CreateInstanceResponse {
  instance: {
    instanceName: string;
    status: string;
  };
  hash: {
    apikey: string;
  };
  qrcode?: {
    pairingCode: string | null;
    code: string;
    base64: string;
  };
}

/** Connection state for an instance */
export type ConnectionState = 'open' | 'close' | 'connecting';
