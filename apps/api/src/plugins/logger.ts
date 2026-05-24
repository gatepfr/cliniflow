import pino from 'pino';

export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.phone',
      '*.phone_normalized',
      '*.full_name',
      '*.birth_date',
      '*.email',
      '*.cpf',
      'body.password',
      'body.content',
    ],
    censor: '[REDACTED]',
  },
  serializers: {
    req: (req: { method: string; url: string }) => ({
      method: req.method,
      url: req.url,
      // NO body or headers logging — PII risk
    }),
  },
});
