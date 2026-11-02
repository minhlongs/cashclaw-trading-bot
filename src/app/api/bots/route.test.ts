import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(), create: vi.fn(), rate: vi.fn(), headers: vi.fn(), context: vi.fn(),
  reserve: vi.fn(), mark: vi.fn(), release: vi.fn(), hash: vi.fn(),
}));
vi.mock('@/forest/api/routes', () => ({ botListHandler: (...args: unknown[]) => mocks.list(...args), botCreateHandler: (...args: unknown[]) => mocks.create(...args) }));
vi.mock('@/forest/api/rate-limiter', () => ({ checkRateLimit: (...args: unknown[]) => mocks.rate(...args), getRateLimitHeaders: (...args: unknown[]) => mocks.headers(...args) }));
vi.mock('@/ee/tenancy/workspace-request-context', () => ({
  resolveWorkspaceTierContext: (...args: unknown[]) => mocks.context(...args),
  workspaceContextErrorResponse: (error: unknown) => Response.json({ ok: false, error: String(error) }, { status: 503 }),
}));
vi.mock('@/ee/billing/bot-quota-reservations', () => ({
  hashBotCreateRequest: (...args: unknown[]) => mocks.hash(...args),
  reserveWorkspaceBotSlot: (...args: unknown[]) => mocks.reserve(...args),
  markBotReservationCreated: (...args: unknown[]) => mocks.mark(...args),
  releaseBotReservation: (...args: unknown[]) => mocks.release(...args),
}));

const { GET, POST } = await import('./route');
const db = {};
const ctx = { db, userId: 'user-a', workspaceId: 'ws-a', role: 'OWNER', tier: 'BASIC', entitlementExpiresAtMs: null };
const payload = (id = 'bot-1') => ({ id, name: 'Test Bot', strategy: 'grid', pair: 'BTC/USDT', exchange: 'binance', capital: 1000 });

describe('/api/bots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.context.mockResolvedValue(ctx);
    mocks.rate.mockReturnValue({ allowed: true });
    mocks.headers.mockReturnValue({});
    mocks.hash.mockResolvedValue('request-hash');
    mocks.reserve.mockResolvedValue({ kind: 'reserved' });
    mocks.mark.mockResolvedValue(undefined);
    mocks.release.mockResolvedValue(undefined);
    mocks.list.mockResolvedValue({ ok: true, data: [] });
    mocks.create.mockResolvedValue({ ok: true, data: { id: 'bot-1' } });
  });

  it('lists only the session-resolved workspace', async () => {
    const res = await GET(new Request('https://app.example/api/bots', { headers: { cookie: 'session_id=valid' } }));
    expect(res.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith('ws-a');
  });

  it('reserves quota atomically before creating a workspace-owned paper bot', async () => {
    const res = await POST(new Request('https://app.example/api/bots', { method: 'POST', body: JSON.stringify(payload()) }));
    expect(res.status).toBe(201);
    expect(mocks.reserve).toHaveBeenCalledWith(ctx, 'bot-1', 'request-hash');
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'bot-1', mode: 'paper' }), { userId: 'user-a', workspaceId: 'ws-a' });
    expect(mocks.mark).toHaveBeenCalledWith(db, 'bot-1', 'user-a');
  });

  it('does not let a forged tier header bypass the authoritative BASIC quota', async () => {
    mocks.reserve.mockResolvedValue({ kind: 'quota_exceeded' });
    const res = await POST(new Request('https://app.example/api/bots', {
      method: 'POST', headers: { 'x-cashclaw-tier': 'MASTER' }, body: JSON.stringify(payload('bot-2')),
    }));
    expect(res.status).toBe(403);
    expect(mocks.context).toHaveBeenCalledWith(expect.any(Request), { explicitWorkspaceId: undefined });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('returns idempotent success for a previously created identical request', async () => {
    mocks.reserve.mockResolvedValue({ kind: 'created' });
    const res = await POST(new Request('https://app.example/api/bots', { method: 'POST', body: JSON.stringify(payload()) }));
    expect(res.status).toBe(200);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('returns conflict for concurrent in-progress request and releases reservations after create failure', async () => {
    mocks.reserve.mockResolvedValueOnce({ kind: 'in_progress' });
    const first = await POST(new Request('https://app.example/api/bots', { method: 'POST', body: JSON.stringify(payload()) }));
    expect(first.status).toBe(409);

    mocks.reserve.mockResolvedValueOnce({ kind: 'reserved' });
    mocks.create.mockResolvedValueOnce({ ok: false, error: 'synthetic create failure' });
    const second = await POST(new Request('https://app.example/api/bots', { method: 'POST', body: JSON.stringify(payload('bot-3')) }));
    expect(second.status).toBe(400);
    expect(mocks.release).toHaveBeenCalledWith(db, 'bot-3', 'user-a');
  });

  it('keeps live mode and rate limits rejected', async () => {
    const live = await POST(new Request('https://app.example/api/bots', { method: 'POST', body: JSON.stringify({ ...payload(), mode: 'live' }) }));
    expect(live.status).toBe(400);
    mocks.rate.mockReturnValue({ allowed: false });
    const limited = await POST(new Request('https://app.example/api/bots', { method: 'POST', body: JSON.stringify({}) }));
    expect(limited.status).toBe(429);
  });
});
