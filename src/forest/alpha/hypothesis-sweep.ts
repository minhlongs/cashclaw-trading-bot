// Hypothesis Sweep — Parameter Grid Search for BTC 4h Strategy Discovery
// Tests RSI + filter combinations across parameter space, ranks by expectancy.
// Usage: npx tsx src/forest/alpha/hypothesis-sweep.ts [days] [stressMode]
// Defaults: 167 days, conservative

import { fetchOHLCV } from '@/forest/backtest/data-fetcher';
import { resolveStressConfig, applyCosts, type CostConfig, type StressMode } from '@/forest/backtest/cost-model';
import { loadCandles, saveCandles, getCacheKey } from '@/forest/backtest/ohlcv-cache';
import type { BacktestTrade } from '@/forest/backtest/types';
import type { Candle } from '@/forest/backtest/ohlcv';

// ── Types ────────────────────────────────────────────────────────────────────

interface StrategyVariant {
  name: string;
  filter: 'none' | 'momentum' | 'volume' | 'atr';
  rsiPeriod: number;
  smaPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  maxHoldHours: number;
  volumeThreshold: number;   // only used for volume filter (multiplier vs 20-bar avg)
  atrThreshold: number;      // only used for atr filter (multiplier of 14-bar ATR / close)
}

interface SweepResult {
  name: string;
  filter: string;
  rsiPeriod: number;
  smaPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  maxHoldHours: number;
  netPnl: number;
  winRate: number;
  totalTrades: number;
  profitFactor: number;
  expectancy: number;
  sharpe: number;
  bootstrapP5: number;   // 5th percentile bootstrapped PnL
  bootstrapP95: number;  // 95th percentile bootstrapped PnL
  tradesPerMonth: number;
  avgHoldingHours: number;
}

// ── Indicator Helpers ─────────────────────────────────────────────────────────

function computeRSI(closes: number[], period: number): number {
  if (closes.length < period) return 50;
  const slice = closes.slice(-period);
  const gains: number[] = [];
  const losses: number[] = [];
  for (let j = 1; j < slice.length; j++) {
    const d = slice[j] - slice[j - 1];
    gains.push(Math.max(d, 0));
    losses.push(Math.max(-d, 0));
  }
  const avgGain = gains.reduce((a, b) => a + b, 0) / gains.length;
  const avgLoss = losses.reduce((a, b) => a + b, 0) / losses.length;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function computeSMA(candles: Candle[], endIdx: number, period: number): number {
  if (endIdx < period) return candles[endIdx].close;
  let sum = 0;
  for (let j = endIdx - period; j < endIdx; j++) sum += candles[j].close;
  return sum / period;
}

function computeATR(candles: Candle[], endIdx: number, period: number): number {
  if (endIdx < period + 1) return Infinity;
  let sum = 0;
  for (let j = endIdx - period; j < endIdx; j++) {
    const tr = Math.max(
      candles[j].high - candles[j].low,
      Math.abs(candles[j].high - candles[j - 1].close),
      Math.abs(candles[j].low - candles[j - 1].close),
    );
    sum += tr;
  }
  return sum / period;
}

function computeVolAvg(candles: Candle[], endIdx: number, period: number): number {
  if (endIdx < period) return candles[endIdx].volume;
  let sum = 0;
  for (let j = endIdx - period; j < endIdx; j++) sum += candles[j].volume;
  return sum / period;
}

// ── Strategy Engine ───────────────────────────────────────────────────────────

const INITIAL_CAPITAL = 10_000;

function runStrategy(candles: Candle[], variant: StrategyVariant, costCfg: CostConfig): BacktestTrade[] {
  const { rsiPeriod, smaPeriod, rsiOversold, rsiOverbought, maxHoldHours, filter, volumeThreshold, atrThreshold } = variant;
  const trades: BacktestTrade[] = [];
  let position: { entryPrice: number; entryIndex: number } | null = null;

  const warmup = Math.max(smaPeriod, rsiPeriod, 150); // ATR needs 14 + regime SMA uses 150 bars

  for (let i = warmup; i < candles.length; i++) {
    const closes = candles.slice(i - rsiPeriod, i).map(c => c.close);
    const rsi = computeRSI(closes, rsiPeriod);
    const sma = computeSMA(candles, i, smaPeriod);
    const price = candles[i].close;
    const prevPrice = i > 0 ? candles[i - 1].close : price;

    if (!position) {
      // ── Entry filters ────────────────────────────────────────────────────

      // Base RSI entry: oversold + price > SMA
      if (!(rsi < rsiOversold && price > sma)) continue;

      // Variant-specific additional filters
      if (filter === 'momentum') {
        // Pure momentum: require close > prevClose (always enforced for this variant)
        if (!(price > prevPrice)) continue;
      } else if (filter === 'volume') {
        // Volume must be > threshold * 20-bar avg
        const volAvg = computeVolAvg(candles, i, 20);
        if (volAvg === 0 || candles[i].volume <= volumeThreshold * volAvg) continue;
      } else if (filter === 'atr') {
        // ATR must be < threshold * current close (low-vol regime)
        const atr14 = computeATR(candles, i, 14);
        if (atr14 > atrThreshold * price) continue;
      }
      // filter === 'none': no additional filter

      position = { entryPrice: price, entryIndex: i };
    } else {
      const holdMin = (candles[i].timestamp - candles[position.entryIndex].timestamp) / 60_000;
      let exitReason: string | null = null;
      if (holdMin >= maxHoldHours * 60) exitReason = 'maxhold';
      else if (price < sma * 0.95) exitReason = 'stop';
      else if (rsi > rsiOverbought) exitReason = 'rsi';

      if (exitReason) {
        const quantity = INITIAL_CAPITAL / position.entryPrice;
        const grossPnl = (price - position.entryPrice) * quantity;
        const notional = price * quantity;
        const cost = applyCosts(grossPnl, notional, costCfg);

        trades.push({
          entryTimestamp: candles[position.entryIndex].timestamp,
          exitTimestamp: candles[i].timestamp,
          side: 'buy',
          entryPrice: position.entryPrice,
          exitPrice: price,
          pnl: cost.netPnl,
          fee: cost.fees,
          pnlPct: position.entryPrice > 0
            ? ((price - position.entryPrice) / position.entryPrice) * 100
            : 0,
          holdingMinutes: holdMin,
          quantity,
          exitReason,
          entryRegime: 'UNKNOWN',
        });
        position = null;
      }
    }
  }

  return trades;
}

// ── Statistics ────────────────────────────────────────────────────────────────

function bootstrapConfidence(trades: BacktestTrade[], nBoot = 1000): { p5: number; p95: number } {
  if (trades.length < 5) return { p5: 0, p95: 0 };
  const pnls = trades.map(t => t.pnl);
  const means: number[] = [];
  for (let b = 0; b < nBoot; b++) {
    let sum = 0;
    for (let i = 0; i < pnls.length; i++) {
      sum += pnls[Math.floor(Math.random() * pnls.length)];
    }
    means.push(sum / pnls.length);
  }
  means.sort((a, b) => a - b);
  const p5idx = Math.floor(0.05 * nBoot);
  const p95idx = Math.floor(0.95 * nBoot);
  return { p5: means[p5idx], p95: means[p95idx] };
}

function computeSharpe(trades: BacktestTrade[]): number {
  if (trades.length < 2) return 0;
  const pnls = trades.map(t => t.pnl);
  const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
  const variance = pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / pnls.length;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  // Annualize: ~8760 hours/year, avg holding period in hours
  const avgHoldHrs = trades.reduce((s, t) => s + t.holdingMinutes, 0) / trades.length / 60;
  const tradesPerYear = avgHoldHrs > 0 ? 8760 / avgHoldHrs : 50;
  return (mean / std) * Math.sqrt(tradesPerYear);
}

function computeExpectancy(trades: BacktestTrade[]): number {
  // Expectancy = (win% * avgWin) + (loss% * avgLoss)
  if (trades.length === 0) return 0;
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const winRate = wins.length / trades.length;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
  return winRate * avgWin + (1 - winRate) * avgLoss;
}

// ── Parameter Grid ────────────────────────────────────────────────────────────

function buildVariants(): StrategyVariant[] {
  const variants: StrategyVariant[] = [];

  const rsiPeriods = [7, 10, 14, 21];
  const smaPeriods = [30, 50, 90, 150];
  const rsiOversolds = [25, 30, 35];
  const rsiOverboughts = [60, 65, 70, 75];
  const maxHoldHoursArr = [24, 48, 96, 168];

  const base: Omit<StrategyVariant, 'rsiPeriod' | 'smaPeriod' | 'rsiOversold' | 'rsiOverbought' | 'maxHoldHours' | 'name'> = {
    filter: 'none',
    volumeThreshold: 1.5,
    atrThreshold: 0.02,
  };

  // ── 1. RSI only (no extra filter) ───────────────────────────────────────
  for (const rp of rsiPeriods) {
    for (const sp of smaPeriods) {
      for (const ro of rsiOversolds) {
        for (const rb of rsiOverboughts) {
          for (const mh of maxHoldHoursArr) {
            variants.push({
              ...base,
              name: `RSI(${rp},${sp},${ro},${rb},mh${mh})`,
              filter: 'none',
              rsiPeriod: rp, smaPeriod: sp, rsiOversold: ro, rsiOverbought: rb, maxHoldHours: mh,
            });
          }
        }
      }
    }
  }

  // ── 2. RSI + momentum (subset: 14/20 defaults, vary oversold/overbought/maxhold) ──
  for (const ro of rsiOversolds) {
    for (const rb of rsiOverboughts) {
      for (const mh of maxHoldHoursArr) {
        variants.push({
          ...base,
          name: `RSI+Mom(14,20,${ro},${rb},mh${mh})`,
          filter: 'momentum',
          rsiPeriod: 14, smaPeriod: 20, rsiOversold: ro, rsiOverbought: rb, maxHoldHours: mh,
        });
      }
    }
  }

  // ── 3. RSI + volume filter (subset) ─────────────────────────────────────
  for (const rp of [10, 14]) {
    for (const sp of [20, 50]) {
      for (const mh of [24, 48]) {
        variants.push({
          ...base,
          name: `RSI+Vol(${rp},${sp},mh${mh})`,
          filter: 'volume',
          rsiPeriod: rp, smaPeriod: sp, rsiOversold: 30, rsiOverbought: 65, maxHoldHours: mh,
          volumeThreshold: 1.5,
        });
      }
    }
  }

  // ── 4. RSI + ATR filter (subset) ────────────────────────────────────────
  for (const rp of [10, 14]) {
    for (const sp of [20, 50]) {
      for (const mh of [24, 48]) {
        variants.push({
          ...base,
          name: `RSI+ATR(${rp},${sp},mh${mh})`,
          filter: 'atr',
          rsiPeriod: rp, smaPeriod: sp, rsiOversold: 30, rsiOverbought: 65, maxHoldHours: mh,
          atrThreshold: 0.02,
        });
      }
    }
  }

  // ── 5. Pure momentum (no RSI, just SMA cross) ──────────────────────────
  // Force RSI oversold=0, overbought=100 so RSI never triggers exit/entry by itself
  // Instead, entry = price > SMA + momentum, exit = price < SMA*0.95 or max hold
  for (const sp of [10, 20, 50]) {
    for (const mh of maxHoldHoursArr) {
      variants.push({
        ...base,
        name: `PureMom(SMA${sp},mh${mh})`,
        filter: 'momentum',
        rsiPeriod: 14, smaPeriod: sp,
        rsiOversold: 0, rsiOverbought: 100, // RSI never triggers
        maxHoldHours: mh,
      });
    }
  }

  return variants;
}

// ── Data Fetch ────────────────────────────────────────────────────────────────

async function fetchBTC4h(days: number): Promise<Candle[]> {
  const endMs = Date.now();
  const startMs = endMs - days * 24 * 60 * 60 * 1000;
  const cacheKey = getCacheKey('binance', 'BTCUSDT', '4h');
  const cached = loadCandles(cacheKey);
  if (cached && cached.candles.length > days * 6) {
    console.log(`[cache] Using ${cached.candles.length} cached BTC 4h candles`);
    return cached.candles.filter((c: Candle) => c.timestamp >= startMs && c.timestamp <= endMs) as Candle[];
  }
  console.log(`[fetch] Downloading BTC 4h candles (${days} days) from Binance...`);
  const candles = await fetchOHLCV('binance', 'BTCUSDT', '4h', startMs, endMs);
  console.log(`[fetch] Got ${candles.length} candles`);
  return candles;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function parseArgs(): { days: number; stressMode: StressMode } {
  const args = process.argv.slice(2);
  const days = parseInt(args[0] || '167', 10);
  const stressMode = (args[1] || 'conservative') as StressMode;
  if (isNaN(days) || days <= 0 || days > 3650) {
    console.error('Usage: npx tsx hypothesis-sweep.ts [days] [stressMode]');
    process.exit(1);
  }
  if (!['normal', 'conservative', 'adverse'].includes(stressMode)) {
    console.error('stressMode must be normal, conservative, or adverse');
    process.exit(1);
  }
  return { days, stressMode };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { days, stressMode } = parseArgs();
  const costCfg = resolveStressConfig(stressMode);
  const candles = await fetchBTC4h(days);

  if (candles.length < 200) {
    console.error(`Insufficient data: ${candles.length} candles (need 200+)`);
    process.exit(1);
  }

  const totalDays = (candles[candles.length - 1].timestamp - candles[0].timestamp) / (24 * 60 * 60 * 1000);
  console.log(`\n=== Hypothesis Sweep: SOL 1h ===`);
  console.log(`Candles: ${candles.length}  |  Period: ${totalDays.toFixed(1)} days  |  Cost: ${stressMode}`);
  console.log(`Fee: ${(costCfg.feePct * 100).toFixed(3)}%  Slip: ${(costCfg.slipPct * 100).toFixed(3)}%  Impact: ${(costCfg.marketImpactPct * 100).toFixed(3)}%\n`);

  const variants = buildVariants();
  console.log(`Testing ${variants.length} parameter combinations...\n`);

  const results: SweepResult[] = [];

  for (let idx = 0; idx < variants.length; idx++) {
    const v = variants[idx];
    const trades = runStrategy(candles, v, costCfg);
    const { p5, p95 } = bootstrapConfidence(trades);

    const netPnl = trades.reduce((s, t) => s + t.pnl, 0);
    const wins = trades.filter(t => t.pnl > 0).length;
    const losses = trades.filter(t => t.pnl <= 0).length;
    const grossProfit = trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(trades.filter(t => t.pnl <= 0).reduce((s, t) => s + t.pnl, 0));
    const avgHoldHrs = trades.length > 0
      ? trades.reduce((s, t) => s + t.holdingMinutes, 0) / trades.length / 60
      : 0;

    results.push({
      name: v.name,
      filter: v.filter,
      rsiPeriod: v.rsiPeriod,
      smaPeriod: v.smaPeriod,
      rsiOversold: v.rsiOversold,
      rsiOverbought: v.rsiOverbought,
      maxHoldHours: v.maxHoldHours,
      netPnl: Number(netPnl.toFixed(2)),
      winRate: trades.length > 0 ? Number(((wins / trades.length) * 100).toFixed(1)) : 0,
      totalTrades: trades.length,
      profitFactor: grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 999 : 0,
      expectancy: Number(computeExpectancy(trades).toFixed(4)),
      sharpe: Number(computeSharpe(trades).toFixed(2)),
      bootstrapP5: Number(p5.toFixed(2)),
      bootstrapP95: Number(p95.toFixed(2)),
      tradesPerMonth: totalDays > 0 ? Number(((trades.length / totalDays) * 30).toFixed(1)) : 0,
      avgHoldingHours: Number(avgHoldHrs.toFixed(1)),
    });

    if ((idx + 1) % 100 === 0 || idx === variants.length - 1) {
      process.stdout.write(`  Progress: ${idx + 1}/${variants.length}\r`);
    }
  }

  console.log('\n');

  // ── Rank by expectancy (not raw return) ──────────────────────────────────
  results.sort((a, b) => b.expectancy - a.expectancy);

  // ── Filter: require at least 10 trades for statistical relevance ─────────
  const viable = results.filter(r => r.totalTrades >= 10);
  const top10 = viable.slice(0, 10);

  console.log('=== Top 10 Strategies by Expectancy (min 10 trades) ===\n');

  console.table(top10.map((r, i) => ({
    Rank: i + 1,
    Name: r.name,
    Filter: r.filter,
    Trades: r.totalTrades,
    'Win%': r.winRate,
    'PnL ($)': r.netPnl,
    'PF': r.profitFactor,
    'Expectancy': r.expectancy,
    'Sharpe': r.sharpe,
    'Boot P5': r.bootstrapP5,
    'Boot P95': r.bootstrapP95,
    'Avg Hold': r.avgHoldingHours + 'h',
  })));

  // ── Statistical significance summary ─────────────────────────────────────
  console.log('\n=== Statistical Significance Summary ===\n');
  const profitableViable = viable.filter(r => r.expectancy > 0);
  console.log(`Total viable strategies (>=10 trades): ${viable.length}`);
  console.log(`Positive expectancy: ${profitableViable.length} (${viable.length > 0 ? ((profitableViable.length / viable.length) * 100).toFixed(0) : 0}%)`);
  console.log(`Bootstrapped 95% CI above zero: ${top10.filter(r => r.bootstrapP5 > 0).length} of top 10`);

  // ── Filter breakdown ─────────────────────────────────────────────────────
  console.log('\n=== Performance by Filter Type ===\n');
  const filterGroups = new Map<string, SweepResult[]>();
  for (const r of viable) {
    if (!filterGroups.has(r.filter)) filterGroups.set(r.filter, []);
    filterGroups.get(r.filter)!.push(r);
  }

  console.table(Array.from(filterGroups.entries()).map(([filter, arr]) => ({
    Filter: filter,
    Variants: arr.length,
    'Avg Expectancy': (arr.reduce((s, r) => s + r.expectancy, 0) / arr.length).toFixed(4),
    'Avg Win%': (arr.reduce((s, r) => s + r.winRate, 0) / arr.length).toFixed(1),
    'Avg Sharpe': (arr.reduce((s, r) => s + r.sharpe, 0) / arr.length).toFixed(2),
    'Median Trades': arr.map(r => r.totalTrades).sort((a, b) => a - b)[Math.floor(arr.length / 2)],
  })));

  // ── Parameter sensitivity analysis (best filter type) ────────────────────
  console.log('\n=== Parameter Sensitivity (RSI-only variants) ===\n');
  const rsiOnly = viable.filter(r => r.filter === 'none');

  // RSI period sensitivity
  const byRSIPeriod = new Map<number, number[]>();
  for (const r of rsiOnly) {
    if (!byRSIPeriod.has(r.rsiPeriod)) byRSIPeriod.set(r.rsiPeriod, []);
    byRSIPeriod.get(r.rsiPeriod)!.push(r.expectancy);
  }
  console.table(Array.from(byRSIPeriod.entries()).map(([period, exps]) => ({
    'RSI Period': period,
    Variants: exps.length,
    'Avg Expectancy': (exps.reduce((a, b) => a + b, 0) / exps.length).toFixed(4),
    'Max Expectancy': Math.max(...exps).toFixed(4),
    'Pct Positive': ((exps.filter(e => e > 0).length / exps.length) * 100).toFixed(0) + '%',
  })));

  // SMA period sensitivity
  const bySMAPeriod = new Map<number, number[]>();
  for (const r of rsiOnly) {
    if (!bySMAPeriod.has(r.smaPeriod)) bySMAPeriod.set(r.smaPeriod, []);
    bySMAPeriod.get(r.smaPeriod)!.push(r.expectancy);
  }
  console.table(Array.from(bySMAPeriod.entries()).map(([period, exps]) => ({
    'SMA Period': period,
    Variants: exps.length,
    'Avg Expectancy': (exps.reduce((a, b) => a + b, 0) / exps.length).toFixed(4),
    'Max Expectancy': Math.max(...exps).toFixed(4),
    'Pct Positive': ((exps.filter(e => e > 0).length / exps.length) * 100).toFixed(0) + '%',
  })));

  // ── Overall verdict ──────────────────────────────────────────────────────
  console.log('\n=== VERDICT ===\n');
  const allPnl = viable.map(r => r.expectancy);
  const meanExpectancy = allPnl.length > 0 ? allPnl.reduce((a, b) => a + b, 0) / allPnl.length : 0;
  const bestExpectancy = viable.length > 0 ? viable[0].expectancy : 0;

  if (viable.length === 0) {
    console.log('NO VIABLE STRATEGIES FOUND (<10 trades across all parameter combinations)');
  } else if (meanExpectancy <= 0) {
    console.log(`MEAN EXPECTANCY ACROSS ALL STRATEGIES: ${meanExpectancy.toFixed(4)} — SOL 1h RSI shows NO systematic edge`);
  } else if (bestExpectancy > 0 && top10[0]?.bootstrapP5 > 0) {
    console.log(`STRONG SIGNAL: Best strategy expectancy=${bestExpectancy.toFixed(4)}, bootstrap 95% CI entirely above zero`);
  } else {
    console.log(`WEAK/MARGINAL SIGNAL: Best expectancy=${bestExpectancy.toFixed(4)}, but bootstrap CI includes zero — likely noise`);
  }

  // ── Write markdown report ────────────────────────────────────────────────
  const reportPath = '/Users/macbook/trade-bot/plans/reports/hypothesis-sweep-btc4h.md';
  const fs = await import('fs');
  const md = buildMarkdownReport({
    days, totalDays, candleCount: candles.length, stressMode, costCfg,
    totalVariants: variants.length, viableCount: viable.length,
    top10, allResults: viable, filterGroups,
    byRSIPeriod: Array.from(byRSIPeriod.entries()).map(([k, v]) => ({ period: k, exps: v })),
    bySMAPeriod: Array.from(bySMAPeriod.entries()).map(([k, v]) => ({ period: k, exps: v })),
    meanExpectancy, bestExpectancy,
  });
  fs.writeFileSync(reportPath, md, 'utf8');
  console.log(`\nReport saved to: ${reportPath}`);
}

// ── Markdown Report Builder ───────────────────────────────────────────────────

function buildMarkdownReport(args: {
  days: number; totalDays: number; candleCount: number; stressMode: string;
  costCfg: CostConfig; totalVariants: number; viableCount: number;
  top10: SweepResult[]; allResults: SweepResult[];
  filterGroups: Map<string, SweepResult[]>;
  byRSIPeriod: { period: number; exps: number[] }[];
  bySMAPeriod: { period: number; exps: number[] }[];
  meanExpectancy: number; bestExpectancy: number;
}): string {
  const { days, totalDays, candleCount, stressMode, costCfg, totalVariants, viableCount, top10, allResults, filterGroups, byRSIPeriod, bySMAPeriod, meanExpectancy, bestExpectancy } = args;

  let md = `# Hypothesis Sweep — BTC 4h\n\n`;
  md += `**Date:** ${new Date().toISOString().slice(0, 10)}\n`;
  md += `**Asset:** BTC/USDT  |  **Exchange:** Binance  |  **Timeframe:** 4h\n`;
  md += `**Lookback:** ${days} days (${candleCount} candles, ${totalDays.toFixed(1)} actual days)\n`;
  md += `**Cost model:** ${stressMode} (fee=${(costCfg.feePct * 100).toFixed(3)}%, slip=${(costCfg.slipPct * 100).toFixed(3)}%, impact=${(costCfg.marketImpactPct * 100).toFixed(3)}%)\n`;
  md += `**Total variants tested:** ${totalVariants}  |  **Viable (>=10 trades):** ${viableCount}\n\n`;
  md += `---\n\n`;

  // Verdict
  md += `## Verdict\n\n`;
  if (viableCount === 0) {
    md += `**NO VIABLE STRATEGIES FOUND** (< 10 trades across all parameter combinations)\n\n`;
  } else if (meanExpectancy <= 0) {
    md += `**NO SYSTEMATIC EDGE** — Mean expectancy across all strategies: ${meanExpectancy.toFixed(4)}\n\n`;
    md += `SOL 1h RSI does not produce positive expectancy at the tested parameter grid. The apparent "profitability" is likely noise or survivorship bias.\n\n`;
  } else if (bestExpectancy > 0 && top10[0]?.bootstrapP5 > 0) {
    md += `**STRONG SIGNAL** — Best expectancy: ${bestExpectancy.toFixed(4)}, bootstrap 95% CI entirely above zero\n\n`;
  } else {
    md += `**MARGINAL** — Best expectancy: ${bestExpectancy.toFixed(4)}, but bootstrap CI includes zero\n\n`;
  }

  // Top 10
  md += `## Top 10 Strategies by Expectancy\n\n`;
  md += `| Rank | Strategy | Filter | Trades | Win% | PnL ($) | PF | Expectancy | Sharpe | Boot P5 | Boot P95 |\n`;
  md += `|------|----------|--------|--------|------|---------|-----|------------|--------|---------|----------|\n`;
  top10.forEach((r, i) => {
    md += `| ${i + 1} | ${r.name} | ${r.filter} | ${r.totalTrades} | ${r.winRate}% | ${r.netPnl} | ${r.profitFactor} | ${r.expectancy} | ${r.sharpe} | ${r.bootstrapP5} | ${r.bootstrapP95} |\n`;
  });
  md += `\n`;

  // Filter breakdown
  md += `## Performance by Filter Type\n\n`;
  md += `| Filter | Variants | Avg Expectancy | Avg Win% | Avg Sharpe | Median Trades |\n`;
  md += `|--------|----------|----------------|----------|------------|---------------|\n`;
  for (const [filter, arr] of filterGroups) {
    const avgExp = (arr.reduce((s, r) => s + r.expectancy, 0) / arr.length).toFixed(4);
    const avgWin = (arr.reduce((s, r) => s + r.winRate, 0) / arr.length).toFixed(1);
    const avgSh = (arr.reduce((s, r) => s + r.sharpe, 0) / arr.length).toFixed(2);
    const medTrades = arr.map(r => r.totalTrades).sort((a, b) => a - b)[Math.floor(arr.length / 2)];
    md += `| ${filter} | ${arr.length} | ${avgExp} | ${avgWin}% | ${avgSh} | ${medTrades} |\n`;
  }
  md += `\n`;

  // Parameter sensitivity
  md += `## Parameter Sensitivity (RSI-only variants)\n\n`;
  md += `### RSI Period\n\n`;
  md += `| Period | Variants | Avg Expectancy | Max Expectancy | % Positive |\n`;
  md += `|--------|----------|----------------|----------------|------------|\n`;
  for (const { period, exps } of byRSIPeriod) {
    const avg = (exps.reduce((a, b) => a + b, 0) / exps.length).toFixed(4);
    const max = Math.max(...exps).toFixed(4);
    const pctPos = ((exps.filter(e => e > 0).length / exps.length) * 100).toFixed(0) + '%';
    md += `| ${period} | ${exps.length} | ${avg} | ${max} | ${pctPos} |\n`;
  }
  md += `\n`;

  md += `### SMA Period\n\n`;
  md += `| Period | Variants | Avg Expectancy | Max Expectancy | % Positive |\n`;
  md += `|--------|----------|----------------|----------------|------------|\n`;
  for (const { period, exps } of bySMAPeriod) {
    const avg = (exps.reduce((a, b) => a + b, 0) / exps.length).toFixed(4);
    const max = Math.max(...exps).toFixed(4);
    const pctPos = ((exps.filter(e => e > 0).length / exps.length) * 100).toFixed(0) + '%';
    md += `| ${period} | ${exps.length} | ${avg} | ${max} | ${pctPos} |\n`;
  }
  md += `\n`;

  // Full results
  md += `## Full Results (viable strategies)\n\n`;
  md += `| Strategy | Filter | RSI Period | SMA Period | Oversold | Overbought | Max Hold | Trades | Win% | PnL | PF | Expectancy | Sharpe |\n`;
  md += `|----------|--------|------------|------------|----------|------------|----------|--------|------|-----|-----|------------|--------|\n`;
  for (const r of allResults) {
    md += `| ${r.name} | ${r.filter} | ${r.rsiPeriod} | ${r.smaPeriod} | ${r.rsiOversold} | ${r.rsiOverbought} | ${r.maxHoldHours}h | ${r.totalTrades} | ${r.winRate}% | ${r.netPnl} | ${r.profitFactor} | ${r.expectancy} | ${r.sharpe} |\n`;
  }
  md += `\n`;

  md += `---\n\n`;
  md += `*Generated by hypothesis-sweep.ts — all results are in-sample; do not trade based on these results alone.*\n`;

  return md;
}

main().catch((err) => {
  console.error('Hypothesis sweep failed:', err);
  process.exit(1);
});
