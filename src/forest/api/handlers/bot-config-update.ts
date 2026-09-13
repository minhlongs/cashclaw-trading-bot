/**
 * Backend handler for bot configuration updates.
 * Validates parameter bounds, enforces anti-IDOR checks and paper mode,
 * persists to D1, and updates runtime BotInstance state.
 */

import { getBotManager, type BotConfig } from '@/tree/bot';
import { patchBot } from '@/forest/bot/d1-adapter';

interface BoundRule {
  min: number;
  max: number;
  integer?: boolean;
}

const BOUNDS: Record<string, BoundRule> = {
  gridSpacingPct: { min: 0.1, max: 50 },
  gridLevels: { min: 2, max: 200, integer: true },
  capitalPerLevelPct: { min: 1, max: 100 },
  takeProfitPct: { min: 0.1, max: 50 },
  stopLossPct: { min: 0.1, max: 50 },
  maxDrawdownPct: { min: 1, max: 50 },
  bbPeriod: { min: 2, max: 100, integer: true },
  bbStdDev: { min: 0.1, max: 10 },
  rsiPeriod: { min: 2, max: 100, integer: true },
  rsiBuyThreshold: { min: 1, max: 50 },
  rsiSellThreshold: { min: 50, max: 99 },
  priceDropStep: { min: 0.1, max: 50 },
  maxSteps: { min: 1, max: 50, integer: true },
  baseOrderSizePct: { min: 1, max: 100 },
};

function coerceBound(key: string, value: number): number {
  const rule = BOUNDS[key];
  if (!rule) return value;
  const clamped = Math.min(Math.max(value, rule.min), rule.max);
  return rule.integer ? Math.round(clamped) : clamped;
}

function validateAndSanitizePatch(
  configPatch: Record<string, number>,
): { valid: false; error: string } | { valid: true; patch: Record<string, number> } {
  if (!configPatch || typeof configPatch !== 'object' || Array.isArray(configPatch)) {
    return { valid: false, error: 'Invalid configuration values' };
  }

  const patch: Record<string, number> = {};
  for (const [key, val] of Object.entries(configPatch)) {
    if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) {
      return { valid: false, error: 'Invalid configuration values' };
    }
    patch[key] = coerceBound(key, val);
  }
  return { valid: true, patch };
}

export async function botUpdateConfigHandler(
  id: string,
  configPatch: Record<string, number>,
  userId?: string,
): Promise<{ ok: boolean; data?: { id: string; config: BotConfig }; error?: string }> {
  try {
    const validated = validateAndSanitizePatch(configPatch);
    if (!validated.valid) {
      return { ok: false, error: validated.error };
    }

    const manager = getBotManager();
    const bot = manager.getBot(id, userId) ?? (await manager.getOrCreateBot(id, userId));
    if (!bot) {
      return { ok: false, error: `Bot not found: ${id}` };
    }

    const ownerId = (bot as { userId?: string | null }).userId;
    if (userId && ownerId && ownerId !== userId) {
      return { ok: false, error: `Bot not found: ${id}` };
    }

    const updatedConfig: BotConfig = {
      ...bot.getConfig(),
      ...validated.patch,
      mode: 'paper', // ADR-001 paper-only invariant
    };

    await patchBot(id, { config_json: JSON.stringify(updatedConfig) });
    bot.updateConfig(updatedConfig);

    return {
      ok: true,
      data: { id, config: updatedConfig },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to update configuration',
    };
  }
}
