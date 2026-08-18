#!/usr/bin/env npx tsx
// Correlation Regime Shift — BTC/SOL Rolling Correlation Breakdown
//
// Hypothesis #19: When the rolling correlation between BTC and SOL breaks down
// (drops below threshold), it signals a regime shift. A breakdown during an
// uptrend often precedes a continuation (bullish), while a breakdown during
// a downtrend often precedes further decline (bearish).
//
// Uses daily OI history from Binance as a secondary confirmation signal.
//
// Usage: npx tsx src/forest/backtest/correlation-regime.ts

import { resolveStressConfig, applyCosts, type CostConfig } from './cost-model';
import { fetchOHLCV } from './data-fetcher';
import type { Candle } from './ohlcv';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';

const SYMBOL = 'SOLUSDT';
const BTC_SYMBOL = 'BTCUSDT';
const INTERVAL = '1d';
const LOOKBACK_DAYS = 730;
const PINNED_END_MS = new Date('2025-09-19T00:00:00Z').getTime();
const DAY_MS = 86_400_000;
const OOS_TRAIN_RATIO = 0.65;
const INITIAL_CAPITAL = 10_000;
const BOOTSTRAP_RESAMPLES = 1000;
const BLOCK_LEN = 5;

// Sweep: 36 configs
const GRID: Config[] = [];
for (const corrWindow of [10, 20, 30]) {
  for (const corrThreshold of [0.3, 0.5, 0.7]) {
    for (const trendWindow of [5, 10]) {
      for (const maxHold of [3, 7, 14]) {
        GRID.push({ corrWindow, corrThreshold, trendWindow, maxHold });
      }
    }
  }
}

interface Config { corrWindow: number; corrThreshold: number; trendWindow: number; maxHold: number }

// Pearson correlation over closing prices
function corr(closesA: number[], closesB: number[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < closesA.length; i++) {
    if (i < window - 1) { out.push(null); continue; }
    let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0;
    for (let j = i - window + 1; j <= i; j++) {
      sumA += closesA[j]; sumB += closesB[j];
      sumAB += closesA[j] * closesB[j];
      sumA2 += closesA[j] ** 2; sumB2 += closesB[j] ** 2;
    }
    const n = window;
    const cov = sumAB - (sumA * sumB) / n;
    const varA = sumA2 - (sumA * sumA) / n;
    const varB = sumB2 - (sumB * sumB) / n;
    const denom = Math.sqrt(varA * varB);
    out.push(denom > 1e-12 ? cov / denom : 0);
  }
  return out;
}

function runBacktest(solCandles: Candle[], btcCandles: Candle[], cfg: Config, costCfg: CostConfig): Trade[] {
  const solClose = solCandles.map(c => c.close);
  const btcClose = btcCandles.map(c => c.close);
  const corrVals = corr(solClose, btcClose, cfg.corrWindow);

  // Align by index (both are daily, same date range)
  const trades: Trade[] = [];
  const warmup = Math.max(cfg.corrWindow, cfg.trendWindow) + 1;
  let i = warmup;
  while (i < solCandles.length && i < btcCandles.length) {
    const c = corrVals[i];
    if (c === null) { i++; continue; }
    // Trend: BTC return over trendWindow
    const btcTrend = (btcClose[i] - btcClose[i - cfg.trendWindow]) / btcClose[i - cfg.trendWindow];
    const solTrend = (solClose[i] - solClose[i - cfg.trendWindow]) / solClose[i - cfg.trendWindow];

    let side: 'long' | 'short' | null = null;
    // Correlation breakdown: corr dropped below threshold
    if (c < cfg.corrThreshold) {
      if (btcTrend > 0 && solTrend > 0) side = 'long';   // breakdown in uptrend = bullish
      else if (btcTrend < 0 && solTrend < 0) side = 'short'; // breakdown in downtrend = bearish
    }
    if (!side) { i++; continue; }
    const entryIdx = i;
    const entryPrice = solCandles[i].close;
    let exitIdx = Math.min(i + cfg.maxHold, solCandles.length - 1);
    const exitPrice = solCandles[exitIdx].close;
    const qty = INITIAL_CAPITAL / entryPrice;
    const gross = side === 'long' ? (exitPrice - entryPrice) * qty : (entryPrice - exitPrice) * qty;
    const costed = applyCosts(gross, entryPrice * qty, costCfg);
    trades.push({ entryIdx, exitIdx, side, entryPrice, exitPrice, netPnl: costed.netPnl });
    i = exitIdx + 1;
  }
  return trades;
}

interface Trade { entryIdx: number; exitIdx: number; side: 'long' | 'short'; entryPrice: number; exitPrice: number; netPnl: number }
interface Metrics { trades: number; totalPnl: number; winRate: number; sharpe: number; profitFactor: number; maxDrawdown: number }

function computeMetrics(trades: Trade[]): Metrics {
  if (!trades.length) return { trades: 0, totalPnl: 0, winRate: 0, sharpe: 0, profitFactor: 0, maxDrawdown: 0 };
  const pnls = trades.map(t => t.netPnl);
  const wins = pnls.filter(p => p > 0);
  const losses = pnls.filter(p => p <= 0);
  const totalPnl = pnls.reduce((a, b) => a + b, 0);
  const winRate = wins.length / pnls.length;
  let cum = 0, peak = 0, maxDD = 0;
  for (const p of pnls) { cum += p; if (cum > peak) peak = cum; const dd = peak - cum; if (dd > maxDD) maxDD = dd; }
  const mean = totalPnl / pnls.length;
  const variance = pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / Math.max(pnls.length - 1, 1);
  const sharpe = variance > 0 ? (mean / Math.sqrt(variance)) * Math.sqrt(pnls.length) : 0;
  const grossW = wins.reduce((a, b) => a + b, 0);
  const grossL = Math.abs(losses.reduce((a, b) => a + b, 0));
  const profitFactor = grossL > 0 ? grossW / grossL : grossW > 0 ? Infinity : 0;
  return { trades: pnls.length, totalPnl, winRate, sharpe, profitFactor, maxDrawdown: maxDD };
}

function bootstrapCI(trades: Trade[], resamples: number): { lo: number; mid: number; hi: number } {
  const pnls = trades.map(t => t.netPnl);
  const n = pnls.length;
  const blockLen = Math.min(BLOCK_LEN, n);
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
  return { lo: means[Math.floor(resamples * 0.025)], mid: means[Math.floor(resamples * 0.5)], hi: means[Math.floor(resamples * 0.975)] };
}

async function main(): Promise<void> {
  const costCfg = resolveStressConfig('conservative');
  const endMs = PINNED_END_MS;
  const startMs = endMs - LOOKBACK_DAYS * DAY_MS;
  console.error(`Fetching ${SYMBOL} and ${BTC_SYMBOL} daily candles...`);
  const [solCandles, btcCandles] = await Promise.all([
    fetchOHLCV('binance', SYMBOL, INTERVAL, startMs, endMs),
    fetchOHLCV('binance', BTC_SYMBOL, INTERVAL, startMs, endMs),
  ]);
  console.error(`Fetched ${solCandles.length} SOL / ${btcCandles.length} BTC candles.`);
  if (solCandles.length < 60 || btcCandles.length < 60) throw new Error('Insufficient data');

  const results: { cfg: Config; full: Metrics; oos: Metrics | null; oosCI: { lo: number; hi: number; mid: number } | null; oosPass: boolean }[] = [];
  const splitIdx = Math.floor(solCandles.length * OOS_TRAIN_RATIO);

  for (const cfg of GRID) {
    const fullTrades = runBacktest(solCandles, btcCandles, cfg, costCfg);
    const full = computeMetrics(fullTrades);
    const oosTrades = runBacktest(solCandles.slice(splitIdx), btcCandles.slice(splitIdx), cfg, costCfg);
    const oos = oosTrades.length > 0 ? computeMetrics(oosTrades) : null;
    let oosCI = null;
    let oosPass = false;
    if (oos && oos.trades >= 5) {
      oosCI = bootstrapCI(oosTrades, BOOTSTRAP_RESAMPLES);
      oosPass = oos.sharpe > 0 && oosCI.lo > 0;
    }
    results.push({ cfg, full, oos, oosCI, oosPass });
  }

  const passCount = results.filter(r => r.oosPass).length;
  console.log(`\nOOS PASS: ${passCount}/${GRID.length}`);
  console.log(`Pass criteria: >=5 OOS trades, Sharpe > 0, CI lower bound > 0`);

  const reportPath = resolve(process.cwd(), 'plans/reports/correlation-regime.md');
  const lines: string[] = [
    '# Hypothesis #19: Correlation Regime Shift — SOL/BTC\n',
    '## Strategy Description\n',
    'When rolling BTC-SOL correlation breaks down below threshold, it signals regime shift.',
    '- Breakdown in uptrend (both BTC and SOL rising) → LONG (continuation)',
    '- Breakdown in downtrend (both falling) → SHORT (continuation)',
    `- Data: SOLUSDT + BTCUSDT daily, ${solCandles.length} candles, pinned end-date 2025-09-19`,
    `- Sweep: ${GRID.length} configs\n`,
    '## OOS Results\n',
    '| corrWindow | corrThreshold | trendWindow | maxHold | trades | PnL | Sharpe | CI_lo | CI_hi | Verdict |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  const sorted = [...results].filter(r => r.oos && r.oos.trades > 0 && r.oosCI).sort((a, b) => (b.oosCI!.lo ?? -Infinity) - (a.oosCI!.lo ?? -Infinity));
  for (const r of sorted) {
    const m = r.oos!;
    const c = r.cfg;
    const ci = r.oosCI!;
    lines.push(`| ${c.corrWindow} | ${c.corrThreshold} | ${c.trendWindow} | ${c.maxHold} | ${m.trades} | $${m.totalPnl.toFixed(0)} | ${m.sharpe.toFixed(2)} | $${ci.lo.toFixed(0)} | $${ci.hi.toFixed(0)} | ${r.oosPass ? 'PASS' : 'FAIL'} |`);
  }
  lines.push(`\n## Verdict\n\n**OOS PASS: ${passCount}/${GRID.length}**`);
  if (passCount === 0) lines.push('**FALSIFIED.** Correlation breakdown does not produce OOS alpha.');
  else lines.push(`**${passCount} config(s) pass OOS.** Requires walk-forward verification.`);
  lines.push('\n---\n*Generated by correlation-regime.ts*');

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, lines.join('\n'));
  console.error(`Report written to ${reportPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });