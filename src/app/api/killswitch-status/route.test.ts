import { describe, it, expect, vi, beforeEach } from 'vitest';

type Json = Record<string, unknown>;

interface KillswitchState {
  enabled: boolean;
  halted: boolean;
  haltReason: string | null;
  haltTimestamp: number | null;
  dailyPnl: number;
  consecutiveLosses: number;
  currentDrawdown: number;
}

const defaultState: KillswitchState = {
  enabled: true,
  halted: false,
  haltReason: null,
  haltTimestamp: null,
  dailyPnl: 0,
  consecutiveLosses: 0,
  currentDrawdown: 0,
};

const mockGetState = vi.fn((): KillswitchState => ({ ...defaultState }));
const mockKillswitch = { getState: mockGetState };
const mockManager = { getKillswitch: vi.fn(() => mockKillswitch) };

vi.mock('@/tree/bot', () => ({
  getBotManager: () => mockManager,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetState.mockReturnValue({ ...defaultState });
  mockManager.getKillswitch.mockReturnValue(mockKillswitch);
});

describe('GET /api/killswitch-status', () => {
  it('returns killswitch state', async () => {
    const { GET } = await import('./route');
    const res = await GET();
    const json = await res.json() as Json;
    expect(json.enabled).toBe(true);
    expect(json.halted).toBe(false);
  });

  it('includes all state fields', async () => {
    const { GET } = await import('./route');
    const res = await GET();
    const json = await res.json() as Json;
    expect(json).toHaveProperty('enabled');
    expect(json).toHaveProperty('halted');
    expect(json).toHaveProperty('haltReason');
    expect(json).toHaveProperty('haltedAt');
    expect(json).toHaveProperty('dailyPnl');
    expect(json).toHaveProperty('consecutiveLosses');
    expect(json).toHaveProperty('currentDrawdown');
    expect(json).toHaveProperty('timestamp');
  });

  it('reflects halted state', async () => {
    mockGetState.mockReturnValue({
      enabled: true,
      halted: true,
      haltReason: 'Max drawdown exceeded',
      haltTimestamp: Date.now() - 60000,
      dailyPnl: -500,
      consecutiveLosses: 3,
      currentDrawdown: 12.5,
    });
    const { GET } = await import('./route');
    const res = await GET();
    const json = await res.json() as Json;
    expect(json.halted).toBe(true);
    expect(json.haltReason).toBe('Max drawdown exceeded');
    expect(json.dailyPnl).toBe(-500);
    expect(json.currentDrawdown).toBe(12.5);
  });

  it('returns timestamp', async () => {
    const { GET } = await import('./route');
    const res = await GET();
    const json = await res.json() as Json;
    expect(typeof json.timestamp).toBe('number');
    expect(json.timestamp as number).toBeGreaterThan(0);
  });
});
