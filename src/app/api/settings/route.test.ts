import { describe, it, expect, vi, beforeEach } from 'vitest';

type Json = Record<string, unknown>;

// ── Hoisted mocks ─────────────────────────────────────────────

const mockGetSettings = vi.fn(async () => ({ ok: true, data: {} }));
const mockUpdateExchange = vi.fn(async (): Promise<{ ok: boolean; error?: string }> => ({ ok: true }));
const mockUpdateRisk = vi.fn(async (): Promise<{ ok: boolean; error?: string }> => ({ ok: true }));
const mockEmergencyHalt = vi.fn(async (): Promise<{ ok: boolean; error?: string }> => ({ ok: true }));
const mockResumeFromHalt = vi.fn(async () => ({ ok: true }));
const mockCheckRateLimit = vi.fn(() => ({ allowed: true, remaining: 99, resetAt: Date.now() + 60000 }));
const mockGetRateLimitHeaders = vi.fn(() => ({}));

vi.mock('@/forest/settings/actions', () => ({
  getSettings: mockGetSettings,
  updateExchangeCredentials: mockUpdateExchange,
  updateRiskLimits: mockUpdateRisk,
  emergencyHalt: mockEmergencyHalt,
  resumeFromHalt: mockResumeFromHalt,
}));

vi.mock('@/forest/api/rate-limiter', () => ({
  checkRateLimit: mockCheckRateLimit,
  getRateLimitHeaders: mockGetRateLimitHeaders,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 99, resetAt: Date.now() + 60000 });
  mockGetSettings.mockResolvedValue({ ok: true, data: {} });
  mockUpdateExchange.mockResolvedValue({ ok: true });
  mockUpdateRisk.mockResolvedValue({ ok: true });
  mockEmergencyHalt.mockResolvedValue({ ok: true });
  mockResumeFromHalt.mockResolvedValue({ ok: true });
});

function mockReq(body: unknown) {
  return { json: async () => body, method: 'POST' } as any;
}

async function loadRoute() {
  return import('./route');
}

describe('GET /api/settings', () => {
  it('returns settings data', async () => {
    const route = await loadRoute();
    const res = await route.GET();
    const json = await res.json() as Json;
    expect(json.ok).toBe(true);
  });

  it('returns 500 on error', async () => {
    mockGetSettings.mockRejectedValue(new Error('DB down'));
    const route = await loadRoute();
    const res = await route.GET();
    expect(res.status).toBe(500);
    const json = await res.json() as Json;
    expect(json.ok).toBe(false);
  });
});

describe('POST /api/settings', () => {
  it('returns 429 on rate limit', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 });
    const route = await loadRoute();
    const res = await route.POST(mockReq({ type: 'exchange', exchange: 'binance' }));
    expect(res.status).toBe(429);
  });

  it('returns 400 for invalid input', async () => {
    const route = await loadRoute();
    const res = await route.POST(mockReq({ type: 'invalid' }));
    expect(res.status).toBe(400);
    const json = await res.json() as Json;
    expect(json.ok).toBe(false);
  });

  it('updates exchange credentials', async () => {
    const route = await loadRoute();
    const res = await route.POST(mockReq({ type: 'exchange', exchange: 'binance', apiKey: 'k', apiSecret: 's', testnet: false }));
    const json = await res.json() as Json;
    expect(json.ok).toBe(true);
    expect(mockUpdateExchange).toHaveBeenCalledWith('binance', 'k', 's', false);
  });

  it('returns 400 when exchange update fails', async () => {
    mockUpdateExchange.mockResolvedValue({ ok: false, error: 'DB unavailable' });
    const route = await loadRoute();
    const res = await route.POST(mockReq({ type: 'exchange', exchange: 'binance' }));
    expect(res.status).toBe(400);
  });

  it('updates risk limits', async () => {
    const route = await loadRoute();
    const res = await route.POST(mockReq({ type: 'risk', maxDrawdownPct: 20 }));
    const json = await res.json() as Json;
    expect(json.ok).toBe(true);
    expect(mockUpdateRisk).toHaveBeenCalledWith(expect.objectContaining({ maxDrawdownPct: 20 }));
  });

  it('returns 400 when risk update fails', async () => {
    mockUpdateRisk.mockResolvedValue({ ok: false, error: 'Validation error' });
    const route = await loadRoute();
    const res = await route.POST(mockReq({ type: 'risk', maxDrawdownPct: 20 }));
    expect(res.status).toBe(400);
  });

  it('emergency halts killswitch', async () => {
    const route = await loadRoute();
    const res = await route.POST(mockReq({ type: 'killswitch', action: 'halt', reason: 'test' }));
    const json = await res.json() as Json;
    expect(json.ok).toBe(true);
    expect(mockEmergencyHalt).toHaveBeenCalledWith('test');
  });

  it('resumes killswitch', async () => {
    const route = await loadRoute();
    const res = await route.POST(mockReq({ type: 'killswitch', action: 'resume' }));
    const json = await res.json() as Json;
    expect(json.ok).toBe(true);
    expect(mockResumeFromHalt).toHaveBeenCalledOnce();
  });

  it('returns 400 when halt fails', async () => {
    mockEmergencyHalt.mockResolvedValue({ ok: false, error: 'Halt failed' });
    const route = await loadRoute();
    const res = await route.POST(mockReq({ type: 'killswitch', action: 'halt' }));
    expect(res.status).toBe(400);
  });

  it('returns 500 on internal error', async () => {
    const route = await loadRoute();
    const badReq = { json: async () => { throw new Error('parse error'); } } as any;
    const res = await route.POST(badReq);
    expect(res.status).toBe(500);
  });
});
