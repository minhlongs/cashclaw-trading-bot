import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────

const mockFindSettings = vi.fn();
const mockUpsertSettings = vi.fn();

vi.mock('@/lib/db/client', () => ({ createServerClient: vi.fn() }));
vi.mock('@/lib/db/repositories', () => ({
  findSettingsByUser: (...a: unknown[]) => mockFindSettings(...a),
  upsertSettings: (...a: unknown[]) => mockUpsertSettings(...a),
}));
vi.mock('@/forest/bot/d1-adapter', () => ({ loadAllBotsFromD1: vi.fn(async () => {}) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// BotManager mock — only used by resetAllBots tests
const mockManager = {
  getRunningBots: vi.fn((): { stop: () => void }[] => []),
};
vi.mock('@/tree/bot', () => ({ getBotManager: () => mockManager }));

import { createServerClient } from '@/lib/db/client';
import { emergencyHalt, resumeFromHalt, resetAllBots, getSettings, updateExchangeCredentials, updateRiskLimits } from './actions';

const DEFAULT_SETTINGS_ROW = {
  id: 'settings_default',
  user_id: null,
  exchange_creds_json: JSON.stringify({
    binance: { apiKey: '', apiSecret: '', testnet: true },
    bybit: { apiKey: '', apiSecret: '', testnet: true },
    okx: { apiKey: '', apiSecret: '', testnet: true },
  }),
  risk_limits_json: JSON.stringify({ maxDrawdownPct: 15, dailyLossLimitPct: 10, cooldownMinutes: 60, maxOpenOrders: 10 }),
  notification_json: '{}',
  killswitch_daily_json: '{}',
  killswitch_enabled: 1,
  killswitch_reason: null,
  killswitch_triggered_at: null,
  updated_at: Date.now(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFindSettings.mockResolvedValue(null);
  mockUpsertSettings.mockResolvedValue(undefined);
  mockManager.getRunningBots.mockReturnValue([]);
  vi.mocked(createServerClient).mockReturnValue({
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
      }),
    }),
  } as any);
});

/** Helper to dynamically import a named export from the actions module. */
async function action(file: string, name: string) {
  const mod = await import(file);
  return mod[name] as (...args: unknown[]) => Promise<unknown>;
}

describe('getSettings', () => {
  it('returns defaults when no DB row exists', async () => {
    mockFindSettings.mockResolvedValue(null);
    const result = await getSettings();
    expect(result).toMatchObject({
      exchanges: { binance: { testnet: true } },
      risk: { maxDrawdownPct: 15 },
      killswitch: { enabled: true },
    });
  });

  it('parses settings row and uses D1 killswitch state', async () => {
    mockFindSettings.mockResolvedValue({
      id: 'settings_default',
      exchange_creds_json: JSON.stringify({
        binance: { apiKey: 'k1', apiSecret: 's1', testnet: false },
        bybit: { apiKey: '', apiSecret: '', testnet: true },
        okx: { apiKey: '', apiSecret: '', testnet: true },
      }),
      risk_limits_json: JSON.stringify({ maxDrawdownPct: 20, dailyLossLimitPct: 5, cooldownMinutes: 10, maxOpenOrders: 25 }),
      notification_json: '{}',
      killswitch_daily_json: '{"dailyPnl":0,"consecutiveLosses":0,"peakCapital":0,"dailyStartTime":1700000000}',
      killswitch_enabled: 0,
      killswitch_reason: 'test halt',
      killswitch_triggered_at: 1700000000,
      updated_at: Date.now(),
    } as any);
    const result = await getSettings();
    expect(result).toMatchObject({
      killswitch: {
        enabled: false,
        reason: 'test halt',
        triggeredAt: 1700000000,
      },
    });
  });
});

describe('updateExchangeCredentials', () => {
  it('returns error when DB unavailable', async () => {
    vi.mocked(createServerClient).mockReturnValue(null as any);
    const fn = await action('./actions', 'updateExchangeCredentials');
    const result = (await fn('binance', 'k', 's', false)) as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Database not available');
  });

  it('returns error when API key and secret are empty (binance)', async () => {
    const fn = await action('./actions', 'updateExchangeCredentials');
    const result = (await fn('binance', '', '', false)) as { ok: boolean; error?: string };
    expect(result).toEqual({ ok: false, error: 'API key and secret are required' });
  });

  it('returns error when API key and secret are empty (bybit)', async () => {
    const fn = await action('./actions', 'updateExchangeCredentials');
    const result = (await fn('bybit', '', '', false)) as { ok: boolean; error?: string };
    expect(result).toEqual({ ok: false, error: 'API key and secret are required' });
  });
});

describe('updateRiskLimits', () => {
  it('validates max drawdown range lower bound', async () => {
    const fn = await action('./actions', 'updateRiskLimits');
    const result = (await fn({ maxDrawdownPct: 0 })) as { ok: boolean; error?: string };
    expect(result).toEqual({ ok: false, error: 'Max drawdown must be between 1-100%' });
  });

  it('validates max drawdown range upper bound', async () => {
    const fn = await action('./actions', 'updateRiskLimits');
    const result = (await fn({ maxDrawdownPct: 101 })) as { ok: boolean; error?: string };
    expect(result).toEqual({ ok: false, error: 'Max drawdown must be between 1-100%' });
  });
});

describe('emergencyHalt', () => {
  it('persists killswitch halt to D1', async () => {
    mockFindSettings.mockResolvedValue({ ...DEFAULT_SETTINGS_ROW } as any);
    const fn = await action('./actions', 'emergencyHalt');
    const result = await fn('market crash');

    expect(result).toEqual({ ok: true });
    const row = mockUpsertSettings.mock.calls[0]?.[1] as any;
    expect(row.killswitch_enabled).toBe(0);
    expect(row.killswitch_reason).toBe('market crash');
  });
});

describe('resumeFromHalt', () => {
  it('persists killswitch resume to D1', async () => {
    mockFindSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS_ROW,
      killswitch_enabled: 0,
    } as any);
    const fn = await action('./actions', 'resumeFromHalt');
    const result = await fn();

    expect(result).toEqual({ ok: true });
    const row = mockUpsertSettings.mock.calls[0]?.[1] as any;
    expect(row.killswitch_enabled).toBe(1);
    expect(row.killswitch_reason).toBeNull();
  });
});

describe('resetAllBots', () => {
  it('returns ok when no bots running', async () => {
    mockManager.getRunningBots.mockReturnValue([]);
    const fn = await action('./actions', 'resetAllBots');
    const result = await fn();
    expect(result).toEqual({ ok: true });
  });

  it('stops running bots', async () => {
    const mockBot = { stop: vi.fn() };
    mockManager.getRunningBots.mockReturnValue([mockBot]);
    const fn = await action('./actions', 'resetAllBots');
    await fn();
    expect(mockBot.stop).toHaveBeenCalled();
  });

  it('returns error when getRunningBots throws', async () => {
    mockManager.getRunningBots.mockImplementation(() => { throw new Error('mgr down'); });
    const fn = await action('./actions', 'resetAllBots');
    const result = await fn();
    expect(result).toEqual({ ok: false, error: 'mgr down' });
  });
});

describe('saveKillswitchDailyState', () => {
  it('persists daily state to D1', async () => {
    const { saveKillswitchDailyState } = await import('./actions');
    mockFindSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS_ROW,
      exchange_creds_json: '{}',
    });

    await saveKillswitchDailyState({ dailyPnl: -50, consecutiveLosses: 2, peakCapital: 1000, dailyStartTime: 1700000000 });

    expect(mockUpsertSettings).toHaveBeenCalled();
    const call = mockUpsertSettings.mock.calls[0] as [unknown, { killswitch_daily_json: string }];
    const persisted = JSON.parse(call[1].killswitch_daily_json) as Record<string, unknown>;
    expect(persisted.dailyPnl).toBe(-50);
    expect(persisted.consecutiveLosses).toBe(2);
    expect(persisted.peakCapital).toBe(1000);
  });

  it('does not throw on persistence failure', async () => {
    const { saveKillswitchDailyState } = await import('./actions');
    mockFindSettings.mockRejectedValue(new Error('D1 down'));

    await expect(saveKillswitchDailyState({ dailyPnl: 0, consecutiveLosses: 0, peakCapital: 0, dailyStartTime: 0 }))
      .resolves.toBeUndefined();
  });
});
