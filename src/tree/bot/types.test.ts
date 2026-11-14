import { describe, it, expect } from 'vitest';
import {
  type GridBotConfig,
  type MeanRevBotConfig,
  type VolatilityDcaBotConfig,
  type H3MakerBotConfig,
  getStrategyVerificationTier,
  hasStrategyChain,
  isGridConfig,
  isH3MakerConfig,
  isMeanRevConfig,
  isVolatilityDcaConfig,
} from './types';

const makeGridConfig = (overrides: Partial<GridBotConfig> = {}): GridBotConfig => ({
  symbol: 'BTC/USDT',
  exchange: 'binance',
  mode: 'paper',
  capital: 1000,
  maxDrawdownPct: 0.1,
  strategy: 'grid',
  gridSpacingPct: 0.01,
  gridLevels: 5,
  capitalPerLevelPct: 0.2,
  takeProfitPct: 0.02,
  stopLossPct: 0.03,
  rebalanceOnFill: false,
  ...overrides,
});

const makeMeanRevConfig = (overrides: Partial<MeanRevBotConfig> = {}): MeanRevBotConfig => ({
  symbol: 'BTC/USDT',
  exchange: 'binance',
  mode: 'paper',
  capital: 1000,
  maxDrawdownPct: 0.1,
  strategy: 'mean_reversion',
  bbPeriod: 20,
  bbStdDev: 2,
  rsiPeriod: 14,
  rsiBuyThreshold: 30,
  rsiSellThreshold: 70,
  volumeMultiplier: 1.5,
  positionSizePct: 0.05,
  cooldownMinutes: 5,
  ...overrides,
});

const makeVolatilityDcaConfig = (overrides: Partial<VolatilityDcaBotConfig> = {}): VolatilityDcaBotConfig => ({
  symbol: 'BTC/USDT',
  exchange: 'binance',
  mode: 'paper',
  capital: 1000,
  maxDrawdownPct: 0.1,
  strategy: 'volatility_dca',
  pair: 'BTC/USDT',
  priceDropStep: 1.5,
  maxSteps: 6,
  baseOrderSizePct: 10,
  volatilityWindow: 20,
  volBaseline: 50,
  reboundTarget: 1.0,
  ...overrides,
});

describe('hasStrategyChain', () => {
  it('returns true when strategyChain is present with items', () => {
    const config = makeGridConfig({
      strategyChain: [{ strategy: 'grid', on: 'RSI_OVERSOLD' }],
    });
    expect(hasStrategyChain(config)).toBe(true);
  });

  it('returns false when strategyChain is empty array', () => {
    const config = makeGridConfig({ strategyChain: [] });
    expect(hasStrategyChain(config)).toBe(false);
  });

  it('returns false when strategyChain is undefined', () => {
    const config = makeGridConfig();
    expect(hasStrategyChain(config)).toBe(false);
  });
});

describe('isGridConfig', () => {
  it('returns true for grid config', () => {
    expect(isGridConfig(makeGridConfig())).toBe(true);
  });

  it('returns false for mean-reversion config', () => {
    expect(isGridConfig(makeMeanRevConfig())).toBe(false);
  });
});

describe('isMeanRevConfig', () => {
  it('returns true for mean-reversion config', () => {
    expect(isMeanRevConfig(makeMeanRevConfig())).toBe(true);
  });

  it('returns false for grid config', () => {
    expect(isMeanRevConfig(makeGridConfig())).toBe(false);
  });
});

describe('isVolatilityDcaConfig', () => {
  it('returns true for volatility-dca config', () => {
    expect(isVolatilityDcaConfig(makeVolatilityDcaConfig())).toBe(true);
  });

  it('returns false for grid config', () => {
    expect(isVolatilityDcaConfig(makeGridConfig())).toBe(false);
  });

  it('returns false for mean-reversion config', () => {
    expect(isVolatilityDcaConfig(makeMeanRevConfig())).toBe(false);
  });
});

describe('isH3MakerConfig and getStrategyVerificationTier', () => {
  const makeH3Config = (): H3MakerBotConfig => ({
    symbol: 'BTC/USDT',
    exchange: 'binance',
    mode: 'paper',
    capital: 1000,
    maxDrawdownPct: 12,
    strategy: 'h3_maker',
    lookbackDays: 30,
    entryAnnualBps: 800,
    exitAnnualBps: 150,
    maxGrossLeverage: 1.0,
  });

  it('identifies h3_maker config accurately', () => {
    expect(isH3MakerConfig(makeH3Config())).toBe(true);
    expect(isH3MakerConfig(makeGridConfig())).toBe(false);
  });

  it('maps strategy verification tiers cleanly', () => {
    expect(getStrategyVerificationTier('h3_maker')).toBe('PAPER_FORWARD_ELIGIBLE');
    expect(getStrategyVerificationTier('grid')).toBe('UNVERIFIED_RETAIL_SANDBOX');
    expect(getStrategyVerificationTier('mean_reversion')).toBe('UNVERIFIED_RETAIL_SANDBOX');
    expect(getStrategyVerificationTier('volatility_dca')).toBe('UNVERIFIED_RETAIL_SANDBOX');
  });
});
