// Forest layer — Server Actions for user settings
// Exchange credentials, risk limits, killswitch control.

'use server';

import { getBotManager } from '@/tree/bot';

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
  killswitch: {
    enabled: boolean;
    reason: string | null;
    triggeredAt: number | null;
  };
}

const DEFAULT_SETTINGS: SettingsData = {
  exchanges: {
    binance: { apiKey: '', apiSecret: '', testnet: true },
    bybit: { apiKey: '', apiSecret: '', testnet: true },
    okx: { apiKey: '', apiSecret: '', testnet: true },
  },
  risk: {
    maxDrawdownPct: 15,
    dailyLossLimitPct: 10,
    cooldownMinutes: 30,
    maxOpenOrders: 50,
  },
  killswitch: {
    enabled: true,
    reason: null,
    triggeredAt: null,
  },
};

export async function getSettings(): Promise<SettingsData> {
  // TODO: wire to D1 user_settings table
  // For now return defaults + live killswitch state
  const ks = getBotManager().getKillswitch();
  return {
    ...DEFAULT_SETTINGS,
    killswitch: {
      enabled: ks.isTradingEnabled(),
      reason: null,
      triggeredAt: null,
    },
  };
}

export async function updateExchangeCredentials(
  exchange: 'binance' | 'bybit' | 'okx',
  apiKey: string,
  apiSecret: string,
  testnet: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    // TODO: store encrypted in D1
    // For now just validate non-empty
    if (!apiKey.trim() || !apiSecret.trim()) {
      return { ok: false, error: 'API key and secret are required' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Update failed' };
  }
}

export async function updateRiskLimits(input: {
  maxDrawdownPct?: number;
  dailyLossLimitPct?: number;
  cooldownMinutes?: number;
  maxOpenOrders?: number;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    if (input.maxDrawdownPct !== undefined && (input.maxDrawdownPct < 1 || input.maxDrawdownPct > 100)) {
      return { ok: false, error: 'Max drawdown must be between 1-100%' };
    }
    if (input.dailyLossLimitPct !== undefined && (input.dailyLossLimitPct < 1 || input.dailyLossLimitPct > 100)) {
      return { ok: false, error: 'Daily loss limit must be between 1-100%' };
    }
    // TODO: persist to D1
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Update failed' };
  }
}

export async function emergencyHalt(reason: string): Promise<{ ok: boolean; error?: string }> {
  try {
    getBotManager().getKillswitch().manualHalt(reason);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Halt failed' };
  }
}

export async function resumeFromHalt(): Promise<{ ok: boolean; error?: string }> {
  try {
    getBotManager().getKillswitch().manualResume();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Resume failed' };
  }
}

export async function resetAllBots(): Promise<{ ok: boolean; error?: string }> {
  try {
    // Stop all running bots then reset
    const manager = getBotManager();
    for (const bot of manager.getRunningBots()) {
      bot.stop();
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Reset failed' };
  }
}
