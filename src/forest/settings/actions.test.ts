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

const mockKillswitch = {
  isTradingEnabled: vi.fn(() => true),
  manualHalt: vi.fn(),
  manualResume: vi.fn(),
};
const mockManager = {
  getKillswitch: () => mockKillswitch,
  getRunningBots: vi.fn((): { stop: () => void }[] => []),
};
vi.mock('@/tree/bot', () => ({ getBotManager: () => mockManager }));

const mockDb = { prepare: vi.fn() };

beforeEach(async () => {
  vi.clearAllMocks();
  mockKillswitch.isTradingEnabled.mockReturnValue(true);
  mockManager.getRunningBots.mockReturnValue([]);
  const { createServerClient } = await import('@/lib/db/client');
  vi.mocked(createServerClient).mockReturnValue(mockDb as any);
});

async function action(mod: string, fn: string) {
  const m = await import(mod);
  return (m as Record<string, (...a: unknown[]) => Promise<unknown>>)[fn];
}

// ── Tests ─────────────────────────────────────────────────────

describe('settings/actions', () => {
  describe('getSettings', () => {
    it('returns defaults when DB is unavailable', async () => {
      const { createServerClient } = await import('@/lib/db/client');
      vi.mocked(createServerClient).mockReturnValue(null as any);
      const getSettings = await action('./actions', 'getSettings');
      const result = await getSettings();
      expect(result).toMatchObject({
        exchanges: { binance: { apiKey: '', testnet: true } },
        risk: { maxDrawdownPct: 15, dailyLossLimitPct: 10 },
        killswitch: { enabled: true },
      });
    });

    it('returns defaults when no settings row exists', async () => {
      mockFindSettings.mockResolvedValue(null);
      const getSettings = await action('./actions', 'getSettings');
      const result = await getSettings();
      expect(result).toMatchObject({
        exchanges: { binance: { apiKey: '', testnet: true } },
        risk: { maxDrawdownPct: 15 },
        killswitch: { enabled: true },
      });
    });

    it('parses settings row and uses live killswitch state', async () => {
      mockFindSettings.mockResolvedValue({
        id: 'settings_default',
        exchange_creds_json: JSON.stringify({
          binance: { apiKey: 'k1', apiSecret: 's1', testnet: false },
          bybit: { apiKey: '', apiSecret: '', testnet: true },
          okx: { apiKey: '', apiSecret: '', testnet: true },
        }),
        risk_limits_json: JSON.stringify({ maxDrawdownPct: 20, dailyLossLimitPct: 5, cooldownMinutes: 10, maxOpenOrders: 25 }),
        killswitch_enabled: 0,
        killswitch_reason: 'manual',
        killswitch_triggered_at: 12345,
        updated_at: 100,
      });
      mockKillswitch.isTradingEnabled.mockReturnValue(true); // live state overrides DB row

      const getSettings = await action('./actions', 'getSettings');
      const result = (await getSettings()) as { exchanges: Record<string, { apiKey: string; testnet: boolean }>; risk: { maxDrawdownPct: number }; killswitch: { enabled: boolean; reason?: string | null } };
      expect(result.exchanges.binance.apiKey).toBe('k1');
      expect(result.exchanges.binance.testnet).toBe(false);
      expect(result.risk.maxDrawdownPct).toBe(20);
      expect(result.killswitch.enabled).toBe(true); // from live killswitch, not DB
      expect(result.killswitch.reason).toBe('manual');
    });

    it('handles malformed JSON in exchange_creds_json', async () => {
      mockFindSettings.mockResolvedValue({
        id: 'settings_default',
        exchange_creds_json: 'NOT_JSON',
        risk_limits_json: '{}',
        killswitch_enabled: 1,
        killswitch_reason: null,
        killswitch_triggered_at: null,
        updated_at: 100,
      });
      const getSettings = await action('./actions', 'getSettings');
      const result = (await getSettings()) as { exchanges: Record<string, { apiKey: string }>; risk: { maxDrawdownPct: number } };
      // Falls back to defaults
      expect(result.exchanges.binance.apiKey).toBe('');
      expect(result.risk.maxDrawdownPct).toBe(15);
    });

    it('handles malformed JSON in risk_limits_json', async () => {
      mockFindSettings.mockResolvedValue({
        id: 'settings_default',
        exchange_creds_json: '{}',
        risk_limits_json: 'BROKEN',
        killswitch_enabled: 1,
        killswitch_reason: null,
        killswitch_triggered_at: null,
        updated_at: 100,
      });
      const getSettings = await action('./actions', 'getSettings');
      const result = (await getSettings()) as { risk: { maxDrawdownPct: number } };
      expect(result.risk.maxDrawdownPct).toBe(15); // default
    });
  });

  describe('updateExchangeCredentials', () => {
    it('rejects empty API key', async () => {
      const fn = await action('./actions', 'updateExchangeCredentials');
      const result = await fn('binance', '', 'secret', false);
      expect(result).toEqual({ ok: false, error: 'API key and secret are required' });
    });

    it('rejects empty API secret', async () => {
      const fn = await action('./actions', 'updateExchangeCredentials');
      const result = await fn('binance', 'key', '  ', false);
      expect(result).toEqual({ ok: false, error: 'API key and secret are required' });
    });

    it('persists valid credentials', async () => {
      mockFindSettings.mockResolvedValue(null);
      const fn = await action('./actions', 'updateExchangeCredentials');
      const result = await fn('binance', 'mykey', 'mysecret', true);
      expect(result).toEqual({ ok: true });
      expect(mockUpsertSettings).toHaveBeenCalledTimes(1);
      const row = mockUpsertSettings.mock.calls[0][1];
      const creds = JSON.parse(row.exchange_creds_json);
      expect(creds.binance.apiKey).toBe('mykey');
      expect(creds.binance.apiSecret).toBe('mysecret');
      expect(creds.binance.testnet).toBe(true);
    });

    it('returns error when DB unavailable', async () => {
      const { createServerClient } = await import('@/lib/db/client');
      vi.mocked(createServerClient).mockReturnValue(null as any);
      const fn = await action('./actions', 'updateExchangeCredentials');
      const result = (await fn('binance', 'k', 's', false)) as { ok: boolean; error?: string };
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Database not available');
    });
  });

  describe('updateRiskLimits', () => {
    it('rejects maxDrawdownPct < 1', async () => {
      const fn = await action('./actions', 'updateRiskLimits');
      const result = await fn({ maxDrawdownPct: 0 });
      expect(result).toEqual({ ok: false, error: 'Max drawdown must be between 1-100%' });
    });

    it('rejects maxDrawdownPct > 100', async () => {
      const fn = await action('./actions', 'updateRiskLimits');
      const result = await fn({ maxDrawdownPct: 101 });
      expect(result).toEqual({ ok: false, error: 'Max drawdown must be between 1-100%' });
    });

    it('rejects dailyLossLimitPct out of range', async () => {
      const fn = await action('./actions', 'updateRiskLimits');
      const r1 = (await fn({ dailyLossLimitPct: 0 })) as { ok: boolean };
      expect(r1.ok).toBe(false);
      const r2 = (await fn({ dailyLossLimitPct: 101 })) as { ok: boolean };
      expect(r2.ok).toBe(false);
    });

    it('rejects cooldownMinutes out of range', async () => {
      const fn = await action('./actions', 'updateRiskLimits');
      const r1 = (await fn({ cooldownMinutes: 0 })) as { ok: boolean };
      expect(r1.ok).toBe(false);
      const r2 = (await fn({ cooldownMinutes: 1441 })) as { ok: boolean };
      expect(r2.ok).toBe(false);
    });

    it('rejects maxOpenOrders out of range', async () => {
      const fn = await action('./actions', 'updateRiskLimits');
      const r1 = (await fn({ maxOpenOrders: 0 })) as { ok: boolean };
      expect(r1.ok).toBe(false);
      const r2 = (await fn({ maxOpenOrders: 501 })) as { ok: boolean };
      expect(r2.ok).toBe(false);
    });

    it('persists valid risk limits', async () => {
      mockFindSettings.mockResolvedValue(null);
      const fn = await action('./actions', 'updateRiskLimits');
      const result = await fn({ maxDrawdownPct: 25, cooldownMinutes: 60 });
      expect(result).toEqual({ ok: true });
      const row = mockUpsertSettings.mock.calls[0][1];
      const risk = JSON.parse(row.risk_limits_json);
      expect(risk.maxDrawdownPct).toBe(25);
      expect(risk.cooldownMinutes).toBe(60);
      expect(risk.dailyLossLimitPct).toBe(10); // unchanged default
    });
  });

  describe('emergencyHalt', () => {
    it('halts killswitch and persists', async () => {
      mockFindSettings.mockResolvedValue(null);
      const fn = await action('./actions', 'emergencyHalt');
      const result = await fn('market crash');
      expect(result).toEqual({ ok: true });
      expect(mockKillswitch.manualHalt).toHaveBeenCalledWith('market crash');
      const row = mockUpsertSettings.mock.calls[0][1];
      expect(row.killswitch_enabled).toBe(0);
      expect(row.killswitch_reason).toBe('market crash');
      expect(typeof row.killswitch_triggered_at).toBe('number');
    });
  });

  describe('resumeFromHalt', () => {
    it('resumes killswitch and persists', async () => {
      mockFindSettings.mockResolvedValue(null);
      const fn = await action('./actions', 'resumeFromHalt');
      const result = await fn();
      expect(result).toEqual({ ok: true });
      expect(mockKillswitch.manualResume).toHaveBeenCalled();
      const row = mockUpsertSettings.mock.calls[0][1];
      expect(row.killswitch_enabled).toBe(1);
      expect(row.killswitch_reason).toBeNull();
      expect(row.killswitch_triggered_at).toBeNull();
    });
  });

  describe('resetAllBots', () => {
    it('stops all running bots', async () => {
      const mockBot = { stop: vi.fn() };
      mockManager.getRunningBots.mockReturnValue([mockBot]);
      const fn = await action('./actions', 'resetAllBots');
      const result = await fn();
      expect(result).toEqual({ ok: true });
      expect(mockBot.stop).toHaveBeenCalledOnce();
    });

    it('returns ok when no bots running', async () => {
      mockManager.getRunningBots.mockReturnValue([]);
      const fn = await action('./actions', 'resetAllBots');
      const result = await fn();
      expect(result).toEqual({ ok: true });
    });

    it('returns error when getRunningBots throws', async () => {
      mockManager.getRunningBots.mockImplementation(() => { throw new Error('mgr down'); });
      const fn = await action('./actions', 'resetAllBots');
      const result = await fn();
      expect(result).toEqual({ ok: false, error: 'mgr down' });
    });
  });
});
