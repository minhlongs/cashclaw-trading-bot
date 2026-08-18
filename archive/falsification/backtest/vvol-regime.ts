#!/usr/bin/env npx tsx
// VVOL Regime Backtest — Volatility-of-Volatility Regime Detection
//
// Hypothesis: Extreme VVOL (vol-of-vol) spikes precede market reversals.
//   - VVOL spike on up-move = top signal (SHORT)
//   - VVOL spike on down-move = capitulation bottom (LONG)
//
// Usage: npx tsx src/forest/backtest/vvol-regime.ts

import { resolveStressConfig, applyCosts, type CostConfig } from './cost-model';
import { fetchOHLCV } from './data-fetcher';
import type { Candle } from './ohlcv';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';

// ── Types ────────────────────────────────────────────────────────────────────

interface Config {
  volWindow: number;
  vvolWindow: number;
  vvolZThreshold: number;
  priceRocThreshold: number;
  maxHold: number;
}

interface Trade {
  entryBar: number;
  exitBar: number;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  netPnl: number;
  grossPnl: number;
  fees: number;
  holdBars: number;
}

interface BacktestMetrics {
  totalTrades: number;
  winRate: number;
  netPnL: number;
  sharpe: number;
  profitFactor: number;
  maxDrawdown: number;
  bootstrapCI: [number, number];
  avgHold: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const SYMBOL = 'SOLUSDT';
const INTERVAL = '8h';
const LOOKBACK_MS = 730 * 24 * 60 * 60 * 1000;
const END_DATE = new Date('2025-09-19T00:00:00Z').getTime();
const START_DATE = END_DATE - LOOKBACK_MS;
const TRAIN_RATIO = 0.65;
const NOTIONAL = 1000;
const RESAMPLES = 1000;

const CONFIGS: Config[] = [];
for (const volWindow of [12, 24]) {
  for (const vvolWindow of [6, 12]) {
    for (const vvolZThreshold of [2.0, 3.0]) {
      for (const priceRocThreshold of [0.01, 0.03]) {
        for (const maxHold of [6, 12, 24]) {
          CONFIGS.push({ volWindow, vvolWindow, vvolZThreshold, priceRocThreshold, maxHold });
        }
      }
    }
  }
}

// ── Volatility Computation ───────────────────────────────────────────────────

function computeRealizedVol(logRets: number[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < logRets.length; i++) {
    if (i < window - 1) { out.push(null); continue; }
    const w = logRets.slice(i - window + 1, i + 1);
    const mean = w.reduce((a, b) => a + b, 0) / w.length;
    const variance = w.reduce((s, r) => s + (r - mean) ** 2, 0) / (w.length - 1);
    out.push(Math.sqrt(variance * 1095));
  }
  return out;
}

function computeVVOL(realizedVol: (number | null)[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < realizedVol.length; i++) {
    if (i < window - 1) { out.push(null); continue; }
    const vals: number[] = [];
    for (let j = i - window + 1; j <= i; j++) {
      if (realizedVol[j] !== null) vals.push(realizedVol[j]!);
    }
    if (vals.length < 2) { out.push(null); continue; }
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (vals.length - 1);
    out.push(Math.sqrt(variance));
  }
  return out;
}

// ── Bootstrap CI ─────────────────────────────────────────────────────────────

function bootstrapCI(trades: Trade[], resamples: number): [number, number] {
  if (trades.length === 0) return [0, 0];
  const pnls = trades.map(t => t.netPnl);
  const means: number[] = [];
  for (let r = 0; r < resamples; r++) {
    const sample: number[] = [];
    for (let i = 0; i < pnls.length; i++) {
      sample.push(pnls[Math.floor(Math.random() * pnls.length)]);
    }
    means.push(sample.reduce((a, b) => a + b, 0) / sample.length);
  }
  means.sort((a, b) => a - b);
  const lo = means[Math.floor(means.length * 0.025)] ?? 0;
  const hi = means[Math.floor(means.length * 0.975)] ?? 0;
  return [lo, hi];
}

// ── Metrics ──────────────────────────────────────────────────────────────────

function computeMetrics(trades: Trade[]): BacktestMetrics {
  if (trades.length === 0) {
    return { totalTrades: 0, winRate: 0, netPnL: 0, sharpe: 0, profitFactor: 0,
      maxDrawdown: 0, bootstrapCI: [0, 0], avgHold: 0 };
  }
  const wins = trades.filter(t => t.netPnl > 0);
  const losses = trades.filter(t => t.netPnl <= 0);
  const winRate = wins.length / trades.length;
  const netPnL = trades.reduce((s, t) => s + t.netPnl, 0);
  const grossWin = wins.reduce((s, t) => s + t.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
  const avgHold = trades.reduce((s, t) => s + t.holdBars, 0) / trades.length;

  // Drawdown from running PnL
  let peak = 0, maxDD = 0, cumPnl = 0;
  for (const t of trades) {
    cumPnl += t.netPnl;
    peak = Math.max(peak, cumPnl);
    maxDD = Math.max(maxDD, peak - cumPnl);
  }

  const rets = trades.map(t => t.netPnl / NOTIONAL);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const std = Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1));
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(365 / 8) : 0;

  const bootstrapCI_ = bootstrapCI(trades, RESAMPLES);
  return { totalTrades: trades.length, winRate, netPnL, sharpe, profitFactor,
    maxDrawdown: maxDD, bootstrapCI: bootstrapCI_, avgHold };
}

// ── Backtest Engine ──────────────────────────────────────────────────────────

function runBacktest(candles: Candle[], cfg: Config, costCfg: CostConfig): Trade[] {
  const closes = candles.map(c => c.close);
  const logRets: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    logRets.push(Math.log(closes[i] / closes[i - 1]));
  }

  const rVol = computeRealizedVol(logRets, cfg.volWindow);
  const vvol = computeVVOL(rVol, cfg.vvolWindow);

  // Rolling stats for VVOL z-score
  const warmup = Math.max(cfg.volWindow + cfg.vvolWindow, 48);
  const vvolSlice = vvol.slice(0, Math.max(warmup, 24)).filter((v): v is number => v !== null);
  let vvolMean = vvolSlice.length > 0 ? vvolSlice.reduce((a, b) => a + b, 0) / vvolSlice.length : 0;
  let vvolStd = vvolSlice.length > 1
    ? Math.sqrt(vvolSlice.reduce((s, v) => s + (v - vvolMean) ** 2, 0) / (vvolSlice.length - 1))
    : 1;

  const trades: Trade[] = [];
  let inPosition = false;
  let entryBar = 0;
  let entryPrice = 0;
  let side: 'LONG' | 'SHORT' = 'LONG';
  let barsSinceEntry = 0;

  for (let i = warmup; i < candles.length; i++) {
    // Update rolling VVOL stats (expanding window)
    if (vvol[i] !== null) {
      const n = vvol.slice(0, i + 1).filter((v): v is number => v !== null).length;
      const allVals = vvol.slice(0, i + 1).filter((v): v is number => v !== null);
      const oldMean = vvolMean;
      vvolMean = allVals.reduce((a, b) => a + b, 0) / allVals.length;
      vvolStd = allVals.length > 1
        ? Math.sqrt(allVals.reduce((s, v) => s + (v - vvolMean) ** 2, 0) / (allVals.length - 1))
        : vvolStd;
      // Cap STD to avoid division by tiny number
      if (vvolStd < 1e-8) vvolStd = 1;
    }

    if (inPosition) {
      barsSinceEntry++;
      const exitPrice = closes[i];
      const exitReason = barsSinceEntry >= cfg.maxHold ? 'maxHold' : 'vvolRevert';
      const currentVvol = vvol[i];
      const reverted = currentVvol !== null && currentVvol < vvolMean;
      if (barsSinceEntry >= cfg.maxHold || (barsSinceEntry > 1 && reverted)) {
        const grossPnl = side === 'LONG'
          ? (exitPrice - entryPrice) / entryPrice * NOTIONAL
          : (entryPrice - exitPrice) / entryPrice * NOTIONAL;
        const cost = applyCosts(grossPnl, NOTIONAL, costCfg);
        trades.push({
          entryBar, exitBar: i, side, entryPrice, exitPrice,
          netPnl: cost.netPnl, grossPnl, fees: cost.fees, holdBars: barsSinceEntry,
        });
        inPosition = false;
      }
      continue;
    }

    // No position — check for entry
    const vvi = vvol[i];
      const vviPrev = vvol[i - 1];
      if (vvi === null || vviPrev === null) continue;
      const zScore = (vvi - vvolMean) / vvolStd;
    if (zScore < cfg.vvolZThreshold) continue;

    const priceRoc = (closes[i] - closes[i - 12]) / closes[i - 12];
    const absRoc = Math.abs(priceRoc);

    if (absRoc < cfg.priceRocThreshold) continue;

    if (priceRoc > 0) {
      // Price up + VVOL spike = exhaustion top -> SHORT
      side = 'SHORT';
      entryBar = i;
      entryPrice = closes[i];
      inPosition = true;
      barsSinceEntry = 0;
    } else {
      // Price down + VVOL spike = capitulation bottom -> LONG
      side = 'LONG';
      entryBar = i;
      entryPrice = closes[i];
      inPosition = true;
      barsSinceEntry = 0;
    }
  }

  // Close open position at end
  if (inPosition) {
    const exitPrice = closes[closes.length - 1];
    const grossPnl = side === 'LONG'
      ? (exitPrice - entryPrice) / entryPrice * NOTIONAL
      : (entryPrice - exitPrice) / entryPrice * NOTIONAL;
    const cost = applyCosts(grossPnl, NOTIONAL, costCfg);
    trades.push({
      entryBar, exitBar: closes.length - 1, side, entryPrice, exitPrice,
      netPnl: cost.netPnl, grossPnl, fees: cost.fees, holdBars: closes.length - 1 - entryBar,
    });
  }

  return trades;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Fetching ${SYMBOL} ${INTERVAL} candles...`);
  const candles = await fetchOHLCV('binance', SYMBOL, INTERVAL, START_DATE, END_DATE);
  console.log(`Fetched ${candles.length} candles (${new Date(candles[0].timestamp).toISOString().slice(0,10)} to ${new Date(candles[candles.length-1].timestamp).toISOString().slice(0,10)})`);

  const splitIdx = Math.floor(candles.length * TRAIN_RATIO);
  const trainCandles = candles.slice(0, splitIdx);
  const testCandles = candles.slice(splitIdx);
  console.log(`Train: ${trainCandles.length} bars | Test: ${testCandles.length} bars`);

  const costCfg = resolveStressConfig('normal');

  // VVOL distribution stats (using full period)
  const fullCloses = candles.map(c => c.close);
  const fullRets: number[] = [0];
  for (let i = 1; i < fullCloses.length; i++) {
    fullRets.push(Math.log(fullCloses[i] / fullCloses[i - 1]));
  }
  const fullRVol = computeRealizedVol(fullRets, 24);
  const fullVVOL = computeVVOL(fullRVol, 12);
  const vvolVals = fullVVOL.filter((v): v is number => v !== null);
  const vvolMean = vvolVals.reduce((a, b) => a + b, 0) / vvolVals.length;
  const vvolStd = Math.sqrt(vvolVals.reduce((s, v) => s + (v - vvolMean) ** 2, 0) / (vvolVals.length - 1));
  const vvolMin = Math.min(...vvolVals);
  const vvolMax = Math.max(...vvolVals);

  console.log(`VVOL distribution: mean=${vvolMean.toFixed(6)} std=${vvolStd.toFixed(6)} min=${vvolMin.toFixed(6)} max=${vvolMax.toFixed(6)}`);
  console.log(`Running ${CONFIGS.length} configurations...`);

  const results: Array<{ cfg: Config; train: BacktestMetrics; test: BacktestMetrics }> = [];

  for (const cfg of CONFIGS) {
    const trainTrades = runBacktest(trainCandles, cfg, costCfg);
    const testTrades = runBacktest(testCandles, cfg, costCfg);
    const trainM = computeMetrics(trainTrades);
    const testM = computeMetrics(testTrades);
    results.push({ cfg, train: trainM, test: testM });
  }

  // Sort by test PnL
  results.sort((a, b) => b.test.netPnL - a.test.netPnL);

  // OOS pass criteria
  const passResults = results.filter(r =>
    r.test.totalTrades >= 5 &&
    r.test.sharpe > 0 &&
    r.test.bootstrapCI[0] > 0
  );

  console.log(`\nOOS PASS: ${passResults.length} / ${CONFIGS.length}`);

  // ── Report ───────────────────────────────────────────────────────────────

  const lines: string[] = [];
  lines.push('# VVOL Regime Backtest Report');
  lines.push('');
  lines.push('## Hypothesis');
  lines.push('');
  lines.push('VVOL (volatility-of-volatility) spikes precede market reversals.');
  lines.push('SHORT when VVOL spikes on up-move (exhaustion top).');
  lines.push('LONG when VVOL spikes on down-move (capitulation bottom).');
  lines.push('');
  lines.push('## VVOL Distribution (full period, volWindow=24, vvolWindow=12)');
  lines.push('');
  lines.push(`| Stat | Value |`);
  lines.push(`|------|-------|`);
  lines.push(`| Mean | ${vvolMean.toFixed(6)} |`);
  lines.push(`| Std  | ${vvolStd.toFixed(6)} |`);
  lines.push(`| Min  | ${vvolMin.toFixed(6)} |`);
  lines.push(`| Max  | ${vvolMax.toFixed(6)} |`);
  lines.push(`| Count | ${vvolVals.length} |`);
  lines.push('');

  lines.push('## Configuration');
  lines.push('');
  lines.push(`- Symbol: ${SYMBOL} ${INTERVAL}`);
  lines.push(`- Period: ${new Date(candles[0].timestamp).toISOString().slice(0,10)} to ${new Date(candles[candles.length-1].timestamp).toISOString().slice(0,10)} (${candles.length} bars)`);
  lines.push(`- Train/Test split: ${(TRAIN_RATIO*100).toFixed(0)}%/${((1-TRAIN_RATIO)*100).toFixed(0)}%`);
  lines.push(`- Train: ${trainCandles.length} bars | Test: ${testCandles.length} bars`);
  lines.push(`- Total configs: ${CONFIGS.length}`);
  lines.push(`- Cost model: ${costCfg.feePct*10000}bps fee, ${costCfg.slipPct*10000}bps slip, ${costCfg.marketImpactPct*10000}bps impact`);
  lines.push(`- Notional: $${NOTIONAL}`);
  lines.push(`- Bootstrap resamples: ${RESAMPLES}`);
  lines.push('');

  lines.push('## Full Period Results (Top 10 by PnL)');
  lines.push('');
  lines.push('| # | volWindow | vvolWindow | zThr | rocThr | maxHold | Trades | WinRate | PnL | Sharpe | PF | MaxDD |');
  lines.push('|---|-----------|-----------|------|--------|---------|--------|---------|-----|--------|----|-------|');
  const top10 = results.slice(0, 10);
  for (let i = 0; i < top10.length; i++) {
    const r = top10[i];
    lines.push(`| ${i+1} | ${r.cfg.volWindow} | ${r.cfg.vvolWindow} | ${r.cfg.vvolZThreshold} | ${r.cfg.priceRocThreshold} | ${r.cfg.maxHold} | ${r.train.totalTrades} | ${(r.train.winRate*100).toFixed(1)}% | $${r.train.netPnL.toFixed(2)} | ${r.train.sharpe.toFixed(2)} | ${r.train.profitFactor.toFixed(2)} | $${r.train.maxDrawdown.toFixed(2)} |`);
  }
  lines.push('');

  lines.push('## OOS Results (All Configs)');
  lines.push('');
  lines.push('| # | volWindow | vvolWindow | zThr | rocThr | maxHold | Trades | WinRate | PnL | Sharpe | CI Lo | CI Hi | Verdict |');
  lines.push('|---|-----------|-----------|------|--------|---------|--------|---------|-----|--------|-------|-------|---------|');
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const isPass = r.test.totalTrades >= 5 && r.test.sharpe > 0 && r.test.bootstrapCI[0] > 0;
    const isMarg = r.test.totalTrades >= 5 && r.test.sharpe > 0 && !isPass;
    const verdict = isPass ? 'PASS' : isMarg ? 'MARG' : 'FAIL';
    lines.push(`| ${i+1} | ${r.cfg.volWindow} | ${r.cfg.vvolWindow} | ${r.cfg.vvolZThreshold} | ${r.cfg.priceRocThreshold} | ${r.cfg.maxHold} | ${r.test.totalTrades} | ${(r.test.winRate*100).toFixed(1)}% | $${r.test.netPnL.toFixed(2)} | ${r.test.sharpe.toFixed(2)} | $${r.test.bootstrapCI[0].toFixed(2)} | $${r.test.bootstrapCI[1].toFixed(2)} | ${verdict} |`);
  }
  lines.push('');

  lines.push('## Verdict');
  lines.push('');
  lines.push(`- OOS PASS: **${passResults.length} / ${CONFIGS.length}**`);
  if (passResults.length === 0) {
    lines.push('');
    lines.push('**No configurations passed OOS criteria.** VVOL regime detection does not produce reliable reversal signals on SOLUSDT 8h.');
    lines.push('');
    lines.push('Possible explanations:');
    lines.push('1. VVOL spikes are noise, not signal — volatility-of-volatility is inherently noisy at short horizons');
    lines.push('2. 730 days is insufficient to capture enough regime transitions');
    lines.push('3. The z-score threshold may need adaptive calibration rather than static thresholds');
  } else {
    lines.push('');
    lines.push(`Top OOS config: volWindow=${passResults[0].cfg.volWindow}, vvolWindow=${passResults[0].cfg.vvolWindow}, zThr=${passResults[0].cfg.vvolZThreshold}, rocThr=${passResults[0].cfg.priceRocThreshold}, maxHold=${passResults[0].cfg.maxHold}`);
    lines.push(`  - OOS trades: ${passResults[0].test.totalTrades}, Sharpe: ${passResults[0].test.sharpe.toFixed(2)}, PnL: $${passResults[0].test.netPnL.toFixed(2)}`);
    lines.push(`  - Bootstrap CI: [$${passResults[0].test.bootstrapCI[0].toFixed(2)}, $${passResults[0].test.bootstrapCI[1].toFixed(2)}]`);
  }

  lines.push('');
  lines.push('## Regime Statistics');
  lines.push('');
  const allVvolSpikes = vvolVals.filter((v, idx) => {
    const threshold = vvolMean + 2.0 * vvolStd;
    return v > threshold;
  });
  lines.push(`- VVOL values computed: ${vvolVals.length}`);
  lines.push(`- VVOL spikes (z > 2.0): ${allVvolSpikes.length} (${(allVvolSpikes.length / vvolVals.length * 100).toFixed(1)}%)`);
  lines.push(`- Mean VVOL: ${vvolMean.toFixed(6)}`);
  lines.push(`- VVOL + 2*std threshold: ${(vvolMean + 2 * vvolStd).toFixed(6)}`);
  lines.push(`- VVOL + 3*std threshold: ${(vvolMean + 3 * vvolStd).toFixed(6)}`);

  const report = lines.join('\n');
  const rp = resolve(process.cwd(), 'plans/reports/vvol-regime.md');
  mkdirSync(dirname(rp), { recursive: true });
  writeFileSync(rp, report, 'utf-8');
  console.log(`\nReport saved: ${rp}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
