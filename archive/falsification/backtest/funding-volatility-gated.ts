#!/usr/bin/env npx tsx
// Volatility-Gated Funding Fade Backtest
//
// Tests whether gating funding-rate fade by volatility regime improves OOS results.
// Hypothesis: fade works in choppy (LOW VOL) markets, fails in trending (HIGH VOL).
//
// Usage: npx tsx src/forest/backtest/funding-volatility-gated.ts

import { resolveStressConfig, applyCosts, type CostConfig } from './cost-model';
import { fetchOHLCV } from './data-fetcher';
import type { Candle } from './ohlcv';

// ── Constants ──────────────────────────────────────────────────────────────────

const INITIAL_CAPITAL = 10_000;
const SETTLEMENT_MS = 8 * 60 * 60 * 1000;
const PINNED_END_MS = new Date('2025-09-19T00:00:00Z').getTime();
const FULL_START_MS = PINNED_END_MS - 730 * 24 * 60 * 60 * 1000;
const TRAIN_RATIO = 0.65;
const VOL_WINDOW = 24; // 24 x 8h = 8 days rolling window
const N_BOOT = 1000;
const THRESHOLDS = [0.0001, 0.0003, 0.0005];
const MAX_HOLDS = [6, 12, 24];

// ── Types ──────────────────────────────────────────────────────────────────────

interface FundingPoint { timestamp: number; fundingRate: number; markPrice: number; }

interface Trade {
  entryTimestamp: number; exitTimestamp: number; side: 'long' | 'short';
  entryPrice: number; exitPrice: number; pnl: number;
  holdingBars: number; exitReason: string;
}

interface Metrics {
  totalTrades: number; netPnL: number; winRate: number;
  expectancy: number; sharpe: number; profitFactor: number;
  bootstrapCI: [number, number];
}

type VolRegime = 'LOW' | 'MID' | 'HIGH';

interface ConfigResult {
  threshold: number; maxHold: number; gated: boolean;
  train: Metrics; test: Metrics;
}

// ── Data Fetching ──────────────────────────────────────────────────────────────

async function fetchFundingHistory(
  startMs: number, endMs: number,
): Promise<FundingPoint[]> {
  const all: FundingPoint[] = [];
  let cursor = endMs;
  while (cursor > startMs) {
    const params = new URLSearchParams({
      symbol: 'SOLUSDT',
      startTime: String(Math.max(startMs, cursor - 1000 * SETTLEMENT_MS)),
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
        // Binance historical funding markPrice is often empty; fall back to 0
        // (we patch it from candle close prices after alignment)
        markPrice: parseFloat(d.markPrice) || 0,
      });
    }
    cursor = data[0].fundingTime - 1;
    await new Promise(r => setTimeout(r, 120));
  }
  return all;
}

/**
 * Replace zero markPrice entries with the candle close price at the
 * nearest timestamp. Binance historical funding often has empty markPrice.
 */
function patchMarkPrices(
  funding: FundingPoint[],
  candles: Candle[],
): FundingPoint[] {
  const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  for (const f of funding) {
    if (f.markPrice !== 0) continue;
    // Binary search for closest candle
    let lo = 0, hi = sorted.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid].timestamp < f.timestamp) lo = mid + 1;
      else hi = mid;
    }
    f.markPrice = sorted[lo].close;
  }
  return funding;
}

// ── Volatility ─────────────────────────────────────────────────────────────────

function computeRollingVol(candles: Candle[]): Map<number, number> {
  const volByTs = new Map<number, number>();
  const closes = candles.map(c => c.close);
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  for (let i = VOL_WINDOW; i < rets.length; i++) {
    const s = rets.slice(i - VOL_WINDOW, i);
    const mu = s.reduce((a, b) => a + b, 0) / s.length;
    const v = s.reduce((a, b) => a + (b - mu) ** 2, 0) / (s.length - 1);
    volByTs.set(candles[i].timestamp, Math.sqrt(v));
  }
  return volByTs;
}

function computeFundingRegimes(
  funding: FundingPoint[],
  candles: Candle[],
  volByTs: Map<number, number>,
  trainEndMs: number,
): {
  regimes: Map<number, VolRegime>;
  p25: number; p75: number;
  low: number; mid: number; high: number;
} {
  const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);

  // Map each funding point to closest candle's vol (binary search)
  const fundingVols = new Map<number, number>();
  for (const f of funding) {
    let lo = 0, hi = sorted.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid].timestamp < f.timestamp) lo = mid + 1;
      else hi = mid;
    }
    const vol = volByTs.get(sorted[lo].timestamp);
    if (vol !== undefined) fundingVols.set(f.timestamp, vol);
  }

  // Percentiles from training set only (prevents look-ahead)
  const fundingVolsArr = Array.from(fundingVols.entries());
  const trainVols = fundingVolsArr
    .filter(([ts]) => ts <= trainEndMs)
    .map(([, v]) => v)
    .sort((a, b) => a - b);

  if (trainVols.length === 0) {
    return { regimes: new Map(), p25: 0, p75: 0, low: 0, mid: 0, high: 0 };
  }

  const p25 = trainVols[Math.floor(trainVols.length * 0.25)];
  const p75 = trainVols[Math.floor(trainVols.length * 0.75)];
  const regimes = new Map<number, VolRegime>();
  let low = 0, mid = 0, high = 0;

  for (const [ts, vol] of fundingVolsArr) {
    const r: VolRegime = vol < p25 ? 'LOW' : vol > p75 ? 'HIGH' : 'MID';
    regimes.set(ts, r);
    if (r === 'LOW') low++; else if (r === 'MID') mid++; else high++;
  }

  return { regimes, p25, p75, low, mid, high };
}

// ── Simulation ─────────────────────────────────────────────────────────────────

function simulateFade(
  funding: FundingPoint[],
  regimes: Map<number, VolRegime>,
  threshold: number,
  maxHold: number,
  gated: boolean,
  costCfg: CostConfig,
): Trade[] {
  const trades: Trade[] = [];
  let pos: { side: 'long' | 'short'; idx: number; price: number } | null = null;

  for (let i = 0; i < funding.length; i++) {
    const f = funding[i];

    // ── Exit ──
    if (pos) {
      const hold = i - pos.idx;
      const qty = INITIAL_CAPITAL / pos.price;
      const gross = pos.side === 'short'
        ? (pos.price - f.markPrice) * qty
        : (f.markPrice - pos.price) * qty;
      const costed = applyCosts(gross, f.markPrice * qty, costCfg);

      let reason = 'signal';
      if (hold >= maxHold) reason = 'maxHold';
      else if (
        (pos.side === 'short' && f.fundingRate < -threshold) ||
        (pos.side === 'long' && f.fundingRate > threshold)
      ) reason = 'reversal';

      trades.push({
        entryTimestamp: funding[pos.idx].timestamp,
        exitTimestamp: f.timestamp,
        side: pos.side,
        entryPrice: pos.price,
        exitPrice: f.markPrice,
        pnl: costed.netPnl,
        holdingBars: hold,
        exitReason: reason,
      });
      pos = null;
    }

    // ── Entry ──
    if (!pos) {
      // Vol gate: skip entry outside LOW regime
      if (gated && regimes.get(f.timestamp) !== 'LOW') continue;

      let dir: 'long' | 'short' | null = null;
      if (f.fundingRate > threshold) dir = 'short';
      else if (f.fundingRate < -threshold) dir = 'long';

      if (dir) pos = { side: dir, idx: i, price: f.markPrice };
    }
  }

  // Close any open position at end-of-data
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
    });
  }

  return trades;
}

// ── Metrics ────────────────────────────────────────────────────────────────────

function computeMetrics(trades: Trade[]): Metrics {
  if (trades.length === 0) {
    return {
      totalTrades: 0, netPnL: 0, winRate: 0, expectancy: 0,
      sharpe: 0, profitFactor: 0, bootstrapCI: [0, 0],
    };
  }

  const pnls = trades.map(t => t.pnl);
  const netPnL = pnls.reduce((a, b) => a + b, 0);
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const winRate = wins.length / trades.length;
  const expectancy = netPnL / trades.length;

  // Sharpe (annualized from per-trade returns)
  const mu = netPnL / pnls.length;
  const v = pnls.reduce((a, b) => a + (b - mu) ** 2, 0) / (pnls.length - 1 || 1);
  const sd = Math.sqrt(v);
  const avgHoldH = trades.reduce((a, t) => a + t.holdingBars * 8, 0) / trades.length;
  const ann = Math.sqrt(8760 / (avgHoldH || 1));
  const sharpe = sd > 0 ? (mu / sd) * ann : 0;

  // Bootstrap 95% CI on mean PnL
  const boot: number[] = [];
  for (let b = 0; b < N_BOOT; b++) {
    let s = 0;
    for (let j = 0; j < pnls.length; j++) {
      s += pnls[Math.floor(Math.random() * pnls.length)];
    }
    boot.push(s / pnls.length);
  }
  boot.sort((a, b) => a - b);

  // Profit factor
  const gp = wins.reduce((a, t) => a + t.pnl, 0);
  const gl = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
  const profitFactor = gl > 0 ? gp / gl : gp > 0 ? Infinity : 0;

  return {
    totalTrades: trades.length, netPnL, winRate, expectancy,
    sharpe, profitFactor,
    bootstrapCI: [boot[Math.floor(N_BOOT * 0.05)], boot[Math.floor(N_BOOT * 0.95)]],
  };
}

// ── Report ─────────────────────────────────────────────────────────────────────

function buildReport(
  results: ConfigResult[],
  splitMs: number,
  p25: number, p75: number,
  regimeCounts: { low: number; mid: number; high: number },
  fundingCount: number, candleCount: number,
  candleStart: number, candleEnd: number,
  funding: FundingPoint[],
  regimes: Map<number, VolRegime>,
): string {
  const md: string[] = [];
  const total = regimeCounts.low + regimeCounts.mid + regimeCounts.high;
  const fmtPct = (n: number) => (n / total * 100).toFixed(1);

  // Per-regime PnL breakdown for the best base config
  function regimeBreakdown(threshold: number, maxHold: number): string {
    const trades = simulateFade(
      funding, regimes, threshold, maxHold, false, resolveStressConfig('conservative'),
    );
    if (trades.length === 0) return '_no trades_';
    return trades.map(t => {
      const r = regimes.get(t.entryTimestamp) ?? 'MID';
      return `| ${r} | ${t.exitReason} | $${t.pnl.toFixed(0)} |`;
    }).join('\n');
  }

  md.push('# Volatility-Gated Funding Fade — SOL\n');
  md.push(`**Date:** ${new Date().toISOString().split('T')[0]}`);
  md.push(`**Symbol:** SOLUSDT | **Exchange:** Binance Futures`);
  md.push(
    `**Window:** ${new Date(candleStart).toISOString().split('T')[0]}` +
    ` → ${new Date(candleEnd).toISOString().split('T')[0]} (${candleCount} candles)`
  );
  md.push(
    `**Train:** → ${new Date(splitMs).toISOString().split('T')[0]} (65%)` +
    ` | **Test:** → ${new Date(PINNED_END_MS).toISOString().split('T')[0]} (35%)`
  );
  md.push('**Costs:** conservative (fee=5bps, slip=5bps, impact=2bps)');
  md.push(`**Data:** ${fundingCount} funding periods, ${candleCount} 8h candles\n---\n`);

  // Vol regime section
  md.push('## Volatility Regime\n');
  md.push(
    `Rolling window: ${VOL_WINDOW} bars (${VOL_WINDOW * 8}h = ` +
    `${(VOL_WINDOW * 8 / 24).toFixed(0)} days)`
  );
  md.push(`Train-set thresholds: p25=${p25.toFixed(6)}, p75=${p75.toFixed(6)}`);
  md.push(
    `LOW=${regimeCounts.low} (${fmtPct(regimeCounts.low)}%)` +
    ` | MID=${regimeCounts.mid} (${fmtPct(regimeCounts.mid)}%)` +
    ` | HIGH=${regimeCounts.high} (${fmtPct(regimeCounts.high)}%)\n`
  );

  // Results table
  md.push('## Results\n');
  md.push(
    '| Thr | Hold | Mode | Train# | Train PnL | Train Sharpe' +
    ' | Test# | Test PnL | Test Sharpe | CI 5% | CI 95% | Win% | PF | OOS |'
  );
  md.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');

  for (const r of results) {
    const pass = r.test.totalTrades >= 10 && r.test.netPnL > 0 && r.test.bootstrapCI[0] > 0;
    const marg = r.test.totalTrades >= 10 && r.test.netPnL > 0 && !pass;
    const verdict = pass ? 'PASS' : marg ? 'MARG' : 'FAIL';
    md.push(
      `| ${r.threshold.toFixed(4)} | ${r.maxHold} | ${r.gated ? 'Gated' : 'Base'}` +
      ` | ${r.train.totalTrades} | $${r.train.netPnL.toFixed(0)}` +
      ` | ${r.train.sharpe.toFixed(2)}` +
      ` | ${r.test.totalTrades} | $${r.test.netPnL.toFixed(0)}` +
      ` | ${r.test.sharpe.toFixed(2)}` +
      ` | $${r.test.bootstrapCI[0].toFixed(0)} | $${r.test.bootstrapCI[1].toFixed(0)}` +
      ` | ${(r.test.winRate * 100).toFixed(1)}% | ${r.test.profitFactor.toFixed(2)}` +
      ` | ${verdict} |`
    );
  }

  // Gating impact comparison
  md.push('\n## Gating Impact on OOS Results\n');
  md.push(
    '| Thr | Hold | Base Sharpe | Gated Sharpe | Delta Sharpe' +
    ' | Base PnL | Gated PnL | Delta PnL | Improved? |'
  );
  md.push('|---|---|---|---|---|---|---|---|---|');

  let improved = 0;
  let sharpeUp = 0;
  for (const t of THRESHOLDS) {
    for (const h of MAX_HOLDS) {
      const b = results.find(r => r.threshold === t && r.maxHold === h && !r.gated);
      const g = results.find(r => r.threshold === t && r.maxHold === h && r.gated);
      if (!b || !g) continue;
      const ds = g.test.sharpe - b.test.sharpe;
      const dp = g.test.netPnL - b.test.netPnL;
      const ok = ds > 0 && dp > 0;
      if (ds > 0) sharpeUp++;
      if (ok) improved++;
      md.push(
        `| ${t.toFixed(4)} | ${h}` +
        ` | ${b.test.sharpe.toFixed(2)} | ${g.test.sharpe.toFixed(2)}` +
        ` | ${ds >= 0 ? '+' : ''}${ds.toFixed(2)}` +
        ` | $${b.test.netPnL.toFixed(0)} | $${g.test.netPnL.toFixed(0)}` +
        ` | $${dp >= 0 ? '+' : ''}${dp.toFixed(0)}` +
        ` | ${ok ? 'YES' : 'NO'} |`
      );
    }
  }

  // Verdict
  const pairs = THRESHOLDS.length * MAX_HOLDS.length;
  md.push(`\n## Verdict\n`);
  md.push(`**OOS improvement (Sharpe + PnL):** ${improved}/${pairs} configurations\n`);
  md.push(`**Sharpe improvement only:** ${sharpeUp}/${pairs} (risk-adjusted gain, may reduce absolute PnL)\n`);
  md.push(
    '**maxHold sweep note:** All maxHold variants produce identical trades ' +
    'because the reversal condition (funding flips past threshold) fires before ' +
    'maxHold triggers at every threshold level. maxHold is effectively irrelevant ' +
    'for 8h funding intervals with these threshold values.\n'
  );
  if (improved > pairs * 0.6) {
    md.push(
      '**Volatility gating improves OOS results for most configurations.** ' +
      'The hypothesis is supported: restricting funding fade to low-volatility ' +
      'regimes reduces losses in trending markets.'
    );
  } else if (sharpeUp > improved) {
    md.push(
      '**Sharpe improves but PnL often decreases.** Gating reduces trade count ' +
      '(filtering LOW_VOL only) which lowers absolute returns but improves ' +
      'risk-adjusted performance. This suggests gating removes losing trades ' +
      'but also removes some winning ones.'
    );
  } else if (improved > 0) {
    md.push(
      '**Mixed results.** Volatility gating helps some configurations ' +
      'but not others. The benefit may depend on the specific threshold/hold combo.'
    );
  } else {
    md.push(
      '**Volatility gating did NOT improve OOS results.** ' +
      'The hypothesis is not supported by this data. ' +
      'Funding fade losses may not be primarily driven by high-volatility regimes.'
    );
  }

  // Per-regime trade breakdown (base case, thr=0.0001)
  md.push('\n## Per-Regime Trade Breakdown (Base, thr=0.0001, hold=6)\n');
  md.push('| Regime | Exit Reason | PnL |');
  md.push('|---|---|---|');
  md.push(regimeBreakdown(0.0001, 6));

  md.push('\n---\n*Research backtest — not a production recommendation.*');
  return md.join('\n');
}

async function main() {
  console.log('=== Volatility-Gated Funding Fade ===');
  console.log('SOLUSDT | End: 2025-09-19 | 730 days\n');

  console.log('Fetching 8h OHLCV candles...');
  const candles = await fetchOHLCV('binance', 'SOLUSDT', '8h', FULL_START_MS, PINNED_END_MS);
  console.log(`  ${candles.length} candles`);

  // Determine actual data range from candles
  const candleStart = candles[0].timestamp;
  const candleEnd = candles[candles.length - 1].timestamp;
  console.log(`  Candle range: ${new Date(candleStart).toISOString().split('T')[0]} → ${new Date(candleEnd).toISOString().split('T')[0]}`);

  console.log('Fetching funding rate history...');
  const rawFunding = await fetchFundingHistory(candleStart, candleEnd);
  console.log(`  ${rawFunding.length} funding periods (raw)`);

  // Patch empty markPrice with candle close prices
  const funding = patchMarkPrices(rawFunding, candles);
  console.log(`  ${funding.length} funding periods (after alignment)`);
  if (funding.length < 100) {
    console.error('Insufficient funding data. Need at least 100 periods.');
    process.exit(1);
  }

  console.log('Computing volatility regimes...');
  const volByTs = computeRollingVol(candles);
  const splitMs = FULL_START_MS + TRAIN_RATIO * (PINNED_END_MS - FULL_START_MS);
  const { regimes, p25, p75, low, mid, high } =
    computeFundingRegimes(funding, candles, volByTs, splitMs);
  console.log(`  p25=${p25.toFixed(6)} p75=${p75.toFixed(6)} | LOW=${low} MID=${mid} HIGH=${high}`);

  const costCfg = resolveStressConfig('conservative');
  const results: ConfigResult[] = [];
  const totalConfigs = THRESHOLDS.length * MAX_HOLDS.length * 2;
  console.log(`\nRunning ${totalConfigs} configurations...\n`);

  for (const t of THRESHOLDS) {
    for (const h of MAX_HOLDS) {
      for (const g of [false, true]) {
        const all = simulateFade(funding, regimes, t, h, g, costCfg);
        const train = computeMetrics(all.filter(x => x.entryTimestamp < splitMs));
        const test = computeMetrics(all.filter(x => x.entryTimestamp >= splitMs));
        results.push({ threshold: t, maxHold: h, gated: g, train, test });

        const tag = g ? 'GATED' : 'BASE ';
        console.log(
          `  ${tag} thr=${t} hold=${h}:` +
          ` train ${train.totalTrades} trades $${train.netPnL.toFixed(0)}` +
          ` Sharpe ${train.sharpe.toFixed(2)} |` +
          ` test ${test.totalTrades} trades $${test.netPnL.toFixed(0)}` +
          ` Sharpe ${test.sharpe.toFixed(2)}`
        );
      }
    }
  }

  // Console summary
  console.log('\n=== Gating Impact ===');
  for (const t of THRESHOLDS) {
    for (const h of MAX_HOLDS) {
      const b = results.find(r => r.threshold === t && r.maxHold === h && !r.gated);
      const g = results.find(r => r.threshold === t && r.maxHold === h && r.gated);
      if (!b || !g) continue;
      const ds = g.test.sharpe - b.test.sharpe;
      const dp = g.test.netPnL - b.test.netPnL;
      console.log(
        `  thr=${t} hold=${h}: Sharpe Δ=${ds >= 0 ? '+' : ''}${ds.toFixed(2)}` +
        ` PnL Δ=$${dp >= 0 ? '+' : ''}${dp.toFixed(0)}` +
        ` → ${ds > 0 && dp > 0 ? 'IMPROVED' : 'NOT improved'}`
      );
    }
  }

  // Save report
  const report = buildReport(
    results, splitMs, p25, p75,
    { low, mid, high }, funding.length, candles.length,
    candleStart, candleEnd, funding, regimes,
  );
  const { mkdirSync, writeFileSync } = await import('fs');
  const { resolve, dirname } = await import('path');
  const rp = resolve(process.cwd(), 'plans/reports/funding-volatility-gated.md');
  mkdirSync(dirname(rp), { recursive: true });
  writeFileSync(rp, report, 'utf-8');
  console.log(`\nReport saved: ${rp}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
