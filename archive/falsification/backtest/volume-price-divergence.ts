#!/usr/bin/env npx tsx
// Volume-Price Divergence Backtest — SOLUSDT 8h
//
// Hypothesis #14: When price rises but volume declines (weak hands buying),
// rally is unsustainable -> SHORT. When price falls but volume declines
// (weak hands selling), selloff is unsustainable -> LONG.
//
// Usage: npx tsx src/forest/backtest/volume-price-divergence.ts

import { resolveStressConfig, applyCosts, type CostConfig } from './cost-model';
import { fetchOHLCV } from './data-fetcher';
import type { Candle } from './ohlcv';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';

// ── Constants ────────────────────────────────────────────────────────────────

const INITIAL_CAPITAL = 10_000;
const PINNED_END_MS = new Date('2025-09-19T00:00:00Z').getTime();
const DAY_MS = 86_400_000;
const EXCHANGE = 'binance';
const SYMBOL = 'SOLUSDT';
const INTERVAL = '8h';
const LOOKBACK_DAYS = 730;
const OOS_TRAIN_RATIO = 0.65;
const BOOTSTRAP_RESAMPLES = 1_000;
const BLOCK_SIZE = 6;
const EXIT_ROC_THRESHOLD = 0.005;
const STRESS_MODE = 'conservative' as const;

// ── Param Grid ───────────────────────────────────────────────────────────────

interface Config {
  priceRocPeriod: number;
  volWindow: number;
  priceThreshold: number;
  volZThreshold: number;
  maxHold: number;
}

const GRID: Config[] = [];
for (const priceRocPeriod of [3, 12])
  for (const volWindow of [12, 24])
    for (const priceThreshold of [0.01, 0.03])
      for (const volZThreshold of [0.5, 1.0])
        for (const maxHold of [6, 12, 24])
          GRID.push({ priceRocPeriod, volWindow, priceThreshold, volZThreshold, maxHold });

// ── Signal Precomputation ────────────────────────────────────────────────────

interface Signal {
  priceROC: number;
  volZ: number;
}

function precomputeSignals(
  candles: Candle[],
  priceRocPeriod: number,
  volWindow: number,
): Signal[] {
  const n = candles.length;
  const signals: Signal[] = new Array(n);
  // Rolling volume mean/std accumulators
  let volSum = 0;
  let volSqSum = 0;
  for (let i = 0; i < n; i++) {
    const vol = candles[i].volume;
    // Price ROC (no lookahead: uses candle[i].close vs candle[i - period].close)
    const roc = i >= priceRocPeriod
      ? (candles[i].close - candles[i - priceRocPeriod].close) / candles[i - priceRocPeriod].close
      : 0;
    // Rolling volume stats
    volSum += vol;
    volSqSum += vol * vol;
    if (i >= volWindow) {
      const oldVol = candles[i - volWindow].volume;
      volSum -= oldVol;
      volSqSum -= oldVol * oldVol;
    }
    if (i >= volWindow - 1) {
      const count = volWindow;
      const mean = volSum / count;
      const variance = volSqSum / count - mean * mean;
      const std = Math.sqrt(Math.max(variance, 1e-12));
      signals[i] = { priceROC: roc, volZ: (vol - mean) / std };
    } else {
      signals[i] = { priceROC: roc, volZ: 0 };
    }
  }
  return signals;
}

// ── Trade Execution ──────────────────────────────────────────────────────────

interface Trade {
  entryIdx: number;
  exitIdx: number;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  netPnl: number;
}

function runBacktest(
  candles: Candle[],
  signals: Signal[],
  cfg: Config,
  costCfg: CostConfig,
): Trade[] {
  const trades: Trade[] = [];
  const warmup = Math.max(cfg.priceRocPeriod, cfg.volWindow);
  let i = warmup;
  const cap = INITIAL_CAPITAL;
  while (i < candles.length) {
    const sig = signals[i];
    let side: 'long' | 'short' | null = null;
    if (sig.priceROC > cfg.priceThreshold && sig.volZ < -cfg.volZThreshold) {
      side = 'short';
    } else if (sig.priceROC < -cfg.priceThreshold && sig.volZ < -cfg.volZThreshold) {
      side = 'long';
    }
    if (!side) { i++; continue; }
    const entryIdx = i;
    const entryPrice = candles[i].close;
    // Exit logic
    let exitIdx = i + cfg.maxHold;
    if (exitIdx >= candles.length) exitIdx = candles.length - 1;
    for (let j = i + 1; j <= exitIdx && j < candles.length; j++) {
      if (Math.abs(signals[j].priceROC) < EXIT_ROC_THRESHOLD) {
        exitIdx = j;
        break;
      }
    }
    const exitPrice = candles[exitIdx].close;
    const qty = cap / entryPrice;
    const gross = side === 'long'
      ? (exitPrice - entryPrice) * qty
      : (entryPrice - exitPrice) * qty;
    const costed = applyCosts(gross, entryPrice * qty, costCfg);
    trades.push({ entryIdx, exitIdx, side, entryPrice, exitPrice, netPnl: costed.netPnl });
    i = exitIdx + 1;
  }
  return trades;
}

// ── Metrics ──────────────────────────────────────────────────────────────────

interface Metrics {
  trades: number;
  totalPnl: number;
  winRate: number;
  sharpe: number;
  profitFactor: number;
  maxDrawdown: number;
}

function computeMetrics(trades: Trade[]): Metrics {
  if (trades.length === 0) return { trades: 0, totalPnl: 0, winRate: 0, sharpe: 0, profitFactor: 0, maxDrawdown: 0 };
  const pnls = trades.map(t => t.netPnl);
  const wins = pnls.filter(p => p > 0);
  const losses = pnls.filter(p => p <= 0);
  const totalPnl = pnls.reduce((a, b) => a + b, 0);
  const winRate = wins.length / pnls.length;
  // Max drawdown (cumulative PnL)
  let cum = 0, peak = 0, maxDD = 0;
  for (const p of pnls) {
    cum += p;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
  }
  // Sharpe (annualized, 8h bars → 3 bars/day → 1095 bars/year)
  const barsPerYear = 1095;
  const mean = totalPnl / pnls.length;
  const variance = pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / pnls.length;
  const std = Math.sqrt(Math.max(variance, 1e-12));
  const sharpe = (mean / std) * Math.sqrt(barsPerYear / Math.max(pnls.length, 1));
  // Profit factor
  const grossWins = wins.reduce((a, b) => a + b, 0);
  const grossLosses = Math.abs(losses.reduce((a, b) => a + b, 0));
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0;
  return { trades: pnls.length, totalPnl, winRate, sharpe, profitFactor, maxDrawdown: maxDD };
}

// ── Bootstrap CI ─────────────────────────────────────────────────────────────

function bootstrapCI(trades: Trade[], resamples: number): { lo: number; hi: number; mid: number } {
  const pnls = trades.map(t => t.netPnl);
  if (pnls.length < 2) return { lo: 0, hi: 0, mid: 0 };
  const n = pnls.length;
  const blockLen = Math.min(BLOCK_SIZE, n);
  const means: number[] = [];
  for (let r = 0; r < resamples; r++) {
    const sample: number[] = [];
    while (sample.length < n) {
      const start = Math.floor(Math.random() * (n - blockLen + 1));
      for (let b = 0; b < blockLen && sample.length < n; b++) sample.push(pnls[start + b]);
    }
    means.push(sample.reduce((a, b) => a + b, 0) / sample.length);
  }
  means.sort((a, b) => a - b);
  return {
    lo: means[Math.floor(resamples * 0.025)],
    mid: means[Math.floor(resamples * 0.5)],
    hi: means[Math.floor(resamples * 0.975)],
  };
}

// ── Config Result ────────────────────────────────────────────────────────────

interface ConfigResult {
  cfg: Config;
  fullMetrics: Metrics;
  oosMetrics: Metrics | null;
  oosCI: { lo: number; hi: number; mid: number } | null;
  oosPass: boolean;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const costCfg = resolveStressConfig(STRESS_MODE);
  const endMs = PINNED_END_MS;
  const startMs = endMs - LOOKBACK_DAYS * DAY_MS;
  console.error(`Fetching ${SYMBOL} ${INTERVAL} candles from ${new Date(startMs).toISOString().slice(0, 10)} to ${new Date(endMs).toISOString().slice(0, 10)}...`);
  const candles = await fetchOHLCV(EXCHANGE, SYMBOL, INTERVAL, startMs, endMs);
  console.error(`Fetched ${candles.length} candles.`);
  if (candles.length < 60) throw new Error('Insufficient candle data.');

  // Volume stats
  const vols = candles.map(c => c.volume);
  const volMean = vols.reduce((a, b) => a + b, 0) / vols.length;
  const volStd = Math.sqrt(vols.reduce((s, v) => s + (v - volMean) ** 2, 0) / vols.length);
  console.error(`Volume stats: mean=${volMean.toFixed(2)}, std=${volStd.toFixed(2)}`);

  const results: ConfigResult[] = [];
  for (const cfg of GRID) {
    const signals = precomputeSignals(candles, cfg.priceRocPeriod, cfg.volWindow);
    // OOS split
    const splitIdx = Math.floor(candles.length * OOS_TRAIN_RATIO);
    const trainSignals = signals.slice(0, splitIdx);
    const trainCandles = candles.slice(0, splitIdx);
    const oosSignals = signals.slice(splitIdx);
    const oosCandles = candles.slice(splitIdx);
    const fullTrades = runBacktest(candles, signals, cfg, costCfg);
    const fullMetrics = computeMetrics(fullTrades);
    const oosTrades = runBacktest(oosCandles, oosSignals, cfg, costCfg);
    const oosMetrics = oosTrades.length > 0 ? computeMetrics(oosTrades) : null;
    let oosCI = null;
    let oosPass = false;
    if (oosMetrics && oosMetrics.trades >= 5) {
      oosCI = bootstrapCI(oosTrades, BOOTSTRAP_RESAMPLES);
      oosPass = oosMetrics.sharpe > 0 && oosCI.lo > 0;
    }
    results.push({ cfg, fullMetrics, oosMetrics, oosCI, oosPass });
  }

  // Print full-period top-10 by PnL
  const sortedFull = [...results].sort((a, b) => b.fullMetrics.totalPnl - a.fullMetrics.totalPnl);
  console.log('\n=== Full-Period Results (Top 10 by PnL) ===');
  console.log(' priceRocPeriod | volWindow | priceThr | volZThr | maxHold | trades |   PnL    |  WinRate | Sharpe | PF    | MaxDD');
  console.log(' ----------------|-----------|----------|---------|---------|--------|----------|----------|--------|-------|------');
  for (const r of sortedFull.slice(0, 10)) {
    const m = r.fullMetrics;
    const c = r.cfg;
    console.log(
      `       ${String(c.priceRocPeriod).padStart(2)}      |    ${String(c.volWindow).padStart(2)}    |   ${c.priceThreshold.toFixed(2)}  |  ${c.volZThreshold.toFixed(1)}   |    ${String(c.maxHold).padStart(2)}   |  ${String(m.trades).padStart(4)}  | ${m.totalPnl.toFixed(8).padStart(10)} | ${(m.winRate * 100).toFixed(1).padStart(7)}% | ${m.sharpe.toFixed(2).padStart(6)} | ${m.profitFactor.toFixed(2).padStart(5)} | ${m.maxDrawdown.toFixed(6)}`,
    );
  }

  // Print OOS results for all configs
  const sortedOOS = [...results].filter(r => r.oosMetrics && r.oosMetrics.trades > 0)
    .sort((a, b) => (b.oosCI?.lo ?? -Infinity) - (a.oosCI?.lo ?? -Infinity));
  console.log('\n=== OOS Results (all configs with trades) ===');
  console.log(' priceRocPeriod | volWindow | priceThr | volZThr | maxHold | trades |   PnL    | Sharpe | CI_lo    | CI_hi    | Verdict');
  console.log(' ----------------|-----------|----------|---------|---------|--------|----------|--------|----------|----------|--------');
  for (const r of sortedOOS) {
    const m = r.oosMetrics!;
    const c = r.cfg;
    const ci = r.oosCI!;
    const verdict = r.oosPass ? 'PASS' : 'FAIL';
    console.log(
      `       ${String(c.priceRocPeriod).padStart(2)}      |    ${String(c.volWindow).padStart(2)}    |   ${c.priceThreshold.toFixed(2)}  |  ${c.volZThreshold.toFixed(1)}   |    ${String(c.maxHold).padStart(2)}   |  ${String(m.trades).padStart(4)}  | ${m.totalPnl.toFixed(8).padStart(10)} | ${m.sharpe.toFixed(2).padStart(6)} | ${ci.lo.toFixed(6).padStart(8)} | ${ci.hi.toFixed(6).padStart(8)} |  ${verdict}`,
    );
  }

  // Summary
  const passCount = results.filter(r => r.oosPass).length;
  const totalWithOOS = results.filter(r => r.oosMetrics && r.oosMetrics.trades > 0).length;
  console.log(`\n=== VERDICT ===`);
  console.log(`OOS PASS: ${passCount}/${totalWithOOS} configs (of ${GRID.length} total)`);
  console.log(`Pass criteria: >=5 OOS trades, Sharpe > 0, CI lower bound > 0`);
  if (passCount === 0) {
    console.log('Hypothesis #14 FALSIFIED — no config passes OOS.');
  } else {
    console.log(`Hypothesis #14 SURVIVES — ${passCount} config(s) pass OOS.`);
    const bestPass = results.filter(r => r.oosPass)
      .sort((a, b) => (b.oosCI?.lo ?? 0) - (a.oosCI?.lo ?? 0))[0];
    console.log(`Best OOS config: priceRocPeriod=${bestPass.cfg.priceRocPeriod}, volWindow=${bestPass.cfg.volWindow}, priceThr=${bestPass.cfg.priceThreshold}, volZThr=${bestPass.cfg.volZThreshold}, maxHold=${bestPass.cfg.maxHold}`);
  }

  // Write report
  const reportPath = resolve(process.cwd(), 'plans/reports/volume-price-divergence.md');
  const report = buildReport(results, GRID, candles, passCount, totalWithOOS, volMean, volStd);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, report, 'utf-8');
  console.log(`\nReport saved: ${reportPath}`);
}

function buildReport(
  results: ConfigResult[],
  grid: Config[],
  candles: Candle[],
  passCount: number,
  totalWithOOS: number,
  volMean: number,
  volStd: number,
): string {
  const lines: string[] = [];
  lines.push('# Hypothesis #14: Volume-Price Divergence — SOLUSDT 8h');
  lines.push('');
  lines.push('## Strategy Description');
  lines.push('');
  lines.push('When price rises but volume declines (weak hands buying), rally is unsustainable => SHORT.');
  lines.push('When price falls but volume declines (weak hands selling), selloff is unsustainable => LONG.');
  lines.push('');
  lines.push('- **Signal:** Price ROC > threshold AND volume Z-score < -volZThreshold');
  lines.push('- **Exit:** Max hold bars OR |priceROC| < 0.005');
  lines.push('- **Costs:** Conservative stress mode (fees + slippage + market impact)');
  lines.push('');
  lines.push(`- **Data:** SOLUSDT 8h candles, ${candles.length} bars, ${new Date(candles[0].timestamp).toISOString().slice(0, 10)} to ${new Date(candles[candles.length - 1].timestamp).toISOString().slice(0, 10)}`);
  lines.push(`- **Volume stats:** mean=${volMean.toFixed(2)}, std=${volStd.toFixed(2)}`);
  lines.push('- **Sweep:** 48 configs (2x2x2x2x3)');
  lines.push('');
  lines.push('## Full-Period Results (Top 10 by PnL)');
  lines.push('');
  lines.push('| priceRocPeriod | volWindow | priceThr | volZThr | maxHold | trades | PnL | WinRate | Sharpe | PF | MaxDD |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
  const sortedFull = [...results].sort((a, b) => b.fullMetrics.totalPnl - a.fullMetrics.totalPnl);
  for (const r of sortedFull.slice(0, 10)) {
    const m = r.fullMetrics;
    const c = r.cfg;
    lines.push(`| ${c.priceRocPeriod} | ${c.volWindow} | ${c.priceThreshold} | ${c.volZThreshold} | ${c.maxHold} | ${m.trades} | ${m.totalPnl.toFixed(6)} | ${(m.winRate * 100).toFixed(1)}% | ${m.sharpe.toFixed(2)} | ${m.profitFactor.toFixed(2)} | ${m.maxDrawdown.toFixed(6)} |`);
  }
  lines.push('');
  lines.push('## OOS Results (All Configs)');
  lines.push('');
  lines.push('| priceRocPeriod | volWindow | priceThr | volZThr | maxHold | trades | PnL | Sharpe | CI 95% Lo | CI 95% Hi | Verdict |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
  const sortedOOS = [...results]
    .filter(r => r.oosMetrics && r.oosMetrics.trades > 0)
    .sort((a, b) => (b.oosCI?.lo ?? -Infinity) - (a.oosCI?.lo ?? -Infinity));
  for (const r of sortedOOS) {
    const m = r.oosMetrics!;
    const c = r.cfg;
    const ci = r.oosCI!;
    const verdict = r.oosPass ? 'PASS' : 'FAIL';
    lines.push(`| ${c.priceRocPeriod} | ${c.volWindow} | ${c.priceThreshold} | ${c.volZThreshold} | ${c.maxHold} | ${m.trades} | ${m.totalPnl.toFixed(6)} | ${m.sharpe.toFixed(2)} | ${ci.lo.toFixed(6)} | ${ci.hi.toFixed(6)} | ${verdict} |`);
  }
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  lines.push(`**OOS PASS: ${passCount}/${totalWithOOS}** (of ${grid.length} total configs)`);
  lines.push('');
  lines.push('Pass criteria: >=5 OOS trades, Sharpe > 0, CI lower bound > 0');
  lines.push('');
  if (passCount === 0) {
    lines.push('**Hypothesis #14 FALSIFIED** — no config survives OOS validation.');
  } else {
    lines.push(`**Hypothesis #14 SURVIVES** — ${passCount} config(s) pass OOS.`);
  }
  lines.push('');
  lines.push('## Key Statistics');
  lines.push('');
  lines.push(`- Candles analyzed: ${candles.length}`);
  lines.push(`- Configs swept: ${grid.length}`);
  lines.push(`- Volume mean: ${volMean.toFixed(2)}`);
  lines.push(`- Volume std: ${volStd.toFixed(2)}`);
  lines.push(`- Train/Test split: 65%/35%`);
  lines.push(`- Bootstrap resamples: ${BOOTSTRAP_RESAMPLES}`);
  lines.push(`- Stress mode: ${STRESS_MODE}`);
  lines.push('');
  // Signal stats
  let shortSignals = 0, longSignals = 0;
  for (const r of results.slice(0, 1)) {
    const cfg = r.cfg;
    const sigs = precomputeSignals(candles, cfg.priceRocPeriod, cfg.volWindow);
    const warmup = Math.max(cfg.priceRocPeriod, cfg.volWindow);
    for (let i = warmup; i < sigs.length; i++) {
      if (sigs[i].priceROC > cfg.priceThreshold && sigs[i].volZ < -cfg.volZThreshold) shortSignals++;
      else if (sigs[i].priceROC < -cfg.priceThreshold && sigs[i].volZ < -cfg.volZThreshold) longSignals++;
    }
  }
  lines.push(`- Sample signal counts (first config): SHORT=${shortSignals}, LONG=${longSignals}`);
  lines.push('');
  lines.push('---');
  lines.push(`*Generated ${new Date().toISOString().slice(0, 10)} by volume-price-divergence.ts*`);
  return lines.join('\n');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
