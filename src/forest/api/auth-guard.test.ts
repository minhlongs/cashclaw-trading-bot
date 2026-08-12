import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { authGuard } from './auth-guard';

const AUTH_ENDPOINT = '/api/users/me';
const ADMIN_TOKEN = 'trade-bot-admin';

function makeApp() {
  const app = new Hono<{ Bindings: { ADMIN_TOKEN: string } }>();
  app.use('*', authGuard());
  app.get(AUTH_ENDPOINT, (c) => c.json({ success: true }));
  return app;
}

function fetchWithToken(token: string, adminToken: string): Response | Promise<Response> {
  const app = makeApp();
  const request = new Request(`http://localhost${AUTH_ENDPOINT}`, {
    headers: token !== '' ? { Authorization: `Bearer ${token}` } : {},
  });
  return app.fetch(request, { ADMIN_TOKEN: adminToken });
}

function fetchNoAuthHeader(adminToken: string): Response | Promise<Response> {
  const app = makeApp();
  const request = new Request(`http://localhost${AUTH_ENDPOINT}`);
  return app.fetch(request, { ADMIN_TOKEN: adminToken });
}

function fetchRawHeader(rawHeader: string | undefined, adminToken: string): Response | Promise<Response> {
  const app = makeApp();
  const headers: Record<string, string> = {};
  if (rawHeader !== undefined) {
    headers['Authorization'] = rawHeader;
  }
  const request = new Request(`http://localhost${AUTH_ENDPOINT}`, { headers });
  return app.fetch(request, { ADMIN_TOKEN: adminToken });
}

describe('authGuard', () => {
  describe('env token validation', () => {
    it('returns 401 when ADMIN_TOKEN env is empty', async () => {
      const response = await fetchWithToken('some-secret', '');
      expect(response.status).toBe(401);
    });

    it('returns 401 when ADMIN_TOKEN env is whitespace-only', async () => {
      const response = await fetchWithToken('some-secret', '   ');
      expect(response.status).toBe(401);
    });

    it('returns 401 when ADMIN_TOKEN env has embedded whitespace', async () => {
      const response = await fetchWithToken('sec ret', 'sec ret');
      expect(response.status).toBe(401);
    });

    it('returns 401 when ADMIN_TOKEN env has leading/trailing whitespace', async () => {
      const response = await fetchWithToken('secret', ' secret ');
      expect(response.status).toBe(401);
    });
  });

  describe('missing or malformed Authorization header', () => {
    it('returns 401 when Authorization header is absent', async () => {
      const response = await fetchNoAuthHeader(ADMIN_TOKEN);
      expect(response.status).toBe(401);
    });

    it('returns 401 when Authorization header is empty string', async () => {
      const response = await fetchRawHeader('', ADMIN_TOKEN);
      expect(response.status).toBe(401);
    });

    it('returns 401 for non-Bearer scheme', async () => {
      const response = await fetchRawHeader(`Basic ${ADMIN_TOKEN}`, ADMIN_TOKEN);
      expect(response.status).toBe(401);
    });

    it('returns 401 for just the scheme with no token', async () => {
      const response = await fetchRawHeader('Bearer', ADMIN_TOKEN);
      expect(response.status).toBe(401);
    });

    it('returns 401 for Bearer with empty token', async () => {
      const response = await fetchRawHeader('Bearer ', ADMIN_TOKEN);
      expect(response.status).toBe(401);
    });

    it('returns 401 for Bearer with extra spaces after token', async () => {
      const response = await fetchRawHeader(`Bearer ${ADMIN_TOKEN} extra`, ADMIN_TOKEN);
      expect(response.status).toBe(401);
    });
  });

  describe('token comparison', () => {
    it('accepts exact matching token', async () => {
      const response = await fetchWithToken(ADMIN_TOKEN, ADMIN_TOKEN);
      expect(response.status).toBe(200);
    });

    it('rejects wrong token', async () => {
      const response = await fetchWithToken('wrong-token', ADMIN_TOKEN);
      expect(response.status).toBe(401);
    });

    it('rejects token with different casing', async () => {
      const response = await fetchWithToken(ADMIN_TOKEN.toUpperCase(), ADMIN_TOKEN);
      expect(response.status).toBe(401);
    });

    it('rejects uppercase token against lowercase env', async () => {
      const response = await fetchWithToken('ABC', 'abc');
      expect(response.status).toBe(401);
    });

    it('accepts mixed-case exact match', async () => {
      const token = 'PrOduct-SeCret123';
      const response = await fetchWithToken(token, token);
      expect(response.status).toBe(200);
    });

    it('rejects token with leading space', async () => {
      const response = await fetchWithToken(` ${ADMIN_TOKEN}`, ADMIN_TOKEN);
      expect(response.status).toBe(401);
    });

    it('accepts long matching token', async () => {
      const token = 'a'.repeat(200);
      const response = await fetchWithToken(token, token);
      expect(response.status).toBe(200);
    });

    it('rejects token that differs by one character', async () => {
      const response = await fetchWithToken('trade-bot-adm1n', ADMIN_TOKEN);
      expect(response.status).toBe(401);
    });

    it('accepts token with special characters', async () => {
      const token = 'te!$t@3ecr3t';
      const response = await fetchWithToken(token, token);
      expect(response.status).toBe(200);
    });

    it('returns 401 for empty token in Bearer', async () => {
      const response = await fetchWithToken('', ADMIN_TOKEN);
      expect(response.status).toBe(401);
    });
  });

  describe('authorized requests reach handler', () => {
    it('returns success body for authorized request', async () => {
      const app = makeApp();
      const request = new Request(`http://localhost${AUTH_ENDPOINT}`, {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      const response = await app.fetch(request, { ADMIN_TOKEN });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ success: true });
    });
  });
});
