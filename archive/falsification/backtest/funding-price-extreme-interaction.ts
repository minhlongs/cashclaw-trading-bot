#!/usr/bin/env npx tsx
// Hypothesis #27 — Funding × Price Extreme Interaction
// Extreme funding AND extreme price → forced positioning unwinds predictably.
// SHORT when funding>threshold AND z-score>priceSigma (fade crowded longs at price extreme)
// LONG when funding<-threshold AND z-score<-priceSigma (fade crowded shorts at price extreme)
// Usage: npx tsx src/forest/backtest/funding-price-extreme-interaction.ts

import { resolveStressConfig, applyCosts, type CostConfig } from './cost-model';
import { fetchOHLCV } from './data-fetcher';
import type { Candle } from './ohlcv';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';

const SYMBOL = process.argv[2] || 'SOLUSDT';
const INTERVAL = '8h';
const LOOKBACK_DAYS = 730;
const PINNED_END_MS = new Date(process.argv[3] || '2025-09-19T00:00:00Z').getTime();
const DAY_MS = 86_400_000;
const H8 = 8 * 3600_000;
const OOS_TRAIN_RATIO = 0.65;
const INITIAL_CAPITAL = 10_000;
const BOOTSTRAP_RESAMPLES = 1000;
const BLOCK_LEN = 3;

const GRID: Config[] = [];
for (const fundingThreshold of [0.0003, 0.0005, 0.0008]) {
  for (const priceSigma of [1.5, 2.0, 2.5]) {
    for (const maxHold of [6, 12, 24]) {
      GRID.push({ fundingThreshold, priceSigma, maxHold });
    }
  }
}

interface Config { fundingThreshold: number; priceSigma: number; maxHold: number }
interface FP { ts: number; rate: number }
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

async function fetchFunding(sym: string): Promise<FP[]> {
  const all: FP[] = [], from = PINNED_END_MS - LOOKBACK_DAYS * 86_400_000;
  let cur = PINNED_END_MS;
  while (cur > from) {
    const p = new URLSearchParams({ symbol: sym, startTime: String(Math.max(from, cur - 1000 * H8)), endTime: String(cur), limit: '1000' });
    const r = await fetch(`https://fapi.binance.com/fapi/v1/fundingRate?${p}`);
    if (!r.ok) throw new Error(`[${r.status}] funding`);
    const d = await r.json() as Array<{ fundingTime: number; fundingRate: string }>;
    if (!d.length) break;
    for (const x of d) all.unshift({ ts: x.fundingTime, rate: parseFloat(x.fundingRate) });
    cur = d[0].fundingTime - 1;
    await new Promise(r => setTimeout(r, 120));
  }
  return all;
}

function runBacktest(candles: Candle[], fp: FP[], cfg: Config, costCfg: CostConfig): Trade[] {
  const closes = candles.map(c => c.close);
  const sma = new Array(candles.length).fill(0);
  const rollingStd = new Array(candles.length).fill(0);
  const smaPeriod = 40;
  let sum = 0, sumSq = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += closes[i];
    sumSq += closes[i] * closes[i];
    if (i >= smaPeriod) {
      sum -= closes[i - smaPeriod];
      sumSq -= closes[i - smaPeriod] * closes[i - smaPeriod];
    }
    sma[i] = i >= smaPeriod - 1 ? sum / smaPeriod : closes[i];
    if (i >= smaPeriod - 1) {
      const mean = sum / smaPeriod;
      const variance = Math.max(sumSq / smaPeriod - mean * mean, 0);
      rollingStd[i] = Math.sqrt(variance);
    }
  }

  const cm = new Map<number, number>(candles.map((c, idx) => [c.timestamp, idx]));
  const trades: Trade[] = [];
  const warmup = smaPeriod;
  for (let i = warmup; i < candles.length; i++) {
    if (rollingStd[i] <= 0) continue;
    const zScore = (closes[i] - sma[i]) / rollingStd[i];
    const idx = cm.get(fp[i]?.ts ?? 0);
    const rate = fp[i]?.rate;
    if (rate === undefined) continue;

    let side: 'long' | 'short' | null = null;
    // SHORT when funding>threshold AND z-score>priceSigma (fade crowded longs at price extreme)
    if (rate > cfg.fundingThreshold && zScore > cfg.priceSigma) side = 'short';
    // LONG when funding<-threshold AND z-score<-priceSigma (fade crowded shorts at price extreme)
    else if (rate < -cfg.fundingThreshold && zScore < -cfg.priceSigma) side = 'long';
    if (!side) continue;

    const entryIdx = i;
    const entryPrice = closes[i];
    let exitIdx = Math.min(i + cfg.maxHold, candles.length - 1);
    const exitPrice = closes[exitIdx];
    const qty = INITIAL_CAPITAL / entryPrice;
    const gross = side === 'long' ? (exitPrice - entryPrice) * qty : (entryPrice - exitPrice) * qty;
    const costed = applyCosts(gross, entryPrice * qty, costCfg);
    trades.push({ entryIdx, exitIdx, side, entryPrice, exitPrice, netPnl: costed.netPnl });
  }
  return trades;
}

async function main(): Promise<void> {
  const costCfg = resolveStressConfig('conservative');
  console.error(`Fetching ${SYMBOL} funding + candles...`);
  const [candles, fp] = await Promise.all([
    fetchOHLCV('binance', SYMBOL, INTERVAL, PINNED_END_MS - LOOKBACK_DAYS * 86_400_000, PINNED_END_MS),
    fetchFunding(SYMBOL),
  ]);
  console.error(`Fetched ${candles.length} candles | ${fp.length} funding periods.`);
  if (candles.length < 60 || fp.length < 60) throw new Error('Insufficient data');

  const results: { cfg: Config; full: Metrics; oos: Metrics | null; oosCI: { lo: number; hi: number; mid: number } | null; oosPass: boolean }[] = [];
  const splitIdx = Math.floor(candles.length * OOS_TRAIN_RATIO);

  for (const cfg of GRID) {
    const fullTrades = runBacktest(candles, fp, cfg, costCfg);
    const full = computeMetrics(fullTrades);
    const oosTrades = runBacktest(candles.slice(splitIdx), fp.slice(splitIdx), cfg, costCfg);
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

  const reportPath = resolve(process.cwd(), `plans/reports/funding-price-extreme-interaction-${SYMBOL.toLowerCase()}-${PINNED_END_MS}.md`);
  const lines: string[] = [
    '# Hypothesis #27: Funding × Price Extreme Interaction — SOLUSDT 8h\n',
    '## Strategy Description\n',
    'Extreme funding AND extreme price → forced positioning unwinds predictably.',
    '- SHORT when funding>threshold AND z-score>priceSigma (fade crowded longs at price extreme)',
    '- LONG when funding<-threshold AND z-score<-priceSigma (fade crowded shorts at price extreme)',
    `- Data: SOLUSDT 8h, ${candles.length} candles + ${fp.length} funding periods, pinned end-date 2025-09-19`,
    `- Sweep: ${GRID.length} configs\n`,
    '## OOS Results\n',
    '| fundThr | priceSig | maxHold | trades | PnL | Sharpe | CI_lo | CI_hi | Verdict |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  const sorted = [...results].filter(r => r.oos && r.oos.trades > 0 && r.oosCI).sort((a, b) => (b.oosCI!.lo ?? -Infinity) - (a.oosCI!.lo ?? -Infinity));
  for (const r of sorted) {
    const m = r.oos!;
    const c = r.cfg;
    const ci = r.oosCI!;
    lines.push(`| ${c.fundingThreshold} | ${c.priceSigma} | ${c.maxHold} | ${m.trades} | $${m.totalPnl.toFixed(0)} | ${m.sharpe.toFixed(2)} | $${ci.lo.toFixed(0)} | $${ci.hi.toFixed(0)} | ${r.oosPass ? 'PASS' : 'FAIL'} |`);
  }
  lines.push(`\n## Verdict\n\n**OOS PASS: ${passCount}/${GRID.length}**`);
  if (passCount === 0) lines.push('**FALSIFIED.** Funding × price extreme interaction does not produce OOS alpha.');
  else lines.push(`**${passCount} config(s) pass OOS.** Requires walk-forward verification.`);
  lines.push('\n---\n*Generated by funding-price-extreme-interaction.ts*');

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, lines.join('\n'));
  console.error(`Report written to ${reportPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });