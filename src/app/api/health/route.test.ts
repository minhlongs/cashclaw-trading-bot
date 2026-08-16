// route.test.ts — tests for /api/health route handler
import { describe, it, expect, vi } from 'vitest';

// Default mock: everything healthy
vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn().mockReturnValue({
    prepare: vi.fn().mockReturnValue({
      first: vi.fn()
        .mockResolvedValueOnce({ '1': 1 })        // probeDb SELECT 1
        .mockResolvedValueOnce(null),               // probeCircuitBreaker → no open breakers
    }),
  }),
}));

vi.mock('@/forest/api/rate-limiter', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 99, resetAt: Date.now() + 60_000 }),
}));

const { GET } = await import('./route');
const { createServerClient } = await import('@/lib/db/client');
const { checkRateLimit } = await import('@/forest/api/rate-limiter');

describe('/api/health route', () => {
  it('returns health status with all checks ok', async () => {
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
    expect(checks.circuitBreaker).toBe('ok');
    expect(checks.rateLimiter).toBe('ok');
  });

  it('returns degraded when db is unavailable', async () => {
    vi.mocked(createServerClient).mockReturnValueOnce(null as never);
    const res = await GET();
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe('degraded');
    const checks = body.checks as Record<string, string>;
    expect(checks.db).toBe('unavailable');
    expect(checks.circuitBreaker).toBe('unavailable');
  });

  it('returns degraded when circuit breaker has open breakers', async () => {
    vi.mocked(createServerClient).mockReturnValueOnce({
      prepare: vi.fn().mockReturnValue({
        first: vi.fn()
          .mockResolvedValueOnce({ '1': 1 })    // DB ok
          .mockResolvedValueOnce({ state: 'open' }), // CB open
      }),
    } as never);
    const res = await GET();
    const body = await res.json() as unknown as Record<string, unknown>;
    expect(body.status).toBe('degraded');
    const checks = body.checks as Record<string, string>;
    expect(checks.db).toBe('ok');
    expect(checks.circuitBreaker).toBe('degraded');
  });

  it('marks circuit breaker unavailable when D1 query throws', async () => {
    vi.mocked(createServerClient).mockReturnValueOnce({
      prepare: vi.fn().mockReturnValue({
        first: vi.fn()
          .mockResolvedValueOnce({ '1': 1 })  // DB ok
          .mockRejectedValueOnce(new Error('no such table: circuit_breaker_state')),
      }),
    } as never);
    const res = await GET();
    const body = await res.json() as unknown as Record<string, unknown>;
    expect(body.status).toBe('degraded');
    const checks = body.checks as Record<string, string>;
    expect(checks.db).toBe('ok');
    expect(checks.circuitBreaker).toBe('degraded');
  });

  it('marks rate limiter unavailable when checkRateLimit throws', async () => {
    vi.mocked(checkRateLimit).mockImplementationOnce(() => {
      throw new Error('rate limiter module error');
    });
    const res = await GET();
    const body = await res.json() as unknown as Record<string, unknown>;
    // Rate limiter being unavailable does NOT degrade overall status
    // (overall status reflects db + circuit breaker only)
    expect(body.status).toBe('ok');
    const checks = body.checks as Record<string, string>;
    expect(checks.db).toBe('ok');
    expect(checks.circuitBreaker).toBe('ok');
    expect(checks.rateLimiter).toBe('unavailable');
  });

  it('includes environment and version in response', async () => {
    const res = await GET();
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty('environment');
    expect(body).toHaveProperty('version');
    expect(typeof body.uptime).toBe('number');
  });
});
