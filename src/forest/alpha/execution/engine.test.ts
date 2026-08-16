// Alpha Execution Engine — Tests

import { describe, it, expect, beforeEach } from 'vitest';
import { AlphaExecutionEngine } from './engine';
import type { AlphaSignal, AlphaDirection } from '@/tree/alpha/types';
import { RegimeLabel } from '@/tree/regime/types';
import type { AlphaExecutionConfig } from './types';

const defaultConfig: AlphaExecutionConfig = {
  enabled: true,
  maxPositions: 3,
  maxExposurePct: 1,
  regimeFilter: [],
  minConfidence: 0.5,
  positionTimeoutMs: 60_000,
};

function makeSignal(overrides: Partial<AlphaSignal> = {}): AlphaSignal {
  return {
    name: 'test-alpha',
    source: 'indicator',
    direction: 'buy',
    confidence: 0.8,
    timestamp: Date.now(),
    features: { features: [], computedAt: Date.now(), symbol: 'BTCUSDT', lookback: 20 },
    metadata: {},
    ...overrides,
  };
}

function withSymbol(symbol: string): AlphaSignal {
  return makeSignal({ features: { ...makeSignal().features, symbol } });
}

describe('AlphaExecutionEngine', () => {
  let engine: AlphaExecutionEngine;
  beforeEach(() => { engine = new AlphaExecutionEngine(); });

  describe('signal filtering', () => {
    it('rejects signals when engine is disabled', () => {
      const cfg: AlphaExecutionConfig = { ...defaultConfig, enabled: false };
      expect(engine.evaluateAndExecute([makeSignal()], RegimeLabel.TREND_UP, cfg)).toHaveLength(0);
    });

    it('rejects hold signals', () => {
      const signal = makeSignal({ direction: 'hold' as AlphaDirection });
      expect(engine.evaluateAndExecute([signal], RegimeLabel.TREND_UP, defaultConfig)).toHaveLength(0);
    });

    it('rejects signals below confidence threshold', () => {
      const signal = makeSignal({ confidence: 0.3 });
      expect(engine.evaluateAndExecute([signal], RegimeLabel.TREND_UP, { ...defaultConfig, minConfidence: 0.6 })).toHaveLength(0);
    });

    it('rejects signals in filtered regimes', () => {
      expect(engine.evaluateAndExecute([makeSignal()], RegimeLabel.SHOCK, { ...defaultConfig, regimeFilter: [RegimeLabel.TREND_UP] })).toHaveLength(0);
    });

    it('accepts signals in allowed regimes', () => {
      expect(engine.evaluateAndExecute([makeSignal()], RegimeLabel.TREND_UP, { ...defaultConfig, regimeFilter: [RegimeLabel.TREND_UP] })).toHaveLength(1);
    });
  });

  describe('position opening', () => {
    it('creates a position with correct fields', () => {
      const opened = engine.evaluateAndExecute([makeSignal({ name: 'rsi-alpha', confidence: 0.9 })], RegimeLabel.TREND_UP, defaultConfig);
      expect(opened).toHaveLength(1);
      expect(opened[0].symbol).toBe('BTCUSDT');
      expect(opened[0].direction).toBe('long');
      expect(opened[0].alphaName).toBe('rsi-alpha');
      expect(opened[0].confidence).toBe(0.9);
      expect(opened[0].closedAt).toBeUndefined();
    });

    it('maps sell direction to short', () => {
      const opened = engine.evaluateAndExecute([makeSignal({ direction: 'sell' as AlphaDirection })], RegimeLabel.TREND_UP, defaultConfig);
      expect(opened[0].direction).toBe('short');
    });
  });

  describe('position closing', () => {
    it('calculates PnL correctly for long', () => {
      const pos = engine.evaluateAndExecute([makeSignal()], RegimeLabel.TREND_UP, defaultConfig)[0];
      engine.updatePositionFill(pos.id, 100, 2);
      engine.closePosition(pos.id, 110, 'exit_signal');
      expect(pos.pnl).toBeCloseTo(20); // (110 - 100) * 2
      expect(pos.closeReason).toBe('exit_signal');
    });

    it('calculates PnL correctly for short', () => {
      const pos = engine.evaluateAndExecute([makeSignal({ direction: 'sell' as AlphaDirection })], RegimeLabel.TREND_UP, defaultConfig)[0];
      engine.updatePositionFill(pos.id, 100, 2);
      engine.closePosition(pos.id, 90, 'exit_signal');
      expect(pos.pnl).toBeCloseTo(20); // (100 - 90) * 2
    });

    it('ignores close for unknown id', () => {
      const pos = engine.evaluateAndExecute([makeSignal()], RegimeLabel.TREND_UP, defaultConfig)[0];
      engine.closePosition('nonexistent', 100, 'manual');
      expect(pos.closedAt).toBeUndefined();
    });

    it('ignores second close on already closed position', () => {
      const pos = engine.evaluateAndExecute([makeSignal()], RegimeLabel.TREND_UP, defaultConfig)[0];
      engine.updatePositionFill(pos.id, 100, 2);
      engine.closePosition(pos.id, 110, 'exit_signal');
      engine.closePosition(pos.id, 120, 'manual');
      expect(pos.closeReason).toBe('exit_signal');
      expect(pos.pnl).toBeCloseTo(20);
    });
  });

  describe('max positions limit', () => {
    it('opens positions up to the limit', () => {
      const signals = [
        withSymbol('BTCUSDT'),
        withSymbol('ETHUSDT'),
        withSymbol('SOLUSDT'),
      ];
      engine.evaluateAndExecute(signals, RegimeLabel.TREND_UP, { ...defaultConfig, maxPositions: 2 });
      expect(engine.openPositions).toHaveLength(2);
    });

    it('rejects additional signals once limit reached', () => {
      engine.evaluateAndExecute([withSymbol('BTCUSDT')], RegimeLabel.TREND_UP, { ...defaultConfig, maxPositions: 1 });
      const extra = engine.evaluateAndExecute([withSymbol('ETHUSDT')], RegimeLabel.TREND_UP, { ...defaultConfig, maxPositions: 1 });
      expect(extra).toHaveLength(0);
    });
  });

  describe('regime filter', () => {
    it('opens when regime is in filter', () => {
      expect(engine.evaluateAndExecute([makeSignal()], RegimeLabel.TREND_UP, { ...defaultConfig, regimeFilter: [RegimeLabel.TREND_UP] })).toHaveLength(1);
    });

    it('rejects when regime is not in filter', () => {
      expect(engine.evaluateAndExecute([makeSignal()], RegimeLabel.HIGH_VOLATILITY, { ...defaultConfig, regimeFilter: [RegimeLabel.TREND_UP] })).toHaveLength(0);
    });

    it('allows all regimes when filter is empty', () => {
      const regimes = [RegimeLabel.TREND_UP, RegimeLabel.TREND_DOWN, RegimeLabel.SHOCK, RegimeLabel.HIGH_VOLATILITY, RegimeLabel.UNKNOWN];
      for (const regime of regimes) {
        const eng = new AlphaExecutionEngine();
        expect(eng.evaluateAndExecute([makeSignal()], regime, defaultConfig)).toHaveLength(1);
      }
    });
  });

  describe('buildPortfolio', () => {
    it('returns correct totals for empty portfolio', () => {
      const pf = engine.buildPortfolio(RegimeLabel.RANGE);
      expect(pf.openCount).toBe(0);
      expect(pf.totalExposure).toBe(0);
      expect(pf.totalRealisedPnl).toBe(0);
      expect(pf.regime).toBe(RegimeLabel.RANGE);
    });

    it('reflects open positions and realised PnL', () => {
      const pos = engine.evaluateAndExecute([makeSignal()], RegimeLabel.TREND_UP, defaultConfig)[0];
      engine.updatePositionFill(pos.id, 100, 2);
      engine.closePosition(pos.id, 110, 'exit_signal');
      const pf = engine.buildPortfolio(RegimeLabel.TREND_UP);
      expect(pf.openCount).toBe(0);
      expect(pf.totalRealisedPnl).toBeCloseTo(20);
    });
  });
});