import { describe, it, expect } from 'vitest';
import { buildDefaultChain } from './leg-builder';
import type { GridBotConfig, MeanRevBotConfig } from '@/tree/bot/types';

const gridConfig: GridBotConfig = {
  strategy: 'grid',
  symbol: 'BTCUSDT',
  exchange: 'paper',
  mode: 'paper',
  capital: 1000,
  maxDrawdownPct: 15,
  gridSpacingPct: 1,
  gridLevels: 5,
  capitalPerLevelPct: 20,
  takeProfitPct: 0.5,
  stopLossPct: 2,
  rebalanceOnFill: false,
};

const meanRevConfig: MeanRevBotConfig = {
  strategy: 'mean_reversion',
  symbol: 'ETHUSDT',
  exchange: 'paper',
  mode: 'paper',
  capital: 500,
  maxDrawdownPct: 20,
  bbPeriod: 20,
  bbStdDev: 2,
  rsiPeriod: 14,
  rsiBuyThreshold: 30,
  rsiSellThreshold: 70,
  volumeMultiplier: 1.5,
  positionSizePct: 10,
  cooldownMinutes: 60,
};

describe('buildDefaultChain', () => {
  it('returns empty array when no strategyChain defined', () => {
    expect(buildDefaultChain(gridConfig)).toEqual([]);
  });

  it('returns empty array when strategyChain is not an array', () => {
    const badConfig = { ...gridConfig, strategyChain: 'invalid' };
    expect(buildDefaultChain(badConfig as any)).toEqual([]);
  });

  it('builds single grid leg', () => {
    const config = { ...gridConfig, strategyChain: [{ strategy: 'grid' as const, on: 'tick' as const }] };
    const chain = buildDefaultChain(config);
    expect(chain).toHaveLength(1);
    expect(chain[0].strategy.name).toBe('grid');
    expect(chain[0].fallback).toBeNull();
  });

  it('builds single mean reversion leg', () => {
    const config = { ...meanRevConfig, strategyChain: [{ strategy: 'mean_reversion' as const, on: 'tick' as const }] };
    const chain = buildDefaultChain(config);
    expect(chain).toHaveLength(1);
    expect(chain[0].strategy.name).toBe('mean_reversion');
  });

  it('builds chain with fallback for multi-leg config', () => {
    const config = {
      ...gridConfig,
      strategyChain: [
        { strategy: 'grid' as const, on: 'tick' as const },
        { strategy: 'mean_reversion' as const, on: 'error' as const },
      ],
    };
    const chain = buildDefaultChain(config);
    expect(chain).toHaveLength(2);
    expect(chain[0].fallback).not.toBeNull();
    expect(chain[0].fallback!.name).toBe('mean_reversion');
    expect(chain[1].fallback).toBeNull();
  });

  it('skips unknown strategy types', () => {
    const config = {
      ...gridConfig,
      strategyChain: [{ strategy: 'unknown' as any, on: 'tick' }],
    };
    const chain = buildDefaultChain(config);
    expect(chain).toHaveLength(0);
  });
});
