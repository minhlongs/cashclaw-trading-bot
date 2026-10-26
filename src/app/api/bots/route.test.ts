// route.test.ts — tests for /api/bots route handlers
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBotListHandler = vi.fn();
const mockBotCreateHandler = vi.fn();
const mockCheckRateLimit = vi.fn().mockReturnValue({ allowed: true });
const mockGetRateLimitHeaders = vi.fn().mockReturnValue({});

vi.mock('@/forest/api/routes', () => ({
  botListHandler: (...args: unknown[]) => mockBotListHandler(...args),
  botCreateHandler: (...args: unknown[]) => mockBotCreateHandler(...args),
}));

vi.mock('@/forest/api/rate-limiter', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getRateLimitHeaders: (...args: unknown[]) => mockGetRateLimitHeaders(...args),
}));

const { GET, POST } = await import('./route');

describe('/api/bots route', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('GET', () => {
    it('returns bot list', async () => {
      mockBotListHandler.mockResolvedValue({ ok: true, bots: [] });
      const res = await GET();
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.ok).toBe(true);
    });
  });

  describe('POST', () => {
    it('creates a bot when rate limit allows', async () => {
      mockCheckRateLimit.mockReturnValue({ allowed: true });
      mockBotCreateHandler.mockResolvedValue({ ok: true, id: 'bot-1' });
      const req = new Request('http://localhost/api/bots', {
        method: 'POST',
        body: JSON.stringify({
          id: 'bot-1',
          name: 'Test Bot',
          strategy: 'grid',
          pair: 'BTC/USDT',
          exchange: 'binance',
          capital: 1000,
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    it('returns 429 when rate limited', async () => {
      mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfterMs: 1000 });
      const req = new Request('http://localhost/api/bots', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ ok: false, error: 'Rate limit exceeded' });
    });

    it('returns 400 when bot creation fails', async () => {
      mockCheckRateLimit.mockReturnValue({ allowed: true });
      mockBotCreateHandler.mockResolvedValue({ ok: false, error: 'Invalid config' });
      const req = new Request('http://localhost/api/bots', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('returns 403 QUOTA_EXCEEDED on BASIC tier when 1 bot is already running, and allows on PREMIUM', async () => {
      mockCheckRateLimit.mockReturnValue({ allowed: true });
      mockBotListHandler.mockResolvedValue({ ok: true, data: [{ id: 'existing-bot-1' }] });
      mockBotCreateHandler.mockResolvedValue({ ok: true, id: 'bot-2' });

      const basicReq = new Request('http://localhost/api/bots', {
        method: 'POST',
        headers: { 'x-cashclaw-tier': 'BASIC' },
        body: JSON.stringify({
          id: 'bot-2',
          name: 'Second Bot',
          strategy: 'grid',
          pair: 'BTC/USDT',
          exchange: 'binance',
          capital: 1000,
        }),
      });
      const basicRes = await POST(basicReq);
      expect(basicRes.status).toBe(403);
      const basicBody = (await basicRes.json()) as { ok: boolean; error: string };
      expect(basicBody.error).toContain('QUOTA_EXCEEDED');

      const premiumReq = new Request('http://localhost/api/bots', {
        method: 'POST',
        headers: { 'x-cashclaw-tier': 'PREMIUM' },
        body: JSON.stringify({
          id: 'bot-2',
          name: 'Second Bot',
          strategy: 'grid',
          pair: 'BTC/USDT',
          exchange: 'binance',
          capital: 1000,
        }),
      });
      const premiumRes = await POST(premiumReq);
      expect(premiumRes.status).toBe(200);
    });

    it('accepts volatility_dca config with quantExecution enabled', async () => {
      mockCheckRateLimit.mockReturnValue({ allowed: true });
      mockBotListHandler.mockResolvedValue({ ok: true, data: [] });
      mockBotCreateHandler.mockResolvedValue({ ok: true, data: { id: 'bot-vdca' } });

      const req = new Request('http://localhost/api/bots', {
        method: 'POST',
        body: JSON.stringify({
          id: 'bot-vdca',
          name: 'Vol DCA Quant',
          strategy: 'volatility_dca',
          pair: 'BTC/USDT',
          exchange: 'binance',
          capital: 2000,
          config: {
            priceDropStep: 1.5,
            maxSteps: 6,
            baseOrderSizePct: 10,
            volatilityWindow: 20,
            volBaseline: 50,
            reboundTarget: 1.0,
            quantExecution: 1,
          },
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockBotCreateHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          strategy: 'volatility_dca',
          config: expect.objectContaining({ quantExecution: 1 }),
        }),
      );
    });
  });
});
