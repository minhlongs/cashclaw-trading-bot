// Helper builders for scripts/multi-pair-composition-sweep.ts

import type { Candle } from '@/forest/backtest/ohlcv';
import type { IndicatorCandle } from '@/tree/alpha/indicator-types';
import { computeRealizedPairCorrelationSeries as computeRollingCorrelationSeries } from '@/forest/alpha/relative-value-eval';
import type {
  CompositionWalkForwardInput,
  CompositionEvalConfig,
} from '@/forest/alpha/composition-eval/types';
import type { RelativeValueEvalConfig } from '@/forest/alpha/relative-value-eval/types';
import type { PortfolioConfig, RiskInputs } from '@/tree/alpha/portfolio';
import type { ComposedAlpha, CompositionConfig } from '@/tree/alpha/composition/types';
import { RegimeLabel } from '@/tree/regime/types';
import type { PipelineConfig } from '@/forest/alpha/pipeline/types';

export const SWEEP_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] as const;
export const SWEEP_TIMEFRAME = '1d';

export function toIndicatorCandles(candles: Candle[]): IndicatorCandle[] {
  return candles.map((c) => ({
    timestamp: c.timestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));
}

export function computeSweepPairCorrelations(
  candleMap: Map<string, Candle[]>,
): Record<string, { avgCorr: number; points: number }> {
  const pairCorrelations: Record<string, { avgCorr: number; points: number }> = {};

  for (let i = 0; i < SWEEP_SYMBOLS.length; i++) {
    for (let j = i + 1; j < SWEEP_SYMBOLS.length; j++) {
      const symA = SWEEP_SYMBOLS[i]!;
      const symB = SWEEP_SYMBOLS[j]!;
      const cA = candleMap.get(symA)!;
      const cB = candleMap.get(symB)!;
      const minLen = Math.min(cA.length, cB.length);
      const timestamps = cA.slice(0, minLen).map((c) => c.timestamp);
      const closesA = cA.slice(0, minLen).map((c) => c.close);
      const closesB = cB.slice(0, minLen).map((c) => c.close);

      const periodRecords = timestamps.map((ts) => ({
        timestamp: ts,
        position: 'flat' as const,
        hedgeRatio: 1,
        zScore: 0,
        weights: { [symA]: 0.5, [symB]: -0.5 },
        turnover: 0,
        costPct: 0,
        grossReturn: 0,
        netReturn: 0,
        grossExposure: 1,
        netExposure: 0,
      }));

      const rvEvalConfig: RelativeValueEvalConfig = {
        experimentId: `sweep-rolling-corr-${symA}-${symB}`,
        timeframe: SWEEP_TIMEFRAME,
        periodsPerYear: 365,
        hedgeWindow: 30,
        zWindow: 30,
        minObs: 10,
        entryZ: 2.0,
        exitZ: 0.5,
        maxHalfLife: 60,
        minCorrelation: 0.5,
        validationWindow: 60,
        revalidateEvery: 1,
        minObservations: 30,
        correlationWindow: 30,
      };

      const corrSeries = computeRollingCorrelationSeries(
        { legA: symA, legB: symB, timestamps, closesA, closesB },
        periodRecords,
        rvEvalConfig,
      );

      if (corrSeries && corrSeries.length > 0) {
        const validPoints = corrSeries.filter((v) => v !== 0);
        const avg = validPoints.length > 0
          ? validPoints.reduce((acc, v) => acc + v, 0) / validPoints.length
          : 0;
        pairCorrelations[`${symA}/${symB}`] = {
          avgCorr: parseFloat(avg.toFixed(4)),
          points: corrSeries.length,
        };
      }
    }
  }
  return pairCorrelations;
}

export function buildSweepWalkForwardInput(btcCandles: Candle[]): CompositionWalkForwardInput {
  const timestamps = btcCandles.map((c) => c.timestamp);
  const nBars = timestamps.length;
  const alphasAtEachT = new Map<number, readonly ComposedAlpha[]>();
  const returnSeriesAtEachT = new Map<number, number>();
  const riskInputsAtEachT = new Map<number, RiskInputs>();

  const compositionConfig: CompositionConfig = {
    weights: { returnWeight: 1.0, costWeight: 0.5, riskPenaltyWeight: 0.1, turnoverPenaltyWeight: 0.05, confidenceWeight: 0.2 },
    minNetEdge: 0.0005,
    maxTurnover: 2.0,
  };
  const portfolioConfig: PortfolioConfig = {
    targetVolatility: 0.20, maxPositionWeight: 0.50, maxGrossExposure: 1.00, maxNetExposure: 0.80,
    maxCorrelatedExposure: 0.60, correlationBucketThreshold: 0.85, maxBetaExposure: 0.50,
    maxTurnover: 1.50, drawdownThreshold: 0.15, deRiskFactor: 0.50,
  };
  const config: CompositionEvalConfig = {
    compositionConfig, portfolioConfig, experimentId: 'crypto-composition-sweep',
    timeframe: '1d', periodsPerYear: 365, costBps: 10,
  };

  for (let i = 0; i < nBars; i++) {
    const ts = timestamps[i]!;
    const fwdReturn = i < nBars - 1 ? (btcCandles[i + 1]!.close - btcCandles[i]!.close) / btcCandles[i]!.close : 0;
    returnSeriesAtEachT.set(ts, fwdReturn);
    alphasAtEachT.set(ts, [{
      alphaId: 'trend_btc',
      direction: fwdReturn > 0.002 ? 'buy' : fwdReturn < -0.002 ? 'sell' : 'hold',
      confidence: 0.7,
      expectedReturn: Math.abs(fwdReturn) * 0.8 + 0.002,
      expectedCost: 0.0005,
      expectedTurnover: 0.2,
      regime: RegimeLabel.RANGE,
      horizon: '1d',
      provenance: 'sweep_btc',
      featureDependencies: ['close'],
      timestamp: ts,
    }]);
    riskInputsAtEachT.set(ts, {
      realizedVolatility: 0.45,
      correlationMatrix: new Map(),
      betas: new Map([['BTCUSDT', 1.0]]),
      currentDrawdown: 0.03,
    });
  }

  return {
    alphasAtEachT, returnSeriesAtEachT, riskInputsAtEachT, config,
    windowConfig: { trainBars: 180, validateBars: 30, testBars: 60, stepBars: 30 },
    mode: 'rolling', timestamps,
  };
}

export function buildSweepPipelineConfig(btcCandles: Candle[]): PipelineConfig {
  return {
    symbol: 'BTCUSDT',
    timeframe: '1d',
    candles: btcCandles,
    derivatives: { features: [], signals: [] },
    indicatorSet: { rsi: 14, macd: 26 },
    regimeConfig: { minCandles: 20, confidenceThreshold: 0.5, lookback: 20, minDuration: 3 },
    walkforwardConfig: { trainBars: 100, validateBars: 20, testBars: 30, stepBars: 15 },
    costMode: 'normal',
    minSharpe: 0.0,
    minTrades: 1,
    baselinesEnabled: false,
    survivalGateConfig: { minSharpe: 0.0, minTrades: 1, maxDrawdown: 0.50 },
    initialStrategyPhase: 'RESEARCH',
  };
}
