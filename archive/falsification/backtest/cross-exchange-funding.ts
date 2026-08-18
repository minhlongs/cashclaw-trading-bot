#!/usr/bin/env npx tsx
// Cross-Exchange Funding Rate Arbitrage Backtest
//
// Insight: When Binance funding rate is 0.1% but Bybit is 0.05% for the same asset,
// the arbitrage is to short Binance perp + long Bybit perp. This is a delta-neutral
// trade that profits from the funding differential regardless of price direction.
//
// The script fetches historical funding rates from Binance, Bybit, and OKX, computes
// pairwise differentials, and backtests an arbitrage strategy at various thresholds.
//
// Usage:
//   npx tsx src/forest/backtest/cross-exchange-funding.ts [days]
//
// Defaults: 365 days

import { resolveStressConfig, applyCosts, type CostConfig } from './cost-model';

// ── Types ──────────────────────────────────────────────────────────────────────

interface FundingPoint {
  timestamp: number;
  rate: number;
  exchange: string;
}

interface AlignedPeriod {
  timestamp: number;
  binance: number | null;
  bybit: number | null;
  okx: number | null;
}

interface ArbTrade {
  symbol: string;
  pair: string;       // e.g. "Binance-Bybit"
  entryTime: number;
  exitTime: number;
  entryDiff: number;
  exitDiff: number;
  grossFunding: number;
  netPnl: number;
  holdingPeriods: number;
  exitReason: 'diff_revert' | 'max_hold' | 'signal_end';
}

interface SweepResult {
  threshold: number;
  trades: ArbTrade[];
  totalPnl: number;
  totalFees: number;
  avgPnl: number;
  winRate: number;
  sharpe: number;
  bootstrapP5: number;
  bootstrapP95: number;
  profitFactor: number;
}

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] as const;
const PAIRS: [string, string][] = [
  ['binance', 'bybit'],
  ['binance', 'okx'],
  ['bybit', 'okx'],
];
const FUNDING_INTERVAL_MS = 8 * 60 * 60 * 1000; // 8 hours in ms

// ── Data Fetching ──────────────────────────────────────────────────────────────

async function fetchBinanceFunding(symbol: string, startTimeMs: number, endTimeMs: number): Promise<FundingPoint[]> {
  const all: FundingPoint[] = [];
  let cursor = startTimeMs;
  const batchSize = 1000;

  while (cursor < endTimeMs) {
    const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&startTime=${cursor}&limit=${batchSize}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`[${res.status}] Binance funding rate fetch`);
    const data = (await res.json()) as Array<{
      fundingTime: number;
      fundingRate: string;
    }>;
    if (!Array.isArray(data) || data.length === 0) break;

    for (const r of data) {
      const ts = r.fundingTime;
      const rate = parseFloat(r.fundingRate);
      if (ts >= startTimeMs && ts <= endTimeMs && !Number.isNaN(rate)) {
        all.push({ timestamp: ts, rate, exchange: 'binance' });
      }
    }

    const lastTs = data[data.length - 1].fundingTime;
    cursor = lastTs + 1;
    if (data.length < batchSize) break;
  }

  return all;
}

async function fetchBybitFunding(symbol: string, startTimeMs: number, endTimeMs: number): Promise<FundingPoint[]> {
  const all: FundingPoint[] = [];
  // Bybit V5 funding-rate endpoint: returns up to 200 records, 8h intervals.
  // The endpoint only accepts startTime/endTime for recent data.
  // Fetch multiple batches by adjusting start_time.
  const batchMs = 200 * FUNDING_INTERVAL_MS; // max ~66 days per batch
  let batchStart = startTimeMs;

  while (batchStart < endTimeMs) {
    const batchEnd = Math.min(batchStart + batchMs, endTimeMs);
    const url = `https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${symbol}&startTime=${batchStart}&endTime=${batchEnd}&limit=200`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`[${res.status}] Bybit funding rate fetch`);
    const json = (await res.json()) as { retCode: number; result: { list: Array<{ fundingRate: string; fundingRateTimestamp: string }> } };
    if (json.retCode !== 0) throw new Error(`Bybit API error: ${json.retCode}`);

    const list = json.result?.list ?? [];
    if (list.length === 0) {
      batchStart = batchEnd + 1;
      continue;
    }

    for (const r of list) {
      const ts = parseInt(r.fundingRateTimestamp, 10);
      const rate = parseFloat(r.fundingRate);
      if (ts >= startTimeMs && ts <= endTimeMs && !Number.isNaN(rate)) {
        all.push({ timestamp: ts, rate, exchange: 'bybit' });
      }
    }

    batchStart = batchEnd + 1;
  }

  return all;
}

async function fetchOkxFunding(symbol: string, startTimeMs: number, endTimeMs: number): Promise<FundingPoint[]> {
  // OKX public funding-rate-history endpoint requires instId in format
  // BTCUSDT-SWAP. Returns 51001 if instId is malformed or unsupported.
  // We attempt the call but degrade gracefully on failure — the arbitrage
  // can still run on Binance vs Bybit alone.
  const all: FundingPoint[] = [];
  const instId = `${symbol}-SWAP`;
  let after: string | undefined;

  const maxIter = 50;
  for (let i = 0; i < maxIter; i++) {
    const params = new URLSearchParams({ instId, limit: '100' });
    if (after) params.set('after', after);
    const url = `https://www.okx.com/api/v5/public/funding-rate-history?${params.toString()}`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      console.error(`  OKX fetch failed (network), skipping OKX`);
      return [];
    }
    if (!res.ok) {
      console.error(`  OKX fetch error ${res.status}, skipping OKX`);
      return [];
    }
    const json = (await res.json()) as {
      code: string;
      data: Array<{ fundingTime: string; fundingRate: string }>;
    };
    if (json.code !== '0') {
      console.error(`  OKX API error ${json.code}, skipping OKX`);
      return [];
    }

    const data = json.data ?? [];
    if (data.length === 0) break;

    let hitBefore = false;
    for (const r of data) {
      const ts = parseInt(r.fundingTime, 10);
      const rate = parseFloat(r.fundingRate);
      if (!Number.isNaN(rate)) {
        if (ts >= startTimeMs && ts <= endTimeMs) {
          all.push({ timestamp: ts, rate, exchange: 'okx' });
        }
        if (ts < startTimeMs) {
          hitBefore = true;
        }
      }
    }

    if (hitBefore) break;
    after = data[data.length - 1].fundingTime;
  }

  return all;
}

// ── Data Alignment ─────────────────────────────────────────────────────────────

/**
 * Align funding rates from all exchanges into 8-hour periods.
 * Within each 8-hour bin, take the most recent rate from each exchange.
 * This handles the fact that different exchanges publish at slightly different times.
 */
function alignFundingRates(
  binance: FundingPoint[],
  bybit: FundingPoint[],
  okx: FundingPoint[],
  startMs: number,
  endMs: number,
): AlignedPeriod[] {
  // Build sorted arrays per exchange
  const binanceSorted = binance
    .filter(r => r.timestamp >= startMs && r.timestamp <= endMs)
    .sort((a, b) => a.timestamp - b.timestamp);
  const bybitSorted = bybit
    .filter(r => r.timestamp >= startMs && r.timestamp <= endMs)
    .sort((a, b) => a.timestamp - b.timestamp);
  const okxSorted = okx
    .filter(r => r.timestamp >= startMs && r.timestamp <= endMs)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (binanceSorted.length === 0 && bybitSorted.length === 0 && okxSorted.length === 0) {
    return [];
  }

  // Compute bin boundaries: 8-hour periods from the earliest timestamp
  const allFirst = [
    binanceSorted[0]?.timestamp,
    bybitSorted[0]?.timestamp,
    okxSorted[0]?.timestamp,
  ].filter((t): t is number => t !== undefined);

  const binStart = Math.min(...allFirst);
  const binEnd = Math.max(
    binanceSorted[binanceSorted.length - 1]?.timestamp ?? 0,
    bybitSorted[bybitSorted.length - 1]?.timestamp ?? 0,
    okxSorted[okxSorted.length - 1]?.timestamp ?? 0,
  );

  const bins: AlignedPeriod[] = [];
  let bIdx = 0, yIdx = 0, oIdx = 0; // cursors into each sorted array

  for (let edge = binStart + FUNDING_INTERVAL_MS; edge <= binEnd + FUNDING_INTERVAL_MS; edge += FUNDING_INTERVAL_MS) {
    // Advance cursors: find last rate from each exchange with ts < edge
    let bRate: number | null = null;
    while (bIdx < binanceSorted.length && binanceSorted[bIdx].timestamp < edge) {
      bRate = binanceSorted[bIdx].rate;
      bIdx++;
    }
    let yRate: number | null = null;
    while (yIdx < bybitSorted.length && bybitSorted[yIdx].timestamp < edge) {
      yRate = bybitSorted[yIdx].rate;
      yIdx++;
    }
    let oRate: number | null = null;
    while (oIdx < okxSorted.length && okxSorted[oIdx].timestamp < edge) {
      oRate = okxSorted[oIdx].rate;
      oIdx++;
    }

    if (bRate !== null || yRate !== null || oRate !== null) {
      bins.push({ timestamp: edge, binance: bRate, bybit: yRate, okx: oRate });
    }
  }

  return bins;
}

// ── Backtest ───────────────────────────────────────────────────────────────────

function runArbBacktest(
  aligned: AlignedPeriod[],
  symbol: string,
  pair: [string, string],
  threshold: number,
  costCfg: CostConfig,
  maxHoldingPeriods: number,
): ArbTrade[] {
  const trades: ArbTrade[] = [];
  let inPosition = false;
  let entryIdx = 0;
  let entryDiff = 0;

  const [exA, exB] = pair;

  const getRate = (p: AlignedPeriod, ex: string): number | null => {
    switch (ex) {
      case 'binance': return p.binance;
      case 'bybit':   return p.bybit;
      case 'okx':     return p.okx;
      default:        return null;
    }
  };

  for (let i = 0; i < aligned.length; i++) {
    const rateA = getRate(aligned[i], exA);
    const rateB = getRate(aligned[i], exB);

    if (rateA === null || rateB === null) continue;

    const diff = rateA - rateB; // positive means exA pays more = short exA, long exB

    if (!inPosition) {
      // Entry: differential exceeds threshold
      if (Math.abs(diff) >= threshold) {
        inPosition = true;
        entryIdx = i;
        entryDiff = diff;
      }
    } else {
      // In position: collect funding each period
      const holdingPeriods = i - entryIdx;
      const diffReverted = Math.abs(diff) < threshold;
      const maxHold = holdingPeriods >= maxHoldingPeriods;

      if (diffReverted || maxHold) {
        // Exit trade: close at the current differential level
        const grossFunding = holdingPeriods * Math.abs(entryDiff);
        const notional = 1.0; // unit notional; costs scale proportionally
        const entryCosts = applyCosts(0, notional, costCfg);
        const exitCosts = applyCosts(0, notional, costCfg);
        const totalCost = entryCosts.fees + entryCosts.slippage + entryCosts.marketImpact
                        + exitCosts.fees + exitCosts.slippage + exitCosts.marketImpact;
        const netPnl = grossFunding - totalCost;

        trades.push({
          symbol,
          pair: `${exA}-${exB}`,
          entryTime: aligned[entryIdx].timestamp,
          exitTime: aligned[i].timestamp,
          entryDiff,
          exitDiff: diff,
          grossFunding,
          netPnl,
          holdingPeriods,
          exitReason: maxHold ? 'max_hold' : 'diff_revert',
        });

        inPosition = false;

        // If diff still exceeds threshold after exit, re-enter immediately
        if (Math.abs(diff) >= threshold) {
          inPosition = true;
          entryIdx = i;
          entryDiff = diff;
        }
      }
    }
  }

  // Close any open position at end of data
  if (inPosition) {
    const last = aligned[aligned.length - 1];
    const holdingPeriods = aligned.length - 1 - entryIdx;
    if (holdingPeriods > 0) {
      const grossFunding = holdingPeriods * Math.abs(entryDiff);
      const notional = 1.0;
      const entryCosts = applyCosts(0, notional, costCfg);
      const exitCosts = applyCosts(0, notional, costCfg);
      const totalCost = entryCosts.fees + entryCosts.slippage + entryCosts.marketImpact
                      + exitCosts.fees + exitCosts.slippage + exitCosts.marketImpact;
      const netPnl = grossFunding - totalCost;

      trades.push({
        symbol,
        pair: `${exA}-${exB}`,
        entryTime: aligned[entryIdx].timestamp,
        exitTime: last.timestamp,
        entryDiff,
        exitDiff: 0,
        grossFunding,
        netPnl,
        holdingPeriods,
        exitReason: 'signal_end',
      });
    }
  }

  return trades;
}

// ── Statistics ─────────────────────────────────────────────────────────────────

function computeStats(trades: ArbTrade[], costCfg: CostConfig): Omit<SweepResult, 'threshold'> {
  if (trades.length === 0) {
    return {
      trades: [],
      totalPnl: 0,
      totalFees: 0,
      avgPnl: 0,
      winRate: 0,
      sharpe: 0,
      bootstrapP5: 0,
      bootstrapP95: 0,
      profitFactor: 0,
    };
  }

  const pnls = trades.map(t => t.netPnl);
  const wins = pnls.filter(p => p > 0);
  const losses = pnls.filter(p => p <= 0);

  const totalPnl = pnls.reduce((a, b) => a + b, 0);
  const totalFees = trades.length * (costCfg.feePct + costCfg.slipPct + costCfg.marketImpactPct) * 2; // entry + exit
  const avgPnl = totalPnl / trades.length;
  const winRate = wins.length / trades.length;

  // Sharpe
  const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
  const variance = pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / pnls.length;
  const std = Math.sqrt(variance);
  const avgHoldPeriods = trades.reduce((s, t) => s + t.holdingPeriods, 0) / trades.length;
  const avgHoldHours = avgHoldPeriods * 8;
  const tradesPerYear = avgHoldHours > 0 ? 8760 / avgHoldHours : 50;
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(tradesPerYear) : 0;

  // Bootstrap 90% CI
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
  const grossWins = wins.reduce((a, b) => a + b, 0);
  const grossLosses = Math.abs(losses.reduce((a, b) => a + b, 0));
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0;

  return { trades, totalPnl, totalFees, avgPnl, winRate, sharpe, bootstrapP5, bootstrapP95, profitFactor };
}

// ── Report ─────────────────────────────────────────────────────────────────────

function buildReport(
  symbol: string,
  costCfg: CostConfig,
  bins: AlignedPeriod[],
  results: SweepResult[],
): string {
  const md: string[] = [];

  md.push(`# Cross-Exchange Funding Rate Arbitrage Backtest — ${symbol}`);
  md.push('');
  md.push(`**Date:** ${new Date().toISOString().split('T')[0]}`);
  md.push(`**Exchanges:** Binance Futures, Bybit Linear, OKX Perpetual`);
  md.push(`**Cost Model:** fee=${costCfg.feePct}, slip=${costCfg.slipPct}, impact=${costCfg.marketImpactPct}`);
  md.push(`**Aligned periods:** ${bins.length} (8-hour intervals)`);
  if (bins.length > 0) {
    const first = new Date(bins[0].timestamp).toISOString().split('T')[0];
    const last = new Date(bins[bins.length - 1].timestamp).toISOString().split('T')[0];
    md.push(`**Date range:** ${first} → ${last}`);
  }
  md.push('');
  md.push('## Strategy');
  md.push('');
  md.push('Delta-neutral funding rate arbitrage between exchanges.');
  md.push('When the funding rate differential between two exchanges exceeds a threshold:');
  md.push('- **Short** the perpetual on the exchange paying the higher rate');
  md.push('- **Long** the perpetual on the exchange paying the lower rate');
  md.push('- **Collect** the differential each 8-hour funding period');
  md.push('- **Exit** when the differential reverts below threshold or max hold reached');
  md.push('');
  md.push('## Key Assumptions');
  md.push('');
  md.push('- Same notional size on both legs (delta-neutral)');
  md.push('- Funding rate differential is captured as gross PnL per period');
  md.push('- No leverage used in the calculation');
  md.push('- Entry/exit costs applied at each trade open and close');
  md.push('');

  for (const result of results) {
    md.push(`## Threshold: ${(result.threshold * 100).toFixed(2)}%`);
    md.push('');
    md.push(`| Metric | Value |`);
    md.push(`|--------|-------|`);
    md.push(`| Trades | ${result.trades.length} |`);
    md.push(`| Total Net PnL | ${result.totalPnl.toFixed(4)} |`);
    md.push(`| Total Fees | ${result.totalFees.toFixed(4)} |`);
    md.push(`| Avg PnL/trade | ${result.avgPnl.toFixed(6)} |`);
    md.push(`| Win Rate | ${(result.winRate * 100).toFixed(1)}% |`);
    md.push(`| Sharpe (annualized) | ${result.sharpe.toFixed(2)} |`);
    md.push(`| Bootstrap 90% CI | [${result.bootstrapP5.toFixed(4)}, ${result.bootstrapP95.toFixed(4)}] |`);
    md.push(`| Profit Factor | ${result.profitFactor === Infinity ? '∞' : result.profitFactor.toFixed(2)} |`);
    md.push('');

    // Trade breakdown by pair
    const pairs = Array.from(new Set(result.trades.map(t => t.pair)));
    if (pairs.length > 0 && result.trades.length > 0) {
      md.push(`### By Exchange Pair`);
      md.push('');
      md.push(`| Pair | Trades | Win Rate | Avg PnL |`);
      md.push(`|------|--------|----------|---------|`);
      for (const pair of pairs) {
        const pairTrades = result.trades.filter(t => t.pair === pair);
        const pairWins = pairTrades.filter(t => t.netPnl > 0).length;
        const pairAvgPnl = pairTrades.reduce((s, t) => s + t.netPnl, 0) / pairTrades.length;
        md.push(`| ${pair} | ${pairTrades.length} | ${(pairWins / pairTrades.length * 100).toFixed(1)}% | ${pairAvgPnl.toFixed(6)} |`);
      }
      md.push('');
    }

    // Top 5 trades
    if (result.trades.length > 0) {
      const sorted = [...result.trades].sort((a, b) => b.netPnl - a.netPnl);
      const top5 = sorted.slice(0, 5);
      md.push(`### Top 5 Trades`);
      md.push('');
      md.push(`| Entry | Exit | Pair | Diff | PnL |`);
      md.push(`|-------|------|------|------|-----|`);
      for (const t of top5) {
        const entryDate = new Date(t.entryTime).toISOString().split('T')[0];
        const exitDate = new Date(t.exitTime).toISOString().split('T')[0];
        md.push(`| ${entryDate} | ${exitDate} | ${t.pair} | ${t.entryDiff.toFixed(4)} | ${t.netPnl.toFixed(4)} |`);
      }
      md.push('');
    }
  }

  // Summary comparison
  md.push('## Summary Comparison');
  md.push('');
  md.push(`| Threshold | Trades | Total PnL | Win% | Sharpe | Bootstrap CI |`);
  md.push(`|-----------|--------|-----------|------|--------|--------------|`);
  for (const r of results) {
    md.push(`| ${(r.threshold * 100).toFixed(2)}% | ${r.trades.length} | ${r.totalPnl.toFixed(4)} | ${(r.winRate * 100).toFixed(1)}% | ${r.sharpe.toFixed(2)} | [${r.bootstrapP5.toFixed(4)}, ${r.bootstrapP95.toFixed(4)}] |`);
  }
  md.push('');

  // Verdict
  const bestResult = results.reduce((best, r) => r.sharpe > best.sharpe ? r : best, results[0]);
  md.push('## Verdict');
  md.push('');
  if (bestResult.sharpe > 1 && bestResult.trades.length > 20) {
    md.push(`The signal shows promise at threshold ${(bestResult.threshold * 100).toFixed(2)}% with Sharpe ${bestResult.sharpe.toFixed(2)}.`);
    md.push(`Consider paper trading before live deployment.`);
  } else if (bestResult.sharpe > 0) {
    md.push(`Weakly positive signal at best (Sharpe ${bestResult.sharpe.toFixed(2)}).`);
    md.push(`Likely not tradeable after realistic costs. Needs more data or refinement.`);
  } else {
    md.push(`Signal does NOT produce tradeable alpha.`);
    md.push(`Negative or zero Sharpe across all thresholds after costs.`);
    md.push(`This is the honest result — not all academic signals survive real-world constraints.`);
  }

  return md.join('\n');
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function runSymbol(symbol: string, days: number): Promise<void> {
  const now = Date.now();
  const startMs = now - days * 24 * 60 * 60 * 1000;
  const costCfg = resolveStressConfig('conservative');
  const thresholds = [0.0001, 0.0003, 0.0005];

  console.log(`\n=== Cross-Exchange Funding Arbitrage: ${symbol} ===`);
  console.log(`Period: ${days} days | Cost: fee=${costCfg.feePct} slip=${costCfg.slipPct} impact=${costCfg.marketImpactPct}\n`);

  // Fetch funding rates from all three exchanges
  console.log('Fetching Binance funding rates...');
  const binanceFunding = await fetchBinanceFunding(symbol, startMs, now);
  console.log(`  ${binanceFunding.length} periods loaded`);

  console.log('Fetching Bybit funding rates...');
  const bybitFunding = await fetchBybitFunding(symbol, startMs, now);
  console.log(`  ${bybitFunding.length} periods loaded`);

  console.log('Fetching OKX funding rates...');
  const okxFunding = await fetchOkxFunding(symbol, startMs, now);
  console.log(`  ${okxFunding.length} periods loaded`);

  // Align data into 8-hour periods
  const aligned = alignFundingRates(binanceFunding, bybitFunding, okxFunding, startMs, now);
  console.log(`\nAligned periods: ${aligned.length}`);

  if (aligned.length < 10) {
    console.error('Insufficient aligned data. Need at least 10 periods.');
    return;
  }

  // Compute differential statistics
  const diffs: { pair: string; values: number[] }[] = PAIRS.map(([a, b]) => ({
    pair: `${a}-${b}`,
    values: aligned
      .filter(p => {
        const rateA = a === 'binance' ? p.binance : a === 'bybit' ? p.bybit : p.okx;
        const rateB = b === 'binance' ? p.binance : b === 'bybit' ? p.bybit : p.okx;
        return rateA !== null && rateB !== null;
      })
      .map(p => {
        const rateA = a === 'binance' ? p.binance! : a === 'bybit' ? p.bybit! : p.okx!;
        const rateB = b === 'binance' ? p.binance! : b === 'bybit' ? p.bybit! : p.okx!;
        return rateA - rateB;
      }),
  }));

  console.log('\nDifferential Statistics:');
  for (const d of diffs) {
    if (d.values.length === 0) continue;
    const mean = d.values.reduce((a, b) => a + b, 0) / d.values.length;
    const max = Math.max(...d.values);
    const min = Math.min(...d.values);
    const absMean = d.values.reduce((a, b) => a + Math.abs(b), 0) / d.values.length;
    console.log(`  ${d.pair}: mean=${mean.toFixed(5)} absMean=${absMean.toFixed(5)} min=${min.toFixed(5)} max=${max.toFixed(5)} n=${d.values.length}`);
  }

  // Run sweep across thresholds for each pair, then combine
  const results: SweepResult[] = [];
  for (const threshold of thresholds) {
    const allTrades: ArbTrade[] = [];
    for (const pair of PAIRS) {
      const trades = runArbBacktest(aligned, symbol, pair, threshold, costCfg, 10);
      allTrades.push(...trades);
    }
    const stats = computeStats(allTrades, costCfg);
    results.push({ threshold, ...stats });
  }

  // Print results to console
  for (const r of results) {
    console.log(`\nThreshold ${(r.threshold * 100).toFixed(2)}%: ${r.trades.length} trades, PnL=${r.totalPnl.toFixed(4)}, Win=${(r.winRate * 100).toFixed(1)}%, Sharpe=${r.sharpe.toFixed(2)}`);
  }

  // Build and save report
  const report = buildReport(symbol, costCfg, aligned, results);
  const { mkdirSync, writeFileSync } = await import('fs');
  const { resolve, dirname } = await import('path');
  const reportPath = resolve(process.cwd(), 'plans/reports/cross-exchange-funding.md');
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, report, 'utf-8');
  console.log(`\nReport saved: ${reportPath}`);
}

async function main(): Promise<void> {
  const daysArg = process.argv[2];
  const days = parseInt(daysArg ?? '365', 10);

  console.log(`=== Cross-Exchange Funding Rate Arbitrage Sweep ===`);
  console.log(`Symbols: ${SYMBOLS.join(', ')} | Days: ${days}\n`);

  // Run BTCUSDT first as the primary test case (most liquid)
  await runSymbol('BTCUSDT', days);

  console.log('\n\nDone.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
