import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseExchanges,
  parseRisk,
  parseNotification,
  parseKillswitchDaily,
  rowToSettingsData,
  validateRiskRanges,
  applyRiskOverrides,
} from './parsers';
import { DEFAULT_EXCHANGES, DEFAULT_RISK, DEFAULT_NOTIFICATION, DEFAULT_KILLSWITCH_DAILY, createDefaultSettings } from './types';
import type { SettingsRow } from '@/lib/db/repositories';

vi.mock('@/lib/crypto', () => ({
  decrypt: vi.fn(async (val: string) => (val ? `decrypted_${val}` : '')),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

describe('parsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseExchanges', () => {
    it('parses valid exchanges and decrypts credentials', async () => {
      const raw = JSON.stringify({
        binance: { apiKey: 'k_bin', apiSecret: 's_bin', testnet: false },
        bybit: { apiKey: 'k_byb', apiSecret: 's_byb', testnet: true },
      });
      const res = await parseExchanges(raw);
      expect(res.binance).toEqual({ apiKey: 'decrypted_k_bin', apiSecret: 'decrypted_s_bin', testnet: false });
      expect(res.bybit).toEqual({ apiKey: 'decrypted_k_byb', apiSecret: 'decrypted_s_byb', testnet: true });
      expect(res.okx).toEqual(DEFAULT_EXCHANGES.okx);
    });

    it('returns default exchanges on corrupt JSON', async () => {
      const res = await parseExchanges('{invalid-json');
      expect(res).toEqual(DEFAULT_EXCHANGES);
    });
  });

  describe('parseRisk', () => {
    it('parses valid risk config with partial overrides', () => {
      const res = parseRisk(JSON.stringify({ maxDrawdownPct: 25, maxOpenOrders: 30 }));
      expect(res).toEqual({
        maxDrawdownPct: 25,
        dailyLossLimitPct: DEFAULT_RISK.dailyLossLimitPct,
        cooldownMinutes: DEFAULT_RISK.cooldownMinutes,
        maxOpenOrders: 30,
      });
    });

    it('returns default risk on corrupt JSON', () => {
      expect(parseRisk('not-json')).toEqual(DEFAULT_RISK);
    });
  });

  describe('parseNotification and parseKillswitchDaily', () => {
    it('parses notification settings and handles fallback', () => {
      expect(parseNotification(undefined)).toEqual(DEFAULT_NOTIFICATION);
      expect(parseNotification('bad')).toEqual(DEFAULT_NOTIFICATION);
      expect(parseNotification(JSON.stringify({ botToken: 'tok', chatId: '123' }))).toEqual({ botToken: 'tok', chatId: '123' });
    });

    it('parses killswitch daily settings and handles fallback', () => {
      expect(parseKillswitchDaily(undefined)).toEqual(DEFAULT_KILLSWITCH_DAILY);
      expect(parseKillswitchDaily('bad')).toEqual(DEFAULT_KILLSWITCH_DAILY);
      const data = { dailyPnl: 100, consecutiveLosses: 3, peakCapital: 5000, dailyStartTime: 12345 };
      expect(parseKillswitchDaily(JSON.stringify(data))).toEqual(data);
    });
  });

  describe('rowToSettingsData', () => {
    it('transforms D1 SettingsRow into SettingsData', async () => {
      const row: SettingsRow = {
        id: 'settings_default',
        user_id: null,
        exchange_creds_json: JSON.stringify({ binance: { apiKey: 'k', apiSecret: 's', testnet: true } }),
        risk_limits_json: JSON.stringify({ maxDrawdownPct: 20 }),
        notification_json: JSON.stringify({ botToken: 'bt', chatId: 'ci' }),
        killswitch_daily_json: JSON.stringify({ dailyPnl: -10 }),
        killswitch_enabled: 1,
        killswitch_reason: null,
        killswitch_triggered_at: null,
        updated_at: 1000,
      };
      const res = await rowToSettingsData(row);
      expect(res.killswitch.enabled).toBe(true);
      expect(res.notification.botToken).toBe('bt');
      expect(res.exchanges.binance.apiKey).toBe('decrypted_k');
    });
  });

  describe('validateRiskRanges & applyRiskOverrides', () => {
    it('validates all risk boundaries', () => {
      expect(validateRiskRanges({ maxDrawdownPct: 0 })).toBe('Max drawdown must be between 1-100%');
      expect(validateRiskRanges({ maxDrawdownPct: 101 })).toBe('Max drawdown must be between 1-100%');
      expect(validateRiskRanges({ dailyLossLimitPct: 0 })).toBe('Daily loss limit must be between 1-100%');
      expect(validateRiskRanges({ dailyLossLimitPct: 101 })).toBe('Daily loss limit must be between 1-100%');
      expect(validateRiskRanges({ cooldownMinutes: 0 })).toBe('Cooldown must be between 1-1440 minutes');
      expect(validateRiskRanges({ cooldownMinutes: 1441 })).toBe('Cooldown must be between 1-1440 minutes');
      expect(validateRiskRanges({ maxOpenOrders: 0 })).toBe('Max open orders must be between 1-500');
      expect(validateRiskRanges({ maxOpenOrders: 501 })).toBe('Max open orders must be between 1-500');
      expect(validateRiskRanges({ maxDrawdownPct: 10, cooldownMinutes: 60 })).toBeNull();
    });

    it('applies risk overrides correctly', () => {
      const current = createDefaultSettings();
      applyRiskOverrides(current, { maxDrawdownPct: 22, maxOpenOrders: 77 });
      expect(current.risk.maxDrawdownPct).toBe(22);
      expect(current.risk.maxOpenOrders).toBe(77);
      expect(current.risk.dailyLossLimitPct).toBe(DEFAULT_RISK.dailyLossLimitPct);
    });
  });
});
