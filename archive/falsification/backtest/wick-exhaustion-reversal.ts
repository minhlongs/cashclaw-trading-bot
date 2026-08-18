#!/usr/bin/env npx tsx
// Hypothesis #24 — Wick Exhaustion Reversal
// Large candle wicks (price rejection) on consecutive bars signal exhaustion → mean reversion.
// LONG when downside wicks reject lower levels; SHORT when upside wicks reject higher levels.
// Usage: npx tsx src/forest/backtest/wick-exhaustion-reversal.ts

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
const BLOCK_LEN = 3;

const GRID: Config[] = [];
for (const wickThreshold of [0.5, 0.6, 0.7]) {
  for (const lookbackCandles of [3, 5]) {
    for (const deviationFromSMA of [0.02, 0.05]) {
      for (const maxHold of [6, 12]) {
        GRID.push({ wickThreshold, lookbackCandles, deviationFromSMA, maxHold });
      }
    }
  }
}

interface Config { wickThreshold: number; lookbackCandles: number; deviationFromSMA: number; maxHold: number }
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

function runBacktest(candles: Candle[], cfg: Config, costCfg: CostConfig): Trade[] {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const sma = new Array(candles.length).fill(0);
  const smaPeriod = 20;
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += closes[i];
    if (i >= smaPeriod) sum -= closes[i - smaPeriod];
    sma[i] = i >= smaPeriod - 1 ? sum / smaPeriod : closes[i];
  }

  const trades: Trade[] = [];
  const warmup = Math.max(smaPeriod, cfg.lookbackCandles) + 1;
  let i = warmup;
  while (i < candles.length) {
    const range = highs[i] - lows[i];
    if (range <= 0) { i++; continue; }
    const wickRatio = Math.max(highs[i] - closes[i], closes[i] - lows[i]) / range;
    const isDownWick = closes[i] < (highs[i] + lows[i]) / 2; // close in lower half = downside wick

    // Count consecutive candles with wickRatio > threshold
    let consec = 0;
    let j = i;
    while (j >= warmup) {
      const r = highs[j] - lows[j];
      if (r <= 0) break;
      const wr = Math.max(highs[j] - closes[j], closes[j] - lows[j]) / r;
      if (wr < cfg.wickThreshold) break;
      consec++;
      j--;
    }

    if (consec >= cfg.lookbackCandles) {
      const deviation = Math.abs(closes[i] - sma[i]) / sma[i];
      if (deviation > cfg.deviationFromSMA) {
        let side: 'long' | 'short' | null = null;
        // LONG if wicks are on the downside (price rejecting lower levels)
        if (isDownWick) side = 'long';
        else side = 'short';

        const entryIdx = i;
        const entryPrice = closes[i];
        let exitIdx = Math.min(i + cfg.maxHold, candles.length - 1);
        const exitPrice = closes[exitIdx];
        const qty = INITIAL_CAPITAL / entryPrice;
        const gross = side === 'long' ? (exitPrice - entryPrice) * qty : (entryPrice - exitPrice) * qty;
        const costed = applyCosts(gross, entryPrice * qty, costCfg);
        trades.push({ entryIdx, exitIdx, side, entryPrice, exitPrice, netPnl: costed.netPnl });
        i = exitIdx + 1;
        continue;
      }
    }
    i++;
  }
  return trades;
}

async function main(): Promise<void> {
  const costCfg = resolveStressConfig('conservative');
  const endMs = PINNED_END_MS;
  const startMs = endMs - LOOKBACK_DAYS * DAY_MS;
  console.error(`Fetching ${SYMBOL} ${INTERVAL} candles...`);
  const candles = await fetchOHLCV('binance', SYMBOL, INTERVAL, startMs, endMs);
  console.error(`Fetched ${candles.length} candles.`);
  if (candles.length < 60) throw new Error('Insufficient data');

  const results: { cfg: Config; full: Metrics; oos: Metrics | null; oosCI: { lo: number; hi: number; mid: number } | null; oosPass: boolean }[] = [];
  const splitIdx = Math.floor(candles.length * OOS_TRAIN_RATIO);

  for (const cfg of GRID) {
    const fullTrades = runBacktest(candles, cfg, costCfg);
    const full = computeMetrics(fullTrades);
    const oosTrades = runBacktest(candles.slice(splitIdx), cfg, costCfg);
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

  const reportPath = resolve(process.cwd(), 'plans/reports/wick-exhaustion-reversal.md');
  const lines: string[] = [
    '# Hypothesis #24: Wick Exhaustion Reversal — SOLUSDT 8h\n',
    '## Strategy Description\n',
    'Large candle wicks (price rejection) on consecutive bars signal exhaustion → mean reversion.',
    '- LONG when downside wicks reject lower levels (price rejecting lower levels)',
    '- SHORT when upside wicks reject higher levels (price rejecting higher levels)',
    `- Data: SOLUSDT 8h, ${candles.length} candles, pinned end-date 2025-09-19`,
    `- Sweep: ${GRID.length} configs\n`,
    '## OOS Results\n',
    '| wickThr | lookback | devSMA | maxHold | trades | PnL | Sharpe | CI_lo | CI_hi | Verdict |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  const sorted = [...results].filter(r => r.oos && r.oos.trades > 0 && r.oosCI).sort((a, b) => (b.oosCI!.lo ?? -Infinity) - (a.oosCI!.lo ?? -Infinity));
  for (const r of sorted) {
    const m = r.oos!;
    const c = r.cfg;
    const ci = r.oosCI!;
    lines.push(`| ${c.wickThreshold} | ${c.lookbackCandles} | ${c.deviationFromSMA} | ${c.maxHold} | ${m.trades} | $${m.totalPnl.toFixed(0)} | ${m.sharpe.toFixed(2)} | $${ci.lo.toFixed(0)} | $${ci.hi.toFixed(0)} | ${r.oosPass ? 'PASS' : 'FAIL'} |`);
  }
  lines.push(`\n## Verdict\n\n**OOS PASS: ${passCount}/${GRID.length}**`);
  if (passCount === 0) lines.push('**FALSIFIED.** Wick exhaustion reversal does not produce OOS alpha.');
  else lines.push(`**${passCount} config(s) pass OOS.** Requires walk-forward verification.`);
  lines.push('\n---\n*Generated by wick-exhaustion-reversal.ts*');

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, lines.join('\n'));
  console.error(`Report written to ${reportPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });