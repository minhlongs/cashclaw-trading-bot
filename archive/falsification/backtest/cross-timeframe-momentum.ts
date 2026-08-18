#!/usr/bin/env npx tsx
// Cross-Timeframe Momentum Confirmation — SOLUSDT
//
// Hypothesis #13: Only take 8h trades when the higher-timeframe trend confirms.
// Compute daily-equivalent SMA slope from 8h candles (SMA period in 8h bars).
// LONG: 8h ROC > threshold AND daily SMA rising. SHORT: 8h ROC < -threshold AND daily SMA falling.
//
// Usage: npx tsx src/forest/backtest/cross-timeframe-momentum.ts

import { resolveStressConfig, applyCosts, type CostConfig } from './cost-model';
import { fetchOHLCV } from './data-fetcher';
import type { Candle } from './ohlcv';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';

const SYMBOL = 'SOLUSDT';
const INTERVAL = '8h';
const LOOKBACK_DAYS = 730;
const PINNED_END_MS = new Date('2025-09-19T00:00:00Z').getTime();
const DAY_MS = 86_400_000;
const OOS_TRAIN_RATIO = 0.65;
const INITIAL_CAPITAL = 10_000;
const BOOTSTRAP_RESAMPLES = 1000;
const BLOCK_LEN = 5;

// Reduced sweep: 48 configs
const GRID: Config[] = [];
for (const dailySma of [3, 10]) {
  for (const rocPeriod of [3, 12]) {
    for (const longThr of [0.01, 0.03]) {
      for (const shortThr of [-0.03, -0.01]) {
        for (const maxHold of [6, 12, 24]) {
          GRID.push({ dailySma, rocPeriod, longThr, shortThr, maxHold });
        }
      }
    }
  }
}

interface Config { dailySma: number; rocPeriod: number; longThr: number; shortThr: number; maxHold: number }

// SMA of close prices, period in 8h bars
function sma(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    out.push(sum / period);
  }
  return out;
}

// ROC over N bars
function roc(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period) { out.push(null); continue; }
    out.push((closes[i] - closes[i - period]) / closes[i - period]);
  }
  return out;
}

function runBacktest(candles: Candle[], cfg: Config, costCfg: CostConfig): Trade[] {
  const closes = candles.map(c => c.close);
  const smaVals = sma(closes, cfg.dailySma);
  const rocVals = roc(closes, cfg.rocPeriod);
  const warmup = Math.max(cfg.dailySma, cfg.rocPeriod) + 1;
  const trades: Trade[] = [];
  let i = warmup;
  while (i < candles.length) {
    const smaNow = smaVals[i];
    const smaPrev = smaVals[i - 1];
    const r = rocVals[i];
    if (smaNow === null || smaPrev === null || r === null) { i++; continue; }
    const smaRising = smaNow > smaPrev;
    let side: 'long' | 'short' | null = null;
    if (r > cfg.longThr && smaRising) side = 'long';
    else if (r < cfg.shortThr && !smaRising) side = 'short';
    if (!side) { i++; continue; }
    const entryIdx = i;
    const entryPrice = candles[i].close;
    let exitIdx = Math.min(i + cfg.maxHold, candles.length - 1);
    const exitPrice = candles[exitIdx].close;
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
  console.error(`Fetching ${SYMBOL} ${INTERVAL} candles from ${new Date(startMs).toISOString().slice(0, 10)} to ${new Date(endMs).toISOString().slice(0, 10)}...`);
  const candles = await fetchOHLCV('binance', SYMBOL, INTERVAL, startMs, endMs);
  console.error(`Fetched ${candles.length} candles.`);
  if (candles.length < 60) throw new Error('Insufficient data');

  const results: { cfg: Config; full: Metrics; oos: Metrics | null; oosCI: { lo: number; hi: number; mid: number } | null; oosPass: boolean }[] = [];
  const splitIdx = Math.floor(candles.length * OOS_TRAIN_RATIO);

  for (const cfg of GRID) {
    const fullTrades = runBacktest(candles, cfg, costCfg);
    const full = computeMetrics(fullTrades);
    const oosCandles = candles.slice(splitIdx);
    const oosTrades = runBacktest(oosCandles, cfg, costCfg);
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

  // Write report
  const reportPath = resolve(process.cwd(), 'plans/reports/cross-timeframe-momentum.md');
  const lines: string[] = [
    '# Hypothesis #13: Cross-Timeframe Momentum Confirmation — SOLUSDT 8h\n',
    '## Strategy Description\n',
    'Only take 8h momentum trades when daily-equivalent SMA slope confirms the trend.',
    '- LONG: 8h ROC > threshold AND daily SMA rising',
    '- SHORT: 8h ROC < -threshold AND daily SMA falling',
    `- Data: SOLUSDT 8h, ${candles.length} candles, pinned end-date 2025-09-19`,
    `- Sweep: ${GRID.length} configs\n`,
    '## OOS Results\n',
    '| dailySma | rocPeriod | longThr | shortThr | maxHold | trades | PnL | Sharpe | CI_lo | CI_hi | Verdict |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  const sorted = [...results].filter(r => r.oos && r.oos.trades > 0).sort((a, b) => (b.oosCI?.lo ?? -Infinity) - (a.oosCI?.lo ?? -Infinity));
  for (const r of sorted) {
    const m = r.oos!;
    const c = r.cfg;
    const ci = r.oosCI!;
    lines.push(`| ${c.dailySma} | ${c.rocPeriod} | ${c.longThr} | ${c.shortThr} | ${c.maxHold} | ${m.trades} | $${m.totalPnl.toFixed(0)} | ${m.sharpe.toFixed(2)} | $${ci.lo.toFixed(0)} | $${ci.hi.toFixed(0)} | ${r.oosPass ? 'PASS' : 'FAIL'} |`);
  }
  lines.push(`\n## Verdict\n\n**OOS PASS: ${passCount}/${GRID.length}**`);
  if (passCount === 0) lines.push('**FALSIFIED.** Cross-timeframe momentum confirmation does not produce OOS alpha.');
  else lines.push(`**${passCount} config(s) pass OOS.** Requires walk-forward verification before claiming edge.`);
  lines.push('\n---\n*Generated by cross-timeframe-momentum.ts*');

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, lines.join('\n'));
  console.error(`Report written to ${reportPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
