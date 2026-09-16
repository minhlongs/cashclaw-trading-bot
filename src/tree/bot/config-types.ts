// Bot Engine — Bot Configuration Types
// Strategy parameters, config unions, type guards

import type { ChainLeg } from './strategy-chain-types';

export type BotMode = 'paper' | 'live';
export type StrategyType = 'grid' | 'mean_reversion' | 'volatility_dca';

export interface BaseBotConfig {
  name?: string;
  symbol: string;
  exchange: string;
  mode: BotMode;
  capital: number;
  maxDrawdownPct: number;
  strategy: StrategyType;
  strategyChain?: ChainLeg[];
}

export interface GridBotConfig extends BaseBotConfig {
  strategy: 'grid';
  gridSpacingPct: number;
  gridLevels: number;
  capitalPerLevelPct: number;
  takeProfitPct: number;
  stopLossPct: number;
  rebalanceOnFill: boolean;
}

export interface MeanRevBotConfig extends BaseBotConfig {
  strategy: 'mean_reversion';
  bbPeriod: number;
  bbStdDev: number;
  rsiPeriod: number;
  rsiBuyThreshold: number;
  rsiSellThreshold: number;
  volumeMultiplier: number;
  positionSizePct: number;
  cooldownMinutes: number;
}

export interface VolatilityDcaBotConfig extends BaseBotConfig {
  strategy: 'volatility_dca';
  pair: string;
  priceDropStep: number;
  maxSteps: number;
  baseOrderSizePct: number;
  volatilityWindow: number;
  volBaseline: number;
  reboundTarget: number;
}

export type BotConfig = GridBotConfig | MeanRevBotConfig | VolatilityDcaBotConfig;

export type GridLevelStatus = 'pending' | 'open' | 'filled' | 'cancelled';

export interface GridLevel {
  level: number;
  side: 'buy' | 'sell';
  triggerPrice: number;
  quantity: number;
  status: GridLevelStatus;
  price?: number;
  filledPrice?: number | null;
  takeProfitPrice: number;
  stopLossPrice: number;
  currentTpPrice?: number;
  currentSlPrice?: number;
  trailingActive?: boolean;
  trailingSkipExit?: boolean;
  orderId: string | null;
}

export function isGridConfig(config: BotConfig): config is GridBotConfig {
  return config.strategy === 'grid';
}

export function isMeanRevConfig(config: BotConfig): config is MeanRevBotConfig {
  return config.strategy === 'mean_reversion';
}

export function isVolatilityDcaConfig(config: BotConfig): config is VolatilityDcaBotConfig {
  return config.strategy === 'volatility_dca';
}
