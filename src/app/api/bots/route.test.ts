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
  });
});
