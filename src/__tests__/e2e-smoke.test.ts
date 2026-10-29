/**
 * E2E Smoke Tests — Integration tests for /api/bots customer journey routes.
 *
 * Settings route tests live in e2e-smoke-settings.test.ts to keep each test suite < 250 LOC.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockBotCreateHandler = vi.fn();
const mockBotListHandler = vi.fn();
const routeMocks = vi.hoisted(() => ({
  context: vi.fn(), reserve: vi.fn(), hash: vi.fn(), mark: vi.fn(), release: vi.fn(),
}));

vi.mock('@/forest/api/routes', () => ({
  get botCreateHandler() { return mockBotCreateHandler; },
  get botListHandler() { return mockBotListHandler; },
}));

vi.mock('@/forest/api/rate-limiter', () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 99, resetAt: Date.now() + 60_000 }),
  getRateLimitHeaders: () => ({}),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

vi.mock('@/ee/tenancy/workspace-request-context', () => ({
  resolveWorkspaceTierContext: (...args: unknown[]) => routeMocks.context(...args),
  workspaceContextErrorResponse: (error: unknown) => Response.json({ ok: false, error: String(error) }, { status: 503 }),
}));
vi.mock('@/ee/billing/bot-quota-reservations', () => ({
  hashBotCreateRequest: (...args: unknown[]) => routeMocks.hash(...args),
  reserveWorkspaceBotSlot: (...args: unknown[]) => routeMocks.reserve(...args),
  markBotReservationCreated: (...args: unknown[]) => routeMocks.mark(...args),
  releaseBotReservation: (...args: unknown[]) => routeMocks.release(...args),
}));

function postRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/bots — bot creation', () => {
  let POST: typeof import('@/app/api/bots/route').POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockBotCreateHandler.mockResolvedValue({ ok: true, data: { id: 'new-bot-1' } });
    mockBotListHandler.mockResolvedValue({ ok: true, data: [] });
    routeMocks.context.mockResolvedValue({ db: {}, userId: 'user-a', workspaceId: 'ws-a', role: 'OWNER', tier: 'BASIC', entitlementExpiresAtMs: null });
    routeMocks.hash.mockResolvedValue('hash');
    routeMocks.reserve.mockResolvedValue({ kind: 'reserved' });
    routeMocks.mark.mockResolvedValue(undefined);
    routeMocks.release.mockResolvedValue(undefined);
    POST = (await import('@/app/api/bots/route')).POST;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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

    expect(res.status).toBe(201);
    expect(json.ok).toBe(true);
    expect((json.data as { id: string })?.id).toBe('bot-abc');
    expect(mockBotCreateHandler).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'bot-abc', name: 'Grid BTC' }),
      { userId: 'user-a', workspaceId: 'ws-a' },
    );
  });

  it('defaults mode to paper when omitted', async () => {
    await POST(postRequest('/api/bots', validBotPayload()));

    expect(mockBotCreateHandler).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'paper' }),
      { userId: 'user-a', workspaceId: 'ws-a' },
    );
  });

  it('rejects payload missing required id', async () => {
    const { id, ...withoutId } = validBotPayload();
    void id;
    const res = await POST(postRequest('/api/bots', withoutId));
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(mockBotCreateHandler).not.toHaveBeenCalled();
  });

  it('rejects payload missing required capital', async () => {
    const { capital, ...withoutCapital } = validBotPayload();
    void capital;
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

describe('GET /api/bots', () => {
  let GET: typeof import('@/app/api/bots/route').GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockBotListHandler.mockResolvedValue({ ok: true, data: [] });
    routeMocks.context.mockResolvedValue({ db: {}, userId: 'user-a', workspaceId: 'ws-a', role: 'OWNER', tier: 'BASIC', entitlementExpiresAtMs: null });
    GET = (await import('@/app/api/bots/route')).GET;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a bot list', async () => {
    const res = await GET(new Request('https://app.example/api/bots'));
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });
});
