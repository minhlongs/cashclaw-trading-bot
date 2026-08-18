#!/usr/bin/env npx tsx
// Cross-Asset Correlation Sweep — Pairs Trading Walk-Forward Validation
//
// Hypothesis: When two correlated crypto assets diverge (spread z-score
// goes extreme), does the spread mean-revert after costs?
//
// Uses existing infrastructure:
//   src/tree/alpha/correlation/compute.ts — pearson, spread stats
//   src/tree/alpha/correlation/pairs.ts — findCointegratedPairs, generatePairSignals
//   src/tree/alpha/correlation/adf.ts — cointegration test
//
// Usage:
//   npx tsx src/forest/backtest/cross-asset-sweep.ts

import { resolveStressConfig, applyCosts, type StressConfig } from './cost-model';
import { fetchOHLCV } from './data-fetcher';
import { findCointegratedPairs, generatePairSignals } from '@/tree/alpha/correlation/pairs';
import { computeSpreadStatistics } from '@/tree/alpha/correlation/compute';
import type { IndicatorCandle } from '@/tree/alpha/indicator-types';
import type { Candle } from './ohlcv';
import * as fs from 'fs';

const INITIAL_CAPITAL = 10_000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Types ──────────────────────────────────────────────────────────────────

interface Trade {
  pair: [string, string];
  direction: string;
  entryTimestamp: number;
  exitTimestamp: number;
  entrySpreadZ: number;
  exitSpreadZ: number;
  pnlUsd: number;
  barsHeld: number;
}

interface Metrics {
  totalTrades: number;
  netPnL: number;
  winRate: number;
  expectancy: number;
  sharpe: number;
  profitFactor: number;
  bootstrapCI: [number, number];
}

// ── Config ─────────────────────────────────────────────────────────────────

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const EXCHANGE = 'binance';
const INTERVAL = '8h';
const DAYS = 730;

// Walk-forward split
const MIN_TRAIN_BARS = 200;
const TEST_STEP = 50;

// Pair signal parameters to sweep
const Z_SCORE_ENTRIES = [1.0, 1.5, 2.0, 2.5];
const Z_SCORE_EXITS = [0.0, 0.3, 0.5];
const MAX_HOLD_BARS = [12, 24, 48]; // 96h, 192h, 384h

// ── Helpers ────────────────────────────────────────────────────────────────

function toIndicatorCandle(c: Candle): IndicatorCandle {
  return { timestamp: c.timestamp, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
}

function computeMetrics(trades: Trade[], costConfig: StressConfig): Metrics {
  if (trades.length === 0) {
    return { totalTrades: 0, netPnL: 0, winRate: 0, expectancy: 0, sharpe: 0, profitFactor: 0, bootstrapCI: [0, 0] };
  }

  const costed = trades.map(t => {
    const tc = applyCosts(t.pnlUsd, INITIAL_CAPITAL, costConfig);
    return { ...t, netPnl: tc.netPnl };
  });

  const pnls = costed.map(t => t.netPnl);
  const mean = pnls.reduce((s, p) => s + p, 0) / pnls.length;
  const std = Math.sqrt(pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / pnls.length);
  const wins = costed.filter(t => t.netPnl > 0);
  const losses = costed.filter(t => t.netPnl <= 0);
  const totalWin = wins.reduce((s, t) => s + t.netPnl, 0);
  const totalLoss = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));

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
    profitFactor: totalLoss > 0 ? totalWin / totalLoss : Infinity,
    bootstrapCI: [bootMeans[25], bootMeans[975]],
  };
}

// ── Walk-Forward Pair Trading ──────────────────────────────────────────────

function runPairWalkForward(
  allCandles: Map<string, IndicatorCandle[]>,
  pair: [string, string],
  zEntry: number,
  zExit: number,
  maxHold: number,
  costConfig: StressConfig,
): { train: Trade[]; test: Trade[] } {
  const c1 = allCandles.get(pair[0])!;
  const c2 = allCandles.get(pair[1])!;
  const len = Math.min(c1.length, c2.length);

  // Find first usable bar
  const startBar = 60; // need lookback for correlation
  const splitBar = Math.floor(len * 0.65);

  const train: Trade[] = [];
  const test: Trade[] = [];

  for (let i = startBar; i < len; i++) {
    const lookback = 40; // bars to compute correlation/spread
    const window1 = c1.slice(Math.max(0, i - lookback), i + 1);
    const window2 = c2.slice(Math.max(0, i - lookback), i + 1);

    if (window1.length < 20 || window2.length < 20) continue;

    const stats = computeSpreadStatistics(window1, window2, lookback);
    if (!stats || !isFinite(stats.zScore)) continue;

    const z = stats.zScore;

    // Simple entry/exit logic: enter when z-score crosses threshold, exit at z-exit or maxHold
    // For each bar, check if we should open or close a position
    if (Math.abs(z) >= zEntry) {
      const direction = z > 0 ? 'short_spread' : 'long_spread'; // mean-revert

      // Simulate: hold until z-score reverts to zExit or maxHold bars
      let exitBar = i + 1;
      let exitZ = 0;
      while (exitBar < Math.min(i + maxHold, len)) {
        const ew1 = c1.slice(Math.max(0, exitBar - lookback), exitBar + 1);
        const ew2 = c2.slice(Math.max(0, exitBar - lookback), exitBar + 1);
        if (ew1.length < 20 || ew2.length < 20) { exitBar++; continue; }
        const es = computeSpreadStatistics(ew1, ew2, lookback);
        if (!es || !isFinite(es.zScore)) { exitBar++; continue; }
        exitZ = es.zScore;

        // Exit condition: z reverts past zExit
        if (direction === 'short_spread' && exitZ <= zExit) break;
        if (direction === 'long_spread' && exitZ >= -zExit) break;
        exitBar++;
      }

      // PnL: simplified as spread change × notional
      // long_spread profits when spread decreases (buy cheap, sell expensive)
      // short_spread profits when spread increases
      const spreadChange = exitZ - z;
      let pnlPct: number;
      if (direction === 'long_spread') {
        pnlPct = -spreadChange * 0.01; // profit when z goes down
      } else {
        pnlPct = spreadChange * 0.01; // profit when z goes up
      }
      const pnlUsd = pnlPct * INITIAL_CAPITAL;

      const trade: Trade = {
        pair,
        direction,
        entryTimestamp: c1[i].timestamp,
        exitTimestamp: c1[Math.min(exitBar, len - 1)].timestamp,
        entrySpreadZ: z,
        exitSpreadZ: exitZ,
        pnlUsd,
        barsHeld: exitBar - i,
      };

      if (i < splitBar) {
        train.push(trade);
      } else {
        test.push(trade);
      }

      i = exitBar; // skip ahead past exit
    }
  }

  return { train, test };
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const costConfig = resolveStressConfig('conservative');

  console.log(`\n=== Cross-Asset Correlation Sweep — Walk-Forward ===`);
  console.log(`Assets: ${SYMBOLS.join(', ')} | Interval: ${INTERVAL} | Days: ${DAYS}`);
  console.log(`Cost: conservative | Train: first 65% | Test: last 35%\n`);

  // Fetch candles
  const allCandles = new Map<string, IndicatorCandle[]>();
  const endMs = Date.now();
  const startMs = endMs - DAYS * 24 * 60 * 60 * 1000;

  for (const sym of SYMBOLS) {
    console.log(`Fetching ${sym}...`);
    const raw = await fetchOHLCV(EXCHANGE, sym, INTERVAL, startMs, endMs);
    allCandles.set(sym, raw.map(toIndicatorCandle));
    console.log(`  ${raw.length} candles`);
    await sleep(100);
  }

  // Pairs to test
  const pairs: [string, string][] = [
    ['BTCUSDT', 'ETHUSDT'],
    ['BTCUSDT', 'SOLUSDT'],
    ['ETHUSDT', 'SOLUSDT'],
  ];

  // First: check cointegration
  console.log(`\n--- Cointegration Analysis ---`);
  const pairStats = findCointegratedPairs(allCandles, 240);
  for (const ps of pairStats) {
    console.log(`  ${ps.symbol1}/${ps.symbol2}: corr=${ps.correlation.toFixed(3)}, halfLife=${ps.halfLife.toFixed(1)}, cointP=${ps.cointegrationPValue.toFixed(4)}`);
  }

  // Sweep all configs on all pairs
  const configs = [];
  for (const zEntry of Z_SCORE_ENTRIES) {
    for (const zExit of Z_SCORE_EXITS) {
      for (const maxHold of MAX_HOLD_BARS) {
        configs.push({ zEntry, zExit, maxHold });
      }
    }
  }

  console.log(`\nSweeping ${configs.length} configs × ${pairs.length} pairs = ${configs.length * pairs.length} total...\n`);

  const results: Array<{
    pair: string;
    zEntry: number;
    zExit: number;
    maxHold: number;
    train: Metrics;
    test: Metrics;
    oosPass: boolean;
  }> = [];

  for (const pair of pairs) {
    const pairKey = `${pair[0].split('U')[0]}/${pair[1].split('U')[0]}`;
    for (const cfg of configs) {
      const { train: trainTrades, test: testTrades } = runPairWalkForward(
        allCandles, pair, cfg.zEntry, cfg.zExit, cfg.maxHold, costConfig,
      );
      const trainM = computeMetrics(trainTrades, costConfig);
      const testM = computeMetrics(testTrades, costConfig);
      const oosPass = testM.totalTrades >= 10 && testM.netPnL > 0 && testM.bootstrapCI[0] > 0;

      results.push({
        pair: pairKey,
        zEntry: cfg.zEntry,
        zExit: cfg.zExit,
        maxHold: cfg.maxHold,
        train: trainM,
        test: testM,
        oosPass,
      });
    }
  }

  // Summary
  const passed = results.filter(r => r.oosPass);
  const marginal = results.filter(r => !r.oosPass && r.test.totalTrades >= 10 && r.test.netPnL > 0);
  const failed = results.filter(r => !r.oosPass && (r.test.totalTrades < 10 || r.test.netPnL <= 0));

  console.log(`\n=== Summary ===`);
  console.log(`PASSED OOS: ${passed.length}/${results.length}`);
  console.log(`MARGINAL: ${marginal.length}/${results.length}`);
  console.log(`FAILED: ${failed.length}/${results.length}`);

  // Top 5 by test Sharpe
  const sorted = [...results].filter(r => r.test.totalTrades >= 5).sort((a, b) => b.test.sharpe - a.test.sharpe);
  console.log(`\nTop 5 by Test Sharpe:`);
  for (const r of sorted.slice(0, 5)) {
    const icon = r.oosPass ? '✅' : (r.test.netPnL > 0 ? '⚠️' : '❌');
    console.log(`  ${icon} ${r.pair} zE=${r.zEntry} zX=${r.zExit} hold=${r.maxHold}: train=${r.train.sharpe.toFixed(2)} (${r.train.totalTrades}t) test=${r.test.sharpe.toFixed(2)} (${r.test.totalTrades}t) PnL=$${r.test.netPnL.toFixed(0)} CI[${r.test.bootstrapCI[0].toFixed(0)}, ${r.test.bootstrapCI[1].toFixed(0)}]`);
  }

  // Save report
  let report = `# Cross-Asset Correlation — Walk-Forward Results\n\n`;
  report += `**Date:** ${new Date().toISOString().split('T')[0]}\n`;
  report += `**Assets:** ${SYMBOLS.join(', ')} | **Interval:** ${INTERVAL} | **Days:** ${DAYS}\n`;
  report += `**Pairs:** ${pairs.map(p => p.map(s => s.split('U')[0]).join('/')).join(', ')}\n`;
  report += `**Cost:** conservative\n`;
  report += `**Configs:** ${configs.length} per pair (${Z_SCORE_ENTRIES.length} entries × ${Z_SCORE_EXITS.length} exits × ${MAX_HOLD_BARS.length} holds)\n\n---\n\n`;

  report += `## Cointegration Analysis\n\n`;
  report += `| Pair | Correlation | Half-Life | Coint P-value |\n|---|---|---|---|\n`;
  for (const ps of pairStats) {
    report += `| ${ps.symbol1.split('U')[0]}/${ps.symbol2.split('U')[0]} | ${ps.correlation.toFixed(3)} | ${ps.halfLife.toFixed(1)} | ${ps.cointegrationPValue.toFixed(4)} |\n`;
  }

  report += `\n## Results Summary\n\n`;
  report += `| Status | Count |\n|---|---|\n`;
  report += `| PASSED OOS | ${passed.length}/${results.length} |\n`;
  report += `| MARGINAL | ${marginal.length}/${results.length} |\n`;
  report += `| FAILED | ${failed.length}/${results.length} |\n`;

  report += `\n## Top 10 by Test Sharpe\n\n`;
  report += `| Pair | zEntry | zExit | MaxHold | Train Trades | Train PnL | Train Sharpe | Test Trades | Test PnL | Test Sharpe | CI 5% | CI 95% | OOS |\n`;
  report += `|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const r of sorted.slice(0, 10)) {
    const icon = r.oosPass ? '✅' : (r.test.netPnL > 0 ? '⚠️' : '❌');
    report += `| ${r.pair} | ${r.zEntry} | ${r.zExit} | ${r.maxHold} | ${r.train.totalTrades} | $${r.train.netPnL.toFixed(0)} | ${r.train.sharpe.toFixed(2)} | ${r.test.totalTrades} | $${r.test.netPnL.toFixed(0)} | ${r.test.sharpe.toFixed(2)} | $${r.test.bootstrapCI[0].toFixed(0)} | $${r.test.bootstrapCI[1].toFixed(0)} | ${icon} |\n`;
  }

  report += `\n## Verdict\n\n`;
  if (passed.length > 0) {
    report += `**${passed.length}/${results.length} configs PASSED out-of-sample.** Cross-asset correlation shows potential alpha.\n`;
  } else if (marginal.length > 0) {
    report += `**0/${results.length} PASSED, but ${marginal.length} are marginal** (positive PnL, CI crosses zero). Cross-asset correlation does not produce robust alpha.\n`;
  } else {
    report += `**0/${results.length} PASSED.** Cross-asset correlation pairs trading does NOT produce positive expectancy after conservative costs.\n`;
  }

  fs.writeFileSync('plans/reports/cross-asset-correlation.md', report);
  console.log(`\nReport saved: plans/reports/cross-asset-correlation.md`);
}

main().catch(console.error);
