#!/usr/bin/env npx tsx
// Spot-Perp Basis Trading Backtest — BTCUSDT
//
// Hypothesis #9: When spot-perp basis (funding rate) is extreme,
// it mean-reverts. Delta-neutral trades capture this convergence.
//
// Funding rate IS the basis: positive funding = perp premium over spot.
// We fetch BTCUSDT OHLCV (8h) for prices + Binance fapi funding rates.
// PnL = basis_change * notional, minus conservative costs.
//
// Usage:
//   npx tsx src/forest/backtest/basis-trading-backtest.ts
//   npx tsx src/forest/backtest/basis-trading-backtest.ts SYMBOL=BTCUSDT DAYS=730

import { fetchOHLCV } from './data-fetcher';
import { resolveStressConfig, applyCosts, type CostConfig } from './cost-model';
import type { Candle } from './ohlcv';

// ── Constants ────────────────────────────────────────────────────────────────

const SYMBOL = 'BTCUSDT';
const EXCHANGE = 'binance';
const INTERVAL = '8h';
const INITIAL_CAPITAL = 10_000;
const BOOTSTRAP_RESAMPLES = 5_000;
const OOS_TRAIN_RATIO = 0.65;
const WINDOW = 24; // 24 bars = 8 days at 8h intervals
const SETTLEMENT_MS = 8 * 60 * 60 * 1000;

// ── Types ────────────────────────────────────────────────────────────────────

interface FundingPoint {
  timestamp: number;
  fundingRate: number;
}

interface Trade {
  entryTimestamp: number;
  exitTimestamp: number;
  side: 'short_basis' | 'long_basis';
  entryBasis: number;
  exitBasis: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  fees: number;
  pnlPct: number;
  holdingBars: number;
  exitReason: string;
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

interface BasisConfig {
  zEntry: number;
  zExit: number;
  maxHoldBars: number;
}

interface BasisResult {
  config: BasisConfig;
  allTrades: Trade[];
  allMetrics: Metrics;
  trainMetrics: Metrics;
  testMetrics: Metrics;
}

// ── Data Fetching ─────────────────────────────────────────────────────────────

async function fetchFundingHistory(
  symbol: string,
  days: number,
): Promise<FundingPoint[]> {
  const all: FundingPoint[] = [];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let cursor = Date.now();

  while (cursor > cutoff) {
    const params = new URLSearchParams({
      symbol,
      limit: '1000',
      endTime: String(cursor),
    });
    const res = await fetch(
      `https://fapi.binance.com/fapi/v1/fundingRate?${params}`,
    );
    if (!res.ok) throw new Error(`[${res.status}] funding rate fetch`);
    const data = (await res.json()) as Array<{
      fundingTime: number;
      fundingRate: string;
    }>;
    if (data.length === 0) break;
    for (const d of data) {
      all.unshift({
        timestamp: d.fundingTime,
        fundingRate: parseFloat(d.fundingRate),
      });
    }
    cursor = data[0].fundingTime - 1;
    await new Promise((r) => setTimeout(r, 120));
  }
  return all.filter((p) => p.timestamp >= cutoff);
}

// ── Basis & Z-Score ──────────────────────────────────────────────────────────

function computeBasis(funding: FundingPoint[]): number[] {
  return funding.map((p) => p.fundingRate);
}

function computeZScore(values: number[], window: number): (number | null)[] {
  const zScores: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < window - 1) {
      zScores.push(null);
      continue;
    }
    const slice = values.slice(i - window + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance =
      slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length;
    const std = Math.sqrt(variance);
    zScores.push(std === 0 ? 0 : (values[i] - mean) / std);
  }
  return zScores;
}

// ── Price Lookup Helper ──────────────────────────────────────────────────────

function buildPriceMap(candles: Candle[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const c of candles) {
    map.set(c.timestamp, c.close);
  }
  return map;
}

function closestPrice(
  priceMap: Map<number, number>,
  targetTs: number,
): number {
  if (priceMap.has(targetTs)) return priceMap.get(targetTs)!;
  const entries = Array.from(priceMap);
  let bestTs = 0;
  let bestDist = Infinity;
  for (const [ts] of entries) {
    const dist = Math.abs(ts - targetTs);
    if (dist < bestDist) {
      bestDist = dist;
      bestTs = ts;
    }
  }
  return priceMap.get(bestTs) ?? 0;
}

// ── Trade Simulation ─────────────────────────────────────────────────────────

function simulateTrades(
  funding: FundingPoint[],
  basis: number[],
  zScores: (number | null)[],
  priceMap: Map<number, number>,
  cfg: BasisConfig,
  costCfg: CostConfig,
): Trade[] {
  const trades: Trade[] = [];
  let position: {
    side: 'short_basis' | 'long_basis';
    entryIndex: number;
    entryBasis: number;
    entryPrice: number;
  } | null = null;

  for (let i = 0; i < funding.length; i++) {
    const z = zScores[i];
    if (z === null) continue;

    if (position === null) {
      if (z > cfg.zEntry) {
        position = {
          side: 'short_basis',
          entryIndex: i,
          entryBasis: basis[i],
          entryPrice: closestPrice(priceMap, funding[i].timestamp),
        };
      } else if (z < -cfg.zEntry) {
        position = {
          side: 'long_basis',
          entryIndex: i,
          entryBasis: basis[i],
          entryPrice: closestPrice(priceMap, funding[i].timestamp),
        };
      }
    } else {
      const holdBars = i - position.entryIndex;
      let exitReason = '';

      if (holdBars >= cfg.maxHoldBars) {
        exitReason = 'maxhold';
      } else if (
        position.side === 'short_basis' &&
        z <= cfg.zExit
      ) {
        exitReason = 'z_revert';
      } else if (
        position.side === 'long_basis' &&
        z >= -cfg.zExit
      ) {
        exitReason = 'z_revert';
      }

      if (exitReason) {
        const direction = position.side === 'short_basis' ? 1 : -1;
        const basisChange = position.entryBasis - basis[i];
        const grossPnl = direction * basisChange * INITIAL_CAPITAL;
        const exitPrice = closestPrice(priceMap, funding[i].timestamp);
        const notional = INITIAL_CAPITAL;
        const cost = applyCosts(grossPnl, notional, costCfg);

        trades.push({
          entryTimestamp: funding[position.entryIndex].timestamp,
          exitTimestamp: funding[i].timestamp,
          side: position.side,
          entryBasis: position.entryBasis,
          exitBasis: basis[i],
          entryPrice: position.entryPrice,
          exitPrice,
          pnl: cost.netPnl,
          fees: cost.fees,
          pnlPct: cost.netPnl / INITIAL_CAPITAL,
          holdingBars: holdBars,
          exitReason,
        });
        position = null;
      }
    }
  }

  // Force-close any open position at end
  if (position !== null) {
    const last = funding.length - 1;
    const direction = position.side === 'short_basis' ? 1 : -1;
    const basisChange = position.entryBasis - basis[last];
    const grossPnl = direction * basisChange * INITIAL_CAPITAL;
    const cost = applyCosts(grossPnl, INITIAL_CAPITAL, costCfg);
    trades.push({
      entryTimestamp: funding[position.entryIndex].timestamp,
      exitTimestamp: funding[last].timestamp,
      side: position.side,
      entryBasis: position.entryBasis,
      exitBasis: basis[last],
      entryPrice: position.entryPrice,
      exitPrice: closestPrice(priceMap, funding[last].timestamp),
      pnl: cost.netPnl,
      fees: cost.fees,
      pnlPct: cost.netPnl / INITIAL_CAPITAL,
      holdingBars: last - position.entryIndex,
      exitReason: 'end_of_data',
    });
  }

  return trades;
}

// ── Metrics ──────────────────────────────────────────────────────────────────

function computeMetrics(trades: Trade[]): Metrics {
  if (trades.length === 0) {
    return {
      netPnl: 0,
      trades: 0,
      winRate: 0,
      expectancy: 0,
      sharpe: 0,
      ci95Lo: 0,
      ci95Hi: 0,
      profitFactor: 0,
      maxDrawdown: 0,
    };
  }

  const netPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const winRate = wins.length / trades.length;
  const expectancy = netPnl / trades.length;

  const grossWins = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLosses = Math.abs(
    losses.reduce((s, t) => s + t.pnl, 0),
  );
  const profitFactor =
    grossLosses === 0
      ? grossWins > 0
        ? Infinity
        : 0
      : grossWins / grossLosses;

  // Sharpe (annualised from trade-level PnL series)
  const pnls = trades.map((t) => t.pnl);
  const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
  const variance =
    pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / pnls.length;
  const std = Math.sqrt(variance);
  const avgHoldBars =
    trades.reduce((s, t) => s + t.holdingBars, 0) / trades.length;
  const avgHoldHours = avgHoldBars * 8;
  const tradesPerYear =
    avgHoldHours > 0 ? (365.25 * 24) / avgHoldHours : 0;
  const sharpe =
    std === 0 || tradesPerYear === 0
      ? 0
      : (mean / std) * Math.sqrt(tradesPerYear);

  // Bootstrap 95% CI on mean trade PnL
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
    netPnl,
    trades: trades.length,
    winRate,
    expectancy,
    sharpe,
    ci95Lo: ci.lo,
    ci95Hi: ci.hi,
    profitFactor,
    maxDrawdown,
  };
}

function bootstrapCI(
  samples: number[],
  resamples: number,
): { lo: number; hi: number } {
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
  return {
    lo: means[Math.floor(resamples * 0.025)],
    hi: means[Math.floor(resamples * 0.975)],
  };
}

// ── OOS Split ────────────────────────────────────────────────────────────────

function splitOOS(trades: Trade[]): { train: Trade[]; test: Trade[] } {
  const idx = Math.floor(trades.length * OOS_TRAIN_RATIO);
  return { train: trades.slice(0, idx), test: trades.slice(idx) };
}

// ── Config Sweep ─────────────────────────────────────────────────────────────

function buildConfigs(): BasisConfig[] {
  const zEntries = [1.5, 2.0, 2.5, 3.0];
  const zExits = [0.0, 0.3, 0.5];
  const maxHolds = [6, 12, 24];
  const configs: BasisConfig[] = [];
  for (const ze of zEntries) {
    for (const zx of zExits) {
      for (const mh of maxHolds) {
        configs.push({ zEntry: ze, zExit: zx, maxHoldBars: mh });
      }
    }
  }
  return configs;
}

// ── Report Builder ───────────────────────────────────────────────────────────

function fmtCI(lo: number, hi: number): string {
  const fmt = (v: number) =>
    v >= 0 ? `+$${v.toFixed(2)}` : `-$${Math.abs(v).toFixed(2)}`;
  return `${fmt(lo)} to ${fmt(hi)}`;
}

function buildReport(
  funding: FundingPoint[],
  results: BasisResult[],
  buyHoldReturn: number,
): string {
  const md: string[] = [];
  md.push(`# Spot-Perp Basis Trading Backtest — BTCUSDT`);
  md.push('');
  md.push(
    `**Hypothesis #9:** When spot-perp basis (funding rate) is extreme, it mean-reverts.`,
  );
  md.push(
    `Delta-neutral trades capture convergence back to fair value.`,
  );
  md.push('');
  md.push(`| Parameter | Value |`);
  md.push(`|-----------|-------|`);
  md.push(`| Symbol | BTCUSDT |`);
  md.push(`| Funding periods | ${funding.length} |`);
  md.push(`| Window | ${WINDOW} bars (${WINDOW * 8}h) |`);
  md.push(`| Cost model | conservative |`);
  md.push(`| Bootstrap resamples | ${BOOTSTRAP_RESAMPLES} |`);
  md.push(
    `| OOS split | ${(OOS_TRAIN_RATIO * 100).toFixed(0)}% / ${((1 - OOS_TRAIN_RATIO) * 100).toFixed(0)}% |`,
  );
  md.push(
    `| Buy-and-hold return | ${(buyHoldReturn * 100).toFixed(2)}% |`,
  );
  md.push('');

  // ── Full period results
  md.push('## Full Period Results');
  md.push('');
  md.push(
    '| zEntry | zExit | MaxHold | Trades | Net PnL | Win Rate | Expectancy | Sharpe | 95% CI | Profit Factor | Max DD |',
  );
  md.push(
    '|--------|-------|---------|--------|---------|----------|------------|--------|--------|---------------|--------|',
  );

  const sorted = [...results].sort(
    (a, b) => b.allMetrics.expectancy - a.allMetrics.expectancy,
  );
  for (const r of sorted) {
    const m = r.allMetrics;
    md.push(
      `| ${r.config.zEntry.toFixed(1)} | ${r.config.zExit.toFixed(1)} | ${r.config.maxHoldBars} | ${m.trades} | $${m.netPnl.toFixed(2)} | ${(m.winRate * 100).toFixed(1)}% | $${m.expectancy.toFixed(2)} | ${m.sharpe.toFixed(2)} | [${fmtCI(m.ci95Lo, m.ci95Hi)}] | ${m.profitFactor === Infinity ? 'Inf' : m.profitFactor.toFixed(2)} | ${(m.maxDrawdown * 100).toFixed(1)}% |`,
    );
  }
  md.push('');

  // ── OOS results
  md.push('## Out-of-Sample Results');
  md.push('');
  md.push(
    '| zEntry | zExit | MaxHold | Train Exp. | Test Exp. | Train Sharpe | Test Sharpe | Degradation |',
  );
  md.push(
    '|--------|-------|---------|------------|-----------|--------------|-------------|-------------|',
  );

  const oosSorted = [...results].sort(
    (a, b) => b.testMetrics.expectancy - a.testMetrics.expectancy,
  );
  for (const r of oosSorted) {
    const deg =
      r.trainMetrics.expectancy !== 0
        ? ((r.trainMetrics.expectancy - r.testMetrics.expectancy) /
            Math.abs(r.trainMetrics.expectancy)) *
          100
        : 0;
    md.push(
      `| ${r.config.zEntry.toFixed(1)} | ${r.config.zExit.toFixed(1)} | ${r.config.maxHoldBars} | $${r.trainMetrics.expectancy.toFixed(2)} | $${r.testMetrics.expectancy.toFixed(2)} | ${r.trainMetrics.sharpe.toFixed(2)} | ${r.testMetrics.sharpe.toFixed(2)} | ${deg.toFixed(0)}% |`,
    );
  }
  md.push('');

  // ── Verdict
  md.push('## Verdict');
  md.push('');

  const positiveOOS = oosSorted.filter(
    (r) => r.testMetrics.expectancy > 0 && r.testMetrics.trades >= 5,
  );
  const significantOOS = positiveOOS.filter(
    (r) => r.testMetrics.ci95Lo > 0,
  );

  if (significantOOS.length > 0) {
    const best = significantOOS[0];
    md.push(
      `**${significantOOS.length} of ${results.length} configs show statistically significant positive OOS expectancy.**`,
    );
    md.push('');
    md.push(
      `Best OOS: zEntry=${best.config.zEntry.toFixed(1)}, zExit=${best.config.zExit.toFixed(1)}, maxHold=${best.config.maxHoldBars}`,
    );
    md.push(
      `- Train expectancy: $${best.trainMetrics.expectancy.toFixed(2)}/trade, Sharpe ${best.trainMetrics.sharpe.toFixed(2)}`,
    );
    md.push(
      `- Test expectancy: $${best.testMetrics.expectancy.toFixed(2)}/trade, Sharpe ${best.testMetrics.sharpe.toFixed(2)}`,
    );
    md.push(
      `- Bootstrap 95% CI: [${fmtCI(best.testMetrics.ci95Lo, best.testMetrics.ci95Hi)}] — does NOT cross zero`,
    );
    md.push('');
    md.push(
      '**Basis mean-reversion may be a viable alpha source on BTCUSDT.**',
    );
  } else if (positiveOOS.length > 0) {
    md.push(
      `**${positiveOOS.length} configs show positive OOS expectancy, but none are statistically significant (CI crosses zero).**`,
    );
    md.push('');
    md.push(
      'Basis mean-reversion may have a weak edge, but not reliable enough for allocation.',
    );
  } else {
    md.push('**No configuration produces positive OOS expectancy.**');
    md.push('');
    md.push(
      'Basis mean-reversion does NOT produce alpha on BTCUSDT.',
    );
    md.push(
      'The spot-perp basis may be too efficient for retail-level extraction.',
    );
  }

  md.push('');

  // ── Trade distribution
  md.push('## Trade Distribution');
  md.push('');
  const bestAll = sorted[0];
  if (bestAll && bestAll.allTrades.length > 0) {
    const bySide = {
      short_basis: bestAll.allTrades.filter((t) => t.side === 'short_basis'),
      long_basis: bestAll.allTrades.filter((t) => t.side === 'long_basis'),
    };
    md.push(`**Best full-period config:** zEntry=${bestAll.config.zEntry.toFixed(1)}, zExit=${bestAll.config.zExit.toFixed(1)}, maxHold=${bestAll.config.maxHoldBars}`);
    md.push('');
    md.push(`| Side | Count | Avg PnL | Win Rate |`);
    md.push(`|------|-------|---------|----------|`);
    for (const [side, trades] of Object.entries(bySide)) {
      const avgPnl =
        trades.length > 0
          ? trades.reduce((s, t) => s + t.pnl, 0) / trades.length
          : 0;
      const wr =
        trades.length > 0
          ? trades.filter((t) => t.pnl > 0).length / trades.length
          : 0;
      md.push(
        `| ${side} | ${trades.length} | $${avgPnl.toFixed(2)} | ${(wr * 100).toFixed(1)}% |`,
      );
    }
    md.push('');

    // Exit reasons
    md.push('**Exit reasons:**');
    md.push('');
    const reasons = new Map<string, number>();
    for (const t of bestAll.allTrades) {
      reasons.set(t.exitReason, (reasons.get(t.exitReason) ?? 0) + 1);
    }
    const reasonEntries: [string, number][] = [];
    reasons.forEach((count, reason) => reasonEntries.push([reason, count]));
    for (const [reason, count] of reasonEntries) {
      md.push(`- ${reason}: ${count}`);
    }
  }

  return md.join('\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const symbolArg = args
    .find((a) => a.startsWith('SYMBOL='))
    ?.split('=')[1];
  const daysArg = args
    .find((a) => a.startsWith('DAYS='))
    ?.split('=')[1];

  const symbol = symbolArg?.toUpperCase() ?? SYMBOL;
  const days = parseInt(daysArg ?? '730', 10);

  console.log(`=== Spot-Perp Basis Trading Backtest ===`);
  console.log(
    `Hypothesis: Basis mean-reversion captures alpha`,
  );
  console.log(
    `Symbol: ${symbol} | Days: ${days} | Window: ${WINDOW} bars\n`,
  );

  // 1. Fetch OHLCV candles for prices
  const endMs = Date.now();
  const startMs = endMs - days * 24 * 60 * 60 * 1000;
  console.log(`Fetching ${days} days of ${INTERVAL} candles...`);
  const candles = await fetchOHLCV(
    EXCHANGE,
    symbol,
    INTERVAL,
    startMs,
    endMs,
  );
  console.log(`  ${candles.length} candles loaded`);

  // Buy-and-hold reference
  const firstClose = candles[0]?.close ?? 1;
  const lastClose = candles[candles.length - 1]?.close ?? 1;
  const buyHoldReturn = (lastClose - firstClose) / firstClose;
  console.log(
    `  Buy-and-hold: ${(buyHoldReturn * 100).toFixed(2)}% (${firstClose.toFixed(0)} → ${lastClose.toFixed(0)})\n`,
  );

  // 2. Fetch funding rate history
  console.log(`Fetching funding rate history...`);
  const funding = await fetchFundingHistory(symbol, days);
  console.log(`  ${funding.length} funding periods loaded\n`);

  if (funding.length < WINDOW + 10) {
    console.error(
      'Insufficient funding data. Need at least WINDOW + 10 periods.',
    );
    process.exit(1);
  }

  // 3. Compute basis and z-scores
  const basis = computeBasis(funding);
  const zScores = computeZScore(basis, WINDOW);

  const avgBasis =
    basis.reduce((a, b) => a + b, 0) / basis.length;
  const basisStd = Math.sqrt(
    basis.reduce((s, v) => s + (v - avgBasis) ** 2, 0) / basis.length,
  );
  console.log(
    `Basis stats: mean=${(avgBasis * 100).toFixed(4)}%, std=${(basisStd * 100).toFixed(4)}%, min=${(Math.min(...basis) * 100).toFixed(4)}%, max=${(Math.max(...basis) * 100).toFixed(4)}%`,
  );

  const priceMap = buildPriceMap(candles);

  // 4. Run config sweep
  const costCfg = resolveStressConfig('conservative');
  const configs = buildConfigs();
  console.log(
    `\nRunning ${configs.length} configurations (${OOS_TRAIN_RATIO * 100}% / ${(1 - OOS_TRAIN_RATIO) * 100}% train/test split)...\n`,
  );

  const results: BasisResult[] = [];

  for (const cfg of configs) {
    const trades = simulateTrades(
      funding,
      basis,
      zScores,
      priceMap,
      cfg,
      costCfg,
    );
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

    console.log(
      `  zEntry=${cfg.zEntry.toFixed(1)} zExit=${cfg.zExit.toFixed(1)} maxHold=${cfg.maxHoldBars} → ${trades.length} trades | full: $${metrics.netPnl.toFixed(2)} (${(metrics.winRate * 100).toFixed(1)}% WR) | test: $${testMetrics.netPnl.toFixed(2)}`,
    );
  }

  // 5. Console summary
  const sorted = [...results].sort(
    (a, b) => b.testMetrics.expectancy - a.testMetrics.expectancy,
  );
  const positiveOOS = sorted.filter(
    (r) => r.testMetrics.expectancy > 0 && r.testMetrics.trades >= 5,
  );
  const significant = positiveOOS.filter(
    (r) => r.testMetrics.ci95Lo > 0,
  );

  console.log(
    `\nOOS: ${positiveOOS.length} positive expectancy | ${significant.length} statistically significant`,
  );
  console.log(
    `Buy-and-hold return: ${(buyHoldReturn * 100).toFixed(2)}%`,
  );

  if (sorted.length > 0) {
    const best = sorted[0];
    console.log(
      `\nBest OOS: zEntry=${best.config.zEntry.toFixed(1)} zExit=${best.config.zExit.toFixed(1)} maxHold=${best.config.maxHoldBars}`,
    );
    console.log(
      `  Full:  $${best.allMetrics.expectancy.toFixed(2)}/trade, Sharpe ${best.allMetrics.sharpe.toFixed(2)}, ${best.allMetrics.trades} trades`,
    );
    console.log(
      `  Train: $${best.trainMetrics.expectancy.toFixed(2)}/trade, Sharpe ${best.trainMetrics.sharpe.toFixed(2)}`,
    );
    console.log(
      `  Test:  $${best.testMetrics.expectancy.toFixed(2)}/trade, Sharpe ${best.testMetrics.sharpe.toFixed(2)}`,
    );
    console.log(
      `  CI95:  [${fmtCI(best.testMetrics.ci95Lo, best.testMetrics.ci95Hi)}]`,
    );
  }

  // 6. Save report
  const report = buildReport(funding, results, buyHoldReturn);
  const { mkdirSync, writeFileSync } = await import('fs');
  const { resolve, dirname } = await import('path');
  const reportPath = resolve(
    process.cwd(),
    'plans/reports/basis-trading-backtest.md',
  );
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, report, 'utf-8');
  console.log(`\nReport saved: ${reportPath}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
