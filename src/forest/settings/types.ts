// Forest layer — Settings types and default configurations
// Pure contracts and defaults for D1 persistence and server actions.

export type ExchangeKey = 'binance' | 'bybit' | 'okx';

export interface SettingsData {
  exchanges: {
    binance: { apiKey: string; apiSecret: string; testnet: boolean };
    bybit: { apiKey: string; apiSecret: string; testnet: boolean };
    okx: { apiKey: string; apiSecret: string; testnet: boolean };
  };
  risk: {
    maxDrawdownPct: number;
    dailyLossLimitPct: number;
    cooldownMinutes: number;
    maxOpenOrders: number;
  };
  notification: {
    botToken: string;
    chatId: string;
  };
  killswitch: {
    enabled: boolean;
    reason: string | null;
    triggeredAt: number | null;
  };
  killswitchDaily: {
    dailyPnl: number;
    consecutiveLosses: number;
    peakCapital: number;
    dailyStartTime: number;
  };
}

export interface RiskLimitsInput {
  maxDrawdownPct?: number;
  dailyLossLimitPct?: number;
  cooldownMinutes?: number;
  maxOpenOrders?: number;
}

export interface KillswitchDailyInput {
  dailyPnl: number;
  consecutiveLosses: number;
  peakCapital: number;
  dailyStartTime: number;
}

export const SETTINGS_ROW_ID = 'settings_default';

export const DEFAULT_EXCHANGES: SettingsData['exchanges'] = {
  binance: { apiKey: '', apiSecret: '', testnet: true },
  bybit: { apiKey: '', apiSecret: '', testnet: true },
  okx: { apiKey: '', apiSecret: '', testnet: true },
};

export const DEFAULT_RISK: SettingsData['risk'] = {
  maxDrawdownPct: 15,
  dailyLossLimitPct: 10,
  cooldownMinutes: 30,
  maxOpenOrders: 50,
};

export const DEFAULT_NOTIFICATION: SettingsData['notification'] = {
  botToken: '',
  chatId: '',
};

export const DEFAULT_KILLSWITCH_DAILY: SettingsData['killswitchDaily'] = {
  dailyPnl: 0,
  consecutiveLosses: 0,
  peakCapital: 0,
  dailyStartTime: Date.now(),
};

export function createDefaultSettings(): SettingsData {
  return {
    exchanges: { ...DEFAULT_EXCHANGES },
    risk: { ...DEFAULT_RISK },
    notification: { ...DEFAULT_NOTIFICATION },
    killswitch: { enabled: true, reason: null, triggeredAt: null },
    killswitchDaily: { ...DEFAULT_KILLSWITCH_DAILY },
  };
}
