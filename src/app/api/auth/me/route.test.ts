import { describe, it, expect, vi, beforeEach } from 'vitest';

type Json = Record<string, unknown>;

const mockBind = vi.fn().mockReturnThis();
const mockFirst = vi.fn();
const mockRun = vi.fn();
const mockPrepare = vi.fn(() => ({ bind: mockBind, first: mockFirst, run: mockRun }));
const mockDb = { prepare: mockPrepare };

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('@/lib/auth/session-utils', () => ({
  parseSessionCookie: vi.fn(),
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

function mockReq() { return {} as any; }

async function setSession(id: string | null) {
  const { parseSessionCookie } = await import('@/lib/auth/session-utils');
  vi.mocked(parseSessionCookie).mockReturnValue(id);
}

describe('GET /api/auth/me', () => {
  it('returns 401 when no session cookie', async () => {
    await setSession(null);
    const { GET } = await import('./route');
    const res = await GET(mockReq());
    expect(res.status).toBe(401);
    const json = await res.json() as Json;
    expect(json.ok).toBe(false);
  });

  it('returns 503 when DB unavailable', async () => {
    await setSession('s1');
    const { createServerClient } = await import('@/lib/db/client');
    vi.mocked(createServerClient).mockReturnValue(null as any);
    const { GET } = await import('./route');
    const res = await GET(mockReq());
    expect(res.status).toBe(503);
  });

  it('returns 401 when session not found in DB', async () => {
    await setSession('s1');
    mockFirst.mockResolvedValue(null);
    const { GET } = await import('./route');
    const res = await GET(mockReq());
    expect(res.status).toBe(401);
    const json = await res.json() as Json;
    expect(json.error).toContain('Session expired');
  });

  it('returns user data on valid session', async () => {
    await setSession('s1');
    mockFirst.mockResolvedValue({
      session_id: 's1',
      user_id: 'u1',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      email: 'test@test.com',
      display_name: 'Test User',
      locale: 'vi',
    });
    const { GET } = await import('./route');
    const res = await GET(mockReq());
    const json = await res.json() as Json;
    expect(json.ok).toBe(true);
    const user = json.user as Record<string, unknown>;
    expect(user.id).toBe('u1');
    expect(user.email).toBe('test@test.com');
    expect(user.displayName).toBe('Test User');
    expect(user.locale).toBe('vi');
  });

  it('extends session expiry on valid session', async () => {
    await setSession('s1');
    mockFirst.mockResolvedValue({
      session_id: 's1',
      user_id: 'u1',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      email: 'test@test.com',
      display_name: 'Test',
      locale: 'en',
    });
    const { GET } = await import('./route');
    await GET(mockReq());
    expect(mockRun).toHaveBeenCalledOnce();
  });

  it('returns 500 on internal error', async () => {
    await setSession('s1');
    mockPrepare.mockImplementation(() => { throw new Error('DB error'); });
    const { GET } = await import('./route');
    const res = await GET(mockReq());
    expect(res.status).toBe(500);
  });
});
