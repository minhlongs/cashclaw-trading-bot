#!/usr/bin/env npx tsx
// ML Regime Detection — Walk-Forward Validation
//
// Hypothesis: Can a learned regime classifier improve signal filtering
// over rule-based regime detection, or does it just overfit?
//
// Design:
// 1. Generate pseudo-labels from forward returns (forward 48h return direction + vol)
// 2. Train a simple decision tree classifier on regime features
// 3. Walk-forward: train on expanding window, predict next period
// 4. Filter funding-rate fade signals by ML regime predictions
// 5. Compare: ML-filtered vs rule-filtered vs unfiltered
//
// Usage:
//   npx tsx src/forest/backtest/ml-regime-sweep.ts SOLUSDT

import { resolveStressConfig, applyCosts, type StressConfig } from './cost-model';
import { fetchOHLCV } from './data-fetcher';
import { RuleBasedRegimeClassifier } from '@/tree/regime/classifier';
import { extractRegimeFeatures } from '@/tree/regime/features';
import { type RegimeConfig } from '@/tree/regime/types';
import type { Candle } from './ohlcv';
import * as fs from 'fs';

// ── Types ──────────────────────────────────────────────────────────────────

interface FundingPoint {
  timestamp: number;
  fundingRate: number;
  markPrice: number;
}

interface Trade {
  entryTimestamp: number;
  exitTimestamp: number;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  pnlUsd: number;
  barsHeld: number;
  entryRegime: string;
}

interface TreeNode {
  feature: string | null;
  threshold: number | null;
  left: TreeNode | null;
  right: TreeNode | null;
  prediction: string | null;
  samples: number;
}

interface Metrics {
  totalTrades: number;
  netPnL: number;
  winRate: number;
  expectancy: number;
  sharpe: number;
  bootstrapCI: [number, number];
}

const SETTLEMENT_MS = 8 * 60 * 60 * 1000;
const INITIAL_CAPITAL = 10_000;
const TREE_DEPTH = 4;
const MIN_SAMPLES_LEAF = 20;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Funding Fetch (working pattern from derivative-sweep) ───────────────────

async function fetchFundingHistory(symbol: string, days: number): Promise<FundingPoint[]> {
  const all: FundingPoint[] = [];
  const toMs = Date.now();
  const fromMs = toMs - days * 24 * 60 * 60 * 1000;
  let cursor = toMs;

  while (cursor > fromMs) {
    const params = new URLSearchParams({
      symbol,
      startTime: String(Math.max(fromMs, cursor - 1000 * SETTLEMENT_MS)),
      endTime: String(cursor),
      limit: '1000',
    });
    try {
      const res = await fetch(`https://fapi.binance.com/fapi/v1/fundingRate?${params}`);
      if (!res.ok) throw new Error(`[${res.status}] funding rate fetch`);
      const data = await res.json() as Array<{
        fundingTime: number; fundingRate: string; markPrice: string;
      }>;
      if (data.length === 0) break;
      for (const d of data) {
        all.unshift({
          timestamp: d.fundingTime,
          fundingRate: parseFloat(d.fundingRate),
          markPrice: parseFloat(d.markPrice),
        });
      }
      cursor = data[0].fundingTime - 1;
      await sleep(120);
    } catch (e) {
      console.error(`  Funding fetch error: ${e}`);
      break;
    }
  }
  return all;
}

// ── Simple Decision Tree (from scratch, no libraries) ─────────────────────

function entropy(labels: string[]): number {
  const counts: Record<string, number> = {};
  for (const l of labels) counts[l] = (counts[l] || 0) + 1;
  let ent = 0;
  for (const c of Object.values(counts)) {
    const p = c / labels.length;
    if (p > 0) ent -= p * Math.log2(p);
  }
  return ent;
}

function bestSplit(
  features: number[][],
  labels: string[],
  featureNames: string[],
): { featureIdx: number; threshold: number; gain: number } | null {
  const baseEntropy = entropy(labels);
  let bestGain = 0;
  let bestFeature = -1;
  let bestThreshold = 0;

  for (let fi = 0; fi < featureNames.length; fi++) {
    const values = features.map(row => row[fi]);
    const unique = [...new Set(values)].sort((a, b) => a - b);
    const thresholds = unique.length > 10
      ? [0.2, 0.33, 0.5, 0.67, 0.8].map(p => unique[Math.floor(p * (unique.length - 1))])
      : unique;

    for (const t of thresholds) {
      const leftIdx: number[] = [];
      const rightIdx: number[] = [];
      for (let i = 0; i < features.length; i++) {
        if (values[i] <= t) leftIdx.push(i);
        else rightIdx.push(i);
      }
      if (leftIdx.length < MIN_SAMPLES_LEAF || rightIdx.length < MIN_SAMPLES_LEAF) continue;

      const leftLabels = leftIdx.map(i => labels[i]);
      const rightLabels = rightIdx.map(i => labels[i]);
      const pL = leftIdx.length / features.length;
      const pR = rightIdx.length / features.length;
      const gain = baseEntropy - pL * entropy(leftLabels) - pR * entropy(rightLabels);

      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = fi;
        bestThreshold = t;
      }
    }
  }

  if (bestFeature < 0 || bestGain < 0.001) return null;
  return { featureIdx: bestFeature, threshold: bestThreshold, gain: bestGain };
}

function majorityLabel(labels: string[]): string {
  const counts: Record<string, number> = {};
  for (const l of labels) counts[l] = (counts[l] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function buildTree(
  features: number[][],
  labels: string[],
  featureNames: string[],
  depth: number,
): TreeNode {
  const majority = majorityLabel(labels);

  if (depth >= TREE_DEPTH || features.length < MIN_SAMPLES_LEAF * 2 || entropy(labels) < 0.01) {
    return { feature: null, threshold: null, left: null, right: null, prediction: majority, samples: labels.length };
  }

  const split = bestSplit(features, labels, featureNames);
  if (!split) {
    return { feature: null, threshold: null, left: null, right: null, prediction: majority, samples: labels.length };
  }

  const leftFeat: number[][] = [];
  const leftLab: string[] = [];
  const rightFeat: number[][] = [];
  const rightLab: string[] = [];

  for (let i = 0; i < features.length; i++) {
    if (features[i][split.featureIdx] <= split.threshold) {
      leftFeat.push(features[i]);
      leftLab.push(labels[i]);
    } else {
      rightFeat.push(features[i]);
      rightLab.push(labels[i]);
    }
  }

  return {
    feature: featureNames[split.featureIdx],
    threshold: split.threshold,
    left: buildTree(leftFeat, leftLab, featureNames, depth + 1),
    right: buildTree(rightFeat, rightLab, featureNames, depth + 1),
    prediction: null,
    samples: labels.length,
  };
}

function predictTree(tree: TreeNode, features: number[], featureNames: string[]): string {
  if (tree.prediction) return tree.prediction;
  const fi = featureNames.indexOf(tree.feature!);
  if (fi < 0) return tree.prediction || 'UNKNOWN';
  return features[fi] <= tree.threshold!
    ? predictTree(tree.left!, features, featureNames)
    : predictTree(tree.right!, features, featureNames);
}

// ── Label Generation (pseudo-labels from forward returns) ──────────────────

function generateLabels(
  candles: Candle[],
  labelLookforward: number,
): { label: string; index: number }[] {
  const labels: { label: string; index: number }[] = [];
  for (let i = 0; i < candles.length - labelLookforward; i++) {
    const futureClose = candles[i + labelLookforward].close;
    const currentClose = candles[i].close;
    const retPct = (futureClose - currentClose) / currentClose;

    const returns: number[] = [];
    for (let j = i + 1; j <= Math.min(i + labelLookforward, candles.length - 1); j++) {
      returns.push(Math.log(candles[j].close / candles[j - 1].close));
    }
    const vol = Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / returns.length);

    let label: string;
    if (vol > 0.03) {
      label = 'HIGH_VOL';
    } else if (retPct > 0.05) {
      label = 'TREND_UP';
    } else if (retPct < -0.05) {
      label = 'TREND_DOWN';
    } else {
      label = 'RANGE';
    }
    labels.push({ label, index: i });
  }
  return labels;
}

// ── Simulation ────────────────────────────────────────────────────────────

function simulateFade(
  funding: FundingPoint[],
  fundingThreshold: number,
  maxHoldBars: number,
  regimeFilter: ((ts: number) => string) | null,
  filterRegimes: string[],
): Trade[] {
  const trades: Trade[] = [];
  let position: { side: 'long' | 'short'; entryIndex: number; entryPrice: number } | null = null;

  for (let i = 1; i < funding.length; i++) {
    const f = funding[i];

    if (position) {
      const barsHeld = i - position.entryIndex;
      const priceChangePct = (f.markPrice - position.entryPrice) / position.entryPrice;
      const rawPnlPct = position.side === 'long' ? priceChangePct : -priceChangePct;

      if (barsHeld >= maxHoldBars) {
        trades.push({
          entryTimestamp: funding[position.entryIndex].timestamp,
          exitTimestamp: f.timestamp,
          side: position.side,
          entryPrice: position.entryPrice,
          exitPrice: f.markPrice,
          pnlUsd: rawPnlPct * INITIAL_CAPITAL,
          barsHeld,
          entryRegime: regimeFilter ? regimeFilter(funding[position.entryIndex].timestamp) : 'ALL',
        });
        position = null;
      }
    } else {
      const absFunding = Math.abs(f.fundingRate);
      if (absFunding >= fundingThreshold) {
        if (regimeFilter) {
          const regime = regimeFilter(f.timestamp);
          if (!filterRegimes.includes(regime)) continue;
        }
        position = {
          side: f.fundingRate > 0 ? 'short' : 'long',
          entryIndex: i,
          entryPrice: f.markPrice,
        };
      }
    }
  }
  return trades;
}

// ── Metrics ───────────────────────────────────────────────────────────────

function computeMetrics(trades: Trade[], costConfig: StressConfig): Metrics {
  if (trades.length === 0) {
    return { totalTrades: 0, netPnL: 0, winRate: 0, expectancy: 0, sharpe: 0, bootstrapCI: [0, 0] };
  }

  const costed = trades.map(t => {
    const tc = applyCosts(t.pnlUsd, INITIAL_CAPITAL, costConfig);
    return { ...t, netPnl: tc.netPnl };
  });

  const pnls = costed.map(t => t.netPnl);
  const mean = pnls.reduce((s, p) => s + p, 0) / pnls.length;
  const std = Math.sqrt(pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / pnls.length);
  const wins = costed.filter(t => t.netPnl > 0);

  const N_BOOT = 1000;
  const bootMeans: number[] = [];
  for (let b = 0; b < N_BOOT; b++) {
    let sum = 0;
    for (let i = 0; i < pnls.length; i++) sum += pnls[Math.floor(Math.random() * pnls.length)];
    bootMeans.push(sum / pnls.length);
  }
  bootMeans.sort((a, b) => a - b);

  return {
    totalTrades: trades.length,
    netPnL: pnls.reduce((s, p) => s + p, 0),
    winRate: wins.length / trades.length * 100,
    expectancy: mean,
    sharpe: std > 0 ? (mean / std) * Math.sqrt(pnls.length) : 0,
    bootstrapCI: [bootMeans[25], bootMeans[975]],
  };
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const symbol = process.argv[2] || 'SOLUSDT';
  const costConfig = resolveStressConfig('conservative');
  const DAYS = 730;
  const exchange = 'binance';
  const interval = '8h';

  console.log(`\n=== ML Regime Detection — Walk-Forward Validation ===`);
  console.log(`Symbol: ${symbol} | Days: ${DAYS} | Cost: conservative\n`);

  // Fetch candles via existing data-fetcher (with cache)
  console.log(`Fetching ${interval} candles...`);
  const endMs = Date.now();
  const startMs = endMs - DAYS * 24 * 60 * 60 * 1000;
  const candles = await fetchOHLCV(exchange, symbol, interval, startMs, endMs);
  console.log(`  ${candles.length} candles loaded`);

  // Fetch funding via proven cursor pattern
  console.log(`Fetching funding...`);
  const funding = await fetchFundingHistory(symbol, DAYS);
  console.log(`  ${funding.length} funding periods loaded\n`);

  if (candles.length < 200) {
    console.log('Insufficient candle data for ML regime detection');
    return;
  }

  // Compute regime features at each candle
  const regimeConfig: RegimeConfig = {
    minCandles: 20,
    confidenceThreshold: 0.5,
    lookback: 20,
    minDuration: 1,
  };
  const classifier = new RuleBasedRegimeClassifier();

  const featureNames = ['realizedVol', 'atr', 'trendStrength', 'maSlope', 'returnDispersion', 'volumeAbnormality'];
  const allFeatures: number[][] = [];
  const allLabels = generateLabels(candles, 6); // 6 bars = 48h lookforward
  const candleTimestamps: number[] = [];

  for (let i = regimeConfig.minCandles; i < candles.length; i++) {
    const f = extractRegimeFeatures(candles, regimeConfig, i);
    if (!f) continue;
    allFeatures.push([f.realizedVol, f.atr, f.trendStrength, f.maSlope, f.returnDispersion, f.volumeAbnormality]);
    candleTimestamps.push(candles[i].timestamp);
  }

  console.log(`Feature matrix: ${allFeatures.length} rows × ${featureNames.length} features`);
  console.log(`Label distribution:`);
  const labCounts: Record<string, number> = {};
  for (const l of allLabels) labCounts[l.label] = (labCounts[l.label] || 0) + 1;
  for (const [k, v] of Object.entries(labCounts)) console.log(`  ${k}: ${v}`);

  // Walk-forward: train on expanding window, predict next period
  const MIN_TRAIN = 200;
  const PREDICT_STEP = 50;

  const predictions: { index: number; predicted: string; actual: string }[] = [];

  console.log(`\nWalk-forward: MIN_TRAIN=${MIN_TRAIN}, PREDICT_STEP=${PREDICT_STEP}\n`);

  for (let testStart = MIN_TRAIN; testStart < allFeatures.length; testStart += PREDICT_STEP) {
    const testEnd = Math.min(testStart + PREDICT_STEP, allFeatures.length);

    const trainLabels: string[] = [];
    for (let i = 0; i < testStart; i++) {
      const candleIdx = i + regimeConfig.minCandles;
      const labelEntry = allLabels.find(l => l.index === candleIdx);
      trainLabels.push(labelEntry ? labelEntry.label : 'RANGE');
    }

    const trainFeatures = allFeatures.slice(0, testStart);
    const tree = buildTree(trainFeatures, trainLabels, featureNames, 0);

    for (let i = testStart; i < testEnd; i++) {
      const candleIdx = i + regimeConfig.minCandles;
      const labelEntry = allLabels.find(l => l.index === candleIdx);
      const actual = labelEntry ? labelEntry.label : 'RANGE';
      const predicted = predictTree(tree, allFeatures[i], featureNames);
      predictions.push({ index: i, predicted, actual });
    }

    if (testStart % 500 === 0 || testStart + PREDICT_STEP >= allFeatures.length) {
      const correct = predictions.filter(p => p.index >= testStart && p.index < testEnd && p.predicted === p.actual).length;
      const total = Math.min(PREDICT_STEP, allFeatures.length - testStart);
      console.log(`  Window ${testStart}-${testEnd}: accuracy ${(correct / total * 100).toFixed(1)}% (${correct}/${total})`);
    }
  }

  const totalCorrect = predictions.filter(p => p.predicted === p.actual).length;
  console.log(`\nOverall ML accuracy: ${(totalCorrect / predictions.length * 100).toFixed(1)}% (${totalCorrect}/${predictions.length})`);

  // Build ML regime filter function
  const mlRegimeMap: Record<number, string> = {};
  for (const p of predictions) mlRegimeMap[p.index] = p.predicted;

  const mlRegimeFilter = (timestamp: number): string => {
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i < candleTimestamps.length; i++) {
      const dist = Math.abs(candleTimestamps[i] - timestamp);
      if (dist < minDist) { minDist = dist; closest = i; }
    }
    const featureIdx = closest - regimeConfig.minCandles;
    return mlRegimeMap[featureIdx] || 'RANGE';
  };

  const ruleRegimeFilter = (timestamp: number): string => {
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i < candleTimestamps.length; i++) {
      const dist = Math.abs(candleTimestamps[i] - timestamp);
      if (dist < minDist) { minDist = dist; closest = i; }
    }
    const candleIdx = closest + regimeConfig.minCandles;
    if (candleIdx >= candles.length) return 'UNKNOWN';
    const features = extractRegimeFeatures(candles, regimeConfig, candleIdx);
    if (!features) return 'UNKNOWN';
    const result = classifier.classify(features, regimeConfig);
    return result.label;
  };

  // Simulate funding rate fade: unfiltered vs ML-filtered vs rule-filtered
  const fundingThreshold = 0.0001;
  const maxHoldBars = 12;

  console.log(`\n--- Simulation: funding≥${fundingThreshold}, maxHold=${maxHoldBars} ---\n`);

  const unfiltered = simulateFade(funding, fundingThreshold, maxHoldBars, null, []);
  const mUnfiltered = computeMetrics(unfiltered, costConfig);
  console.log(`UNFILTERED: ${mUnfiltered.totalTrades} trades, $${mUnfiltered.netPnL.toFixed(0)} PnL, Sharpe ${mUnfiltered.sharpe.toFixed(2)}`);

  const mlFiltered = simulateFade(funding, fundingThreshold, maxHoldBars, mlRegimeFilter, ['RANGE', 'TREND_UP', 'TREND_DOWN']);
  const mMlFiltered = computeMetrics(mlFiltered, costConfig);
  console.log(`ML-FILTERED (non-volatile): ${mMlFiltered.totalTrades} trades, $${mMlFiltered.netPnL.toFixed(0)} PnL, Sharpe ${mMlFiltered.sharpe.toFixed(2)}`);

  const ruleFiltered = simulateFade(funding, fundingThreshold, maxHoldBars, ruleRegimeFilter, ['RANGE', 'TREND_UP', 'TREND_DOWN', 'LOW_VOLATILITY', 'UNKNOWN']);
  const mRuleFiltered = computeMetrics(ruleFiltered, costConfig);
  console.log(`RULE-FILTERED (non-volatile): ${mRuleFiltered.totalTrades} trades, $${mRuleFiltered.netPnL.toFixed(0)} PnL, Sharpe ${mRuleFiltered.sharpe.toFixed(2)}`);

  const mlTrending = simulateFade(funding, fundingThreshold, maxHoldBars, mlRegimeFilter, ['TREND_UP', 'TREND_DOWN']);
  const mMlTrending = computeMetrics(mlTrending, costConfig);
  console.log(`ML-TRENDING ONLY: ${mMlTrending.totalTrades} trades, $${mMlTrending.netPnL.toFixed(0)} PnL, Sharpe ${mMlTrending.sharpe.toFixed(2)}`);

  const ruleTrending = simulateFade(funding, fundingThreshold, maxHoldBars, ruleRegimeFilter, ['TREND_UP', 'TREND_DOWN']);
  const mRuleTrending = computeMetrics(ruleTrending, costConfig);
  console.log(`RULE-TRENDING ONLY: ${mRuleTrending.totalTrades} trades, $${mRuleTrending.netPnL.toFixed(0)} PnL, Sharpe ${mRuleTrending.sharpe.toFixed(2)}`);

  // Regime distribution in predictions
  console.log(`\n--- ML Regime Distribution (predicted) ---`);
  const predDist: Record<string, number> = {};
  for (const p of predictions) predDist[p.predicted] = (predDist[p.predicted] || 0) + 1;
  for (const [k, v] of Object.entries(predDist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v} (${(v / predictions.length * 100).toFixed(1)}%)`);
  }

  // Verdict
  const improvement = mMlFiltered.sharpe > mUnfiltered.sharpe;
  const mlBeatsRule = mMlFiltered.sharpe > mRuleFiltered.sharpe;
  console.log(`\n--- Verdict ---`);
  console.log(`ML filter improves over unfiltered: ${improvement ? 'YES ✅' : 'NO ❌'} (${mMlFiltered.sharpe.toFixed(2)} vs ${mUnfiltered.sharpe.toFixed(2)})`);
  console.log(`ML beats rule-based: ${mlBeatsRule ? 'YES ✅' : 'NO ❌'} (${mMlFiltered.sharpe.toFixed(2)} vs ${mRuleFiltered.sharpe.toFixed(2)})`);

  // Save report
  let report = `# ML Regime Detection — Walk-Forward Results\n\n`;
  report += `**Date:** ${new Date().toISOString().split('T')[0]}\n`;
  report += `**Symbol:** ${symbol} | **Days:** ${DAYS} | **Cost:** conservative\n`;
  report += `**Model:** Decision tree (depth=${TREE_DEPTH}, minLeaf=${MIN_SAMPLES_LEAF})\n`;
  report += `**Labels:** Forward 48h returns (RANGE/TREND_UP/TREND_DOWN/HIGH_VOL)\n\n---\n\n`;
  report += `## ML Accuracy\n\n`;
  report += `Overall accuracy: **${(totalCorrect / predictions.length * 100).toFixed(1)}%** (${totalCorrect}/${predictions.length})\n\n`;
  report += `| Regime | Predicted Count |\n|---|---|\n`;
  for (const [k, v] of Object.entries(predDist).sort((a, b) => b[1] - a[1])) {
    report += `| ${k} | ${v} (${(v / predictions.length * 100).toFixed(1)}%) |\n`;
  }
  report += `\n## Strategy Comparison\n\n`;
  report += `| Filter | Trades | Net PnL | Sharpe | CI 5% | CI 95% |\n|---|---|---|---|---|---|\n`;
  report += `| Unfiltered | ${mUnfiltered.totalTrades} | $${mUnfiltered.netPnL.toFixed(0)} | ${mUnfiltered.sharpe.toFixed(2)} | $${mUnfiltered.bootstrapCI[0].toFixed(0)} | $${mUnfiltered.bootstrapCI[1].toFixed(0)} |\n`;
  report += `| ML (non-volatile) | ${mMlFiltered.totalTrades} | $${mMlFiltered.netPnL.toFixed(0)} | ${mMlFiltered.sharpe.toFixed(2)} | $${mMlFiltered.bootstrapCI[0].toFixed(0)} | $${mMlFiltered.bootstrapCI[1].toFixed(0)} |\n`;
  report += `| Rule (non-volatile) | ${mRuleFiltered.totalTrades} | $${mRuleFiltered.netPnL.toFixed(0)} | ${mRuleFiltered.sharpe.toFixed(2)} | $${mRuleFiltered.bootstrapCI[0].toFixed(0)} | $${mRuleFiltered.bootstrapCI[1].toFixed(0)} |\n`;
  report += `| ML (trending only) | ${mMlTrending.totalTrades} | $${mMlTrending.netPnL.toFixed(0)} | ${mMlTrending.sharpe.toFixed(2)} | $${mMlTrending.bootstrapCI[0].toFixed(0)} | $${mMlTrending.bootstrapCI[1].toFixed(0)} |\n`;
  report += `| Rule (trending only) | ${mRuleTrending.totalTrades} | $${mRuleTrending.netPnL.toFixed(0)} | ${mRuleTrending.sharpe.toFixed(2)} | $${mRuleTrending.bootstrapCI[0].toFixed(0)} | $${mRuleTrending.bootstrapCI[1].toFixed(0)} |\n`;
  report += `\n## Verdict\n\n`;
  report += `- ML improves over unfiltered: **${improvement ? 'YES' : 'NO'}**\n`;
  report += `- ML beats rule-based: **${mlBeatsRule ? 'YES' : 'NO'}**\n`;
  if (!improvement) {
    report += `\n**ML regime detection does NOT improve signal quality.** The classifier is either overfitting to noise or regime labels derived from forward returns don't add predictive value for the funding-rate fade strategy.\n`;
  } else {
    report += `\nML regime detection shows improvement — but validate with cross-asset testing before concluding this is real alpha.\n`;
  }

  fs.writeFileSync('plans/reports/ml-regime-detection.md', report);
  console.log(`\nReport saved: plans/reports/ml-regime-detection.md`);
}

main().catch(console.error);
