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

  it('GET /api/killswitch-status requires Bearer token and returns fallback when DB is absent', async () => {
    const unauthRes = await app.request('/api/killswitch-status', {}, makeEnv({ DB: null }));
    expect(unauthRes.status).toBe(401);

    const res = await app.request('/api/killswitch-status', {
      headers: { Authorization: 'Bearer test-token' },
    }, makeEnv({ DB: null }));
    expect(res.status).toBe(200);
    const body = await res.json() as { enabled: boolean; halted: boolean };
    expect(body.enabled).toBe(true);
    expect(body.halted).toBe(false);
  });

  it('GET /api/killswitch-status forwards x-user-id to D1 settings query', async () => {
    const mockFirst = vi.fn().mockResolvedValue({
      id: 'set_1',
      user_id: 'usr_worker',
      killswitch_enabled: 0,
      killswitch_reason: 'Tenant halt',
      killswitch_triggered_at: 12345,
    });
    const mockBind = vi.fn().mockReturnValue({ first: mockFirst });
    const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
    const res = await app.request('/api/killswitch-status', {
      headers: { Authorization: 'Bearer test-token', 'x-user-id': 'usr_worker' },
    }, makeEnv({ DB: { prepare: mockPrepare } as unknown as WorkerEnv['DB'] }));
    expect(res.status).toBe(200);
    expect(mockBind).toHaveBeenCalledWith('usr_worker');
    const body = await res.json() as { enabled: boolean; halted: boolean; haltReason: string };
    expect(body.enabled).toBe(false);
    expect(body.halted).toBe(true);
    expect(body.haltReason).toBe('Tenant halt');
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
