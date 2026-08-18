#!/usr/bin/env npx tsx
// Cross-Exchange Volume Divergence Sweep — Walk-Forward Validation
//
// Hypothesis: When volume on one exchange diverges from another, it signals
// where smart money is moving. Binance volume rising while Bybit falls suggests
// Binance-dominant flow; trade in that direction.
//
// Data: SOLUSDT 8h candles from Binance AND Bybit, pinned end-date 2025-09-19.

import { resolveStressConfig, applyCosts, type StressConfig } from './cost-model';
import { fetchOHLCV } from './data-fetcher';
import type { Candle } from './ohlcv';
import * as fs from 'fs';

const INITIAL_CAPITAL = 10_000;
const END_DATE = new Date('2025-09-19T00:00:00Z');
const END_MS = END_DATE.getTime();
const DAYS = 730;
const START_MS = END_MS - DAYS * 24 * 60 * 60 * 1000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Types ──────────────────────────────────────────────────────────────────

interface Trade {
  direction: 'LONG' | 'SHORT';
  entryTs: number;
  exitTs: number;
  entryRatio: number;
  exitRatio: number;
  pnlPct: number;
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

// ── Sweep Parameters (36 configs) ──────────────────────────────────────────

const WINDOWS = [6, 12, 24];
const LONG_THRESHOLDS = [1.2, 1.5];
const SHORT_THRESHOLDS = [0.5, 0.67];
const MAX_HOLDS = [6, 12, 24];

// ── Helpers ────────────────────────────────────────────────────────────────

/** Merge 4h candles into 8h candles (pair consecutive candles). */
function mergeTo8h(candles: Candle[]): Candle[] {
  const merged: Candle[] = [];
  for (let i = 0; i < candles.length - 1; i += 2) {
    const a = candles[i];
    const b = candles[i + 1];
    // Align timestamps to 8h boundaries
    const alignedTs = Math.floor(a.timestamp / (8 * 3600_000)) * 8 * 3600_000;
    merged.push({
      timestamp: alignedTs,
      open: a.open,
      high: Math.max(a.high, b.high),
      low: Math.min(a.low, b.low),
      close: b.close,
      volume: a.volume + b.volume,
    });
  }
  return merged;
}

function rollingVolumeRatio(
  binance: Candle[],
  bybit: Candle[],
  window: number,
): (number | null)[] {
  const len = Math.min(binance.length, bybit.length);
  const ratios: (number | null)[] = [];
  for (let i = 0; i < len; i++) {
    if (i < window - 1) { ratios.push(null); continue; }
    let bSum = 0, ySum = 0;
    for (let j = i - window + 1; j <= i; j++) {
      bSum += binance[j].volume;
      ySum += bybit[j].volume;
    }
    ratios.push(ySum > 0 ? bSum / ySum : null);
  }
  return ratios;
}

function computeMetrics(trades: Trade[], costConfig: StressConfig): Metrics {
  if (trades.length === 0) {
    return { totalTrades: 0, netPnL: 0, winRate: 0, expectancy: 0, sharpe: 0, profitFactor: 0, bootstrapCI: [0, 0] };
  }
  const costed = trades.map(t => {
    const grossPnl = t.pnlPct * INITIAL_CAPITAL;
    const tc = applyCosts(grossPnl, INITIAL_CAPITAL, costConfig);
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
    totalTrades: pnls.length,
    netPnL: pnls.reduce((s, p) => s + p, 0),
    winRate: wins.length / trades.length * 100,
    expectancy: mean,
    sharpe: std > 0 ? (mean / std) * Math.sqrt(pnls.length) : 0,
    profitFactor: totalLoss > 0 ? totalWin / totalLoss : Infinity,
    bootstrapCI: [bootMeans[25], bootMeans[975]],
  };
}

// ── Strategy ───────────────────────────────────────────────────────────────

function runStrategy(
  binance: Candle[],
  bybit: Candle[],
  window: number,
  longThresh: number,
  shortThresh: number,
  maxHold: number,
): { train: Trade[]; test: Trade[] } {
  const len = Math.min(binance.length, bybit.length);
  const ratios = rollingVolumeRatio(binance, bybit, window);
  const splitBar = Math.floor(len * 0.65);
  const train: Trade[] = [];
  const test: Trade[] = [];

  let i = window - 1; // first usable bar
  while (i < len - 1) {
    const r = ratios[i];
    if (r === null || !isFinite(r)) { i++; continue; }

    let direction: 'LONG' | 'SHORT' | null = null;
    if (r > longThresh) direction = 'LONG';
    else if (r < shortThresh) direction = 'SHORT';

    if (!direction) { i++; continue; }

    const entryPrice = binance[i].close;
    let exitBar = i + 1;
    let exitRatio = r;

    while (exitBar < Math.min(i + maxHold, len)) {
      exitRatio = ratios[exitBar] ?? r;
      // Exit if ratio reverts to neutral zone [shortThresh, longThresh]
      if (exitRatio >= shortThresh && exitRatio <= longThresh) break;
      exitBar++;
    }
    exitBar = Math.min(exitBar, len - 1);

    const exitPrice = binance[exitBar].close;
    const movePct = (exitPrice - entryPrice) / entryPrice;
    const pnlPct = direction === 'LONG' ? movePct : -movePct;

    const trade: Trade = {
      direction,
      entryTs: binance[i].timestamp,
      exitTs: binance[exitBar].timestamp,
      entryRatio: r,
      exitRatio,
      pnlPct,
      barsHeld: exitBar - i,
    };

    if (i < splitBar) train.push(trade); else test.push(trade);
    i = exitBar + 1; // skip past exit
  }
  return { train, test };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const costConfig = resolveStressConfig('conservative');

  console.log(`\n=== Cross-Exchange Volume Divergence Sweep ===`);
  console.log(`Pair: SOLUSDT | Interval: 8h | Days: ${DAYS}`);
  console.log(`End date: ${END_DATE.toISOString().split('T')[0]}`);
  console.log(`Cost: conservative | Train: 65% | Test: 35%\n`);

  // Fetch candles from both exchanges
  console.log('Fetching Binance SOLUSDT (8h)...');
  const binanceRaw = await fetchOHLCV('binance', 'SOLUSDT', '8h', START_MS, END_MS);
  console.log(`  ${binanceRaw.length} candles`);
  await sleep(300);

  // Bybit doesn't support 8h interval; fetch 4h and merge
  console.log('Fetching Bybit SOLUSDT (4h, merging to 8h)...');
  let bybit4h: Candle[] = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      bybit4h = await fetchOHLCV('bybit', 'SOLUSDT', '240', START_MS, END_MS);
      break;
    } catch (err) {
      console.log(`  Bybit attempt ${attempt} failed, retrying in 5s...`);
      await sleep(5000);
    }
  }
  console.log(`  ${bybit4h.length} raw 4h candles`);
  const bybitRaw = mergeTo8h(bybit4h);
  console.log(`  ${bybitRaw.length} merged 8h candles`);

  // Align by timestamp
  const bMap = new Map(binanceRaw.map(c => [c.timestamp, c]));
  const yMap = new Map(bybitRaw.map(c => [c.timestamp, c]));
  const commonTs = [...bMap.keys()].filter(t => yMap.has(t)).sort((a, b) => a - b);
  const binance = commonTs.map(t => bMap.get(t)!);
  const bybit = commonTs.map(t => yMap.get(t)!);
  console.log(`\nAligned: ${commonTs.length} common timestamps`);

  // Volume ratio stats
  const allRatios = rollingVolumeRatio(binance, bybit, 24).filter((r): r is number => r !== null);
  const rMean = allRatios.reduce((s, r) => s + r, 0) / allRatios.length;
  const rStd = Math.sqrt(allRatios.reduce((s, r) => s + (r - rMean) ** 2, 0) / allRatios.length);
  console.log(`Volume ratio (window=24): mean=${rMean.toFixed(4)}, std=${rStd.toFixed(4)}, min=${Math.min(...allRatios).toFixed(4)}, max=${Math.max(...allRatios).toFixed(4)}`);

  // Build configs
  const configs: Array<{ window: number; longThresh: number; shortThresh: number; maxHold: number }> = [];
  for (const w of WINDOWS) for (const lt of LONG_THRESHOLDS) for (const st of SHORT_THRESHOLDS) for (const mh of MAX_HOLDS) {
    configs.push({ window: w, longThresh: lt, shortThresh: st, maxHold: mh });
  }
  console.log(`\nSweeping ${configs.length} configs...\n`);

  // Results
  interface Result {
    cfg: typeof configs[0];
    train: Metrics;
    test: Metrics;
    oosPass: boolean;
  }
  const results: Result[] = [];

  for (const cfg of configs) {
    const { train, test } = runStrategy(binance, bybit, cfg.window, cfg.longThresh, cfg.shortThresh, cfg.maxHold);
    const trainM = computeMetrics(train, costConfig);
    const testM = computeMetrics(test, costConfig);
    const oosPass = testM.totalTrades >= 5 && testM.sharpe > 0 && testM.bootstrapCI[0] > 0;
    results.push({ cfg, train: trainM, test: testM, oosPass });
  }

  // Summary
  const passed = results.filter(r => r.oosPass);
  console.log(`=== OOS Results: ${passed.length}/${results.length} PASSED ===\n`);

  // Full-period top 10 by netPnL
  const byPnl = [...results].sort((a, b) => b.train.netPnL - a.train.netPnL).slice(0, 10);
  console.log('Top 10 Full-Period by PnL:');
  console.log('Win W  TThresh SThresh Hold | Train PnL    Train Sharpe | Trades');
  for (const r of byPnl) {
    const { cfg, train } = r;
    console.log(
      `  ${cfg.window.toString().padStart(2)} ${cfg.longThresh.toFixed(1)} ${cfg.shortThresh.toFixed(2)}  ${cfg.maxHold.toString().padStart(2)}   | $${train.netPnL.toFixed(0).padStart(8)}  ${train.sharpe.toFixed(2).padStart(6)}      | ${train.totalTrades.toString().padStart(3)}`,
    );
  }

  // OOS table
  console.log('\nOOS All Configs:');
  console.log('Win W  TThresh SThresh Hold | Test Trades  Test PnL     Test Sharpe  CI_lo      CI_hi      | PASS');
  for (const r of results) {
    const { cfg, test, oosPass } = r;
    const icon = oosPass ? 'Y' : 'N';
    console.log(
      `  ${cfg.window.toString().padStart(2)} ${cfg.longThresh.toFixed(1)} ${cfg.shortThresh.toFixed(2)}  ${cfg.maxHold.toString().padStart(2)}   | ${test.totalTrades.toString().padStart(4)}        $${test.netPnL.toFixed(0).padStart(8)}  ${test.sharpe.toFixed(2).padStart(8)}    $${test.bootstrapCI[0].toFixed(0).padStart(7)}  $${test.bootstrapCI[1].toFixed(0).padStart(7)}  | ${icon}`,
    );
  }

  // Write report
  let report = `# Cross-Exchange Volume Divergence — Walk-Forward Results\n\n`;
  report += `**Date:** ${new Date().toISOString().split('T')[0]}\n`;
  report += `**Pair:** SOLUSDT | **Interval:** 8h | **Days:** ${DAYS}\n`;
  report += `**End date:** ${END_DATE.toISOString().split('T')[0]}\n`;
  report += `**Exchanges:** Binance, Bybit\n`;
  report += `**Cost:** conservative\n`;
  report += `**Configs:** ${configs.length} (${WINDOWS.length} windows x ${LONG_THRESHOLDS.length} longThresh x ${SHORT_THRESHOLDS.length} shortThresh x ${MAX_HOLDS.length} maxHold)\n\n---\n\n`;

  report += `## Strategy\n\n`;
  report += `Compare rolling volume between Binance and Bybit for SOLUSDT.\n`;
  report += `Volume ratio = BinanceVol(window) / BybitVol(window).\n`;
  report += `LONG when ratio > longThreshold (Binance dominating); SHORT when ratio < shortThreshold (Bybit dominating).\n`;
  report += `Exit when ratio reverts to neutral zone or maxHold bars reached.\n\n`;

  report += `## Volume Ratio Stats\n\n`;
  report += `| Metric | Value |\n|---|---|\n`;
  report += `| Mean (window=24) | ${rMean.toFixed(4)} |\n`;
  report += `| Std | ${rStd.toFixed(4)} |\n`;
  report += `| Min | ${Math.min(...allRatios).toFixed(4)} |\n`;
  report += `| Max | ${Math.max(...allRatios).toFixed(4)} |\n\n`;

  report += `## Full Period Results (Top 10 by PnL)\n\n`;
  report += `| Window | LongThresh | ShortThresh | MaxHold | Train Trades | Train PnL | Train Sharpe | Win Rate |\n`;
  report += `|---|---|---|---|---|---|---|---|\n`;
  for (const r of byPnl) {
    const { cfg, train } = r;
    report += `| ${cfg.window} | ${cfg.longThresh} | ${cfg.shortThresh} | ${cfg.maxHold} | ${train.totalTrades} | $${train.netPnL.toFixed(0)} | ${train.sharpe.toFixed(2)} | ${train.winRate.toFixed(1)}% |\n`;
  }

  report += `\n## OOS Results (All ${configs.length} Configs)\n\n`;
  report += `| Window | LongThresh | ShortThresh | MaxHold | Test Trades | Test PnL | Test Sharpe | CI 5% | CI 95% | OOS |\n`;
  report += `|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const r of results) {
    const { cfg, test, oosPass } = r;
    const icon = oosPass ? 'PASS' : 'FAIL';
    report += `| ${cfg.window} | ${cfg.longThresh} | ${cfg.shortThresh} | ${cfg.maxHold} | ${test.totalTrades} | $${test.netPnL.toFixed(0)} | ${test.sharpe.toFixed(2)} | $${test.bootstrapCI[0].toFixed(0)} | $${test.bootstrapCI[1].toFixed(0)} | ${icon} |\n`;
  }

  report += `\n## Verdict\n\n`;
  if (passed.length > 0) {
    report += `**${passed.length}/${configs.length} configs PASSED out-of-sample.** Cross-exchange volume divergence shows potential alpha.\n`;
  } else {
    report += `**0/${configs.length} configs PASSED.** Cross-exchange volume divergence does NOT produce robust alpha after conservative costs.\n`;
  }

  fs.writeFileSync('plans/reports/cross-exchange-volume.md', report);
  console.log(`\nReport saved: plans/reports/cross-exchange-volume.md`);
}

main().catch(console.error);
