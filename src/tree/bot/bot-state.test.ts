// bot-state.test.ts — unit tests for createInitialState pure function
import { describe, it, expect } from 'vitest';
import { createInitialState } from './bot-state';
import type { GridBotConfig, MeanRevBotConfig } from './types';

const gridConfig: GridBotConfig = {
  symbol: 'BTC/USDT',
  exchange: 'binance',
  mode: 'paper',
  capital: 1000,
  maxDrawdownPct: 10,
  strategy: 'grid',
  gridSpacingPct: 0.5,
  gridLevels: 5,
  capitalPerLevelPct: 20,
  takeProfitPct: 2,
  stopLossPct: 1,
  rebalanceOnFill: true,
};

const meanRevConfig: MeanRevBotConfig = {
  symbol: 'ETH/USDT',
  exchange: 'okx',
  mode: 'live',
  capital: 5000,
  maxDrawdownPct: 15,
  strategy: 'mean_reversion',
  bbPeriod: 20,
  bbStdDev: 2,
  rsiPeriod: 14,
  rsiBuyThreshold: 30,
  rsiSellThreshold: 70,
  volumeMultiplier: 1.5,
  positionSizePct: 10,
  cooldownMinutes: 5,
};

describe('createInitialState', () => {
  it('returns correct shape with GridBotConfig', () => {
    const state = createInitialState('bot-1', gridConfig);
    expect(state.id).toBe('bot-1');
    expect(state.config).toEqual(gridConfig);
    expect(state.status).toBe('idle');
    expect(state.totalPnl).toBe(0);
    expect(state.totalTrades).toBe(0);
    expect(state.winCount).toBe(0);
    expect(state.lossCount).toBe(0);
    expect(state.maxDrawdown).toBe(0);
    expect(state.currentDrawdown).toBe(0);
    expect(state.startedAt).toBeNull();
    expect(state.stoppedAt).toBeNull();
    expect(state.lastTickAt).toBeNull();
    expect(state.lastOrderAt).toBeNull();
    expect(state.error).toBeNull();
  });

  it('sets createdAt and updatedAt timestamps', () => {
    const before = Date.now();
    const state = createInitialState('bot-2', gridConfig);
    const after = Date.now();
    expect(state.createdAt).toBeGreaterThanOrEqual(before);
    expect(state.createdAt).toBeLessThanOrEqual(after);
    expect(state.updatedAt).toBeGreaterThanOrEqual(before);
    expect(state.updatedAt).toBeLessThanOrEqual(after);
  });

  it('returns correct shape with MeanRevBotConfig', () => {
    const state = createInitialState('bot-3', meanRevConfig);
    expect(state.id).toBe('bot-3');
    expect(state.config).toEqual(meanRevConfig);
    expect(state.config.strategy).toBe('mean_reversion');
  });

  it('each call produces independent state objects', () => {
    const a = createInitialState('a', gridConfig);
    const b = createInitialState('b', gridConfig);
    expect(a).not.toBe(b);
    expect(a.id).toBe('a');
    expect(b.id).toBe('b');
  });

  it('config reference matches input', () => {
    const state = createInitialState('x', gridConfig);
    expect(state.config).toBe(gridConfig);
  });

  it('includes all required BotState keys', () => {
    const state = createInitialState('z', gridConfig);
    const requiredKeys = [
      'id', 'config', 'status', 'createdAt', 'updatedAt',
      'totalPnl', 'totalTrades', 'winCount', 'lossCount',
      'maxDrawdown', 'currentDrawdown', 'startedAt', 'stoppedAt',
      'lastTickAt', 'lastOrderAt', 'error',
    ];
    for (const key of requiredKeys) {
      expect(state).toHaveProperty(key);
    }
  });
});
