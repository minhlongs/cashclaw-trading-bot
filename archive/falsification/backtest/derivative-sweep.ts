#!/usr/bin/env npx tsx
// Derivative Alpha Sweep — tests funding rate + OI as standalone alpha sources
//
// The insight: funding rate extremes indicate crowded positions. Extreme positive
// funding = crowded longs = fade (short). Extreme negative = crowded shorts = fade (long).
// OI surges indicate new money entering; OI collapses indicate capitulation.
//
// These are STRUCTURAL signals, not TA — they measure market participant behavior
// rather than price patterns.
//
// Usage:
//   npx tsx src/forest/backtest/derivative-sweep.ts BTCUSDT conservative [days]
//
// Defaults: 730 days, conservative cost model

import { resolveStressConfig, applyCosts, type CostConfig, type StressMode } from './cost-model';

// ── Config ───────────────────────────────────────────────────────────────────

const INITIAL_CAPITAL = 10_000;
const SETTLEMENT_MS = 8 * 60 * 60 * 1000; // funding settles every 8 hours

interface SweepConfig {
  fundingExtreme: number;  // abs funding rate threshold to trigger fade (e.g. 0.0005 = 0.05%)
  oiZThreshold: number;    // abs OI z-score threshold to trigger follow
  fundingWeight: number;   // weight of funding signal in combined mode
  oiWeight: number;        // weight of OI signal in combined mode
  maxHoldBars: number;     // max holding periods before forced exit
  mode: 'funding_only' | 'oi_only' | 'combined';
}

// ── Types ────────────────────────────────────────────────────────────────────

interface FundingPoint {
  timestamp: number;
  fundingRate: number;
  markPrice: number;
}

interface OiPoint {
  timestamp: number;
  openInterest: number;
  notionalUsd: number;
}

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

interface SweepResult {
  config: SweepConfig;
  trades: Trade[];
  netPnl: number;
  winRate: number;
  expectancy: number;
  sharpe: number;
  bootstrapP5: number;
  bootstrapP95: number;
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
      endTime: String(cursor),
      limit: '1000',
    });
    const res = await fetch(`https://fapi.binance.com/fapi/v1/fundingRate?${params}`);
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
    await sleep(120); // rate-limit friendly
  }
  return all;
}

async function fetchOiHistory(symbol: string, _days: number): Promise<OiPoint[]> {
  // Binance OI endpoint: accepts startTime within ~60 days; returns up to 500 per call.
  // Starting from "now" returns empty (current hour's data not yet published),
  // so we start 2h back and page backwards.
  const all: OiPoint[] = [];
  const maxHistoryMs = 60 * 24 * 60 * 60 * 1000;
  const fromMs = Date.now() - maxHistoryMs;
  let cursor = Date.now() - 2 * 3600_000; // start 2h back
  let safety = 0;

  while (cursor > fromMs && safety < 20) {
    safety++;
    const params = new URLSearchParams({
      symbol,
      period: '1h',
      startTime: String(cursor),
      limit: '500',
    });
    try {
      const res = await fetch(`https://fapi.binance.com/futures/data/openInterestHist?${params}`);
      if (!res.ok) break;
      const data = await res.json() as Array<{
        timestamp: number; sumOpenInterest: string; sumOpenInterestValue: string;
      }>;
      if (data.length === 0) break;
      for (const d of data) {
        if (d.timestamp >= fromMs) {
          all.unshift({
            timestamp: d.timestamp,
            openInterest: parseFloat(d.sumOpenInterest),
            notionalUsd: parseFloat(d.sumOpenInterestValue),
          });
        }
      }
      cursor = data[data.length - 1].timestamp - 1;
      await sleep(120);
    } catch {
      break;
    }
  }
  return all;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── Feature Computation ──────────────────────────────────────────────────────

function computeOiZScores(oi: OiPoint[], lookback: number): (number | null)[] {
  const zScores: (number | null)[] = [];
  for (let i = 0; i < oi.length; i++) {
    if (i < lookback) { zScores.push(null); continue; }
    const window = oi.slice(i - lookback, i).map(p => p.openInterest);
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const std = Math.sqrt(window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length);
    if (std === 0) { zScores.push(0); continue; }
    zScores.push((oi[i].openInterest - mean) / std);
  }
  return zScores;
}

function computeOiChange(oi: OiPoint[], lookback: number): (number | null)[] {
  const changes: (number | null)[] = [];
  for (let i = 0; i < oi.length; i++) {
    if (i < lookback) { changes.push(null); continue; }
    const prev = oi[i - lookback].openInterest;
    if (prev === 0) { changes.push(null); continue; }
    changes.push((oi[i].openInterest - prev) / prev);
  }
  return changes;
}

// ── Trade Simulation ─────────────────────────────────────────────────────────

function simulateTrades(
  funding: FundingPoint[],
  oi: OiPoint[],
  cfg: SweepConfig,
  costCfg: CostConfig,
): Trade[] {
  const trades: Trade[] = [];

  // Align on funding timestamps (every 8h). Each funding point is an opportunity to act.
  const oiByTs = new Map<number, OiPoint>();
  for (const p of oi) oiByTs.set(p.timestamp, p);

  // Compute OI features aligned to funding timestamps
  const oiAligned: Array<{ timestamp: number; openInterest: number; zScore: number | null; change: number | null }> = [];
  const oiLookback = 20;
  const zScores = computeOiZScores(oi, oiLookback);
  const oiChanges = computeOiChange(oi, oiLookback);

  for (let i = 0; i < oi.length; i++) {
    // Find the funding point closest to this OI timestamp
    const closestFunding = funding.find(f =>
      Math.abs(f.timestamp - oi[i].timestamp) < SETTLEMENT_MS
    );
    if (!closestFunding) continue;
    if (!oiByTs.has(closestFunding.timestamp)) {
      oiAligned.push({
        timestamp: closestFunding.timestamp,
        openInterest: oi[i].openInterest,
        zScore: zScores[i],
        change: oiChanges[i],
      });
    }
  }

  // Build aligned series: for each funding settlement, get OI features at nearest point
  interface AlignedBar {
    timestamp: number;
    fundingRate: number;
    markPrice: number;
    oiZScore: number | null;
    oiChange: number | null;
  }
  const bars: AlignedBar[] = [];
  for (const f of funding) {
    // Find nearest OI point (within 2h tolerance)
    let bestOi: OiPoint | null = null;
    let bestDist = Infinity;
    for (const o of oi) {
      const dist = Math.abs(o.timestamp - f.timestamp);
      if (dist < bestDist && dist < 2 * 3600_000) {
        bestDist = dist;
        bestOi = o;
      }
    }
    let oiZScore: number | null = null;
    let oiChange: number | null = null;
    if (bestOi) {
      const idx = oi.indexOf(bestOi);
      oiZScore = zScores[idx] ?? null;
      oiChange = oiChanges[idx] ?? null;
    }
    bars.push({
      timestamp: f.timestamp,
      fundingRate: f.fundingRate,
      markPrice: f.markPrice,
      oiZScore,
      oiChange,
    });
  }

  // Simulate: at each funding bar, decide to enter / hold / exit
  let position: { side: 'long' | 'short'; entryPrice: number; entryIndex: number } | null = null;

  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i];
    const prevBar = bars[i - 1];
    const price = bar.markPrice;

    // Check exit first
    if (position) {
      const holdBars = i - position.entryIndex;
      let exitReason: string | null = null;

      if (holdBars >= cfg.maxHoldBars) exitReason = 'maxhold';
      else if (cfg.mode === 'funding_only') {
        // Exit when funding flips direction relative to our position
        if (position.side === 'long' && bar.fundingRate > 0.0003) exitReason = 'funding_flip';
        if (position.side === 'short' && bar.fundingRate < -0.0003) exitReason = 'funding_flip';
      } else if (cfg.mode === 'oi_only') {
        // Exit when OI trend reverses
        if (position.side === 'long' && bar.oiChange !== null && bar.oiChange < -0.05) exitReason = 'oi_reversal';
        if (position.side === 'short' && bar.oiChange !== null && bar.oiChange > 0.05) exitReason = 'oi_reversal';
      } else {
        // Combined: exit on either flip
        if (position.side === 'long' && bar.fundingRate > 0.0005) exitReason = 'funding_flip';
        if (position.side === 'short' && bar.fundingRate < -0.0005) exitReason = 'funding_flip';
        if (!exitReason && bar.oiChange !== null && Math.abs(bar.oiChange) > 0.08) exitReason = 'oi_reversal';
      }

      if (exitReason) {
        const quantity = INITIAL_CAPITAL / position.entryPrice;
        const grossPnl = position.side === 'long'
          ? (price - position.entryPrice) * quantity
          : (position.entryPrice - price) * quantity;
        const notional = price * quantity;
        const cost = applyCosts(grossPnl, notional, costCfg);

        trades.push({
          entryTimestamp: bars[position.entryIndex].timestamp,
          exitTimestamp: bar.timestamp,
          side: position.side,
          entryPrice: position.entryPrice,
          exitPrice: price,
          quantity,
          pnl: cost.netPnl,
          fees: cost.fees,
          pnlPct: position.entryPrice > 0
            ? (cost.netPnl / (position.entryPrice * quantity)) * 100
            : 0,
          holdingBars: holdBars,
          exitReason,
        });
        position = null;
      }
    }

    // Check entry (only if no position)
    if (!position) {
      let direction: 'long' | 'short' | null = null;

      if (cfg.mode === 'funding_only' || cfg.mode === 'combined') {
        // Funding extreme: positive = crowded longs = short; negative = crowded shorts = long
        if (bar.fundingRate > cfg.fundingExtreme) direction = 'short';
        else if (bar.fundingRate < -cfg.fundingExtreme) direction = 'long';
      }

      if (cfg.mode === 'oi_only') {
        // OI surge = follow (new money entering): positive change = long, negative = short
        if (bar.oiChange !== null && bar.oiZScore !== null) {
          if (bar.oiChange > 0.1 && bar.oiZScore > cfg.oiZThreshold) direction = 'long';
          else if (bar.oiChange < -0.1 && bar.oiZScore < -cfg.oiZThreshold) direction = 'short';
        }
      }

      if (cfg.mode === 'combined' && direction) {
        // In combined mode, also weight OI signal
        if (bar.oiChange !== null && bar.oiZScore !== null) {
          if (bar.oiChange > 0.1 && bar.oiZScore > cfg.oiZThreshold && direction === 'short') {
            // Funding says short, OI says long — conflicting, skip
            direction = null;
          } else if (bar.oiChange < -0.1 && bar.oiZScore < -cfg.oiZThreshold && direction === 'long') {
            direction = null;
          }
        }
      }

      if (direction) {
        position = { side: direction, entryPrice: price, entryIndex: i };
      }
    }
  }

  // Close any open position at end
  if (position) {
    const lastBar = bars[bars.length - 1];
    const quantity = INITIAL_CAPITAL / position.entryPrice;
    const grossPnl = position.side === 'long'
      ? (lastBar.markPrice - position.entryPrice) * quantity
      : (position.entryPrice - lastBar.markPrice) * quantity;
    const cost = applyCosts(grossPnl, lastBar.markPrice * quantity, costCfg);
    trades.push({
      entryTimestamp: bars[position.entryIndex].timestamp,
      exitTimestamp: lastBar.timestamp,
      side: position.side,
      entryPrice: position.entryPrice,
      exitPrice: lastBar.markPrice,
      quantity,
      pnl: cost.netPnl,
      fees: cost.fees,
      pnlPct: 0,
      holdingBars: bars.length - 1 - position.entryIndex,
      exitReason: 'end_of_data',
    });
  }

  return trades;
}

// ── Metrics ──────────────────────────────────────────────────────────────────

function computeMetrics(trades: Trade[]): Omit<SweepResult, 'config'> {
  if (trades.length === 0) {
    return {
      trades: [], netPnl: 0, winRate: 0, expectancy: 0,
      sharpe: 0, bootstrapP5: 0, bootstrapP95: 0, profitFactor: 0, maxDrawdown: 0,
    };
  }

  const netPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const winRate = wins.length / trades.length;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
  const expectancy = winRate * avgWin + (1 - winRate) * avgLoss;

  // Sharpe (annualized)
  const pnls = trades.map(t => t.pnl);
  const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
  const variance = pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / pnls.length;
  const std = Math.sqrt(variance);
  const avgHoldBars = trades.reduce((s, t) => s + t.holdingBars, 0) / trades.length;
  const avgHoldHours = avgHoldBars * 8; // each bar is ~8 hours
  const tradesPerYear = avgHoldHours > 0 ? 8760 / avgHoldHours : 50;
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(tradesPerYear) : 0;

  // Bootstrap
  const nBoot = 1000;
  const means: number[] = [];
  for (let b = 0; b < nBoot; b++) {
    let sum = 0;
    for (let i = 0; i < pnls.length; i++) {
      sum += pnls[Math.floor(Math.random() * pnls.length)];
    }
    means.push(sum / pnls.length);
  }
  means.sort((a, b) => a - b);
  const bootstrapP5 = means[Math.floor(0.05 * nBoot)];
  const bootstrapP95 = means[Math.floor(0.95 * nBoot)];

  // Profit factor
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // Max drawdown
  let equity = 0, peak = 0, maxDd = 0;
  for (const t of trades) {
    equity += t.pnl;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDd) maxDd = dd;
  }

  return {
    trades, netPnl, winRate, expectancy,
    sharpe, bootstrapP5, bootstrapP95, profitFactor, maxDrawdown: maxDd,
  };
}

// ── Parameter Sweep ──────────────────────────────────────────────────────────

function buildSweepConfigs(): SweepConfig[] {
  const configs: SweepConfig[] = [];
  const fundingThresholds = [0.0001, 0.0003, 0.0005, 0.001, 0.002];
  const oiThresholds = [1.5, 2.0, 2.5, 3.0];
  const maxHolds = [3, 6, 12, 24]; // in 8h bars

  // Funding-only sweep
  for (const ft of fundingThresholds) {
    for (const mh of maxHolds) {
      configs.push({
        fundingExtreme: ft,
        oiZThreshold: 2.0,
        fundingWeight: 1,
        oiWeight: 0,
        maxHoldBars: mh,
        mode: 'funding_only',
      });
    }
  }

  // OI-only sweep
  for (const ot of oiThresholds) {
    for (const mh of maxHolds) {
      configs.push({
        fundingExtreme: 0.0005,
        oiZThreshold: ot,
        fundingWeight: 0,
        oiWeight: 1,
        maxHoldBars: mh,
        mode: 'oi_only',
      });
    }
  }

  // Combined sweep (top funding × top OI configs)
  for (const ft of [0.0003, 0.0005, 0.001]) {
    for (const ot of [1.5, 2.0]) {
      for (const mh of [6, 12]) {
        configs.push({
          fundingExtreme: ft,
          oiZThreshold: ot,
          fundingWeight: 0.6,
          oiWeight: 0.4,
          maxHoldBars: mh,
          mode: 'combined',
        });
      }
    }
  }

  return configs;
}

// ── Report ───────────────────────────────────────────────────────────────────

function buildReport(
  symbol: string,
  stressMode: StressMode,
  funding: FundingPoint[],
  oi: OiPoint[],
  results: SweepResult[],
): string {
  const costCfg = resolveStressConfig(stressMode);
  const md: string[] = [];

  md.push(`# Derivative Alpha Sweep — ${symbol}`);
  md.push('');
  md.push(`**Date:** ${new Date().toISOString().split('T')[0]}`);
  md.push(`**Exchange:** Binance Futures`);
  md.push(`**Cost Model:** fee=${costCfg.feePct}, slip=${costCfg.slipPct}, impact=${costCfg.marketImpactPct}`);
  md.push(`**Funding periods:** ${funding.length} | **OI points:** ${oi.length}`);
  md.push(`**Date range:** ${new Date(funding[0]?.timestamp ?? 0).toISOString().split('T')[0]} → ${new Date(funding[funding.length - 1]?.timestamp ?? 0).toISOString().split('T')[0]}`);
  md.push('');
  md.push('---');
  md.push('');

  // Summary by mode
  for (const mode of ['funding_only', 'oi_only', 'combined'] as const) {
    const modeResults = results.filter(r => r.config.mode === mode);
    if (modeResults.length === 0) continue;

    md.push(`## ${mode.replace('_', ' ').toUpperCase()} Results`);
    md.push('');
    md.push('| Funding Thresh | OI Z Thresh | Max Hold | Trades | Net PnL | Win% | Expectancy | Sharpe | Bootstrap 5% | Bootstrap 95% |');
    md.push('|---|---|---|---|---|---|---|---|---|---|');

    for (const r of modeResults) {
      md.push(
        `| ${r.config.fundingExtreme.toFixed(4)} | ${r.config.oiZThreshold} | ${r.config.maxHoldBars} | ` +
        `${r.trades.length} | ${fmtPnl(r.netPnl)} | ${(r.winRate * 100).toFixed(1)}% | ` +
        `${fmtPnl(r.expectancy)} | ${r.sharpe.toFixed(2)} | ${fmtPnl(r.bootstrapP5)} | ${fmtPnl(r.bootstrapP95)} |`
      );
    }
    md.push('');
  }

  // Top 5 by expectancy
  const sorted = [...results].sort((a, b) => b.expectancy - a.expectancy);
  md.push('## Top 5 Configurations by Expectancy');
  md.push('');
  for (let i = 0; i < Math.min(5, sorted.length); i++) {
    const r = sorted[i];
    md.push(`**#${i + 1} [${r.config.mode}]** funding≥${r.config.fundingExtreme.toFixed(4)} oiZ≥${r.config.oiZThreshold} maxHold=${r.config.maxHoldBars}`);
    md.push(`- Net PnL: ${fmtPnl(r.netPnl)} | Trades: ${r.trades.length} | Win: ${(r.winRate * 100).toFixed(1)}%`);
    md.push(`- Expectancy: ${fmtPnl(r.expectancy)}/trade | Sharpe: ${r.sharpe.toFixed(2)} | PF: ${r.profitFactor.toFixed(2)}`);
    md.push(`- Bootstrap 95% CI: [${fmtPnl(r.bootstrapP5)}, ${fmtPnl(r.bootstrapP95)}]`);
    md.push('');
  }

  // Exit reason breakdown for best config
  if (sorted.length > 0 && sorted[0].trades.length > 0) {
    const best = sorted[0];
    md.push('## Exit Reason Breakdown (Best Config)');
    md.push('');
    const reasons = new Map<string, { count: number; totalPnl: number }>();
    for (const t of best.trades) {
      const existing = reasons.get(t.exitReason) ?? { count: 0, totalPnl: 0 };
      existing.count++;
      existing.totalPnl += t.pnl;
      reasons.set(t.exitReason, existing);
    }
    md.push('| Exit Reason | Count | Total PnL | Avg PnL |');
    md.push('|---|---|---|---|');
    for (const [reason, { count, totalPnl }] of [...reasons.entries()].sort((a, b) => b[1].count - a[1].count)) {
      md.push(`| ${reason} | ${count} | ${fmtPnl(totalPnl)} | ${fmtPnl(totalPnl / count)} |`);
    }
    md.push('');
  }

  // Verdict
  const positiveCount = results.filter(r => r.expectancy > 0 && r.trades.length >= 10).length;
  md.push('## Verdict');
  md.push('');
  if (positiveCount > 0) {
    const bestOverall = sorted[0];
    const hasSignificantCi = bestOverall.bootstrapP5 > 0;
    md.push(`**${positiveCount} of ${results.length} configurations show positive expectancy** (≥10 trades).`);
    md.push('');
    md.push(`Best: [${bestOverall.config.mode}] ${fmtPnl(bestOverall.expectancy)}/trade, Sharpe ${bestOverall.sharpe.toFixed(2)}, ${bestOverall.trades.length} trades.`);
    if (hasSignificantCi) {
      md.push('**Bootstrap 95% CI does NOT cross zero** — this is a potentially real edge, not noise.');
    } else {
      md.push('**Bootstrap 95% CI crosses zero** — insufficient statistical confidence. Need more data or tighter signal.');
    }
  } else {
    md.push(`**No configuration shows statistically reliable positive expectancy.**`);
    md.push('');
    md.push('Derivative signals alone do not produce alpha on this asset/timeframe.');
  }

  return md.join('\n');
}

function fmtPnl(v: number): string {
  return v >= 0 ? `+$${v.toFixed(2)}` : `-$${Math.abs(v).toFixed(2)}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const [symbolArg, stressArg, daysArg] = process.argv.slice(2);
  const symbol = symbolArg?.toUpperCase() ?? 'BTCUSDT';
  const stressMode: StressMode = (stressArg as StressMode) ?? 'conservative';
  const days = parseInt(daysArg ?? '730', 10);

  console.log(`=== Derivative Alpha Sweep ===`);
  console.log(`Symbol: ${symbol} | Days: ${days} | Stress: ${stressMode}\n`);

  // Fetch data
  console.log(`Fetching funding rate history...`);
  const funding = await fetchFundingHistory(symbol, days);
  console.log(`  ${funding.length} funding periods loaded`);

  console.log(`Fetching OI history...`);
  const oi = await fetchOiHistory(symbol, days);
  console.log(`  ${oi.length} OI data points loaded`);

  if (funding.length < 50) {
    console.error('Insufficient funding data. Need at least 50 periods.');
    process.exit(1);
  }
  if (oi.length < 50) {
    console.warn(`Warning: only ${oi.length} OI points available (OI endpoint limited to ~60 days). OI-only and combined modes will use available data.`);
  }

  const costCfg = resolveStressConfig(stressMode);
  const configs = buildSweepConfigs();
  console.log(`\nRunning ${configs.length} configurations...\n`);

  const results: SweepResult[] = [];
  for (const cfg of configs) {
    const trades = simulateTrades(funding, oi, cfg, costCfg);
    const metrics = computeMetrics(trades);
    results.push({ ...metrics, config: cfg });
  }

  // Console summary
  const sorted = [...results].sort((a, b) => b.expectancy - a.expectancy);
  const positive = sorted.filter(r => r.expectancy > 0);
  const significant = positive.filter(r => r.bootstrapP5 > 0 && r.trades.length >= 10);

  console.log(`Results: ${results.length} configs | ${positive.length} positive expectancy | ${significant.length} statistically significant`);
  console.log(`\nTop 3 by expectancy:`);
  for (let i = 0; i < Math.min(3, sorted.length); i++) {
    const r = sorted[i];
    console.log(`  ${r.config.mode} | funding≥${r.config.fundingExtreme.toFixed(4)} oiZ≥${r.config.oiZThreshold} maxHold=${r.config.maxHoldBars} → ${fmtPnl(r.expectancy)}/trade (${r.trades.length} trades, Sharpe ${r.sharpe.toFixed(2)})`);
  }

  // Save report
  const report = buildReport(symbol, stressMode, funding, oi, results);
  const { mkdirSync, writeFileSync } = await import('fs');
  const { resolve, dirname } = await import('path');
  const reportPath = resolve(process.cwd(), 'plans/reports/derivative-sweep.md');
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, report, 'utf-8');
  console.log(`\nReport saved: ${reportPath}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
