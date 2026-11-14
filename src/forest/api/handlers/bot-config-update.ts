/** Backend handler for bot configuration updates (bounds validation, anti-IDOR, paper-mode & signed-spec invariants). */
import { getBotManager, type BotConfig } from '@/tree/bot';
import { isH3MakerConfig, type H3MakerBotConfig } from '@/tree/bot/config-types';
import { patchBot } from '@/forest/bot/d1-adapter';
import { getVerifiedH3SpecInfo } from './bot-strategy-guard';

interface BoundRule { min: number; max: number; integer?: boolean; }

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
  volumeMultiplier: { min: 0.1, max: 10 },
  positionSizePct: { min: 1, max: 100 },
  cooldownMinutes: { min: 0, max: 60, integer: true },
  priceDropStep: { min: 0.1, max: 50 },
  maxSteps: { min: 1, max: 50, integer: true },
  baseOrderSizePct: { min: 1, max: 100 },
  volatilityWindow: { min: 5, max: 200, integer: true },
  volBaseline: { min: 1, max: 200 },
  reboundTarget: { min: 0.1, max: 50 },
  lookbackDays: { min: 2, max: 180, integer: true },
  entryAnnualBps: { min: 50, max: 5000 },
  exitAnnualBps: { min: 0, max: 2000 },
  maxGrossLeverage: { min: 0.1, max: 1.5 },
};

function coerceBound(key: string, value: number): number | null {
  const rule = BOUNDS[key];
  if (!rule) return null;
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
    const coerced = coerceBound(key, val);
    if (coerced === null) {
      return { valid: false, error: 'Invalid configuration values' };
    }
    patch[key] = coerced;
  }
  return { valid: true, patch };
}

function reconcileH3MakerSpecParity(cfg: H3MakerBotConfig): H3MakerBotConfig {
  const verified = getVerifiedH3SpecInfo();
  const d = verified.ok && verified.verifiedDefaults
    ? verified.verifiedDefaults
    : { lookbackDays: 30, entryAnnualBps: 800, exitAnnualBps: 150, maxGrossLeverage: 1.0, maxDrawdownHardPct: 12, universe: [] };
  const exitAnnualBps = Math.min(cfg.entryAnnualBps - 1, cfg.exitAnnualBps);
  const maxDrawdownPct = Math.min(d.maxDrawdownHardPct, cfg.maxDrawdownPct);
  const normalizedSymbol = cfg.symbol.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const inUniverse = d.universe.length === 0 || d.universe.includes(normalizedSymbol);
  const matchesSpec =
    verified.ok &&
    inUniverse &&
    cfg.lookbackDays === d.lookbackDays &&
    cfg.entryAnnualBps === d.entryAnnualBps &&
    exitAnnualBps === d.exitAnnualBps &&
    cfg.maxGrossLeverage === d.maxGrossLeverage;

  const baseCfg: Omit<H3MakerBotConfig, 'specSha256'> = {
    name: cfg.name,
    symbol: cfg.symbol,
    exchange: cfg.exchange,
    mode: 'paper',
    capital: cfg.capital,
    maxDrawdownPct,
    strategy: 'h3_maker',
    lookbackDays: cfg.lookbackDays,
    entryAnnualBps: cfg.entryAnnualBps,
    exitAnnualBps,
    maxGrossLeverage: cfg.maxGrossLeverage,
    ...(cfg.strategyChain ? { strategyChain: cfg.strategyChain } : {}),
  };
  return matchesSpec && verified.ok && verified.specSha256
    ? { ...baseCfg, specSha256: verified.specSha256 }
    : baseCfg;
}

export async function botUpdateConfigHandler(
  id: string,
  configPatch: Record<string, number>,
  userId?: string,
): Promise<{ ok: boolean; data?: { id: string; config: BotConfig }; error?: string }> {
  try {
    const validated = validateAndSanitizePatch(configPatch);
    if (!validated.valid) return { ok: false, error: validated.error };

    const manager = getBotManager();
    const bot = manager.getBot(id, userId) ?? (await manager.getOrCreateBot(id, userId));
    if (!bot) return { ok: false, error: `Bot not found: ${id}` };

    const ownerId = manager.getBotOwnerId(id);
    if (userId && ownerId && ownerId !== userId) return { ok: false, error: `Bot not found: ${id}` };

    const merged: BotConfig = {
      ...bot.getConfig(),
      ...validated.patch,
      mode: 'paper', // ADR-001 paper-only invariant
    };
    const updatedConfig: BotConfig = isH3MakerConfig(merged) ? reconcileH3MakerSpecParity(merged) : merged;

    await patchBot(id, { config_json: JSON.stringify(updatedConfig) }, userId);
    bot.updateConfig(updatedConfig);

    return { ok: true, data: { id, config: updatedConfig } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to update configuration',
    };
  }
}
