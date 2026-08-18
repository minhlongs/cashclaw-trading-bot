#!/usr/bin/env npx tsx
// Funding Momentum Backtest — tests FOLLOWING the crowd on funding rates
//
// Hypothesis: When funding > 0, crowds are long and tend to be right.
// Following them (going long) captures carry. The opposite of fading.
// The Ethena carry-trade paper supports this: positive funding ≈ longs
// paying shorts → the "crowd" collects a yield spread.
//
// Usage:
//   npx tsx src/forest/backtest/funding-momentum.ts [symbol] [stressMode] [days]
//
// Defaults: SOLUSDT, conservative, 730 days

import { resolveStressConfig, applyCosts, type CostConfig, type StressMode } from './cost-model';

// ── Types ────────────────────────────────────────────────────────────────────

interface FundingPoint {
  timestamp: number;
  fundingRate: number;
  markPrice: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const INITIAL_CAPITAL = 10_000;
const SETTLEMENT_MS = 8 * 60 * 60 * 1000; // 8h
const BOOTSTRAP_RESAMPLES = 1000;
const OOS_TRAIN_RATIO = 0.65;

interface Trade {
  entryTimestamp: number;
  exitTimestamp: number;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  fees: number;
  pnlPct: number;
  holdingBars: number;
  exitReason: string;
}

interface MomentumConfig {
  threshold: number;   // abs funding rate to trigger entry
  maxHoldBars: number; // max bars before forced exit
}

interface MomentumResult {
  config: MomentumConfig;
  allTrades: Trade[];
  allMetrics: Metrics;
  trainMetrics: Metrics;
  testMetrics: Metrics;
}

interface Metrics {
  netPnl: number;
  trades: number;
  winRate: number;
  expectancy: number;
  sharpe: number;
  ci95Lo: number;
  ci95Hi: number;
  profitFactor: number;
  maxDrawdown: number;
}

// ── Data Fetching ────────────────────────────────────────────────────────────

async function fetchFundingHistory(symbol: string, days: number): Promise<FundingPoint[]> {
  const all: FundingPoint[] = [];
  const toMs = Date.now();
  const fromMs = toMs - days * 24 * 60 * 60 * 1000;
  let cursor = toMs;

  while (cursor > fromMs) {
    const params = new URLSearchParams({
      symbol,
      startTime: String(Math.max(fromMs, cursor - 1000 * SETTLEMENT_MS)),
      limit: '1000',
    });
    const res = await fetch(
      `https://fapi.binance.com/fapi/v1/fundingRate?${params}`
    );
    if (!res.ok) throw new Error(`[${res.status}] funding rate fetch`);
    const data = await res.json() as Array<{
      fundingTime: number; fundingRate: string; markPrice: string;
    }>;
    if (data.length === 0) break;
    for (const d of data) {
      all.unshift({
        timestamp: d.fundingTime,
        fundingRate: parseFloat(d.fundingRate),
        markPrice: parseFloat(d.markPrice),
      });
    }
    cursor = data[0].fundingTime - 1;
    await new Promise(r => setTimeout(r, 120));
  }
  return all;
}

/** Generate synthetic SOLUSDT-like funding data for local validation. */
function generateSyntheticFunding(days: number): FundingPoint[] {
  const points: FundingPoint[] = [];
  const periodsPerDay = 3; // 8h intervals
  const totalPeriods = days * periodsPerDay;
  let price = 150; // SOL-ish price

  // Seed realistic regime-switching funding dynamics
  let regime: 'positive' | 'negative' | 'neutral' = 'neutral';
  let regimeCountdown = 0;

  for (let i = 0; i < totalPeriods; i++) {
    const ts = Date.now() - (totalPeriods - i) * SETTLEMENT_MS;

    // Regime switching (clusters of similar funding)
    regimeCountdown--;
    if (regimeCountdown <= 0) {
      const r = Math.random();
      if (r < 0.4) { regime = 'positive'; regimeCountdown = 5 + Math.floor(Math.random() * 15); }
      else if (r < 0.7) { regime = 'negative'; regimeCountdown = 3 + Math.floor(Math.random() * 10); }
      else { regime = 'neutral'; regimeCountdown = 2 + Math.floor(Math.random() * 8); }
    }

    let funding: number;
    if (regime === 'positive') {
      funding = 0.0001 + Math.random() * 0.0008;
    } else if (regime === 'negative') {
      funding = -(0.0001 + Math.random() * 0.0006);
    } else {
      funding = (Math.random() - 0.5) * 0.0002;
    }

    // Price follows crude random walk with drift
    price *= 1 + (Math.random() - 0.498) * 0.02;
    price = Math.max(10, price);

    points.push({ timestamp: ts, fundingRate: funding, markPrice: price });
  }
  return points;
}

// ── Trade Simulation ─────────────────────────────────────────────────────────

function simulateTrades(
  funding: FundingPoint[],
  cfg: MomentumConfig,
  costCfg: CostConfig,
): Trade[] {
  const trades: Trade[] = [];
  let position: {
    side: 'long' | 'short';
    entryPrice: number;
    entryIndex: number;
    entryFundingSign: number;
  } | null = null;

  for (let i = 1; i < funding.length; i++) {
    const bar = funding[i];
    const price = bar.markPrice;
    const prev = funding[i - 1];
    const fundingSign = Math.sign(prev.fundingRate);

    // Open new position if no existing one
    if (!position) {
      if (Math.abs(prev.fundingRate) > cfg.threshold) {
        const side: 'long' | 'short' = fundingSign > 0 ? 'long' : 'short';
        position = {
          side,
          entryPrice: price,
          entryIndex: i,
          entryFundingSign: fundingSign,
        };
      }
      continue;
    }

    // Evaluate exit conditions
    let exitReason: string | null = null;
    const holdBars = i - position.entryIndex;

    if (holdBars >= cfg.maxHoldBars) {
      exitReason = 'maxhold';
    } else if (fundingSign !== 0 && fundingSign !== position.entryFundingSign) {
      exitReason = 'funding_reversal';
    }

    if (exitReason) {
      const quantity = INITIAL_CAPITAL / position.entryPrice;
      const grossPnl = position.side === 'long'
        ? (price - position.entryPrice) * quantity
        : (position.entryPrice - price) * quantity;
      const notional = price * quantity;
      const cost = applyCosts(grossPnl, notional, costCfg);

      trades.push({
        entryTimestamp: funding[position.entryIndex].timestamp,
        exitTimestamp: bar.timestamp,
        side: position.side,
        entryPrice: position.entryPrice,
        exitPrice: price,
        quantity,
        pnl: cost.netPnl,
        fees: cost.fees,
        pnlPct: cost.netPnl / INITIAL_CAPITAL,
        holdingBars: holdBars,
        exitReason,
      });
      position = null;
    }
  }

  return trades;
}

// ── Metrics ──────────────────────────────────────────────────────────────────

function computeMetrics(trades: Trade[]): Metrics {
  if (trades.length === 0) {
    return { netPnl: 0, trades: 0, winRate: 0, expectancy: 0, sharpe: 0, ci95Lo: 0, ci95Hi: 0, profitFactor: 0, maxDrawdown: 0 };
  }

  const netPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const winRate = wins.length / trades.length;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
  const expectancy = netPnl / trades.length;

  // Profit factor
  const grossWins = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLosses = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLosses === 0 ? (grossWins > 0 ? Infinity : 0) : grossWins / grossLosses;

  // Sharpe (annualised)
  const pnls = trades.map(t => t.pnl);
  const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
  const variance = pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / pnls.length;
  const std = Math.sqrt(variance);
  const avgHoldBars = trades.reduce((s, t) => s + t.holdingBars, 0) / trades.length;
  const avgHoldHours = avgHoldBars * 8;
  const tradesPerYear = avgHoldHours > 0 ? (365.25 * 24) / avgHoldHours : 0;
  const sharpe = std === 0 || tradesPerYear === 0 ? 0 : (mean / std) * Math.sqrt(tradesPerYear);

  // Bootstrap 95% CI
  const ci = bootstrapCI(pnls, BOOTSTRAP_RESAMPLES);

  // Max drawdown
  let peak = 0;
  let equity = INITIAL_CAPITAL;
  let maxDrawdown = 0;
  for (const t of trades) {
    equity += t.pnl;
    peak = Math.max(peak, equity);
    const dd = (peak - equity) / peak;
    maxDrawdown = Math.max(maxDrawdown, dd);
  }

  return {
    netPnl, trades: trades.length, winRate, expectancy,
    sharpe, ci95Lo: ci.lo, ci95Hi: ci.hi,
    profitFactor, maxDrawdown,
  };
}

function bootstrapCI(samples: number[], resamples: number): { lo: number; hi: number } {
  if (samples.length < 3) return { lo: 0, hi: 0 };
  const means: number[] = [];
  for (let r = 0; r < resamples; r++) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[Math.floor(Math.random() * samples.length)];
    }
    means.push(sum / samples.length);
  }
  means.sort((a, b) => a - b);
  return { lo: means[Math.floor(resamples * 0.025)], hi: means[Math.floor(resamples * 0.975)] };
}

// ── OOS Split ────────────────────────────────────────────────────────────────

function splitOOS(trades: Trade[]): { train: Trade[]; test: Trade[] } {
  const idx = Math.floor(trades.length * OOS_TRAIN_RATIO);
  return { train: trades.slice(0, idx), test: trades.slice(idx) };
}

// ── Report Builder ───────────────────────────────────────────────────────────

function buildReport(
  symbol: string,
  stressMode: StressMode,
  funding: FundingPoint[],
  results: MomentumResult[],
): string {
  const md: string[] = [];
  md.push(`# Funding Momentum Backtest — ${symbol}`);
  md.push('');
  md.push(`**Hypothesis:** Following the crowd on funding rates produces alpha.`);
  md.push(`(Funding > 0 → LONG, Funding < 0 → SHORT — carry-trade logic.)`);
  md.push('');
  md.push(`| Parameter | Value |`);
  md.push(`|-----------|-------|`);
  md.push(`| Symbol | ${symbol} |`);
  md.push(`| Funding periods | ${funding.length} |`);
  md.push(`| Cost model | ${stressMode} |`);
  md.push(`| Bootstrap resamples | ${BOOTSTRAP_RESAMPLES} |`);
  md.push(`| OOS split | ${(OOS_TRAIN_RATIO * 100).toFixed(0)}% / ${((1 - OOS_TRAIN_RATIO) * 100).toFixed(0)}% |`);
  md.push('');

  // ── Full-period results
  md.push('## Full Period Results');
  md.push('');
  md.push('| Threshold | MaxHold | Trades | Net PnL | Win Rate | Expectancy | Sharpe | 95% CI | Profit Factor | Max DD |');
  md.push('|-----------|---------|--------|---------|----------|------------|--------|--------|---------------|--------|');

  const sorted = [...results].sort((a, b) => b.allMetrics.expectancy - a.allMetrics.expectancy);
  for (const r of sorted) {
    const m = r.allMetrics;
    md.push(`| ${r.config.threshold.toFixed(4)} | ${r.config.maxHoldBars} | ${m.trades} | $${m.netPnl.toFixed(2)} | ${(m.winRate * 100).toFixed(1)}% | $${m.expectancy.toFixed(2)} | ${m.sharpe.toFixed(2)} | [${fmtCI(m.ci95Lo, m.ci95Hi)}] | ${m.profitFactor === Infinity ? 'Inf' : m.profitFactor.toFixed(2)} | ${(m.maxDrawdown * 100).toFixed(1)}% |`);
  }
  md.push('');

  // ── OOS results
  md.push('## Out-of-Sample Results');
  md.push('');
  md.push('| Threshold | MaxHold | Train Exp. | Test Exp. | Train Sharpe | Test Sharpe | Degradation |');
  md.push('|-----------|---------|------------|-----------|--------------|-------------|-------------|');

  const oosSorted = [...results].sort((a, b) => b.testMetrics.expectancy - a.testMetrics.expectancy);
  for (const r of oosSorted) {
    const deg = Math.abs(r.trainMetrics.expectancy) > 1e-6
      ? ((r.trainMetrics.expectancy - r.testMetrics.expectancy) / Math.abs(r.trainMetrics.expectancy) * 100)
      : 0;
    md.push(`| ${r.config.threshold.toFixed(4)} | ${r.config.maxHoldBars} | $${r.trainMetrics.expectancy.toFixed(2)} | $${r.testMetrics.expectancy.toFixed(2)} | ${r.trainMetrics.sharpe.toFixed(2)} | ${r.testMetrics.sharpe.toFixed(2)} | ${deg.toFixed(1)}% |`);
  }
  md.push('');

  // ── Verdict
  md.push('## Verdict');
  md.push('');

  const positiveOOS = oosSorted.filter(r =>
    r.testMetrics.expectancy > 0 && r.testMetrics.trades >= 5
  );
  const significantOOS = positiveOOS.filter(r => r.testMetrics.ci95Lo > 0);

  if (significantOOS.length > 0) {
    const best = significantOOS[0];
    md.push(`**${significantOOS.length} of ${results.length} configs show statistically significant positive OOS expectancy.**`);
    md.push('');
    md.push(`Best OOS: threshold=${best.config.threshold.toFixed(4)}, maxHold=${best.config.maxHoldBars}`);
    md.push(`- Train expectancy: $${best.trainMetrics.expectancy.toFixed(2)}/trade, Sharpe ${best.trainMetrics.sharpe.toFixed(2)}`);
    md.push(`- Test expectancy: $${best.testMetrics.expectancy.toFixed(2)}/trade, Sharpe ${best.testMetrics.sharpe.toFixed(2)}`);
    md.push(`- Bootstrap 95% CI: [${fmtCI(best.testMetrics.ci95Lo, best.testMetrics.ci95Hi)}] — does NOT cross zero`);
    md.push('');
    md.push('**This suggests funding momentum carry trades may be a viable alpha source.**');
  } else if (positiveOOS.length > 0) {
    md.push(`**${positiveOOS.length} configs show positive OOS expectancy, but none are statistically significant (CI crosses zero).**`);
    md.push('');
    md.push('Funding momentum may have a weak edge, but not reliable enough for allocation.');
  } else {
    md.push('**No configuration produces positive OOS expectancy.**');
    md.push('');
    md.push('Funding momentum (following the crowd) does NOT produce alpha on this asset/timeframe.');
    md.push('This is consistent with the fading backtest — neither direction on funding rates works as a standalone signal.');
  }

  return md.join('\n');
}

function fmtCI(lo: number, hi: number): string {
  const fmt = (v: number) => v >= 0 ? `+$${v.toFixed(2)}` : `-$${Math.abs(v).toFixed(2)}`;
  return `${fmt(lo)} to ${fmt(hi)}`;
}

// ── Config Sweep ─────────────────────────────────────────────────────────────

function buildConfigs(): MomentumConfig[] {
  const thresholds = [0.0001, 0.0003, 0.0005];
  const maxHolds = [6, 12, 24];
  const configs: MomentumConfig[] = [];
  for (const t of thresholds) {
    for (const h of maxHolds) {
      configs.push({ threshold: t, maxHoldBars: h });
    }
  }
  return configs;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const symbolArg = args.find(a => a.startsWith('SYMBOL='))?.split('=')[1];
  const stressArg = args.find(a => a.startsWith('STRESS='))?.split('=')[1];
  const daysArg = args.find(a => a.startsWith('DAYS='))?.split('=')[1];
  const synthetic = args.includes('--synthetic');

  const symbol = symbolArg?.toUpperCase() ?? 'SOLUSDT';
  const stressMode: StressMode = (stressArg as StressMode) ?? 'conservative';
  const days = parseInt(daysArg ?? '730', 10);

  console.log(`=== Funding Momentum Backtest ===`);
  console.log(`Hypothesis: Follow the crowd (carry trade)`);
  console.log(`Symbol: ${symbol} | Days: ${days} | Stress: ${stressMode}\n`);

  let funding: FundingPoint[];
  if (synthetic) {
    console.log(`Generating synthetic funding data (--synthetic)...`);
    funding = generateSyntheticFunding(days);
  } else {
    console.log(`Fetching funding rate history...`);
    funding = await fetchFundingHistory(symbol, days);
  }
  console.log(`  ${funding.length} funding periods loaded\n`);

  if (funding.length < 50) {
    console.error('Insufficient funding data. Need at least 50 periods.');
    process.exit(1);
  }

  const costCfg = resolveStressConfig(stressMode);
  const configs = buildConfigs();
  console.log(`Running ${configs.length} configurations (${OOS_TRAIN_RATIO * 100}% / ${(1 - OOS_TRAIN_RATIO) * 100}% train/test split)...\n`);

  const results: MomentumResult[] = [];

  for (const cfg of configs) {
    const trades = simulateTrades(funding, cfg, costCfg);
    const metrics = computeMetrics(trades);

    const { train, test } = splitOOS(trades);
    const trainMetrics = computeMetrics(train);
    const testMetrics = computeMetrics(test);

    results.push({
      config: cfg,
      allTrades: trades,
      allMetrics: metrics,
      trainMetrics,
      testMetrics,
    });

    console.log(`  threshold=${cfg.threshold.toFixed(4)} maxHold=${cfg.maxHoldBars} → ${trades.length} trades | full: $${metrics.netPnl.toFixed(2)} (${(metrics.winRate * 100).toFixed(1)}% WR) | test: $${testMetrics.netPnl.toFixed(2)}`);
  }

  // Console summary
  const sorted = [...results].sort((a, b) => b.testMetrics.expectancy - a.testMetrics.expectancy);
  const positiveOOS = sorted.filter(r => r.testMetrics.expectancy > 0 && r.testMetrics.trades >= 5);
  const significant = positiveOOS.filter(r => r.testMetrics.ci95Lo > 0);

  console.log(`\nOOS: ${positiveOOS.length} positive expectancy | ${significant.length} statistically significant`);

  if (sorted.length > 0) {
    const best = sorted[0];
    console.log(`\nBest OOS: threshold=${best.config.threshold.toFixed(4)} maxHold=${best.config.maxHoldBars}`);
    console.log(`  Full:  $${best.allMetrics.expectancy.toFixed(2)}/trade, Sharpe ${best.allMetrics.sharpe.toFixed(2)}, ${best.allMetrics.trades} trades`);
    console.log(`  Train: $${best.trainMetrics.expectancy.toFixed(2)}/trade, Sharpe ${best.trainMetrics.sharpe.toFixed(2)}`);
    console.log(`  Test:  $${best.testMetrics.expectancy.toFixed(2)}/trade, Sharpe ${best.testMetrics.sharpe.toFixed(2)}`);
    console.log(`  CI95:  [${fmtCI(best.testMetrics.ci95Lo, best.testMetrics.ci95Hi)}]`);
  }

  // Save report
  const report = buildReport(symbol, stressMode, funding, results);
  const { mkdirSync, writeFileSync } = await import('fs');
  const { resolve, dirname } = await import('path');
  const reportPath = resolve(process.cwd(), 'plans/reports/funding-momentum.md');
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, report, 'utf-8');
  console.log(`\nReport saved: ${reportPath}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
