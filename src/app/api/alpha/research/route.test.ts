// route.test.ts — tests for POST /api/alpha/research
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCheckRateLimit = vi.fn().mockReturnValue({ allowed: true });
const mockGetRateLimitHeaders = vi.fn().mockReturnValue({});
const mockFetchCandles = vi.fn().mockResolvedValue([
  { timestamp: 1_700_000_000_000, open: 100, high: 110, low: 90, close: 105, volume: 1000 },
]);
const mockRun = vi.fn().mockResolvedValue({
  symbol: 'BTCUSDT',
  timeframe: '1h',
  totalSteps: 12,
  passedSteps: 7,
  finalSharpe: 0.12,
  regimeBreakdown: {},
  topFeatures: [],
  recommendation: 'discard',
  report: null,
});

vi.mock('@/forest/api/rate-limiter', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getRateLimitHeaders: (...args: unknown[]) => mockGetRateLimitHeaders(...args),
}));

vi.mock('@/forest/alpha/data-fetcher', () => ({
  createCandleSource: () => ({
    fetchCandles: (...args: unknown[]) => mockFetchCandles(...args),
  }),
}));

vi.mock('@/forest/alpha/pipeline/engine', () => ({
  AlphaResearchPipeline: vi.fn().mockImplementation(() => ({
    run: () => mockRun(),
  })),
}));

const { POST } = await import('./route');

describe('/api/alpha/research route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with a report for valid input', async () => {
    const req = new Request('http://localhost/api/alpha/research', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'BTCUSDT', timeframe: '1h' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; report: { symbol: string } };
    expect(body.ok).toBe(true);
    expect(body.report.symbol).toBe('BTCUSDT');
  });

  it('returns 400 when symbol is missing', async () => {
    const req = new Request('http://localhost/api/alpha/research', {
      method: 'POST',
      body: JSON.stringify({ timeframe: '1h' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 });
    const req = new Request('http://localhost/api/alpha/research', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'BTCUSDT', timeframe: '1h' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it('returns 422 when Binance returns 0 candles', async () => {
    mockFetchCandles.mockResolvedValueOnce([]);
    const req = new Request('http://localhost/api/alpha/research', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'BTCUSDT', timeframe: '1h' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it('returns 500 when pipeline throws', async () => {
    mockRun.mockRejectedValueOnce(new Error('Pipeline exploded'));
    const req = new Request('http://localhost/api/alpha/research', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'BTCUSDT', timeframe: '1h' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain('Pipeline exploded');
  });
});
