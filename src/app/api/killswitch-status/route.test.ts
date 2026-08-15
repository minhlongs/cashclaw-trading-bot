// route.test.ts — tests for /api/killswitch-status route handler
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('@/lib/db/repositories', () => ({
  findSettingsByUser: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';
import { createServerClient } from '@/lib/db/client';
import { findSettingsByUser } from '@/lib/db/repositories';

function mockDbAvailable() {
  vi.mocked(createServerClient).mockReturnValue({} as any);
}

function mockDbUnavailable() {
  vi.mocked(createServerClient).mockReturnValue(null as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findSettingsByUser).mockResolvedValue(null as any);
});

describe('GET /api/killswitch-status', () => {
  it('returns safe defaults when DB unavailable', async () => {
    mockDbUnavailable();
    const res = await GET();
    const json = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(json.enabled).toBe(true);
    expect(json.halted).toBe(false);
    expect(json.dailyPnl).toBe(0);
    expect(json.consecutiveLosses).toBe(0);
    expect(json.currentDrawdown).toBe(0);
  });

  it('returns killswitch state from D1 settings row', async () => {
    mockDbAvailable();
    vi.mocked(findSettingsByUser).mockResolvedValue({
      id: 'settings_1',
      user_id: null,
      killswitch_enabled: 0,
      killswitch_reason: 'Emergency halt',
      killswitch_triggered_at: 1700000000,
      killswitch_daily_json: JSON.stringify({ dailyPnl: -150.5, consecutiveLosses: 2, peakCapital: 5000, dailyStartTime: 1700000000 }),
    } as any);

    const res = await GET();
    const json = await res.json() as Record<string, unknown>;

    expect(json.enabled).toBe(false);
    expect(json.halted).toBe(true);
    expect(json.haltReason).toBe('Emergency halt');
    expect(json.haltedAt).toBe(1700000000);
    expect(json.dailyPnl).toBe(-150.5);
    expect(json.consecutiveLosses).toBe(2);
  });

  it('returns defaults when no settings row exists', async () => {
    mockDbAvailable();
    vi.mocked(findSettingsByUser).mockResolvedValue(null);

    const res = await GET();
    const json = await res.json() as Record<string, unknown>;

    expect(json.enabled).toBe(true);
    expect(json.halted).toBe(false);
    expect(json.dailyPnl).toBe(0);
    expect(json.consecutiveLosses).toBe(0);
  });

  it('reads consecutive losses from killswitch_daily_json', async () => {
    mockDbAvailable();
    vi.mocked(findSettingsByUser).mockResolvedValue({
      id: 'settings_1',
      killswitch_enabled: 1,
      killswitch_reason: null,
      killswitch_triggered_at: null,
      killswitch_daily_json: JSON.stringify({ dailyPnl: 50, consecutiveLosses: 3, peakCapital: 2000, dailyStartTime: 1700000000 }),
    } as any);

    const res = await GET();
    const json = await res.json() as Record<string, unknown>;

    expect(json.consecutiveLosses).toBe(3);
    expect(json.dailyPnl).toBe(50);
  });

  it('handles D1 query errors gracefully', async () => {
    mockDbAvailable();
    vi.mocked(findSettingsByUser).mockRejectedValue(new Error('D1 down'));

    const res = await GET();
    const json = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(json.enabled).toBe(true);
    expect(json.halted).toBe(false);
  });

  it('handles malformed killswitch_daily_json gracefully', async () => {
    mockDbAvailable();
    vi.mocked(findSettingsByUser).mockResolvedValue({
      id: 'settings_1',
      killswitch_enabled: 1,
      killswitch_reason: null,
      killswitch_triggered_at: null,
      killswitch_daily_json: 'not-valid-json',
    } as any);

    const res = await GET();
    const json = await res.json() as Record<string, unknown>;

    expect(json.dailyPnl).toBe(0);
    expect(json.consecutiveLosses).toBe(0);
  });
});
