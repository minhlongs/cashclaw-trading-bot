// worker-extended.test.ts — Extended coverage for worker.ts uncovered lines
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger, mockManager, mockTickReport } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  mockManager: {
    getAllBots: vi.fn().mockReturnValue([]),
    getRunningBots: vi.fn().mockReturnValue([]),
  },
  mockTickReport: { evaluated: 1, errors: 0 },
}));

vi.mock('@/lib/logger', () => ({ createLogger: () => mockLogger }));
vi.mock('@/tree/bot', () => ({ getBotManager: vi.fn(() => mockManager) }));
vi.mock('@/forest/bot/scheduler', () => ({
  BotScheduler: vi.fn().mockImplementation(() => ({
    tick: vi.fn().mockResolvedValue(mockTickReport),
  })),
}));

vi.mock('@/forest/api/routes', () => ({
  botListHandler: vi.fn().mockResolvedValue({ ok: true, data: [] }),
  botDetailHandler: vi.fn().mockResolvedValue({ ok: true, data: null }),
  botControlHandler: vi.fn().mockResolvedValue({ ok: true }),
  killswitchHaltHandler: vi.fn().mockResolvedValue({ ok: true, halted: true }),
  killswitchResumeHandler: vi.fn().mockResolvedValue({ ok: true, resumed: true }),
  eventsHandler: vi.fn().mockResolvedValue({ ok: true, events: [] }),
  dailyStatsHandler: vi.fn().mockResolvedValue({ ok: true, stats: {} }),
}));

vi.mock('@/forest/api/auth-guard', () => ({
  authGuard: vi.fn(() => async (c: { req: { header: (h: string) => string | undefined }; json: (d: unknown, s?: number) => Response; next: () => Promise<Response> }, next: () => Promise<Response>) => {
    const auth = c.req.header('authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return c.json({ error: 'missing token' }, 401);
    }
    return next();
  }),
}));

const { default: app } = await import('./worker');

function mkEnv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    DB: null,
    ADMIN_TOKEN: 'test-token',
    VERSION: 'abc1234',
    ASSETS: { fetch: vi.fn().mockResolvedValue(new Response('not found', { status: 404 })) },
    ...overrides,
  };
}

describe('worker extended coverage', () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Static asset middleware — catch block when ASSETS.fetch throws ──
  it('handles ASSETS.fetch error gracefully', async () => {
    const assets = { fetch: vi.fn().mockRejectedValue(new Error('network down')) };
    const res = await app.request('/about', {}, mkEnv({ ASSETS: assets }));
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Asset fetch failed, falling through',
      expect.objectContaining({ action: 'static-assets' }),
    );
    expect(res.status).toBe(404);
  });

  // ── Version catch block — when VERSION processing throws ──
  it('returns fallback version on internal error', async () => {
    const res = await app.request('/api/version', {}, mkEnv({ VERSION: undefined }));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    const data = body.data as Record<string, unknown>;
    expect(data.version).toBe('0.0.0-dev');
  });

  // ── Internal API with auth — valid token → bot list handler ──
  it('returns bot list with valid Bearer token', async () => {
    const res = await app.request('/internal/api/bots', { headers: { Authorization: 'Bearer test-token' } }, mkEnv());
    expect(res.status).toBe(200);
  });

  // ── Auth guard — missing token returns 401 ──
  it('returns 401 when Authorization header is missing', async () => {
    const res = await app.request('/internal/api/bots', {}, mkEnv());
    expect(res.status).toBe(401);
  });

  // ── Events endpoint ──
  it('returns events telemetry', async () => {
    const res = await app.request('/api/events', {}, mkEnv());
    expect(res.status).toBe(200);
  });

  // ── Daily stats endpoint ──
  it('returns daily stats', async () => {
    const res = await app.request('/api/stats/daily', {}, mkEnv());
    expect(res.status).toBe(200);
  });

  // ── Bot detail by ID ──
  it('returns bot detail for valid ID', async () => {
    const req = new Request('http://localhost/internal/api/bots/bot-1', {
      headers: { Authorization: 'Bearer test-token' },
    });
    const res = await app.request(req, undefined, mkEnv());
    expect(res.status).toBe(200);
  });

  // ── Bot control with valid action ──
  it('starts a bot with valid action', async () => {
    const req = new Request('http://localhost/internal/api/bots/bot-1/start', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
    });
    const res = await app.request(req, undefined, mkEnv());
    expect(res.status).toBe(200);
  });

  // ── Bot control with invalid action ──
  it('returns 400 for invalid bot action', async () => {
    const req = new Request('http://localhost/internal/api/bots/bot-1/INVALID', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
    });
    const res = await app.request(req, undefined, mkEnv());
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('Invalid action');
  });

  // ── Version catch block — when c.env.VERSION access throws ──
  it('returns fallback version when env access throws', async () => {
    const env = new Proxy(
      { ASSETS: { fetch: vi.fn() }, ADMIN_TOKEN: 'tok', DB: null },
      {
        get(_target, prop) {
          if (prop === 'VERSION') throw new Error('env read failure');
          return undefined;
        },
      },
    ) as Record<string, unknown>;
    const res = await app.request('/api/version', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
  });

  // ── onError — handler throws → 500 ──
  it('returns 500 when killswitch handler throws', async () => {
    const { killswitchHaltHandler } = await import('@/forest/api/routes');
    (killswitchHaltHandler as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('handler crashed'));
    const req = new Request('http://localhost/api/killswitch/halt', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
    });
    const res = await app.request(req, undefined, mkEnv());
    expect(res.status).toBe(500);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('handler crashed');
  });
});
