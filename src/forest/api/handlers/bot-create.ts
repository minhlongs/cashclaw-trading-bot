import { getBotManager, type CreateBotRequest } from '@/tree/bot';
import type {
  BotConfig,
  GridBotConfig,
  H3MakerBotConfig,
  MeanRevBotConfig,
  StrategyType,
  StrategyVerificationTier,
  VolatilityDcaBotConfig,
} from '@/tree/bot/types';
import { normalizeWizardConfig, coerceNum } from './bot-create.normalize';
import {
  RETAIL_SANDBOX_WARNING,
  evaluateBotStrategyGuard,
  isExactVerifiedH3Config,
  type BotStrategyGuardErrorCode,
  type StrategyArtifactPaths,
  type VerifiedH3Defaults,
} from './bot-strategy-guard';

export interface CreateBotPayload {
  id: string;
  name: string;
  strategy: StrategyType;
  pair: string;
  exchange: string;
  capital: number;
  config?: Record<string, number | boolean>;
  mode?: 'paper' | 'live';
}

export interface CreateBotResultData {
  id: string;
  verificationTier: StrategyVerificationTier;
  warning?: string;
  specSha256?: string;
}

export interface CreateBotResult {
  ok: boolean;
  status?: number;
  code?: BotStrategyGuardErrorCode;
  data?: CreateBotResultData;
  error?: string;
}

function buildStrategyConfig(
  payload: CreateBotPayload,
  cfg: Record<string, number>,
  h3Defaults?: VerifiedH3Defaults,
  specSha256?: string,
): BotConfig {
  const base = {
    name: payload.name,
    symbol: payload.pair,
    exchange: payload.exchange,
    mode: 'paper' as const,
    capital: payload.capital,
    maxDrawdownPct: coerceNum({ config: cfg, key: 'maxDrawdownPct', defaultValue: 10, min: 1, max: 50 }),
  };

  if (payload.strategy === 'grid') {
    return {
      ...base,
      strategy: 'grid' as const,
      gridSpacingPct: coerceNum({ config: cfg, key: 'gridSpacingPct', defaultValue: 1, min: 0.1, max: 20 }),
      gridLevels: coerceNum({ config: cfg, key: 'gridLevels', defaultValue: 10, min: 2, max: 200 }),
      capitalPerLevelPct: coerceNum({ config: cfg, key: 'capitalPerLevelPct', defaultValue: 10, min: 1, max: 100 }),
      takeProfitPct: coerceNum({ config: cfg, key: 'takeProfitPct', defaultValue: 2, min: 0.1, max: 50 }),
      stopLossPct: coerceNum({ config: cfg, key: 'stopLossPct', defaultValue: 5, min: 0.1, max: 50 }),
      rebalanceOnFill: false,
    } satisfies GridBotConfig;
  }

  if (payload.strategy === 'mean_reversion') {
    return {
      ...base,
      strategy: 'mean_reversion' as const,
      bbPeriod: coerceNum({ config: cfg, key: 'bbPeriod', defaultValue: 20, min: 2, max: 200 }),
      bbStdDev: coerceNum({ config: cfg, key: 'bbStdDev', defaultValue: 2, min: 0.5, max: 5 }),
      rsiPeriod: coerceNum({ config: cfg, key: 'rsiPeriod', defaultValue: 14, min: 2, max: 100 }),
      rsiBuyThreshold: coerceNum({ config: cfg, key: 'rsiBuyThreshold', defaultValue: 30, min: 5, max: 50 }),
      rsiSellThreshold: coerceNum({ config: cfg, key: 'rsiSellThreshold', defaultValue: 70, min: 50, max: 95 }),
      volumeMultiplier: coerceNum({ config: cfg, key: 'volumeMultiplier', defaultValue: 1.5, min: 0.1, max: 10 }),
      positionSizePct: coerceNum({ config: cfg, key: 'positionSizePct', defaultValue: 10, min: 1, max: 100 }),
      cooldownMinutes: coerceNum({ config: cfg, key: 'cooldownMinutes', defaultValue: 5, min: 0, max: 60 }),
    } satisfies MeanRevBotConfig;
  }

  if (payload.strategy === 'h3_maker') {
    const d = h3Defaults ?? {
      lookbackDays: 30, entryAnnualBps: 800, exitAnnualBps: 150,
      maxGrossLeverage: 1.0, maxDrawdownHardPct: 12, universe: [],
    };
    const lookbackDays = Math.round(coerceNum({ config: cfg, key: 'lookbackDays', defaultValue: d.lookbackDays, min: 2, max: 180 }));
    const entryAnnualBps = coerceNum({ config: cfg, key: 'entryAnnualBps', defaultValue: d.entryAnnualBps, min: 50, max: 5000 });
    const exitAnnualBps = Math.min(entryAnnualBps - 1, coerceNum({ config: cfg, key: 'exitAnnualBps', defaultValue: d.exitAnnualBps, min: 0, max: 2000 }));
    const maxGrossLeverage = coerceNum({ config: cfg, key: 'maxGrossLeverage', defaultValue: d.maxGrossLeverage, min: 0.1, max: 1.5 });
    const maxDrawdownPct = coerceNum({ config: cfg, key: 'maxDrawdownPct', defaultValue: d.maxDrawdownHardPct, min: 1, max: d.maxDrawdownHardPct });
    const candidate: H3MakerBotConfig = {
      ...base,
      maxDrawdownPct,
      strategy: 'h3_maker' as const,
      lookbackDays,
      entryAnnualBps,
      exitAnnualBps,
      maxGrossLeverage,
    };
    const exactSpecMatch = isExactVerifiedH3Config(
      candidate as unknown as Record<string, unknown>,
      d,
      undefined,
      payload.pair,
    );
    return exactSpecMatch && specSha256 ? { ...candidate, specSha256 } : candidate;
  }

  return {
    ...base,
    strategy: 'volatility_dca' as const,
    pair: payload.pair,
    priceDropStep: coerceNum({ config: cfg, key: 'priceDropStep', defaultValue: 1.5, min: 0.1, max: 20 }),
    maxSteps: coerceNum({ config: cfg, key: 'maxSteps', defaultValue: 6, min: 2, max: 20 }),
    baseOrderSizePct: coerceNum({ config: cfg, key: 'baseOrderSizePct', defaultValue: 10, min: 1, max: 50 }),
    volatilityWindow: coerceNum({ config: cfg, key: 'volatilityWindow', defaultValue: 20, min: 5, max: 100 }),
    volBaseline: coerceNum({ config: cfg, key: 'volBaseline', defaultValue: 50, min: 1, max: 200 }),
    reboundTarget: coerceNum({ config: cfg, key: 'reboundTarget', defaultValue: 1.0, min: 0.1, max: 20 }),
    quantExecution: Boolean(cfg.quantExecution),
  } satisfies VolatilityDcaBotConfig;
}

export async function botCreateHandler(
  payload: CreateBotPayload,
  userId?: string,
  artifactPaths?: StrategyArtifactPaths,
): Promise<CreateBotResult> {
  try {
    if (payload.mode === 'live') {
      return { ok: false, error: 'Live trading not available in v1 — paper mode only' };
    }

    const guard = evaluateBotStrategyGuard(payload.strategy, artifactPaths);
    if (!guard) {
      return { ok: false, error: `Unsupported strategy: ${String(payload.strategy)}` };
    }
    if (!guard.ok) {
      return { ok: false, status: guard.status, code: guard.code, error: guard.error };
    }

    const normalizedPayload: CreateBotPayload = { ...payload, strategy: guard.strategy };
    const cfg = normalizeWizardConfig(normalizedPayload.config);
    const strategyConfig = buildStrategyConfig(
      normalizedPayload,
      cfg,
      guard.verifiedDefaults,
      guard.specSha256,
    );

    const botConfig: CreateBotRequest = {
      id: normalizedPayload.id,
      config: strategyConfig,
      exchangeConfig: { apiKey: '', apiSecret: '', passphrase: '', testnet: true, sandbox: true, rateLimitMs: 100 },
      mode: 'paper',
    };

    if (userId) {
      await getBotManager().createBot(botConfig, userId);
    } else {
      await getBotManager().createBot(botConfig);
    }

    const hasVerifiedSpec =
      strategyConfig.strategy === 'h3_maker' && Boolean(strategyConfig.specSha256);
    const effectiveTier: StrategyVerificationTier =
      strategyConfig.strategy === 'h3_maker' && !hasVerifiedSpec
        ? 'UNVERIFIED_RETAIL_SANDBOX'
        : guard.verificationTier;
    const effectiveWarning =
      effectiveTier === 'UNVERIFIED_RETAIL_SANDBOX'
        ? guard.warning ?? RETAIL_SANDBOX_WARNING
        : undefined;

    return {
      ok: true,
      data: {
        id: normalizedPayload.id,
        verificationTier: effectiveTier,
        ...(effectiveWarning ? { warning: effectiveWarning } : {}),
        ...(hasVerifiedSpec && guard.specSha256 ? { specSha256: guard.specSha256 } : {}),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to create bot' };
  }
}
