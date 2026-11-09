// worker.test.ts — Hono app route tests for CF Workers entry
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
vi.mock('./lib/logger', () => ({
  createLogger: () => mockLogger,
}));

const mockManager = {
  getAllBots: vi.fn().mockResolvedValue([]),
  getRunningBots: vi.fn().mockResolvedValue([]),
  drainQueues: vi.fn().mockResolvedValue({}),
};

const mockListBots = vi.fn().mockResolvedValue([]);
vi.mock('./forest/bot/d1-adapter', () => ({
  BotQueryService: vi.fn().mockImplementation(() => ({
    listBots: mockListBots,
  })),
}));
vi.mock('./tree/bot', () => ({
  getBotManager: vi.fn(() => mockManager),
}));

const mockTickReport = { evaluated: 0, errors: 0 };
vi.mock('./forest/bot/scheduler', () => ({
  BotScheduler: vi.fn().mockImplementation(() => ({
    tick: vi.fn().mockResolvedValue(mockTickReport),
  })),
}));

vi.mock('./forest/api/routes', () => ({
  botListHandler: vi.fn(),
  botDetailHandler: vi.fn(),
  botControlHandler: vi.fn(),
  killswitchHaltHandler: vi.fn((_c: unknown) => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })),
  killswitchResumeHandler: vi.fn((_c: unknown) => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })),
  eventsHandler: vi.fn(),
  dailyStatsHandler: vi.fn(),
}));

vi.mock('./forest/api/auth-guard', () => ({
  authGuard: vi.fn(() => async (c: { req: unknown; next: () => Promise<Response> }, next: () => Promise<Response>) => next()),
}));

const { default: app } = await import('./worker');

function mkEnv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    DB: null, ADMIN_TOKEN: 'test-token', VERSION: 'abc1234def',
    ASSETS: { fetch: vi.fn().mockResolvedValue(new Response('not found', { status: 404 })) },
    ...overrides,
  };
}

describe('worker routes', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('GET /api/health', () => {
    it('returns ok with bot counts', async () => {
      mockListBots.mockResolvedValue([
        { id: 'b1', status: 'running', name: 'Bot 1', exchange: 'binance', pair: 'BTC/USDT', strategy: 'grid', config: { capital: 1000 }, metrics: { totalPnl: 0, winCount: 0, lossCount: 0, totalTrades: 0, maxDrawdown: 0 }, updatedAt: Date.now() },
      ]);
      const res = await app.request('/api/health', {}, mkEnv());
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.status).toBe('ok');
      expect(body.bots).toBe(1);
      expect(body.running).toBe(1);
    });

    it('returns ok with zero bots', async () => {
      mockListBots.mockResolvedValue([]);
      const res = await app.request('/api/health', {}, mkEnv());
      const body = await res.json() as Record<string, unknown>;
      expect(body.status).toBe('ok');
      expect(body.bots).toBe(0);
    });
  });

  describe('GET /api/version', () => {
    it('returns version from env', async () => {
      const res = await app.request('/api/version', {}, mkEnv({ VERSION: 'deadbeef123' }));
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.ok).toBe(true);
      const data = body.data as Record<string, unknown>;
      expect(data.version).toBe('deadbeef123');
      expect(data.shortSha).toBe('deadbee');
    });

    it('returns fallback when no VERSION set', async () => {
      const res = await app.request('/api/version', {}, mkEnv({ VERSION: undefined }));
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect((body.data as Record<string, unknown>).version).toBe('0.0.0-dev');
    });
  });

  describe('POST /api/cron/eval', () => {
    it('triggers scheduler tick and returns report', async () => {
      const res = await app.request('/api/cron/eval', { method: 'POST' }, mkEnv());
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.evaluated).toBe(0);
      expect(body.errors).toBe(0);
    });
  });

  describe('POST /api/killswitch/halt', () => {
    it('halts all bots', async () => {
      expect((await app.request('/api/killswitch/halt', { method: 'POST' }, mkEnv())).status).toBe(200);
    });
  });

  describe('POST /api/killswitch/resume', () => {
    it('resumes all bots', async () => {
      expect((await app.request('/api/killswitch/resume', { method: 'POST' }, mkEnv())).status).toBe(200);
    });
  });

  // ── /api/events & /api/stats/daily authGuard ───────────────────────────────
  describe('GET /api/events and /api/stats/daily auth enforcement', () => {
    it('guards /api/events and /api/stats/daily with authGuard when Bearer token is missing', async () => {
      const { authGuard } = await import('./forest/api/auth-guard');
      const { registerProtectedRoutes } = await import('./worker-api-routes');
      const { Hono } = await import('hono');
      vi.mocked(authGuard).mockImplementation(
        () => async (c, next) => {
          if (c.req.header('Authorization') !== 'Bearer test-token') return c.json({ ok: false, error: 'Unauthorized' }, 401);
          await next();
          return undefined;
        },
      );
      const { eventsHandler, dailyStatsHandler } = await import('./forest/api/routes');
      vi.mocked(eventsHandler).mockResolvedValue({ ok: true, data: [] });
      vi.mocked(dailyStatsHandler).mockResolvedValue({
        ok: true,
        data: { date: '2026-11-09', activeBots: 0, totalTrades: 0, totalPnl: 0, winCount: 0, lossCount: 0, winRate: 0, byStrategy: {} },
      });
      const freshApp = new Hono();
      registerProtectedRoutes(freshApp as never);
      expect((await freshApp.request('/api/events', {}, mkEnv())).status).toBe(401);
      expect((await freshApp.request('/api/stats/daily', {}, mkEnv())).status).toBe(401);
      expect((await freshApp.request('/api/killswitch-status', {}, mkEnv())).status).toBe(401);
      const authEvents = await freshApp.request('/api/events?botId=bot-1&limit=10', { headers: { Authorization: 'Bearer test-token' } }, mkEnv());
      expect(authEvents.status).toBe(200);
      expect(eventsHandler).toHaveBeenCalledWith('bot-1', 10);
      const authStats = await freshApp.request('/api/stats/daily', { headers: { Authorization: 'Bearer test-token' } }, mkEnv());
      expect(authStats.status).toBe(200);
      expect(dailyStatsHandler).toHaveBeenCalledOnce();
      const authKillswitch = await freshApp.request('/api/killswitch-status', { headers: { Authorization: 'Bearer test-token' } }, mkEnv());
      expect(authKillswitch.status).toBe(200);
    });
  });

  describe('404 handler', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await app.request('/nonexistent', {}, mkEnv());
      expect(res.status).toBe(404);
      expect((await res.json() as Record<string, unknown>).error).toBe('Not found');
    });
  });

  describe('static assets middleware', () => {
    it('skips API routes and passes through', async () => {
      expect((await app.request('/api/health', {}, mkEnv())).status).toBe(200);
    });

    it('serves non-API, non-next paths via ASSETS binding', async () => {
      const assets = { fetch: vi.fn().mockResolvedValue(new Response('html', { status: 200 })) };
      const res = await app.request('/about', {}, mkEnv({ ASSETS: assets }));
      expect(assets.fetch).toHaveBeenCalled();
      expect(res.status).toBe(200);
    });

    it('falls through to 404 when assets returns 404', async () => {
      const assets = { fetch: vi.fn().mockResolvedValue(new Response('not found', { status: 404 })) };
      expect((await app.request('/missing', {}, mkEnv({ ASSETS: assets }))).status).toBe(404);
    });
  });

  describe('GET /api/health uses BotQueryService', () => {
    it('calls listBots via BotQueryService', async () => {
      mockListBots.mockClear();
      expect((await app.request('/api/health', {}, mkEnv())).status).toBe(200);
      expect(mockListBots).toHaveBeenCalledTimes(1);
    });
  });

  describe('scheduled() function', () => {
    it('hydrates running bots then drains queues', async () => {
      mockManager.drainQueues = vi.fn().mockResolvedValue({ binance: { processed: 0, skipped: 0, pending: 0 } });
      const { scheduled } = await import('./worker');
      await scheduled({ scheduledTime: Date.now() }, {} as any, {} as any);
      expect(mockManager.drainQueues).toHaveBeenCalledTimes(1);
    });
  });
});
