/**
 * E2E Smoke Tests — Integration tests for the customer journey API routes.
 *
 * These verify the Zod schemas, route handler logic, and handler wiring
 * work end-to-end. They catch schema drift between client POST bodies
 * and server validation (the class of bugs fixed in this round).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks — forest handlers and rate limiter                          */
/* ------------------------------------------------------------------ */

const mockBotCreateHandler = vi.fn();
const mockBotListHandler = vi.fn();
const mockGetSettings = vi.fn();
const mockUpdateExchangeCredentials = vi.fn();
const mockUpdateRiskLimits = vi.fn();
const mockEmergencyHalt = vi.fn();
const mockResumeFromHalt = vi.fn();

vi.mock('@/forest/api/routes', () => ({
  get botCreateHandler() { return mockBotCreateHandler; },
  get botListHandler() { return mockBotListHandler; },
}));

vi.mock('@/forest/settings/actions', () => ({
  get getSettings() { return mockGetSettings; },
  get updateExchangeCredentials() { return mockUpdateExchangeCredentials; },
  get updateRiskLimits() { return mockUpdateRiskLimits; },
  get emergencyHalt() { return mockEmergencyHalt; },
  get resumeFromHalt() { return mockResumeFromHalt; },
}));

vi.mock('@/forest/api/rate-limiter', () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 99, resetAt: Date.now() + 60_000 }),
  getRateLimitHeaders: () => ({}),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function postRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getRequest(path: string): Request {
  return new Request(`http://localhost${path}`, { method: 'GET' });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('POST /api/bots — bot creation', () => {
  let POST: typeof import('@/app/api/bots/route').POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockBotCreateHandler.mockResolvedValue({ ok: true, data: { id: 'new-bot-1' } });
    // Dynamic import so mocks are resolved after vi.mock hoisting
    POST = (await import('@/app/api/bots/route')).POST;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Minimal payload satisfying every required field of CreateBotSchema. */
  function validBotPayload(overrides: Record<string, unknown> = {}) {
    return {
      id: 'bot-abc',
      name: 'Grid BTC',
      strategy: 'grid',
      pair: 'BTC/USDT',
      exchange: 'binance',
      capital: 5000,
      gridConfig: { lowerPrice: 20000, upperPrice: 30000, gridCount: 10 },
      ...overrides,
    };
  }

  it('creates a paper bot with valid payload', async () => {
    const res = await POST(postRequest('/api/bots', validBotPayload()));
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect((json.data as { id: string })?.id).toBe('new-bot-1');
    expect(mockBotCreateHandler).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'bot-abc', name: 'Grid BTC' }),
    );
  });

  it('defaults mode to paper when omitted', async () => {
    await POST(postRequest('/api/bots', validBotPayload()));

    expect(mockBotCreateHandler).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'paper' }),
    );
  });

  it('rejects payload missing required id', async () => {
    const { id: _omitted, ...withoutId } = validBotPayload();
    const res = await POST(postRequest('/api/bots', withoutId));
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(mockBotCreateHandler).not.toHaveBeenCalled();
  });

  it('rejects payload missing required capital', async () => {
    const { capital: _omitted, ...withoutCapital } = validBotPayload();
    const res = await POST(postRequest('/api/bots', withoutCapital));

    expect(res.status).toBe(400);
    expect(mockBotCreateHandler).not.toHaveBeenCalled();
  });

  it('rejects invalid strategy value', async () => {
    const res = await POST(
      postRequest('/api/bots', validBotPayload({ strategy: 'dca' })),
    );
    expect(res.status).toBe(400);
  });

  it('rejects invalid exchange value', async () => {
    const res = await POST(
      postRequest('/api/bots', validBotPayload({ exchange: 'kraken' })),
    );
    expect(res.status).toBe(400);
  });

  it('rejects non-positive capital', async () => {
    const res = await POST(
      postRequest('/api/bots', validBotPayload({ capital: 0 })),
    );
    expect(res.status).toBe(400);
  });

  it('passes through handler errors as 400', async () => {
    mockBotCreateHandler.mockResolvedValue({ ok: false, error: 'Duplicate bot name' });

    const res = await POST(
      postRequest('/api/bots', validBotPayload({ id: 'bot-dup' })),
    );
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(json.error).toBe('Duplicate bot name');
  });
});

describe('POST /api/settings — exchange credentials', () => {
  let POST: typeof import('@/app/api/settings/route').POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockUpdateExchangeCredentials.mockResolvedValue({ ok: true });
    POST = (await import('@/app/api/settings/route')).POST;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saves exchange credentials with type discriminator', async () => {
    const req = postRequest('/api/settings', {
      type: 'exchange',
      exchange: 'binance',
      apiKey: 'my-api-key',
      apiSecret: 'my-api-secret',
      testnet: true,
    });

    const res = await POST(req);
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mockUpdateExchangeCredentials).toHaveBeenCalledWith(
      'binance',
      'my-api-key',
      'my-api-secret',
      true,
    );
  });

  it('defaults testnet to true when omitted', async () => {
    const req = postRequest('/api/settings', {
      type: 'exchange',
      exchange: 'bybit',
      apiKey: 'k',
      apiSecret: 's',
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockUpdateExchangeCredentials).toHaveBeenCalledWith(
      'bybit', 'k', 's', true,
    );
  });

  it('rejects unknown exchange name', async () => {
    const req = postRequest('/api/settings', {
      type: 'exchange',
      exchange: 'kraken',
      apiKey: 'k',
      apiSecret: 's',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects body missing type discriminator', async () => {
    const req = postRequest('/api/settings', {
      exchange: 'binance',
      apiKey: 'k',
      apiSecret: 's',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/settings — risk limits', () => {
  let POST: typeof import('@/app/api/settings/route').POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockUpdateRiskLimits.mockResolvedValue({ ok: true });
    POST = (await import('@/app/api/settings/route')).POST;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saves risk limits with type discriminator', async () => {
    const req = postRequest('/api/settings', {
      type: 'risk',
      maxDrawdownPct: 20,
      dailyLossLimitPct: 10,
      cooldownMinutes: 30,
      maxOpenOrders: 5,
    });

    const res = await POST(req);
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mockUpdateRiskLimits).toHaveBeenCalledWith(
      expect.objectContaining({ maxDrawdownPct: 20 }),
    );
  });

  it('rejects risk values outside valid range', async () => {
    const req = postRequest('/api/settings', {
      type: 'risk',
      maxDrawdownPct: -5,
      dailyLossLimitPct: 10,
      cooldownMinutes: 30,
      maxOpenOrders: 5,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/settings — killswitch', () => {
  let POST: typeof import('@/app/api/settings/route').POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockEmergencyHalt.mockResolvedValue({ ok: true });
    mockResumeFromHalt.mockResolvedValue({ ok: true });
    POST = (await import('@/app/api/settings/route')).POST;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('halts trading with action + reason', async () => {
    const req = postRequest('/api/settings', {
      type: 'killswitch',
      action: 'halt',
      reason: 'Manual halt',
    });

    const res = await POST(req);
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mockEmergencyHalt).toHaveBeenCalledWith('Manual halt');
  });

  it('resumes trading with action resume', async () => {
    const req = postRequest('/api/settings', {
      type: 'killswitch',
      action: 'resume',
    });

    const res = await POST(req);
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mockResumeFromHalt).toHaveBeenCalled();
  });

  it('rejects unknown killswitch action', async () => {
    const req = postRequest('/api/settings', {
      type: 'killswitch',
      action: 'toggle',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/settings', () => {
  let GET: typeof import('@/app/api/settings/route').GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    // getSettings() resolves to SettingsData directly; the route wraps it.
    mockGetSettings.mockResolvedValue({
      exchanges: {
        binance: { apiKey: '', apiSecret: '', testnet: true },
        bybit: { apiKey: '', apiSecret: '', testnet: true },
        okx: { apiKey: '', apiSecret: '', testnet: true },
      },
      risk: { maxDrawdownPct: 15, dailyLossLimitPct: 10, cooldownMinutes: 60, maxOpenOrders: 10 },
      killswitch: { enabled: true, reason: null, triggeredAt: null },
    });
    GET = (await import('@/app/api/settings/route')).GET;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns settings with exchange, risk, and killswitch', async () => {
    const res = await GET();
    const json = (await res.json()) as Record<string, unknown>;
    const data = json.data as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(data.exchanges).toBeDefined();
    expect(data.risk).toBeDefined();
    expect(data.killswitch).toBeDefined();
  });

  it('reports killswitch.enabled true when trading is on', async () => {
    const res = await GET();
    const json = (await res.json()) as Record<string, unknown>;
    const data = json.data as Record<string, unknown>;
    const killswitch = data.killswitch as Record<string, unknown>;

    expect(killswitch.enabled).toBe(true);
  });

  it('returns 500 when settings load throws', async () => {
    mockGetSettings.mockRejectedValue(new Error('D1 unavailable'));

    const res = await GET();
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(json.ok).toBe(false);
  });
});

describe('GET /api/bots', () => {
  let GET: typeof import('@/app/api/bots/route').GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockBotListHandler.mockResolvedValue({ ok: true, data: [] });
    GET = (await import('@/app/api/bots/route')).GET;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a bot list', async () => {
    const res = await GET();
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });
});
