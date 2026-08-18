#!/usr/bin/env npx tsx
// Sentiment × Funding Rate Composite Filter Backtest — SOL
//
// Hypothesis #10: Double contrarian — require BOTH sentiment AND funding to agree.
// When F&G < fearThreshold AND funding > 0 (crowded longs in fear) → SHORT
// When F&G > greedThreshold AND funding < 0 (crowded shorts in greed) → LONG
//
// Data: Fear & Greed Index (alternative.me) + Binance perpetual funding rate
//
// Usage: npx tsx src/forest/backtest/sentiment-funding-composite.ts

import { resolveStressConfig, applyCosts, type CostConfig } from './cost-model';

// ── Constants ──────────────────────────────────────────────────────────────

const PINNED_END_MS = new Date('2025-09-19T00:00:00Z').getTime();
const LOOKBACK_DAYS = 730; // 2 years of data
const INITIAL_CAPITAL = 10_000;
const SETTLEMENT_MS = 8 * 60 * 60 * 1000; // 8h funding interval
const N_BOOT = 1000;

// ── Types ──────────────────────────────────────────────────────────────────

interface FngPoint {
  timestamp: number; // ms
  value: number;     // 0-100
}

interface FundingPoint {
  timestamp: number; // ms
  fundingRate: number;
  markPrice: number;
}

interface Trade {
  entryTimestamp: number;
  exitTimestamp: number;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  holdingBars: number;
  exitReason: string;
  fngAtEntry: number;
  fundingAtEntry: number;
}

interface Metrics {
  trades: number;
  netPnl: number;
  winRate: number;
  expectancy: number;
  sharpe: number;
  profitFactor: number;
  ci95Lo: number;
  ci95Hi: number;
  maxDrawdown: number;
}

interface SweepConfig {
  fngThreshold: number;
  fundingThreshold: number;
  maxHold: number;
}

interface ConfigResult {
  config: SweepConfig;
  allMetrics: Metrics;
  oosMetrics: Metrics | null;
}

// ── Data Fetching ──────────────────────────────────────────────────────────

async function fetchFngHistory(endMs: number): Promise<FngPoint[]> {
  const all: FngPoint[] = [];
  const startMs = endMs - LOOKBACK_DAYS * 86_400_000;
  let page = 1;
  const perPage = 365;

  while (true) {
    const url = `https://api.alternative.me/fng/?limit=${perPage}&page=${page}`;
    let body: { data: Array<{ value: string; timestamp: string }> } | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch(url);
      if (!res.ok) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      try {
        body = await res.json() as { data: Array<{ value: string; timestamp: string }> };
      } catch {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      if (!body!.data || body!.data.length === 0) break;
      break;
    }
    if (!body || !body.data || body.data.length === 0) break;

    for (const d of body.data) {
      const ts = Number(d.timestamp) * 1000;
      if (ts < startMs) break;
      if (ts <= endMs) {
        all.push({ timestamp: ts, value: parseInt(d.value, 10) });
      }
    }
    const oldestTs = Number(body.data[body.data.length - 1].timestamp) * 1000;
    if (oldestTs < startMs || body.data.length < perPage) break;
    page++;
    await new Promise(r => setTimeout(r, 1500)); // rate-limit guard
  }

  all.sort((a, b) => a.timestamp - b.timestamp);
  return all;
}

async function fetchFundingHistory(
  symbol: string,
  endMs: number,
): Promise<FundingPoint[]> {
  const all: FundingPoint[] = [];
  const seen = new Set<number>();
  const startMs = endMs - LOOKBACK_DAYS * 86_400_000;
  let cursor = endMs;

  while (cursor > startMs) {
    const params = new URLSearchParams({
      symbol,
      startTime: String(Math.max(startMs, cursor - 1000 * SETTLEMENT_MS)),
      endTime: String(cursor),
      limit: '1000',
    });
    const url = `https://fapi.binance.com/fapi/v1/fundingRate?${params}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`[${res.status}] funding rate fetch`);
    const data = await res.json() as Array<{
      fundingTime: number;
      fundingRate: string;
      markPrice: string;
    }>;
    if (data.length === 0) break;

    for (const d of data) {
      const ts = d.fundingTime;
      if (!seen.has(ts) && ts >= startMs && ts <= endMs) {
        seen.add(ts);
        all.push({
          timestamp: ts,
          fundingRate: parseFloat(d.fundingRate),
          markPrice: parseFloat(d.markPrice),
        });
      }
    }
    cursor = data[0].fundingTime - SETTLEMENT_MS;
    if (data.length < 100) break;
  }

  all.sort((a, b) => a.timestamp - b.timestamp);
  return all;
}

async function fetchSOLCandles(
  startMs: number,
  endMs: number,
): Promise<Map<number, number>> {
  const priceByTs = new Map<number, number>();
  const seen = new Set<number>();
  let cursor = endMs;

  while (cursor > startMs) {
    const params = new URLSearchParams({
      symbol: 'SOLUSDT',
      interval: '8h',
      endTime: String(cursor),
      limit: '1000',
    });
    const url = `https://fapi.binance.com/fapi/v1/klines?${params}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OHLCV fetch ${res.status}`);
    const data = await res.json() as Array<Array<number>>;
    if (data.length === 0) break;

    for (const k of data) {
      const ts = k[0];
      if (!seen.has(ts) && ts >= startMs) {
        seen.add(ts);
        priceByTs.set(ts, k[4]); // close price
      }
    }
    cursor = data[0][0] - 8 * 3600 * 1000;
    if (data.length < 100) break;
  }

  return priceByTs;
}

// ── Simulation ─────────────────────────────────────────────────────────────

function simulateComposite(
  funding: FundingPoint[],
  fngByDay: Map<number, number>,
  priceByTs: Map<number, number>,
  cfg: SweepConfig,
  costCfg: CostConfig,
): Trade[] {
  const trades: Trade[] = [];
  let pos: {
    side: 'long' | 'short';
    idx: number;
    price: number;
    fng: number;
    funding: number;
  } | null = null;

  for (let i = 0; i < funding.length; i++) {
    const f = funding[i];
    const dayKey = Math.floor(f.timestamp / 86_400_000);
    const fngVal = fngByDay.get(dayKey);
    if (fngVal === undefined) continue;

    // ── Exit logic ──
    if (pos) {
      const hold = i - pos.idx;
      const qty = INITIAL_CAPITAL / pos.price;
      const gross = pos.side === 'short'
        ? (pos.price - f.markPrice) * qty
        : (f.markPrice - pos.price) * qty;
      const costed = applyCosts(gross, f.markPrice * qty, costCfg);

      let reason = 'signal';
      if (hold >= cfg.maxHold) {
        reason = 'maxHold';
      } else if (
        (pos.side === 'short' && f.fundingRate < 0) ||
        (pos.side === 'long' && f.fundingRate > 0)
      ) {
        reason = 'reversal';
      }

      trades.push({
        entryTimestamp: funding[pos.idx].timestamp,
        exitTimestamp: f.timestamp,
        side: pos.side,
        entryPrice: pos.price,
        exitPrice: f.markPrice,
        pnl: costed.netPnl,
        holdingBars: hold,
        exitReason: reason,
        fngAtEntry: pos.fng,
        fundingAtEntry: pos.funding,
      });
      pos = null;
    }

    // ── Entry logic (double contrarian) ──
    if (!pos) {
      const price = priceByTs.get(f.timestamp);
      if (price === undefined) continue;

      if (fngVal < cfg.fngThreshold && f.fundingRate > cfg.fundingThreshold) {
        // Crowded longs in fear → SHORT (fade both)
        pos = {
          side: 'short',
          idx: i,
          price,
          fng: fngVal,
          funding: f.fundingRate,
        };
      } else if (fngVal > (100 - cfg.fngThreshold) && f.fundingRate < -cfg.fundingThreshold) {
        // Crowded shorts in greed → LONG (fade both)
        pos = {
          side: 'long',
          idx: i,
          price,
          fng: fngVal,
          funding: f.fundingRate,
        };
      }
    }
  }

  // Close open position at end of data
  if (pos) {
    const last = funding[funding.length - 1];
    const qty = INITIAL_CAPITAL / pos.price;
    const gross = pos.side === 'short'
      ? (pos.price - last.markPrice) * qty
      : (last.markPrice - pos.price) * qty;
    const costed = applyCosts(gross, last.markPrice * qty, costCfg);
    trades.push({
      entryTimestamp: funding[pos.idx].timestamp,
      exitTimestamp: last.timestamp,
      side: pos.side,
      entryPrice: pos.price,
      exitPrice: last.markPrice,
      pnl: costed.netPnl,
      holdingBars: funding.length - 1 - pos.idx,
      exitReason: 'endOfData',
      fngAtEntry: pos.fng,
      fundingAtEntry: pos.funding,
    });
  }

  return trades;
}

// ── Metrics ────────────────────────────────────────────────────────────────

function computeMetrics(trades: Trade[]): Metrics {
  if (trades.length === 0) {
    return {
      trades: 0, netPnl: 0, winRate: 0, expectancy: 0,
      sharpe: 0, profitFactor: 0, ci95Lo: 0, ci95Hi: 0, maxDrawdown: 0,
    };
  }

  const pnls = trades.map(t => t.pnl);
  const netPnl = pnls.reduce((a, b) => a + b, 0);
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const winRate = wins.length / trades.length;
  const expectancy = netPnl / trades.length;

  // Sharpe (annualized, assuming ~365 / holdPerTrade days avg)
  const mean = netPnl / trades.length;
  const variance = pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / pnls.length;
  const stdDev = Math.sqrt(variance);
  const avgHoldDays = trades.reduce((s, t) => s + t.holdingBars, 0) / trades.length;
  const tradesPerYear = avgHoldDays > 0 ? 365 / avgHoldDays : 0;
  const sharpe = stdDev > 0 ? (mean / stdDev) * Math.sqrt(tradesPerYear) : 0;

  // Profit factor
  const grossWins = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLosses = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0;

  // Max drawdown
  let equity = 0;
  let peak = 0;
  let maxDD = 0;
  for (const p of pnls) {
    equity += p;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
  }

  // Bootstrap 95% CI on mean PnL
  const boot: number[] = [];
  for (let b = 0; b < N_BOOT; b++) {
    let sum = 0;
    for (let j = 0; j < pnls.length; j++) {
      sum += pnls[Math.floor(Math.random() * pnls.length)];
    }
    boot.push(sum / pnls.length);
  }
  boot.sort((a, b) => a - b);

  return {
    trades: trades.length,
    netPnl,
    winRate,
    expectancy,
    sharpe,
    profitFactor,
    ci95Lo: boot[Math.floor(N_BOOT * 0.05)],
    ci95Hi: boot[Math.floor(N_BOOT * 0.95)],
    maxDrawdown: maxDD,
  };
}

// ── Report ─────────────────────────────────────────────────────────────────

function generateReport(
  results: ConfigResult[],
  fng: FngPoint[],
  funding: FundingPoint[],
  splitMs: number,
): string {
  const md: string[] = [];

  md.push('# Sentiment x Funding Rate Composite — SOL\n');
  md.push(`**Date:** ${new Date().toISOString().split('T')[0]}`);
  md.push(`**Hypothesis:** Double contrarian — F&G extremes + crowded funding → fade`);
  md.push(`**Symbol:** SOLUSDT | **Exchange:** Binance Futures`);
  md.push(
    `**Window:** ${new Date(funding[0].timestamp).toISOString().split('T')[0]}` +
    ` -> ${new Date(funding[funding.length - 1].timestamp).toISOString().split('T')[0]}`
  );
  md.push(
    `**Train:** -> ${new Date(splitMs).toISOString().split('T')[0]} (65%)` +
    ` | **Test:** -> ${new Date(PINNED_END_MS).toISOString().split('T')[0]} (35%)`
  );
  md.push('**Costs:** conservative (17bps: 10bps fee + 7bps slip + 10bps impact)');
  md.push(`**Data:** ${funding.length} funding periods, ${fng.length} FNG days\n---\n`);

  // Strategy rules
  md.push('## Strategy Rules\n');
  md.push('- F&G < fearThreshold AND funding > fundingThreshold (crowded longs) -> SHORT');
  md.push('- F&G > (100 - fearThreshold) AND funding < -fundingThreshold (crowded shorts) -> LONG');
  md.push('- Exit: maxHold bars OR funding reversal (flips sign)');
  md.push('- Sweep: 3 x 3 x 3 = 27 configurations\n');

  // Full results table
  md.push('## Full Period Results\n');
  md.push('| FNG Thr | Fund Thr | MaxHold | Trades | Net PnL | Sharpe | PF | WinRate | MaxDD |');
  md.push('|---------|----------|---------|--------|---------|--------|----|---------|-------|');

  for (const r of results) {
    const m = r.allMetrics;
    md.push(
      `| ${r.config.fngThreshold} | ${r.config.fundingThreshold.toFixed(4)}` +
      ` | ${r.config.maxHold} | ${m.trades} | $${m.netPnl.toFixed(0)}` +
      ` | ${m.sharpe.toFixed(2)} | ${m.profitFactor === Infinity ? 'inf' : m.profitFactor.toFixed(2)}` +
      ` | ${(m.winRate * 100).toFixed(0)}% | $${m.maxDrawdown.toFixed(0)} |`
    );
  }

  // OOS results table
  md.push('\n## Out-of-Sample Results\n');
  md.push('| FNG Thr | Fund Thr | MaxHold | OOS# | OOS PnL | OOS Sharpe | CI 5% | CI 95% | WinRate | OOS |');
  md.push('|---------|----------|---------|------|---------|------------|-------|--------|---------|-----|');

  let passCount = 0;
  for (const r of results) {
    const o = r.oosMetrics;
    if (!o) continue;
    const pass = o.trades >= 5 && o.sharpe > 0 && o.ci95Lo > 0;
    if (pass) passCount++;
    md.push(
      `| ${r.config.fngThreshold} | ${r.config.fundingThreshold.toFixed(4)}` +
      ` | ${r.config.maxHold} | ${o.trades} | $${o.netPnl.toFixed(0)}` +
      ` | ${o.sharpe.toFixed(2)} | $${o.ci95Lo.toFixed(0)}` +
      ` | $${o.ci95Hi.toFixed(0)} | ${(o.winRate * 100).toFixed(0)}%` +
      ` | ${pass ? 'PASS' : 'FAIL'} |`
    );
  }

  // Verdict
  md.push('\n## Verdict\n');
  md.push(`**OOS PASS: ${passCount}/${results.length}**\n`);
  if (passCount === 0) {
    md.push('**FALSIFIED.** No configuration passes OOS robustness criteria.');
    md.push('The composite filter does not produce reliable alpha on SOLUSDT.');
  } else if (passCount <= 3) {
    md.push(`**MARGINAL.** ${passCount} configuration(s) pass OOS but are few.`);
    md.push('Requires caution — may be noise. Consider paper trading before live.');
  } else {
    md.push(`**PROMISING.** ${passCount} configurations pass OOS.`);
    md.push('Composite filter shows consistent alpha. Consider deeper validation.');
  }

  // FNG + Funding statistics
  md.push('\n## F&G Index Statistics\n');
  const fngVals = fng.map(f => f.value);
  const meanFng = fngVals.reduce((a, b) => a + b, 0) / fngVals.length;
  const minFng = Math.min(...fngVals);
  const maxFng = Math.max(...fngVals);
  const extremeFear = fngVals.filter(v => v < 25).length;
  const extremeGreed = fngVals.filter(v => v > 75).length;
  md.push(`- Mean: ${meanFng.toFixed(1)}`);
  md.push(`- Range: ${minFng} - ${maxFng}`);
  md.push(`- Extreme Fear days (< 25): ${extremeFear} (${(extremeFear / fngVals.length * 100).toFixed(1)}%)`);
  md.push(`- Extreme Greed days (> 75): ${extremeGreed} (${(extremeGreed / fngVals.length * 100).toFixed(1)}%)`);

  md.push('\n## Funding Rate Statistics\n');
  const fundRates = funding.map(f => f.fundingRate);
  const meanFund = fundRates.reduce((a, b) => a + b, 0) / fundRates.length;
  const minFund = Math.min(...fundRates);
  const maxFund = Math.max(...fundRates);
  const positiveFund = fundRates.filter(v => v > 0).length;
  const negativeFund = fundRates.filter(v => v < 0).length;
  md.push(`- Mean: ${(meanFund * 10000).toFixed(2)} bps`);
  md.push(`- Range: ${(minFund * 10000).toFixed(2)} to ${(maxFund * 10000).toFixed(2)} bps`);
  md.push(`- Positive periods (longs pay): ${positiveFund} (${(positiveFund / fundRates.length * 100).toFixed(1)}%)`);
  md.push(`- Negative periods (shorts pay): ${negativeFund} (${(negativeFund / fundRates.length * 100).toFixed(1)}%)`);

  md.push('\n---');
  md.push(`*Generated by sentiment-funding-composite.ts - ${new Date().toISOString()}*`);

  return md.join('\n');
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const costCfg = resolveStressConfig('conservative');

  // 1. Fetch data
  console.log('Fetching Fear & Greed Index...');
  const fng = await fetchFngHistory(PINNED_END_MS);
  console.log(`  Got ${fng.length} FNG days`);

  console.log('Fetching funding rate history...');
  const funding = await fetchFundingHistory('SOLUSDT', PINNED_END_MS);
  console.log(`  Got ${funding.length} funding periods`);

  if (funding.length < 100) {
    console.error('Insufficient funding data. Need at least 100 periods.');
    process.exit(1);
  }

  console.log('Fetching SOL 8h candles...');
  const candleStart = funding[0].timestamp;
  const candleEnd = funding[funding.length - 1].timestamp;
  const priceByTs = await fetchSOLCandles(candleStart, candleEnd);
  console.log(`  Got ${priceByTs.size} candle prices`);

  // Build FNG map by day
  const fngByDay = new Map<number, number>();
  for (const f of fng) {
    fngByDay.set(Math.floor(f.timestamp / 86_400_000), f.value);
  }

  // 2. OOS split (65/35)
  const splitMs = candleStart + (candleEnd - candleStart) * 0.65;

  // 3. Sweep
  const FNG_THRESHOLDS = [15, 20, 25];
  const FUNDING_THRESHOLDS = [0.0001, 0.0003, 0.0005];
  const MAX_HOLDS = [6, 12, 24];

  const configs: SweepConfig[] = [];
  for (const fngT of FNG_THRESHOLDS) {
    for (const fundT of FUNDING_THRESHOLDS) {
      for (const hold of MAX_HOLDS) {
        configs.push({ fngThreshold: fngT, fundingThreshold: fundT, maxHold: hold });
      }
    }
  }

  console.log(`\nSweeping ${configs.length} configurations...`);

  const results: ConfigResult[] = [];

  for (const cfg of configs) {
    // Full period
    const allTrades = simulateComposite(funding, fngByDay, priceByTs, cfg, costCfg);
    const allMetrics = computeMetrics(allTrades);

    // OOS only
    const oosTrades = allTrades.filter(t => t.entryTimestamp >= splitMs);
    const oosMetrics = oosTrades.length > 0 ? computeMetrics(oosTrades) : null;

    results.push({ config: cfg, allMetrics, oosMetrics });

    const fngStr = cfg.fngThreshold;
    const fundStr = cfg.fundingThreshold.toFixed(4);
    const oosStr = oosMetrics
      ? `OOS: ${oosMetrics.trades}t $${oosMetrics.netPnl.toFixed(0)} SH=${oosMetrics.sharpe.toFixed(2)}`
      : 'OOS: 0 trades';
    console.log(`  FNG=${fngStr} Fund=${fundStr} Hold=${cfg.maxHold} | All: ${allTrades.length}t $${allMetrics.netPnl.toFixed(0)} | ${oosStr}`);
  }

  // 4. Generate report
  const report = generateReport(results, fng, funding, splitMs);

  const { mkdirSync, writeFileSync } = await import('fs');
  const { resolve, dirname } = await import('path');
  const rp = resolve(process.cwd(), 'plans/reports/sentiment-funding-composite.md');
  mkdirSync(dirname(rp), { recursive: true });
  writeFileSync(rp, report, 'utf-8');
  console.log(`\nReport saved: ${rp}`);

  // Summary
  const passCount = results.filter(
    r => r.oosMetrics && r.oosMetrics.trades >= 5 && r.oosMetrics.sharpe > 0 && r.oosMetrics.ci95Lo > 0,
  ).length;
  console.log(`\nOOS PASS: ${passCount}/${results.length}`);
  if (passCount === 0) {
    console.log('Composite filter FALSIFIED — no config passes OOS');
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
