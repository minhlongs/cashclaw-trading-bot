// Multi-pair composition walk-forward sweep script.
// Exercises scanMultiPairUniverse, computeRollingCorrelationSeries, runCompositionWalkForward,
// and AlphaResearchPipeline (including stepGenerateReport) on cached Binance panels.
//
// Usage:
//   npx tsx scripts/multi-pair-composition-sweep.ts

import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadCandles } from '@/forest/backtest/ohlcv-cache';
import type { Candle } from '@/forest/backtest/ohlcv';
import type { IndicatorCandle } from '@/tree/alpha/indicator-types';
import { scanMultiPairUniverse } from '@/tree/alpha/correlation/pairs';
import { computeRealizedPairCorrelationSeries as computeRollingCorrelationSeries } from '@/forest/alpha/relative-value-eval';
import { runCompositionWalkForward } from '@/forest/alpha/composition-eval/walk-forward';
import type {
  CompositionWalkForwardInput,
  CompositionEvalConfig,
} from '@/forest/alpha/composition-eval/types';
import type { RelativeValueEvalConfig } from '@/forest/alpha/relative-value-eval/types';
import type { PortfolioConfig, RiskInputs } from '@/tree/alpha/portfolio';
import type { ComposedAlpha, CompositionConfig } from '@/tree/alpha/composition/types';
import { RegimeLabel } from '@/tree/regime/types';
import { AlphaResearchPipeline } from '@/forest/alpha/pipeline';
import type { PipelineConfig } from '@/forest/alpha/pipeline/types';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] as const;
const TIMEFRAME = '1d';
const OUTPUT_FILE = path.join(process.cwd(), 'plans', 'reports', 'multi-pair-composition-sweep-report.json');

function toIndicatorCandles(candles: Candle[]): IndicatorCandle[] {
  return candles.map((c) => ({
    timestamp: c.timestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));
}

async function runSweep() {
  console.log('=== CashClaw Multi-Pair Composition Walk-Forward Sweep ===\n');

  // 1. Load cached panels for universe
  console.log('1. Loading cached panels for:', SYMBOLS.join(', '));
  const candleMap = new Map<string, Candle[]>();
  const indicatorCandleMap = new Map<string, IndicatorCandle[]>();

  for (const symbol of SYMBOLS) {
    const key = `binance:${symbol}:${TIMEFRAME}`;
    const loaded = loadCandles(key);
    if (!loaded || loaded.candles.length === 0) {
      throw new Error(`Failed to load cached candles for ${key}`);
    }
    candleMap.set(symbol, loaded.candles);
    indicatorCandleMap.set(symbol, toIndicatorCandles(loaded.candles));
    console.log(`   ✓ ${symbol}: ${loaded.candles.length} bars loaded`);
  }

  // 2. Multi-Pair Universe Scan
  console.log('\n2. Executing scanMultiPairUniverse...');
  const scanResult = scanMultiPairUniverse(indicatorCandleMap, {
    lookback: 60,
    minCorrelation: 0.5,
    minSpreadStd: 0.001,
    zScoreThreshold: 1.8,
  });

  console.log(`   Candidate cointegrated pairs: ${scanResult.candidatePairs.length}`);
  console.log(`   Diversified pairs:           ${scanResult.diversifiedPairs.length}`);
  console.log(`   Spread signals emitted:      ${scanResult.signals.length}`);

  // 3. Rolling Correlation Series across Universe Pairs
  console.log('\n3. Computing rolling correlation series across universe pairs...');
  const pairCorrelations: Record<string, { avgCorr: number; points: number }> = {};

  for (let i = 0; i < SYMBOLS.length; i++) {
    for (let j = i + 1; j < SYMBOLS.length; j++) {
      const symA = SYMBOLS[i];
      const symB = SYMBOLS[j];
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
        timeframe: TIMEFRAME,
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
        const pairKey = `${symA}/${symB}`;
        pairCorrelations[pairKey] = {
          avgCorr: parseFloat(avg.toFixed(4)),
          points: corrSeries.length,
        };
        console.log(`   ✓ ${pairKey}: avg rolling correlation = ${avg.toFixed(4)} (${corrSeries.length} points)`);
      }
    }
  }

  // 4. Composition Walk-Forward Evaluation
  console.log('\n4. Executing runCompositionWalkForward across multi-asset returns...');
  const btcCandles = candleMap.get('BTCUSDT')!;
  const timestamps = btcCandles.map((c) => c.timestamp);
  const nBars = timestamps.length;

  const alphasAtEachT = new Map<number, readonly ComposedAlpha[]>();
  const returnSeriesAtEachT = new Map<number, number>();
  const riskInputsAtEachT = new Map<number, RiskInputs>();

  const compositionConfig: CompositionConfig = {
    weights: {
      returnWeight: 1.0,
      costWeight: 0.5,
      riskPenaltyWeight: 0.1,
      turnoverPenaltyWeight: 0.05,
      confidenceWeight: 0.2,
    },
    minNetEdge: 0.0005,
    maxTurnover: 2.0,
  };

  const portfolioConfig: PortfolioConfig = {
    targetVolatility: 0.20,
    maxPositionWeight: 0.50,
    maxGrossExposure: 1.00,
    maxNetExposure: 0.80,
    maxCorrelatedExposure: 0.60,
    correlationBucketThreshold: 0.85,
    maxBetaExposure: 0.50,
    maxTurnover: 1.50,
    drawdownThreshold: 0.15,
    deRiskFactor: 0.50,
  };

  const evalCfg: CompositionEvalConfig = {
    compositionConfig,
    portfolioConfig,
    experimentId: 'crypto-composition-sweep',
    timeframe: '1d',
    periodsPerYear: 365,
    costBps: 10,
  };

  for (let i = 0; i < nBars; i++) {
    const ts = timestamps[i]!;
    const fwdReturn = i < nBars - 1
      ? (btcCandles[i + 1]!.close - btcCandles[i]!.close) / btcCandles[i]!.close
      : 0;

    returnSeriesAtEachT.set(ts, fwdReturn);
    alphasAtEachT.set(ts, [
      {
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
      },
    ]);

    riskInputsAtEachT.set(ts, {
      realizedVolatility: 0.45,
      correlationMatrix: new Map(),
      betas: new Map([['BTCUSDT', 1.0]]),
      currentDrawdown: 0.03,
    });
  }

  const wfInput: CompositionWalkForwardInput = {
    alphasAtEachT,
    returnSeriesAtEachT,
    riskInputsAtEachT,
    config: evalCfg,
    windowConfig: {
      trainBars: 180,
      validateBars: 30,
      testBars: 60,
      stepBars: 30,
    },
    mode: 'rolling',
    timestamps,
  };

  const wfResult = runCompositionWalkForward(wfInput);
  console.log(`   Walk-forward windows evaluated: ${wfResult.windows.length}`);
  console.log(`   Average in-sample Sharpe:        ${wfResult.summaryStats.avgInSampleSharpe.toFixed(4)}`);
  console.log(`   Average out-of-sample Sharpe:    ${wfResult.summaryStats.avgOutSampleSharpe.toFixed(4)}`);
  console.log(`   Positive OOS window fraction:    ${(wfResult.summaryStats.positiveOosFraction * 100).toFixed(1)}%`);
  console.log(`   Stitched annualized Sharpe:      ${wfResult.stitched.annualizedSharpe?.toFixed(4) ?? 'N/A'}`);
  console.log(`   Stitched max drawdown:           ${wfResult.stitched.maxDrawdownPct.toFixed(2)}%`);

  // 5. Run AlphaResearchPipeline to exercise stepGenerateReport & survival gate
  console.log('\n5. Running AlphaResearchPipeline with stepGenerateReport...');
  const pipelineConfig: PipelineConfig = {
    symbol: 'BTCUSDT',
    timeframe: '1d',
    candles: btcCandles,
    derivatives: {
      features: [],
      signals: [],
    },
    indicatorSet: { rsi: 14, macd: 26 },
    regimeConfig: { minCandles: 20, confidenceThreshold: 0.5, lookback: 20, minDuration: 3 },
    walkforwardConfig: { trainBars: 100, validateBars: 20, testBars: 30, stepBars: 15 },
    costMode: 'normal',
    minSharpe: 0.0,
    minTrades: 1,
    baselinesEnabled: false,
    survivalGateConfig: {
      minSharpe: 0.0,
      minTrades: 1,
      maxDrawdown: 0.50,
    },
    initialStrategyPhase: 'RESEARCH',
  };

  const pipeline = new AlphaResearchPipeline(pipelineConfig);
  const pipelineReport = await pipeline.run();
  console.log(`   Total pipeline steps:    ${pipelineReport.totalSteps}`);
  console.log(`   Passed pipeline steps:   ${pipelineReport.passedSteps}`);
  console.log(`   Final Sharpe:            ${pipelineReport.finalSharpe.toFixed(4)}`);
  console.log(`   Recommendation:          ${pipelineReport.recommendation}`);
  console.log(`   Survival Gate Status:    ${pipelineReport.survivalGate?.status ?? 'N/A'}`);
  console.log(`   Promotion Outcome:       ${pipelineReport.promotion ? `${pipelineReport.promotion.from} -> ${pipelineReport.promotion.to}` : 'None'}`);

  // 6. Write artifact
  const outputData = {
    timestamp: new Date().toISOString(),
    universe: SYMBOLS,
    scanResult: {
      candidatePairsCount: scanResult.candidatePairs.length,
      diversifiedPairsCount: scanResult.diversifiedPairs.length,
      signalsCount: scanResult.signals.length,
      diversifiedPairs: scanResult.diversifiedPairs.map((p) => `${p.symbol1}/${p.symbol2}`),
    },
    pairCorrelations,
    compositionWalkForward: {
      windowsCount: wfResult.windows.length,
      summaryStats: wfResult.summaryStats,
      stitchedSharpe: wfResult.stitched.annualizedSharpe,
      stitchedMaxDrawdownPct: wfResult.stitched.maxDrawdownPct,
    },
    pipelineSummary: {
      totalSteps: pipelineReport.totalSteps,
      passedSteps: pipelineReport.passedSteps,
      finalSharpe: pipelineReport.finalSharpe,
      recommendation: pipelineReport.recommendation,
      survivalGate: pipelineReport.survivalGate,
      promotion: pipelineReport.promotion,
    },
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2), 'utf-8');
  console.log(`\n✓ Sweep complete. Artifact written to ${OUTPUT_FILE}`);
}

runSweep().catch((err) => {
  console.error('Sweep execution failed:', err);
  process.exit(1);
});
