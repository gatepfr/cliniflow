import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../server.js';
import { redis } from '../lib/redis.js';
import { createId } from '@clinicaflow/shared';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ logger: false });
});

afterAll(async () => {
  await app.close();
});

describe('Auth routes', () => {
  const testEmail = `test-${createId()}@apitest.clinicaflow`;
  const testPassword = 'TestPassword123';

  it('POST /api/auth/signup — returns 201 + accessToken + sets httpOnly cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: {
        tenantName: `API Test Clinic ${createId()}`,
        email: testEmail,
        password: testPassword,
        name: 'Test Owner',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ accessToken: string }>();
    expect(body.accessToken).toBeTruthy();
    expect(typeof body.accessToken).toBe('string');

    const cookies = res.cookies;
    const refreshCookie = cookies.find((c) => c.name === 'refreshToken');
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie?.httpOnly).toBe(true);
    expect(refreshCookie?.path).toBe('/api/auth/refresh');
  });

  it('POST /api/auth/signup — rejects duplicate email with 409', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: {
        tenantName: 'API Test Clinic Dup',
        email: testEmail,
        password: testPassword,
        name: 'Test Owner 2',
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it('POST /api/auth/login — valid credentials return 200 + accessToken + cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: testEmail, password: testPassword },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ accessToken: string }>();
    expect(body.accessToken).toBeTruthy();

    const refreshCookie = res.cookies.find((c) => c.name === 'refreshToken');
    expect(refreshCookie).toBeDefined();
  });

  it('POST /api/auth/login — wrong password returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: testEmail, password: 'WrongPassword!' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/auth/logout — invalidates refresh token in Redis', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: testEmail, password: testPassword },
    });
    const accessToken = loginRes.json<{ accessToken: string }>().accessToken;
    const refreshCookie = loginRes.cookies.find((c) => c.name === 'refreshToken')!;

    const storedBefore = await redis.get(`token:${refreshCookie.value}`);
    expect(storedBefore).toBeTruthy();

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { authorization: `Bearer ${accessToken}` },
      cookies: { refreshToken: refreshCookie.value },
    });
    expect(logoutRes.statusCode).toBe(200);

    // Token must be deleted from Redis (FOUND-05)
    const storedAfter = await redis.get(`token:${refreshCookie.value}`);
    expect(storedAfter).toBeNull();
  });

  it('POST /api/auth/refresh — after logout, refresh returns 401', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: testEmail, password: testPassword },
    });
    const accessToken = loginRes.json<{ accessToken: string }>().accessToken;
    const refreshCookie = loginRes.cookies.find((c) => c.name === 'refreshToken')!;

    await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { authorization: `Bearer ${accessToken}` },
      cookies: { refreshToken: refreshCookie.value },
    });

    // Try to refresh after logout — must fail (FOUND-05)
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { refreshToken: refreshCookie.value },
    });
    expect(refreshRes.statusCode).toBe(401);
  });
});
