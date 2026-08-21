// worker.test.ts — Hono app route tests for CF Workers entry
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
vi.mock('./lib/logger', () => ({
  createLogger: () => mockLogger,
}));

const mockManager = {
  getAllBots: vi.fn().mockReturnValue([]),
  getRunningBots: vi.fn().mockReturnValue([]),
  drainQueues: vi.fn().mockResolvedValue({}),
};

const mockLoadAllBotsFromD1 = vi.fn().mockResolvedValue(undefined);
vi.mock('./forest/bot/d1-adapter', () => ({
  loadAllBotsFromD1: (...args: unknown[]) => mockLoadAllBotsFromD1(...args),
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
    DB: null,
    ADMIN_TOKEN: 'test-token',
    VERSION: 'abc1234def',
    ASSETS: { fetch: vi.fn().mockResolvedValue(new Response('not found', { status: 404 })) },
    ...overrides,
  };
}

describe('worker routes', () => {
  beforeEach(() => vi.clearAllMocks());

  // ── /api/health ────────────────────────────────────────────────────────────
  describe('GET /api/health', () => {
    it('returns ok with bot counts', async () => {
      mockManager.getAllBots.mockReturnValue([{ id: 'b1' }]);
      mockManager.getRunningBots.mockReturnValue([{ id: 'b1' }]);
      const res = await app.request('/api/health', {}, mkEnv());
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.status).toBe('ok');
      expect(body.bots).toBe(1);
      expect(body.running).toBe(1);
    });

    it('returns ok with zero bots', async () => {
      mockManager.getAllBots.mockReturnValue([]);
      mockManager.getRunningBots.mockReturnValue([]);
      const res = await app.request('/api/health', {}, mkEnv());
      const body = await res.json() as Record<string, unknown>;
      expect(body.status).toBe('ok');
      expect(body.bots).toBe(0);
    });
  });

  // ── /api/version ───────────────────────────────────────────────────────────
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
      const data = body.data as Record<string, unknown>;
      expect(data.version).toBe('0.0.0-dev');
    });
  });

  // ── /api/cron/eval ─────────────────────────────────────────────────────────
  describe('POST /api/cron/eval', () => {
    it('triggers scheduler tick and returns report', async () => {
      const res = await app.request('/api/cron/eval', { method: 'POST' }, mkEnv());
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.evaluated).toBe(0);
      expect(body.errors).toBe(0);
    });
  });

  // ── /api/killswitch ────────────────────────────────────────────────────────
  describe('POST /api/killswitch/halt', () => {
    it('halts all bots', async () => {
      const res = await app.request('/api/killswitch/halt', { method: 'POST' }, mkEnv());
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/killswitch/resume', () => {
    it('resumes all bots', async () => {
      const res = await app.request('/api/killswitch/resume', { method: 'POST' }, mkEnv());
      expect(res.status).toBe(200);
    });
  });

  // ── 404 handler ────────────────────────────────────────────────────────────
  describe('404 handler', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await app.request('/nonexistent', {}, mkEnv());
      expect(res.status).toBe(404);
      const body = await res.json() as Record<string, unknown>;
      expect(body.error).toBe('Not found');
    });
  });

  // ── Static assets middleware ────────────────────────────────────────────────
  describe('static assets middleware', () => {
    it('skips API routes and passes through', async () => {
      const res = await app.request('/api/health', {}, mkEnv());
      expect(res.status).toBe(200);
    });

    it('serves non-API, non-next paths via ASSETS binding', async () => {
      const assets = { fetch: vi.fn().mockResolvedValue(new Response('html', { status: 200 })) };
      const res = await app.request('/about', {}, mkEnv({ ASSETS: assets }));
      expect(assets.fetch).toHaveBeenCalled();
      expect(res.status).toBe(200);
    });

    it('falls through to 404 when assets returns 404', async () => {
      const assets = { fetch: vi.fn().mockResolvedValue(new Response('not found', { status: 404 })) };
      const res = await app.request('/missing', {}, mkEnv({ ASSETS: assets }));
      expect(res.status).toBe(404);
    });
  });

  // ── GET /api/health hydration ──────────────────────────────────────────────
  describe('GET /api/health hydration', () => {
    it('calls loadAllBotsFromD1 before returning health', async () => {
      mockLoadAllBotsFromD1.mockClear();
      const res = await app.request('/api/health', {}, mkEnv());
      expect(res.status).toBe(200);
      expect(mockLoadAllBotsFromD1).toHaveBeenCalledTimes(1);
    });
  });

  // ── scheduled() function ───────────────────────────────────────────────────
  describe('scheduled() function', () => {
    it('calls loadAllBotsFromD1 before drainQueues', async () => {
      const drainQueuesResult = { binance: { processed: 0, skipped: 0, pending: 0 } };
      mockManager.drainQueues = vi.fn().mockResolvedValue(drainQueuesResult);
      mockLoadAllBotsFromD1.mockClear();

      const { scheduled } = await import('./worker');
      await scheduled({ scheduledTime: Date.now() }, {} as any, {} as any);

      expect(mockLoadAllBotsFromD1).toHaveBeenCalledTimes(1);
      expect(mockManager.drainQueues).toHaveBeenCalledTimes(1);
    });
  });
});
