import { describe, it, expect, vi, beforeEach } from 'vitest';

type Json = Record<string, unknown>;

const mockRun = vi.fn();
const mockBind = vi.fn(() => ({ run: mockRun }));
const mockPrepare = vi.fn(() => ({ bind: mockBind }));
const mockDb = { prepare: mockPrepare };

vi.mock('@/lib/db/client', () => ({ createServerClient: vi.fn() }));
vi.mock('@/lib/auth/session-utils', () => ({
  parseSessionCookie: vi.fn(() => 'session-123'),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  const { createServerClient } = await import('@/lib/db/client');
  vi.mocked(createServerClient).mockReturnValue(mockDb as any);
});

function mockReq() { return {} as any; }

describe('POST /api/auth/logout', () => {
  it('returns ok and deletes session', async () => {
    const { POST } = await import('./route');
    const res = await POST(mockReq());
    const json = await res.json() as Json;
    expect(json.ok).toBe(true);
  });

  it('deletes session from DB when session exists', async () => {
    const { POST } = await import('./route');
    await POST(mockReq());
    expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('DELETE'));
    expect(mockRun).toHaveBeenCalledOnce();
  });

  it('returns ok even when no session cookie', async () => {
    const { parseSessionCookie } = await import('@/lib/auth/session-utils');
    vi.mocked(parseSessionCookie).mockReturnValue(null);
    const { POST } = await import('./route');
    const res = await POST(mockReq());
    const json = await res.json() as Json;
    expect(json.ok).toBe(true);
  });

  it('returns ok when DB unavailable', async () => {
    const { createServerClient } = await import('@/lib/db/client');
    vi.mocked(createServerClient).mockReturnValue(null as any);
    const { POST } = await import('./route');
    const res = await POST(mockReq());
    const json = await res.json() as Json;
    expect(json.ok).toBe(true);
  });

  it('returns 500 on error', async () => {
    const { parseSessionCookie } = await import('@/lib/auth/session-utils');
    vi.mocked(parseSessionCookie).mockImplementation(() => { throw new Error('parse fail'); });
    const { POST } = await import('./route');
    const res = await POST(mockReq());
    expect(res.status).toBe(500);
  });
});
