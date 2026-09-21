import { isGridConfig, isMeanRevConfig, isVolatilityDcaConfig } from '@/tree/bot';
import type { BotSummary } from '@/forest/bot/d1-adapter';
import type { BotDetailData } from './bot-detail-types';

export function botToDetail(bot: BotSummary): BotDetailData {
  const cfg = bot.config;

  const baseConfig: Record<string, number> = isGridConfig(cfg)
    ? {
        spacingPct: cfg.gridSpacingPct,
        levels: cfg.gridLevels,
        capitalPerLevelPct: cfg.capitalPerLevelPct,
        maxDrawdownPct: cfg.maxDrawdownPct,
      }
    : isMeanRevConfig(cfg)
    ? {
        bbPeriod: cfg.bbPeriod,
        bbStdDev: cfg.bbStdDev,
        rsiPeriod: cfg.rsiPeriod,
        rsiBuyThreshold: cfg.rsiBuyThreshold,
        rsiSellThreshold: cfg.rsiSellThreshold,
        volumeMultiplier: cfg.volumeMultiplier,
        positionSizePct: cfg.positionSizePct,
        maxDrawdownPct: cfg.maxDrawdownPct,
      }
    : isVolatilityDcaConfig(cfg)
    ? {
        priceDropStep: cfg.priceDropStep,
        maxSteps: cfg.maxSteps,
        baseOrderSizePct: cfg.baseOrderSizePct,
        volatilityWindow: cfg.volatilityWindow,
        volBaseline: cfg.volBaseline,
        reboundTarget: cfg.reboundTarget,
        maxDrawdownPct: cfg.maxDrawdownPct,
      }
    : {};

  return {
    id: bot.id,
    name: bot.name || bot.id,
    strategy: cfg.strategy,
    pair: cfg.symbol,
    exchange: cfg.exchange ?? 'paper',
    botStatus: bot.status,
    totalPnl: bot.metrics.totalPnl,
    winCount: bot.metrics.winCount,
    lossCount: bot.metrics.lossCount,
    capitalAllocated: cfg.capital,
    capitalUsed: Math.round(cfg.capital * 0.49),
    maxDrawdownPct: bot.metrics.maxDrawdown,
    startedAt: bot.metrics.startedAt,
    updatedAt: bot.updatedAt,
    config: baseConfig,
  };
}
