// route.test.ts — tests for /api/health route handler
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn().mockReturnValue({
    prepare: vi.fn().mockReturnValue({
      first: vi.fn().mockResolvedValue({ '1': 1 }),
    }),
  }),
}));

const { GET } = await import('./route');
describe('/api/health route', () => {
  it('returns health status with db check', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('checks');
    const checks = body.checks as Record<string, string>;
    expect(checks.db).toBe('ok');
  });

  it('returns degraded when db is unavailable', async () => {
    const { createServerClient } = await import('@/lib/db/client');
    vi.mocked(createServerClient).mockReturnValueOnce(null as never);
    const res = await GET();
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe('degraded');
  });
});
