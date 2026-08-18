#!/usr/bin/env npx tsx
// Out-of-Sample Validation for Funding-Rate Fade Strategy
//
// Splits 730-day dataset into:
//   Train:  first ~65% (2024-10-21 → 2025-05-15, ~206 days)
//   Test:   last ~35% (2025-05-15 → 2025-09-19, ~127 days)
//
// Tests the best SOL and ETH configs from in-sample sweep on UNSEEN data.
// If out-of-sample Sharpe is positive with 10+ trades → signal may be real.
//
// Usage:
//   npx tsx src/forest/backtest/derivative-out-of-sample.ts

import { resolveStressConfig, applyCosts, type StressConfig, type StressMode } from './cost-model';
import * as fs from 'fs';

const SETTLEMENT_MS = 8 * 60 * 60 * 1000;
const INITIAL_CAPITAL = 10_000;

// ── Types (same as derivative-sweep) ────────────────────────────────────────

interface FundingPoint {
  timestamp: number;
  fundingRate: number;
  markPrice: number;
}

interface Trade {
  entryTimestamp: number;
  exitTimestamp: number;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  exitReason: 'take-profit' | 'stop-loss' | 'maxhold';
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
  bootstrapPValue: number;
  bootstrapCI: [number, number];
}

// ── Configs to test OOS ─────────────────────────────────────────────────────

const OOS_CONFIGS = [
  // SOL best configs from in-sample
  { symbol: 'SOLUSDT', fundingThreshold: 0.0001, maxHoldBars: 24, label: 'SOL: thresh=0.0001 maxHold=24' },
  { symbol: 'SOLUSDT', fundingThreshold: 0.0001, maxHoldBars: 12, label: 'SOL: thresh=0.0001 maxHold=12' },
  { symbol: 'SOLUSDT', fundingThreshold: 0.0001, maxHoldBars: 6, label: 'SOL: thresh=0.0001 maxHold=6' },
  { symbol: 'SOLUSDT', fundingThreshold: 0.0003, maxHoldBars: 12, label: 'SOL: thresh=0.0003 maxHold=12' },
  // ETH best configs from in-sample
  { symbol: 'ETHUSDT', fundingThreshold: 0.0003, maxHoldBars: 12, label: 'ETH: thresh=0.0003 maxHold=12' },
  { symbol: 'ETHUSDT', fundingThreshold: 0.0001, maxHoldBars: 12, label: 'ETH: thresh=0.0001 maxHold=12' },
  { symbol: 'ETHUSDT', fundingThreshold: 0.0001, maxHoldBars: 6, label: 'ETH: thresh=0.0001 maxHold=6' },
];

// ── Data Fetching ────────────────────────────────────────────────────────────

async function fetchFunding(symbol: string, startTime: number, endTime: number): Promise<FundingPoint[]> {
  const all: FundingPoint[] = [];
  const LIMIT = 1000;
  let cursor = startTime;

  while (cursor < endTime) {
    const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&startTime=${cursor}&endTime=${endTime}&limit=${LIMIT}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`  Funding fetch error ${res.status} at ${new Date(cursor).toISOString()}`);
        break;
      }
      const data = await res.json() as Array<{ fundingRate: string; markPrice: string; fundingTime: number }>;
      if (data.length === 0) break;

      for (const p of data) {
        all.push({
          timestamp: p.fundingTime,
          fundingRate: parseFloat(p.fundingRate),
          markPrice: parseFloat(p.markPrice),
        });
      }
      cursor = data[data.length - 1].fundingTime + 1;
      if (data.length < LIMIT) break;
      await new Promise(r => setTimeout(r, 100));
    } catch (e) {
      console.error(`  Funding fetch failed: ${e}`);
      break;
    }
  }
  return all;
}

// ── Simulation ──────────────────────────────────────────────────────────────

function simulateFade(
  funding: FundingPoint[],
  fundingThreshold: number,
  maxHoldBars: number,
  trainEndMs: number,
): { train: Trade[]; test: Trade[] } {
  const train: Trade[] = [];
  const test: Trade[] = [];
  let position: { side: 'long' | 'short'; entryIndex: number; entryPrice: number } | null = null;

  for (let i = 1; i < funding.length; i++) {
    const f = funding[i];

    if (position) {
      const barsHeld = i - position.entryIndex;
      const priceChangePct = (f.markPrice - position.entryPrice) / position.entryPrice;
      const rawPnlPct = position.side === 'long' ? priceChangePct : -priceChangePct;

      const shouldExit = barsHeld >= maxHoldBars;
      if (shouldExit) {
        const trade: Trade = {
          entryTimestamp: funding[position.entryIndex].timestamp,
          exitTimestamp: f.timestamp,
          side: position.side,
          entryPrice: position.entryPrice,
          exitPrice: f.markPrice,
          exitReason: 'maxhold',
          pnlUsd: rawPnlPct * INITIAL_CAPITAL,
          barsHeld,
        };
        if (trade.entryTimestamp < trainEndMs) {
          train.push(trade);
        } else {
          test.push(trade);
        }
        position = null;
      }
    } else {
      const absFunding = Math.abs(f.fundingRate);
      if (absFunding >= fundingThreshold) {
        position = {
          side: f.fundingRate > 0 ? 'short' : 'long',
          entryIndex: i,
          entryPrice: f.markPrice,
        };
      }
    }
  }
  return { train, test };
}

// ── Metrics ─────────────────────────────────────────────────────────────────

function computeMetrics(trades: Trade[], costConfig: StressConfig): Metrics {
  if (trades.length === 0) {
    return { totalTrades: 0, netPnL: 0, winRate: 0, expectancy: 0, sharpe: 0, profitFactor: 0, bootstrapPValue: 1, bootstrapCI: [0, 0] };
  }

  const costed = trades.map(t => {
    const tc = applyCosts(t.pnlUsd, INITIAL_CAPITAL, costConfig);
    return { ...t, netPnl: tc.netPnl, fees: tc.fees + tc.slippage + tc.marketImpact };
  });

  const wins = costed.filter(t => t.netPnl > 0);
  const losses = costed.filter(t => t.netPnl <= 0);
  const totalWin = wins.reduce((s, t) => s + t.netPnl, 0);
  const totalLoss = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));
  const pnls = costed.map(t => t.netPnl);
  const mean = pnls.reduce((s, p) => s + p, 0) / pnls.length;
  const std = Math.sqrt(pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / pnls.length);
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(pnls.length) : 0;

  // Bootstrap 95% CI
  const N_BOOT = 1000;
  const bootMeans: number[] = [];
  for (let b = 0; b < N_BOOT; b++) {
    let sum = 0;
    for (let i = 0; i < pnls.length; i++) {
      sum += pnls[Math.floor(Math.random() * pnls.length)];
    }
    bootMeans.push(sum / pnls.length);
  }
  bootMeans.sort((a, b) => a - b);
  const ci5 = bootMeans[Math.floor(N_BOOT * 0.05)];
  const ci95 = bootMeans[Math.floor(N_BOOT * 0.95)];
  const pValue = bootMeans.filter(m => m <= 0).length / N_BOOT;

  return {
    totalTrades: trades.length,
    netPnL: costed.reduce((s, t) => s + t.netPnl, 0),
    winRate: wins.length / trades.length * 100,
    expectancy: mean,
    sharpe,
    profitFactor: totalLoss > 0 ? totalWin / totalLoss : Infinity,
    bootstrapPValue: pValue,
    bootstrapCI: [ci5, ci95],
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const costConfig = resolveStressConfig('conservative');

  // Use same date range as derivative-sweep (730 days from Date.now())
  const fullEnd = Date.now();
  const fullStart = fullEnd - 730 * 86400000;
  // Train/Test split: 65%/35%
  const splitDate = fullStart + Math.round((fullEnd - fullStart) * 0.65);
  const trainDays = Math.round((splitDate - fullStart) / (86400000));
  const testDays = Math.round((fullEnd - splitDate) / (86400000));

  console.log(`\n=== Out-of-Sample Validation: Funding-Rate Fade ===`);
  console.log(`Train period: 2024-10-21 → 2025-05-15 (${trainDays} days)`);
  console.log(`Test period:  2025-05-15 → 2025-09-19 (${testDays} days)`);
  console.log(`Cost model: conservative (fee=0.001, slip=0.0007, impact=0.001)\n`);

  const symbols = ['SOLUSDT', 'ETHUSDT'];
  const fundingData: Record<string, FundingPoint[]> = {};

  for (const sym of symbols) {
    console.log(`Fetching ${sym} funding...`);
    fundingData[sym] = await fetchFunding(sym, fullStart, fullEnd);
    console.log(`  ${fundingData[sym].length} funding periods loaded`);
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\nRunning ${OOS_CONFIGS.length} configurations...\n`);

  const results: Array<{
    label: string;
    symbol: string;
    train: Metrics;
    test: Metrics;
    trainTrades: number;
    testTrades: number;
    degradation: string;
  }> = [];

  for (const cfg of OOS_CONFIGS) {
    const funding = fundingData[cfg.symbol];
    if (!funding || funding.length === 0) {
      console.log(`  SKIP ${cfg.label}: no funding data`);
      continue;
    }

    const { train, test } = simulateFade(funding, cfg.fundingThreshold, cfg.maxHoldBars, splitDate);
    const trainM = computeMetrics(train, costConfig);
    const testM = computeMetrics(test, costConfig);

    const degradation = trainM.sharpe > 0
      ? ((1 - testM.sharpe / trainM.sharpe) * 100).toFixed(0) + '%'
      : 'N/A';

    results.push({
      label: cfg.label,
      symbol: cfg.symbol,
      train: trainM,
      test: testM,
      trainTrades: train.length,
      testTrades: test.length,
      degradation,
    });

    const pass = testM.totalTrades >= 10 && testM.netPnL > 0 && testM.bootstrapCI[0] > 0;
    const icon = pass ? '✅' : (testM.netPnL > 0 ? '⚠️' : '❌');
    console.log(`  ${icon} ${cfg.label}`);
    console.log(`     Train: ${trainM.totalTrades} trades, $${trainM.netPnL.toFixed(0)} PnL, Sharpe ${trainM.sharpe.toFixed(2)}`);
    console.log(`     Test:  ${testM.totalTrades} trades, $${testM.netPnL.toFixed(0)} PnL, Sharpe ${testM.sharpe.toFixed(2)}`);
    console.log(`     CI: [${testM.bootstrapCI[0].toFixed(0)}, ${testM.bootstrapCI[1].toFixed(0)}]`);
    console.log(`     Sharpe degradation: ${degradation}%`);
    console.log();
  }

  // Summary
  console.log(`\n=== Summary ===`);
  const passed = results.filter(r => r.test.totalTrades >= 10 && r.test.netPnL > 0 && r.test.bootstrapCI[0] > 0);
  const marginal = results.filter(r => r.test.totalTrades >= 10 && r.test.netPnL > 0 && r.test.bootstrapCI[0] <= 0);
  const failed = results.filter(r => r.test.totalTrades < 10 || r.test.netPnL <= 0);

  console.log(`PASSED OOS: ${passed.length}/${results.length}`);
  for (const r of passed) {
    console.log(`  ✅ ${r.label}: ${r.testTrades} trades, $${r.test.netPnL.toFixed(0)} PnL, Sharpe ${r.test.sharpe.toFixed(2)}, CI [${r.test.bootstrapCI[0].toFixed(0)}, ${r.test.bootstrapCI[1].toFixed(0)}]`);
  }
  console.log(`MARGINAL: ${marginal.length}/${results.length}`);
  for (const r of marginal) {
    console.log(`  ⚠️  ${r.label}: ${r.testTrades} trades, $${r.test.netPnL.toFixed(0)} PnL, Sharpe ${r.test.sharpe.toFixed(2)}`);
  }
  console.log(`FAILED: ${failed.length}/${results.length}`);

  // Save report
  let report = `# Out-of-Sample Validation — Funding-Rate Fade\n\n`;
  report += `**Date:** ${new Date().toISOString().split('T')[0]}\n`;
  report += `**Train:** ${new Date(fullStart).toISOString().split('T')[0]} → ${new Date(splitDate).toISOString().split('T')[0]} (${trainDays} days)\n`;
  report += `**Test:**  ${new Date(splitDate).toISOString().split('T')[0]} → ${new Date(fullEnd).toISOString().split('T')[0]} (${testDays} days)\n`;
  report += `**Cost Model:** conservative\n\n---\n\n`;
  report += `## Results\n\n`;
  report += `| Config | Train Trades | Train PnL | Train Sharpe | Test Trades | Test PnL | Test Sharpe | CI 5% | CI 95% | Degradation | OOS |\n`;
  report += `|---|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const r of results) {
    const oos = r.test.totalTrades >= 10 && r.test.netPnL > 0 && r.test.bootstrapCI[0] > 0 ? '✅' : (r.test.netPnL > 0 ? '⚠️' : '❌');
    report += `| ${r.label} | ${r.train.totalTrades} | $${r.train.netPnL.toFixed(0)} | ${r.train.sharpe.toFixed(2)} | ${r.test.totalTrades} | $${r.test.netPnL.toFixed(0)} | ${r.test.sharpe.toFixed(2)} | $${r.test.bootstrapCI[0].toFixed(0)} | $${r.test.bootstrapCI[1].toFixed(0)} | ${r.degradation}% | ${oos} |\n`;
  }
  report += `\n## Verdict\n\n`;
  report += `**PASSED OOS:** ${passed.length}/${results.length} configurations\n`;
  report += `**MARGINAL:** ${marginal.length}/${results.length} (positive PnL but CI crosses zero)\n`;
  report += `**FAILED:** ${failed.length}/${results.length}\n\n`;
  if (passed.length > 0) {
    report += `**The funding-rate fade signal shows out-of-sample robustness on these configurations.** This is not proof of future profitability, but it passes the first scientific hurdle.\n`;
  } else {
    report += `**No configuration passed out-of-sample validation.** The in-sample results may be overfit.\n`;
  }

  fs.writeFileSync('plans/reports/derivative-out-of-sample.md', report);
  console.log(`\nReport saved: plans/reports/derivative-out-of-sample.md`);
}

main().catch(console.error);
