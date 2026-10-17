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
import { runCompositionWalkForward } from '@/forest/alpha/composition-eval/walk-forward';
import { AlphaResearchPipeline } from '@/forest/alpha/pipeline';
import {
  SWEEP_SYMBOLS,
  SWEEP_TIMEFRAME,
  toIndicatorCandles,
  computeSweepPairCorrelations,
  buildSweepWalkForwardInput,
  buildSweepPipelineConfig,
} from './multi-pair-composition-sweep-helpers';

const OUTPUT_FILE = path.join(process.cwd(), 'plans', 'reports', 'multi-pair-composition-sweep-report.json');

async function runSweep() {
  console.log('=== CashClaw Multi-Pair Composition Walk-Forward Sweep ===\n');

  console.log('1. Loading cached panels for:', SWEEP_SYMBOLS.join(', '));
  const candleMap = new Map<string, Candle[]>();
  const indicatorCandleMap = new Map<string, IndicatorCandle[]>();

  for (const symbol of SWEEP_SYMBOLS) {
    const key = `binance:${symbol}:${SWEEP_TIMEFRAME}`;
    const loaded = loadCandles(key);
    if (!loaded || loaded.candles.length === 0) {
      throw new Error(`Failed to load cached candles for ${key}`);
    }
    candleMap.set(symbol, loaded.candles);
    indicatorCandleMap.set(symbol, toIndicatorCandles(loaded.candles));
    console.log(`   ✓ ${symbol}: ${loaded.candles.length} bars loaded`);
  }

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

  console.log('\n3. Computing rolling correlation series across universe pairs...');
  const pairCorrelations = computeSweepPairCorrelations(candleMap);
  for (const [pairKey, stats] of Object.entries(pairCorrelations)) {
    console.log(`   ✓ ${pairKey}: avg rolling correlation = ${stats.avgCorr.toFixed(4)} (${stats.points} points)`);
  }

  console.log('\n4. Executing runCompositionWalkForward across multi-asset returns...');
  const btcCandles = candleMap.get('BTCUSDT')!;
  const wfInput = buildSweepWalkForwardInput(btcCandles);
  const wfResult = runCompositionWalkForward(wfInput);
  console.log(`   Walk-forward windows evaluated: ${wfResult.windows.length}`);
  console.log(`   Average in-sample Sharpe:        ${wfResult.summaryStats.avgInSampleSharpe.toFixed(4)}`);
  console.log(`   Average out-of-sample Sharpe:    ${wfResult.summaryStats.avgOutSampleSharpe.toFixed(4)}`);
  console.log(`   Positive OOS window fraction:    ${(wfResult.summaryStats.positiveOosFraction * 100).toFixed(1)}%`);
  console.log(`   Stitched annualized Sharpe:      ${wfResult.stitched.annualizedSharpe?.toFixed(4) ?? 'N/A'}`);
  console.log(`   Stitched max drawdown:           ${wfResult.stitched.maxDrawdownPct.toFixed(2)}%`);

  console.log('\n5. Running AlphaResearchPipeline with stepGenerateReport...');
  const pipeline = new AlphaResearchPipeline(buildSweepPipelineConfig(btcCandles));
  const pipelineReport = await pipeline.run();
  console.log(`   Total pipeline steps:    ${pipelineReport.totalSteps}`);
  console.log(`   Passed pipeline steps:   ${pipelineReport.passedSteps}`);
  console.log(`   Final Sharpe:            ${pipelineReport.finalSharpe.toFixed(4)}`);
  console.log(`   Recommendation:          ${pipelineReport.recommendation}`);
  console.log(`   Survival Gate Status:    ${pipelineReport.survivalGate?.status ?? 'N/A'}`);
  console.log(`   Promotion Outcome:       ${pipelineReport.promotion ? `${pipelineReport.promotion.from} -> ${pipelineReport.promotion.to}` : 'None'}`);

  const outputData = {
    timestamp: new Date().toISOString(),
    universe: SWEEP_SYMBOLS,
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
