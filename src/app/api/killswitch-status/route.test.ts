// route.test.ts — tests for /api/killswitch-status route handler
import { describe, it, expect, vi } from 'vitest';

const mockGetKillswitchState = vi.fn().mockReturnValue({
  enabled: true,
  halted: false,
  haltReason: null,
  haltTimestamp: null,
  dailyPnl: 0,
  consecutiveLosses: 0,
  currentDrawdown: 0,
});

vi.mock('@/tree/bot', () => ({
  getBotManager: vi.fn(() => ({
    getKillswitch: vi.fn(() => ({
      getState: (...args: unknown[]) => mockGetKillswitchState(...args),
    })),
  })),
}));

const { GET } = await import('./route');

describe('/api/killswitch-status route', () => {
  it('returns killswitch state', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.enabled).toBe(true);
    expect(body.halted).toBe(false);
    expect(body).toHaveProperty('timestamp');
  });
});
