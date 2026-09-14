// worker-api-routes.test.ts — tests for handleApiRequest and killswitch-status
import { describe, it, expect, vi } from 'vitest';
import { handleApiRequest, app } from './worker-api';
import type { WorkerEnv } from './worker-env';

vi.mock('./lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

function makeEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    DB: null,
    ADMIN_TOKEN: 'test-token',
    VERSION: 'v1.0.0',
    ASSETS: { fetch: vi.fn().mockResolvedValue(new Response('not found', { status: 404 })) },
    ...overrides,
  };
}

describe('worker-api supplementary tests', () => {
  it('handleApiRequest handles GET /api/version successfully', async () => {
    const req = new Request('http://localhost/api/version');
    const res = await handleApiRequest(req, makeEnv({ VERSION: 'abcdef123456' }));
    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean; data: { version: string; shortSha: string } };
    expect(json.ok).toBe(true);
    expect(json.data.shortSha).toBe('abcdef1');
  });

  it('GET /api/killswitch-status returns fallback when DB is absent', async () => {
    const res = await app.request('/api/killswitch-status', {}, makeEnv({ DB: null }));
    expect(res.status).toBe(200);
    const body = await res.json() as { enabled: boolean; halted: boolean };
    expect(body.enabled).toBe(true);
    expect(body.halted).toBe(false);
  });

  it('CORS origin handler resolves origin correctly', async () => {
    const env = makeEnv({ ALLOWED_ORIGINS: 'https://app.cashclaw.io,https://test.cashclaw.io' });
    const res1 = await app.request('/api/health', {
      headers: { Origin: 'https://app.cashclaw.io' },
    }, env);
    expect(res1.headers.get('access-control-allow-origin')).toBe('https://app.cashclaw.io');

    const res2 = await app.request('/api/health', {
      headers: { Origin: 'https://unauthorized.com' },
    }, env);
    expect(res2.headers.get('access-control-allow-origin')).toBe('https://app.cashclaw.io');
  });
});
