#!/usr/bin/env npx tsx
// Walk-forward validation for Funding x Price Extreme Interaction
// 6 rolling windows, 548-day train / 182-day test, 27-config grid
// Usage: npx tsx src/forest/backtest/funding-price-extreme-walkforward.ts [SYMBOL] [END_DATE]

import { resolveStressConfig, applyCosts, type CostConfig } from './cost-model';
import { fetchOHLCV } from './data-fetcher';
import type { Candle } from './ohlcv';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';

const SYMBOL = process.argv[2] || 'SOLUSDT';
const INTERVAL = '8h';
const PINNED_END_MS = new Date(process.argv[3] || '2025-09-19T00:00:00Z').getTime();
const H8 = 8 * 3600_000;
const DAY_MS = 86_400_000;
const TRAIN_DAYS = 548;
const TEST_DAYS = 182;
const STEP_DAYS = 182;
const INITIAL_CAPITAL = 10_000;
const BOOTSTRAP_RESAMPLES = 1000;

interface Config { fundingThreshold: number; priceSigma: number; maxHold: number }
interface FP { ts: number; rate: number }
interface Trade { entryIdx: number; exitIdx: number; side: 'long' | 'short'; entryPrice: number; exitPrice: number; netPnl: number }
interface Metrics { trades: number; totalPnl: number; winRate: number; sharpe: number; profitFactor: number; maxDrawdown: number }
interface WindowDef { idx: number; trainStart: number; trainEnd: number; testStart: number; testEnd: number }
interface WindowResult { cfg: Config; oosMetrics: Metrics; oosCI: { lo: number; mid: number; hi: number } | null; pass: boolean }

const GRID: Config[] = [];
for (const ft of [0.0003, 0.0005, 0.0008]) for (const ps of [1.5, 2.0, 2.5]) for (const mh of [6, 12, 24]) GRID.push({ fundingThreshold: ft, priceSigma: ps, maxHold: mh });

function computeMetrics(trades: Trade[]): Metrics {
  if (!trades.length) return { trades: 0, totalPnl: 0, winRate: 0, sharpe: 0, profitFactor: 0, maxDrawdown: 0 };
  const pnls = trades.map(t => t.netPnl);
  const wins = pnls.filter(p => p > 0), losses = pnls.filter(p => p <= 0);
  const totalPnl = pnls.reduce((a, b) => a + b, 0);
  const winRate = wins.length / pnls.length;
  let cum = 0, peak = 0, maxDD = 0;
  for (const p of pnls) { cum += p; if (cum > peak) peak = cum; const dd = peak - cum; if (dd > maxDD) maxDD = dd; }
  const mean = totalPnl / pnls.length;
  const variance = pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / Math.max(pnls.length - 1, 1);
  const sharpe = variance > 0 ? (mean / Math.sqrt(variance)) * Math.sqrt(pnls.length) : 0;
  const grossW = wins.reduce((a, b) => a + b, 0), grossL = Math.abs(losses.reduce((a, b) => a + b, 0));
  return { trades: pnls.length, totalPnl, winRate, sharpe, profitFactor: grossL > 0 ? grossW / grossL : grossW > 0 ? Infinity : 0, maxDrawdown: maxDD };
}

function bootstrapCI(trades: Trade[], resamples: number, blockLen: number): { lo: number; mid: number; hi: number } {
  const pnls = trades.map(t => t.netPnl);
  const n = pnls.length, bl = Math.min(blockLen, n);
  const means: number[] = [];
  for (let r = 0; r < resamples; r++) {
    const sample: number[] = [];
    while (sample.length < n) {
      const start = Math.floor(Math.random() * (n - bl + 1));
      for (let b = 0; b < bl && sample.length < n; b++) sample.push(pnls[start + b]);
    }
    means.push(sample.reduce((a, b) => a + b, 0) / sample.length);
  }
  means.sort((a, b) => a - b);
  return { lo: means[Math.floor(resamples * 0.025)], mid: means[Math.floor(resamples * 0.5)], hi: means[Math.floor(resamples * 0.975)] };
}

async function fetchFunding(sym: string, startMs: number, endMs: number): Promise<FP[]> {
  const all: FP[] = [];
  let cur = endMs;
  while (cur > startMs) {
    const p = new URLSearchParams({ symbol: sym, startTime: String(Math.max(startMs, cur - 1000 * H8)), endTime: String(cur), limit: '1000' });
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
    sum += closes[i]; sumSq += closes[i] * closes[i];
    if (i >= smaPeriod) { sum -= closes[i - smaPeriod]; sumSq -= closes[i - smaPeriod] * closes[i - smaPeriod]; }
    sma[i] = i >= smaPeriod - 1 ? sum / smaPeriod : closes[i];
    if (i >= smaPeriod - 1) { const mean = sum / smaPeriod; rollingStd[i] = Math.sqrt(Math.max(sumSq / smaPeriod - mean * mean, 0)); }
  }
  const trades: Trade[] = [];
  for (let i = smaPeriod; i < candles.length; i++) {
    if (rollingStd[i] <= 0) continue;
    const zScore = (closes[i] - sma[i]) / rollingStd[i];
    const rate = fp[i]?.rate;
    if (rate === undefined || isNaN(rate)) continue;
    let side: 'long' | 'short' | null = null;
    if (rate > cfg.fundingThreshold && zScore > cfg.priceSigma) side = 'short';
    else if (rate < -cfg.fundingThreshold && zScore < -cfg.priceSigma) side = 'long';
    if (!side) continue;
    const entryPrice = closes[i];
    const exitIdx = Math.min(i + cfg.maxHold, candles.length - 1);
    const exitPrice = closes[exitIdx];
    const qty = INITIAL_CAPITAL / entryPrice;
    const gross = side === 'long' ? (exitPrice - entryPrice) * qty : (entryPrice - exitPrice) * qty;
    trades.push({ entryIdx: i, exitIdx, side, entryPrice, exitPrice, netPnl: applyCosts(gross, entryPrice * qty, costCfg).netPnl });
  }
  return trades;
}

function computeWindows(totalDays: number): WindowDef[] {
  const windows: WindowDef[] = [];
  for (let i = 0; ; i++) {
    const trainStart = i * STEP_DAYS, trainEnd = trainStart + TRAIN_DAYS;
    const testStart = trainEnd, testEnd = testStart + TEST_DAYS;
    if (testEnd > totalDays) break;
    windows.push({ idx: i + 1, trainStart, trainEnd, testStart, testEnd });
  }
  return windows;
}

function dayOffsetToIdx(candles: Candle[], dayOffset: number): number {
  const targetTs = candles[0].timestamp + dayOffset * DAY_MS;
  let lo = 0, hi = candles.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (candles[mid].timestamp <= targetTs) lo = mid; else hi = mid - 1; }
  return lo;
}

function alignFunding(candles: Candle[], fp: FP[]): FP[] {
  const fpTs = fp.map(f => f.ts);
  return candles.map(c => {
    let lo = 0, hi = fpTs.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (fpTs[mid] < c.timestamp) lo = mid + 1; else hi = mid; }
    let bestFi = lo < fpTs.length ? lo : fpTs.length - 1;
    if (lo > 0) { const dLo = Math.abs(fpTs[lo < fpTs.length ? lo : fpTs.length - 1] - c.timestamp); const dPrev = Math.abs(fpTs[lo - 1] - c.timestamp); if (dPrev < dLo) bestFi = lo - 1; }
    const dist = Math.abs(fpTs[bestFi] - c.timestamp);
    return dist < H8 ? fp[bestFi] : { ts: c.timestamp, rate: NaN };
  });
}

function buildReport(symbol: string, candles: Candle[], fp: FP[], windowResults: WindowResult[][], windowDateRanges: string[], totalOosTrades: number, totalOosPnl: number, allPassCount: number, cfgPassCount: Map<string, number>): string {
  const lines: string[] = [
    `# Walk-Forward Validation: Funding x Price Extreme Interaction`, '',
    '## Strategy Description', '',
    'Extreme funding AND extreme price -> forced positioning unwinds predictably.',
    '- SHORT when funding>threshold AND z-score>priceSigma (fade crowded longs at price extreme)',
    '- LONG when funding<-threshold AND z-score<-priceSigma (fade crowded shorts at price extreme)', '',
    `- Symbol: ${symbol}`, `- Candles: ${candles.length} | Funding periods: ${fp.length}`,
    `- Pinned end-date: ${new Date(PINNED_END_MS).toISOString()}`,
    `- Window config: ${TRAIN_DAYS}d train / ${TEST_DAYS}d test / ${STEP_DAYS}d step`,
    `- Cost model: conservative (17 bps total)`,
    `- Grid: ${GRID.length} configs (3 fundingThreshold x 3 priceSigma x 3 maxHold)`, '',
    '## Window Definitions', '',
    ...windowDateRanges.map(s => `- ${s}`), '',
    '## Per-Window OOS Results', '',
  ];
  for (let wi = 0; wi < windowResults.length; wi++) {
    const results = windowResults[wi];
    const passCount = results.filter(r => r.pass).length;
    lines.push(`### Window ${wi + 1} — ${passCount}/${GRID.length} PASS`, '',
      '| fundThr | priceSig | maxHold | trades | PnL | Sharpe | CI_lo | CI_hi | Verdict |',
      '|---|---|---|---|---|---|---|---|---|');
    for (const r of [...results].filter(r => r.oosMetrics.trades > 0).sort((a, b) => (b.oosCI?.lo ?? -Infinity) - (a.oosCI?.lo ?? -Infinity))) {
      const { oosMetrics: m, cfg: c, oosCI: ci } = r;
      lines.push(`| ${c.fundingThreshold} | ${c.priceSigma} | ${c.maxHold} | ${m.trades} | $${m.totalPnl.toFixed(0)} | ${m.sharpe.toFixed(2)} | ${ci ? '$' + ci.lo.toFixed(0) : 'n/a'} | ${ci ? '$' + ci.hi.toFixed(0) : 'n/a'} | ${r.pass ? 'PASS' : 'FAIL'} |`);
    }
    lines.push('');
  }
  lines.push('## Aggregated Results', '',
    `- Total OOS trades across all windows: ${totalOosTrades}`,
    `- Total OOS PnL across all windows: $${totalOosPnl.toFixed(0)}`,
    `- Total PASS results: ${allPassCount} / ${windowResults.length * GRID.length}`, '',
    '## Pass/Fail Summary', '',
    '| fundThr | priceSig | maxHold | windows PASS | Verdict |',
    '|---|---|---|---|---|');
  for (const cfg of GRID) {
    const key = `${cfg.fundingThreshold}|${cfg.priceSigma}|${cfg.maxHold}`;
    const wPass = cfgPassCount.get(key) ?? 0;
    lines.push(`| ${cfg.fundingThreshold} | ${cfg.priceSigma} | ${cfg.maxHold} | ${wPass}/${windowResults.length} | ${wPass >= 4 ? 'STRONG' : wPass >= 2 ? 'WEAK' : 'FAIL'} |`);
  }
  const anyPass = [...cfgPassCount.values()].some(c => c > 0);
  const strongCount = GRID.filter(cfg => (cfgPassCount.get(`${cfg.fundingThreshold}|${cfg.priceSigma}|${cfg.maxHold}`) ?? 0) >= 4).length;
  lines.push('', '## Go / No-Go Assessment', '',
    !anyPass ? '**NO-GO.** No config passes OOS in any window. Strategy is falsified.'
    : strongCount > 0 ? `**PRELIMINARY GO.** ${strongCount} config(s) pass >=4/6 windows. Recommended next step: out-of-sample walk-forward on unseen data.`
    : '**CONDITIONAL.** Some configs pass but none in >=4 windows. Insufficient robustness.',
    '', '---', '*Generated by funding-price-extreme-walkforward.ts*');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const costCfg = resolveStressConfig('conservative');
  const startMs = PINNED_END_MS - 1800 * DAY_MS;
  console.error(`Fetching ${SYMBOL} candles + funding...`);
  const [candles, fpUnsorted] = await Promise.all([
    fetchOHLCV('binance', SYMBOL, INTERVAL, startMs, PINNED_END_MS),
    fetchFunding(SYMBOL, startMs, PINNED_END_MS),
  ]);
  const fp = fpUnsorted.sort((a, b) => a.ts - b.ts);
  console.error(`Fetched ${candles.length} candles | ${fp.length} funding periods.`);

  const totalDays = Math.ceil((candles[candles.length - 1].timestamp - candles[0].timestamp) / DAY_MS);
  const windows = computeWindows(totalDays);
  const alignedFp = alignFunding(candles, fp);
  console.error(`${windows.length} rolling windows | TRAIN=${TRAIN_DAYS}d TEST=${TEST_DAYS}d STEP=${STEP_DAYS}d`);

  const windowResults: WindowResult[][] = [];
  const windowDateRanges: string[] = [];
  const d = (i: number) => new Date(candles[i].timestamp).toISOString().slice(0, 10);

  for (const w of windows) {
    const ts = dayOffsetToIdx(candles, w.trainStart), te = dayOffsetToIdx(candles, w.trainEnd);
    const us = dayOffsetToIdx(candles, w.testStart), ue = dayOffsetToIdx(candles, w.testEnd);
    const testCandles = candles.slice(us, ue + 1), testFp = alignedFp.slice(us, ue + 1);
    const blockLen = Math.max(1, Math.floor(testCandles.length / TEST_DAYS));
    windowDateRanges.push(`Window ${w.idx}: train [${d(ts)} .. ${d(te)}] | test [${d(us)} .. ${d(ue)}]`);

    const results: WindowResult[] = [];
    for (const cfg of GRID) {
      const oosTrades = runBacktest(testCandles, testFp, cfg, costCfg);
      const oosMetrics = oosTrades.length > 0 ? computeMetrics(oosTrades) : { trades: 0, totalPnl: 0, winRate: 0, sharpe: 0, profitFactor: 0, maxDrawdown: 0 };
      let oosCI = null, pass = false;
      if (oosMetrics.trades >= 5) { oosCI = bootstrapCI(oosTrades, BOOTSTRAP_RESAMPLES, blockLen); pass = oosMetrics.sharpe > 0 && oosCI.lo > 0; }
      results.push({ cfg, oosMetrics, oosCI, pass });
    }
    windowResults.push(results);
    console.error(`  Window ${w.idx}: ${testCandles.length} OOS candles | ${results.filter(r => r.pass).length}/${GRID.length} PASS`);
  }

  const cfgPassCount = new Map<string, number>();
  for (const wr of windowResults) for (const r of wr) {
    const key = `${r.cfg.fundingThreshold}|${r.cfg.priceSigma}|${r.cfg.maxHold}`;
    cfgPassCount.set(key, (cfgPassCount.get(key) ?? 0) + (r.pass ? 1 : 0));
  }
  const allFlat = windowResults.flat();
  const report = buildReport(SYMBOL, candles, fp, windowResults, windowDateRanges,
    allFlat.reduce((s, r) => s + r.oosMetrics.trades, 0),
    allFlat.reduce((s, r) => s + r.oosMetrics.totalPnl, 0),
    allFlat.filter(r => r.pass).length, cfgPassCount);

  const reportPath = resolve(process.cwd(), `plans/reports/funding-price-extreme-walkforward-${SYMBOL.toLowerCase()}-${PINNED_END_MS}.md`);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, report);
  console.error(`\nReport written to ${reportPath}`);
  console.log(report);
}

main().catch(e => { console.error(e); process.exit(1); });
