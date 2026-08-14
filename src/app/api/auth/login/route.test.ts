import { describe, it, expect, vi, beforeEach } from 'vitest';

type Json = Record<string, unknown>;

// ── Hoisted mocks ─────────────────────────────────────────────

const mockBind = vi.fn().mockReturnThis();
const mockFirst = vi.fn();
const mockRun = vi.fn();
const mockPrepare = vi.fn(() => ({ bind: mockBind, first: mockFirst, run: mockRun }));
const mockDb = { prepare: mockPrepare };

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('@/lib/auth/session-utils', () => ({
  generateSessionId: vi.fn(() => 'test-session-id'),
  verifyPasscode: vi.fn(async () => false),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  mockBind.mockReturnThis();
  mockFirst.mockResolvedValue(null);
  mockRun.mockResolvedValue(undefined);
  const { createServerClient } = await import('@/lib/db/client');
  vi.mocked(createServerClient).mockReturnValue(mockDb as any);
});

function mockReq(body: unknown) {
  return { json: async () => body, method: 'POST' } as any;
}

async function loadRoute() {
  return import('./route');
}

describe('POST /api/auth/login', () => {
  it('returns 400 for invalid email', async () => {
    const route = await loadRoute();
    const res = await route.POST(mockReq({ email: 'bad', passcode: '123' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing passcode', async () => {
    const route = await loadRoute();
    const res = await route.POST(mockReq({ email: 'test@test.com' }));
    expect(res.status).toBe(400);
  });

  it('returns 503 when DB unavailable', async () => {
    const { createServerClient } = await import('@/lib/db/client');
    vi.mocked(createServerClient).mockReturnValue(null as any);
    const route = await loadRoute();
    const res = await route.POST(mockReq({ email: 'test@test.com', passcode: '1234' }));
    expect(res.status).toBe(503);
  });

  it('returns 401 when user not found', async () => {
    mockFirst.mockResolvedValue(null);
    const route = await loadRoute();
    const res = await route.POST(mockReq({ email: 'test@test.com', passcode: '1234' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when passcode_hash is null', async () => {
    mockFirst.mockResolvedValue({ id: 'u1', email: 'test@test.com', passcode_hash: null });
    const route = await loadRoute();
    const res = await route.POST(mockReq({ email: 'test@test.com', passcode: '1234' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when passcode verification fails', async () => {
    mockFirst.mockResolvedValue({ id: 'u1', email: 'test@test.com', passcode_hash: 'hash' });
    const { verifyPasscode } = await import('@/lib/auth/session-utils');
    vi.mocked(verifyPasscode).mockResolvedValue(false);
    const route = await loadRoute();
    const res = await route.POST(mockReq({ email: 'test@test.com', passcode: 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('returns 200 with session cookie on valid login', async () => {
    mockFirst.mockResolvedValue({ id: 'u1', email: 'test@test.com', passcode_hash: 'hash' });
    const { verifyPasscode } = await import('@/lib/auth/session-utils');
    vi.mocked(verifyPasscode).mockResolvedValue(true);
    const route = await loadRoute();
    const res = await route.POST(mockReq({ email: 'test@test.com', passcode: 'correct' }));
    const json = await res.json() as Json;
    expect(json.ok).toBe(true);
    expect((json.user as Record<string, unknown>).id).toBe('u1');
  });

  it('returns 500 on internal error', async () => {
    const route = await loadRoute();
    const badReq = { json: async () => { throw new Error('broken'); } } as any;
    const res = await route.POST(badReq);
    expect(res.status).toBe(500);
  });

  it('rate limits after 5 attempts', async () => {
    const route = await loadRoute();
    for (let i = 0; i < 5; i++) {
      mockFirst.mockResolvedValue(null); // user not found — still counts as attempt
      await route.POST(mockReq({ email: 'rate@test.com', passcode: '1234' }));
    }
    // 6th attempt should be rate limited
    const res = await route.POST(mockReq({ email: 'rate@test.com', passcode: '1234' }));
    expect(res.status).toBe(429);
  });
});
