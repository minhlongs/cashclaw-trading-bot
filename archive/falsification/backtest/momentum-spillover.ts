#!/usr/bin/env npx tsx
// Cross-Asset Momentum Spillover Backtest — SOLUSDT
//
// Hypothesis: BTC intraday momentum predicts SOL/ETH intraday momentum.
// When BTC returns strongly in one 8h bar, SOL/ETH tends to follow in the next bar.
// Strategy: when BTC return > positive_threshold → LONG SOL/ETH; when BTC return
// < negative_threshold → SHORT SOL/ETH. Exit after maxHold bars.
//
// This tests whether BTC acts as a "market leader" whose momentum spills into alts.
//
// Usage:
//   npx tsx src/forest/backtest/momentum-spillover.ts SOLUSDT conservative 730
//
// Defaults: SOLUSDT, conservative, 730 days

import { resolveStressConfig, applyCosts, type CostConfig, type StressMode } from './cost-model';
import { fetchOHLCV } from './data-fetcher';

// ── Types ────────────────────────────────────────────────────────────────────

interface Trade {
  entryTimestamp: number;
  exitTimestamp: number;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  btcReturnAtEntry: number;
  pnlUsd: number;
  holdingBars: number;
  exitReason: string;
}

interface Metrics {
  trades: number;
  netPnl: number;
  winRate: number;
  expectancy: number;
  sharpe: number;
  ci95Lo: number;
  ci95Hi: number;
  profitFactor: number;
  maxDrawdown: number;
}

interface Config {
  longThreshold: number;   // BTC return > this → LONG
  shortThreshold: number;  // BTC return < this → SHORT
  maxHoldBars: number;
}

// ── Data ─────────────────────────────────────────────────────────────────────

interface Candle { timestamp: number; open: number; high: number; low: number; close: number; volume: number }

const SETTLEMENT_MS = 8 * 60 * 60 * 1000; // 8h bars

// ── Backtest Engine ──────────────────────────────────────────────────────────

function runBacktest(
  btcCandles: Candle[],
  solCandles: Candle[],
  config: Config,
  costConfig: CostConfig,
  capitalUsd: number,
): Trade[] {
  // Build lookup: timestamp → close
  const btcByTs = new Map<number, number>();
  const solByTs = new Map<number, { close: number; timestamp: number }>();
  for (const c of btcCandles) btcByTs.set(c.timestamp, c.close);
  for (const c of solCandles) solByTs.set(c.timestamp, { close: c.close, timestamp: c.timestamp });

  // Get sorted SOL timestamps (these are our trade timestamps)
  const solTimestamps = Array.from(solByTs.keys()).sort((a, b) => a - b);

  // For each SOL bar, find BTC return from previous bar
  const btcReturns = new Map<number, number>();
  const sortedBtcTs = Array.from(btcByTs.keys()).sort((a, b) => a - b);
  for (let i = 1; i < sortedBtcTs.length; i++) {
    const prev = btcByTs.get(sortedBtcTs[i - 1])!;
    const curr = btcByTs.get(sortedBtcTs[i])!;
    if (prev > 0) btcReturns.set(sortedBtcTs[i], (curr - prev) / prev);
  }

  const trades: Trade[] = [];
  let inPosition = false;
  let entrySide: 'long' | 'short' = 'long';
  let entryPrice = 0;
  let entryTs = 0;
  let entryBtcReturn = 0;
  let entryBarIdx = 0;

  for (let i = 1; i < solTimestamps.length; i++) {
    const ts = solTimestamps[i];
    const sol = solByTs.get(ts)!;
    const btcReturn = btcReturns.get(ts);
    if (btcReturn === undefined) continue;

    if (inPosition) {
      const barsHeld = i - entryBarIdx;
      if (barsHeld >= config.maxHoldBars) {
        const sideMult = entrySide === 'long' ? 1 : -1;
        const rawPnl = sideMult * (sol.close - entryPrice) * (capitalUsd / entryPrice);
        const costed = applyCosts(rawPnl, capitalUsd, costConfig);
        trades.push({
          entryTimestamp: entryTs,
          exitTimestamp: ts,
          side: entrySide,
          entryPrice,
          exitPrice: sol.close,
          btcReturnAtEntry: entryBtcReturn,
          pnlUsd: costed.netPnl,
          holdingBars: barsHeld,
          exitReason: 'maxhold',
        });
        inPosition = false;
      }
      // Also exit if BTC signal flips (optional — skip for simplicity)
    } else {
      // Entry: when BTC return signals → trade SOL
      if (btcReturn > config.longThreshold) {
        // BTC went up strongly → LONG SOL (momentum spillover)
        inPosition = true;
        entrySide = 'long';
        entryPrice = sol.close;
        entryTs = ts;
        entryBtcReturn = btcReturn;
        entryBarIdx = i;
      } else if (btcReturn < config.shortThreshold) {
        // BTC went down strongly → SHORT SOL
        inPosition = true;
        entrySide = 'short';
        entryPrice = sol.close;
        entryTs = ts;
        entryBtcReturn = btcReturn;
        entryBarIdx = i;
      }
    }
  }

  // Close any open position
  if (inPosition && solTimestamps.length > 1) {
    const lastTs = solTimestamps[solTimestamps.length - 1];
    const sol = solByTs.get(lastTs)!;
    const sideMult = entrySide === 'long' ? 1 : -1;
    const rawPnl = sideMult * (sol.close - entryPrice) * (capitalUsd / entryPrice);
    const costed = applyCosts(rawPnl, capitalUsd, costConfig);
    trades.push({
      entryTimestamp: entryTs,
      exitTimestamp: lastTs,
      side: entrySide,
      entryPrice,
      exitPrice: sol.close,
      btcReturnAtEntry: entryBtcReturn,
      pnlUsd: costed.netPnl,
      holdingBars: solTimestamps.length - 1 - entryBarIdx,
      exitReason: 'data-end',
    });
  }

  return trades;
}

// ── Metrics ──────────────────────────────────────────────────────────────────

function computeMetrics(trades: Trade[]): Metrics {
  const pnls = trades.map(t => t.pnlUsd);
  if (pnls.length === 0) {
    return { trades: 0, netPnl: 0, winRate: 0, expectancy: 0, sharpe: 0, ci95Lo: 0, ci95Hi: 0, profitFactor: 0, maxDrawdown: 0 };
  }

  const netPnl = pnls.reduce((a, b) => a + b, 0);
  const wins = pnls.filter(p => p > 0);
  const losses = pnls.filter(p => p <= 0);
  const winRate = wins.length / pnls.length;
  const expectancy = netPnl / pnls.length;

  const mean = expectancy;
  const variance = pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / pnls.length;
  const std = Math.sqrt(variance);
  const avgHolding = trades.reduce((s, t) => s + t.holdingBars, 0) / trades.length;
  const annualizationFactor = avgHolding > 0 ? Math.sqrt(1095 / avgHolding) : 1; // 730d window
  const sharpe = std > 0 ? (mean / std) * annualizationFactor : 0;

  const { lo, hi } = bootstrapCI(pnls, 1000);

  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  let peak = 0, dd = 0, equity = 0;
  for (const p of pnls) {
    equity += p;
    if (equity > peak) peak = equity;
    const currentDd = peak > 0 ? (peak - equity) / peak : 0;
    if (currentDd > dd) dd = currentDd;
  }

  return { trades: pnls.length, netPnl, winRate, expectancy, sharpe, ci95Lo: lo, ci95Hi: hi, profitFactor, maxDrawdown: dd };
}

function bootstrapCI(values: number[], resamples: number): { lo: number; hi: number } {
  if (values.length < 3) return { lo: 0, hi: 0 };
  const means: number[] = [];
  const n = values.length;
  for (let i = 0; i < resamples; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += values[Math.floor(Math.random() * n)];
    means.push(sum / n);
  }
  means.sort((a, b) => a - b);
  return { lo: means[Math.floor(resamples * 0.025)], hi: means[Math.floor(resamples * 0.975)] };
}

function fmtCI(lo: number, hi: number): string {
  return `$${lo.toFixed(0)}, $${hi.toFixed(0)}`;
}

// ── Report ───────────────────────────────────────────────────────────────────

function writeReport(
  symbol: string, stressMode: string, configs: Config[],
  fullResults: Metrics[], oosTrain: Metrics[], oosTest: Metrics[],
  btcCandles: Candle[], solCandles: Candle[],
) {
  const md: string[] = [];
  md.push(`# Cross-Asset Momentum Spillover — ${symbol}`);
  md.push('');
  md.push(`**Hypothesis #11:** BTC intraday momentum (8h return) predicts ${symbol} intraday momentum.`);
  md.push('**Strategy:** when BTC return > threshold → LONG ${symbol}; < threshold → SHORT.');
  md.push('');
  md.push(`| Parameter | Value |`);
  md.push(`|-----------|-------|`);
  md.push(`| Symbol | ${symbol} |`);
  md.push(`| BTC candles | ${btcCandles.length} (8h) |`);
  md.push(`| ${symbol} candles | ${solCandles.length} (8h) |`);
  md.push(`| Cost model | ${stressMode} (17bps round-trip) |`);
  md.push(`| Bootstrap | 1000 resamples, 95% CI |`);
  md.push(`| OOS split | 65% / 35% |`);
  md.push('---');
  md.push('');

  md.push('## Full Period Results');
  md.push('');
  md.push('| LongThresh | ShortThresh | MaxHold | Trades | PnL | Win% | Exp | Sharpe | 95% CI | PF | MaxDD |');
  md.push('|------------|-------------|---------|--------|-----|------|-----|--------|--------|----|-------|');
  for (let i = 0; i < configs.length; i++) {
    const c = configs[i], m = fullResults[i];
    md.push(`| ${(c.longThreshold * 100).toFixed(2)}% | ${(c.shortThreshold * 100).toFixed(2)}% | ${c.maxHoldBars} | ${m.trades} | $${m.netPnl.toFixed(0)} | ${(m.winRate * 100).toFixed(1)}% | $${m.expectancy.toFixed(2)} | ${m.sharpe.toFixed(2)} | [${fmtCI(m.ci95Lo, m.ci95Hi)}] | ${m.profitFactor === Infinity ? 'Inf' : m.profitFactor.toFixed(2)} | ${(m.maxDrawdown * 100).toFixed(1)}% |`);
  }
  md.push('');

  md.push('## Out-of-Sample Results');
  md.push('');
  md.push('| LongThresh | ShortThresh | MaxHold | Train# | Train PnL | Train Sharpe | Test# | Test PnL | Test Sharpe | CI 5% | CI 95% | OOS |');
  md.push('|------------|-------------|---------|--------|-----------|--------------|-------|----------|-------------|-------|--------|-----|');
  let passCount = 0;
  for (let i = 0; i < configs.length; i++) {
    const c = configs[i], tr = oosTrain[i], te = oosTest[i];
    const pass = te.trades >= 5 && te.sharpe > 0 && te.ci95Lo > 0;
    if (pass) passCount++;
    md.push(`| ${(c.longThreshold * 100).toFixed(2)}% | ${(c.shortThreshold * 100).toFixed(2)}% | ${c.maxHoldBars} | ${tr.trades} | $${tr.netPnl.toFixed(0)} | ${tr.sharpe.toFixed(2)} | ${te.trades} | $${te.netPnl.toFixed(0)} | ${te.sharpe.toFixed(2)} | $${te.ci95Lo.toFixed(0)} | $${te.ci95Hi.toFixed(0)} | ${pass ? '✅ PASS' : '❌ FAIL'} |`);
  }
  md.push('');
  md.push(`**PASSED OOS: ${passCount}/${configs.length}**`);
  md.push('');
  md.push('---');
  md.push('*Research backtest — not a production recommendation.*');

  const fs = require('fs');
  fs.writeFileSync('plans/reports/momentum-spillover.md', md.join('\n'));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const symbol = process.argv[2] || 'SOLUSDT';
  const stressMode = (process.argv[3] || 'conservative') as StressMode;
  const days = parseInt(process.argv[4] || '730', 10);

  console.log(`\n🚀 Cross-Asset Momentum Spillover Backtest`);
  console.log(`Symbol: ${symbol} | Mode: ${stressMode} | Window: ${days} days`);

  const costConfig = resolveStressConfig(stressMode);
  const capitalUsd = 10_000;
  const endMs = new Date('2025-09-19').getTime() + 86_400_000 - 1;
  const startMs = endMs - days * 86_400_000;

  console.log('Fetching BTCUSDT 8h candles...');
  const btcCandles = await fetchOHLCV('binance', 'BTCUSDT', '8h', startMs, endMs);
  console.log(`  Got ${btcCandles.length} BTC candles`);

  console.log(`Fetching ${symbol} 8h candles...`);
  const solCandles = await fetchOHLCV('binance', symbol, '8h', startMs, endMs);
  console.log(`  Got ${solCandles.length} ${symbol} candles`);

  // Configs: sweep BTC return thresholds and maxHold
  const configs: Config[] = [];
  for (const longThresh of [0.005, 0.01, 0.02, 0.03]) { // 0.5% to 3%
    for (const shortThresh of [-0.03, -0.02, -0.01, -0.005]) { // -3% to -0.5%
      for (const maxHold of [1, 3, 6, 12]) { // 8h bars (8h to 4 days)
        configs.push({ longThreshold: longThresh, shortThreshold: shortThresh, maxHoldBars: maxHold });
      }
    }
  }

  console.log(`Sweeping ${configs.length} configurations...`);

  // Split for OOS (timestamp-based, not random)
  const splitTs = startMs + (endMs - startMs) * 0.65;
  const trainBtc = btcCandles.filter(c => c.timestamp <= splitTs);
  const trainSol = solCandles.filter(c => c.timestamp <= splitTs);
  const testBtc = btcCandles.filter(c => c.timestamp > splitTs);
  const testSol = solCandles.filter(c => c.timestamp > splitTs);

  console.log(`Train: ${trainBtc.length} BTC, ${trainSol.length} ${symbol}`);
  console.log(`Test:  ${testBtc.length} BTC, ${testSol.length} ${symbol}`);

  const fullResults: Metrics[] = [];
  const oosTrain: Metrics[] = [];
  const oosTest: Metrics[] = [];

  for (const cfg of configs) {
    const allTrades = runBacktest(btcCandles, solCandles, cfg, costConfig, capitalUsd);
    const trainTrades = runBacktest(trainBtc, trainSol, cfg, costConfig, capitalUsd);
    const testTrades = runBacktest(testBtc, testSol, cfg, costConfig, capitalUsd);

    fullResults.push(computeMetrics(allTrades));
    oosTrain.push(computeMetrics(trainTrades));
    oosTest.push(computeMetrics(testTrades));
  }

  // Print summary
  let passCount = 0;
  for (let i = 0; i < configs.length; i++) {
    const te = oosTest[i];
    const pass = te.trades >= 5 && te.sharpe > 0 && te.ci95Lo > 0;
    if (pass) passCount++;
    const c = configs[i];
    const status = pass ? '✅' : te.trades < 5 ? '⚠️' : '❌';
    if (i % 16 === 0) console.log(`  ${status} L${(c.longThreshold*100).toFixed(1)}%/S${(c.shortThreshold*100).toFixed(1)}%/H${c.maxHoldBars}: full trades=${fullResults[i].trades} PnL=$${fullResults[i].netPnl.toFixed(0)} | OOS: trades=${te.trades} Sharpe=${te.sharpe.toFixed(2)}`);
  }

  console.log(`\n📊 OOS PASS: ${passCount}/${configs.length}`);
  if (passCount === 0) {
    console.log('❌ Momentum spillover FALSIFIED — no config passes OOS');
  }

  writeReport(symbol, stressMode, configs, fullResults, oosTrain, oosTest, btcCandles, solCandles);
  console.log('📄 Report written to plans/reports/momentum-spillover.md');
}

main().catch(console.error);
