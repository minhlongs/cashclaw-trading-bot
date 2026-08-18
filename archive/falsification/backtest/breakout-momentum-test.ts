// Breakout & Momentum Strategy Test — SMA crossover, Donchian, volume-confirmed, regime-filtered
// Tests 4 alternative strategy archetypes on cached 1h data (BTC, ETH, SOL).
// RSI mean-reversion failed; this explores momentum / breakout alternatives.
//
// Usage:
//   npx tsx src/forest/backtest/breakout-momentum-test.ts [conservative|normal|adverse]

import { loadCandles } from '@/forest/backtest/ohlcv-cache';
import { resolveStressConfig, applyCosts, type CostConfig } from '@/forest/backtest/cost-model';
import type { Candle } from '@/forest/backtest/ohlcv';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TradeResult {
  grossPnl: number;
  cost: number;
  entryIdx: number;
  exitIdx: number;
  entryPrice: number;
  exitPrice: number;
}

interface Metrics {
  netPnl: number;
  winRate: number;
  numTrades: number;
  profitFactor: number;
  sharpe: number | null;
  maxDrawdown: number;
  bootstrapPValue: number;
  trades: TradeResult[];
  equityCurve: number[];
}

// ── Cache keys ────────────────────────────────────────────────────────────────

const CACHE_KEYS: Record<string, string> = {
  BTCUSDT: 'binance:BTCUSDT:1h',
  ETHUSDT: 'binance:ETHUSDT:1h',
  SOLUSDT: 'binance:SOLUSDT:1h',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** SMA over a window, returning NaN where insufficient data. */
function sma(values: number[], period: number): number[] {
  const result = new Array(values.length).fill(NaN) as number[];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) result[i] = sum / period;
  }
  return result;
}

/** Simple volatility: annualized from close-to-close returns over a lookback. */
function rollingVolatility(closes: number[], lookback: number): number[] {
  const result = new Array(closes.length).fill(NaN) as number[];
  for (let i = lookback; i < closes.length; i++) {
    const rets: number[] = [];
    for (let j = i - lookback + 1; j <= i; j++) {
      if (closes[j - 1] > 0) rets.push(Math.log(closes[j] / closes[j - 1]));
    }
    if (rets.length === 0) continue;
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
    result[i] = Math.sqrt(variance) * Math.sqrt(8760);
  }
  return result;
}

/** Classify regime: TREND_UP / TREND_DOWN / SIDEWAYS. */
function classifyRegime(closes: number[], sma50: number[], vol: number[]): string {
  const lastClose = closes[closes.length - 1];
  const lastSma = sma50[sma50.length - 1];
  const lastVol = vol[vol.length - 1];
  if (Number.isNaN(lastSma) || Number.isNaN(lastVol)) return 'SIDEWAYS';
  if (lastClose > lastSma && lastVol > 0.01) return 'TREND_UP';
  if (lastClose < lastSma) return 'TREND_DOWN';
  return 'SIDEWAYS';
}

/** Sharpe ratio of a PnL equity curve (1-hour bars). */
function sharpeRatio(curve: number[]): number | null {
  if (curve.length < 3) return null;
  const rets: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    rets.push(curve[i] - curve[i - 1]);
  }
  if (rets.length === 0) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return Number(((mean / std) * Math.sqrt(8760)).toFixed(4));
}

/** Max drawdown from a PnL equity curve. */
function maxDrawdown(curve: number[]): number {
  if (curve.length === 0) return 0;
  let peak = curve[0];
  let worst = 0;
  for (const eq of curve) {
    if (eq > peak) peak = eq;
    const dd = peak === 0 ? 0 : (eq - peak) / peak;
    if (dd < worst) worst = dd;
  }
  return Number(worst.toFixed(6));
}

/** Bootstrap significance: p-value for H0: mean trade return <= 0. */
function bootstrapPValue(trades: TradeResult[], nResamples: number): number {
  const returns = trades.map((t) => t.entryPrice > 0 ? t.grossPnl / t.entryPrice : 0);
  if (returns.length < 3) return 1;
  let count = 0;
  for (let i = 0; i < nResamples; i++) {
    const sample: number[] = [];
    for (let j = 0; j < returns.length; j++) {
      sample.push(returns[Math.floor(Math.random() * returns.length)]);
    }
    const sampleMean = sample.reduce((a, b) => a + b, 0) / sample.length;
    if (sampleMean <= 0) count++;
  }
  return Number((count / nResamples).toFixed(4));
}

/** Round-trip cost per unit for a trade. */
function tradeCost(cost: CostConfig, entryPrice: number, exitPrice: number): number {
  const entry = applyCosts(0, entryPrice, cost);
  const exit = applyCosts(0, exitPrice, cost);
  return entry.fees + entry.slippage + entry.marketImpact +
         exit.fees + exit.slippage + exit.marketImpact;
}

/** Build equity curve from trades: step function between trades. */
function buildEquityCurve(trades: TradeResult[], numBars: number): number[] {
  const equity = new Array(numBars).fill(0);
  let cumPnl = 0;
  let tradeIdx = 0;

  for (let bar = 0; bar < numBars && tradeIdx < trades.length; bar++) {
    if (trades[tradeIdx].exitIdx === bar) {
      cumPnl += trades[tradeIdx].grossPnl;
      tradeIdx++;
    }
    equity[bar] = cumPnl;
  }

  return equity;
}

/** Compute all metrics. */
function computeMetrics(trades: TradeResult[], cost: CostConfig): Metrics {
  const equity = buildEquityCurve(trades, 1000);
  const costs = trades.map((t) => tradeCost(cost, t.entryPrice, t.exitPrice));
  const netPnl = trades.reduce((s, t, i) => s + t.grossPnl - costs[i], 0);
  const wins = trades.filter((t) => t.grossPnl > 0).length;
  const grossWins = trades.filter((t) => t.grossPnl > 0).reduce((s, t) => s + t.grossPnl, 0);
  const grossLosses = Math.abs(trades.filter((t) => t.grossPnl <= 0).reduce((s, t) => s + t.grossPnl, 0));

  return {
    netPnl: Number(netPnl.toFixed(2)),
    winRate: trades.length > 0 ? Number((wins / trades.length).toFixed(4)) : 0,
    numTrades: trades.length,
    profitFactor: grossLosses > 0 ? Number((grossWins / grossLosses).toFixed(4)) : grossWins > 0 ? Infinity : 0,
    sharpe: sharpeRatio(equity),
    maxDrawdown: maxDrawdown(equity),
    bootstrapPValue: bootstrapPValue(trades, 1000),
    trades,
    equityCurve: equity,
  };
}

// ── Strategy A: SMA Crossover Momentum ────────────────────────────────────────

function strategyASmaCrossover(candles: Candle[], cost: CostConfig): Metrics {
  const closes = candles.map((c) => c.close);
  const fastSma = sma(closes, 10);
  const slowSma = sma(closes, 30);
  const trades: TradeResult[] = [];

  let inPosition = false;
  let entryPrice = 0;
  let entryIdx = 0;

  for (let i = 31; i < candles.length; i++) {
    if (!inPosition && !Number.isNaN(fastSma[i]) && !Number.isNaN(slowSma[i])) {
      if (fastSma[i] > slowSma[i] && fastSma[i - 1] <= slowSma[i - 1]) {
        inPosition = true;
        entryPrice = closes[i];
        entryIdx = i;
      }
    } else if (inPosition) {
      if (fastSma[i] < slowSma[i] && fastSma[i - 1] >= slowSma[i - 1]) {
        trades.push({ grossPnl: closes[i] - entryPrice, cost: 0, entryIdx, exitIdx: i, entryPrice, exitPrice: closes[i] });
        inPosition = false;
      }
    }
  }

  if (inPosition) {
    const last = closes[closes.length - 1];
    trades.push({ grossPnl: last - entryPrice, cost: 0, entryIdx, exitIdx: candles.length - 1, entryPrice, exitPrice: last });
  }

  return computeMetrics(trades, cost);
}

// ── Strategy B: Donchian Channel Breakout ─────────────────────────────────────

function strategyBDonchian(candles: Candle[], cost: CostConfig): Metrics {
  let inPosition = false;
  let entryPrice = 0;
  let entryIdx = 0;
  const trades: TradeResult[] = [];
  const entryLookback = 20;
  const exitLookback = 10;

  for (let i = Math.max(entryLookback, exitLookback); i < candles.length; i++) {
    const highSlice = candles.slice(i - entryLookback, i).map((c) => c.high);
    const lowSlice = candles.slice(i - exitLookback, i).map((c) => c.low);
    const upperCh = Math.max(...highSlice);
    const lowerCh = Math.min(...lowSlice);

    if (!inPosition && candles[i].close > upperCh) {
      inPosition = true;
      entryPrice = candles[i].close;
      entryIdx = i;
    } else if (inPosition && candles[i].close < lowerCh) {
      trades.push({ grossPnl: candles[i].close - entryPrice, cost: 0, entryIdx, exitIdx: i, entryPrice, exitPrice: candles[i].close });
      inPosition = false;
    }
  }

  if (inPosition) {
    const lastClose = candles[candles.length - 1].close;
    trades.push({ grossPnl: lastClose - entryPrice, cost: 0, entryIdx, exitIdx: candles.length - 1, entryPrice, exitPrice: lastClose });
  }

  return computeMetrics(trades, cost);
}

// ── Strategy C: Volume-Confirmed Momentum (SMA + volume filter) ───────────────

function strategyCVolumeConfirmed(candles: Candle[], cost: CostConfig): Metrics {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const fastSma = sma(closes, 10);
  const slowSma = sma(closes, 30);
  const volSma = sma(volumes, 20);
  const trades: TradeResult[] = [];

  let inPosition = false;
  let entryPrice = 0;
  let entryIdx = 0;

  for (let i = 31; i < candles.length; i++) {
    const volThresholdMet = !Number.isNaN(volSma[i]) && volumes[i] > volSma[i] * 1.5;

    if (!inPosition && !Number.isNaN(fastSma[i]) && !Number.isNaN(slowSma[i])) {
      if (fastSma[i] > slowSma[i] && fastSma[i - 1] <= slowSma[i - 1] && volThresholdMet) {
        inPosition = true;
        entryPrice = closes[i];
        entryIdx = i;
      }
    } else if (inPosition) {
      if (fastSma[i] < slowSma[i] && fastSma[i - 1] >= slowSma[i - 1]) {
        trades.push({ grossPnl: closes[i] - entryPrice, cost: 0, entryIdx, exitIdx: i, entryPrice, exitPrice: closes[i] });
        inPosition = false;
      }
    }
  }

  if (inPosition) {
    const last = closes[closes.length - 1];
    trades.push({ grossPnl: last - entryPrice, cost: 0, entryIdx, exitIdx: candles.length - 1, entryPrice, exitPrice: last });
  }

  return computeMetrics(trades, cost);
}

// ── Strategy D: Regime-Specific Momentum (TREND_UP only) ──────────────────────

function strategyDRegimeMomentum(candles: Candle[], cost: CostConfig): Metrics {
  const closes = candles.map((c) => c.close);
  const fastSma = sma(closes, 10);
  const slowSma = sma(closes, 30);
  const sma50 = sma(closes, 50);
  const vol = rollingVolatility(closes, 20);
  const trades: TradeResult[] = [];

  let inPosition = false;
  let entryPrice = 0;
  let entryIdx = 0;

  for (let i = 51; i < candles.length; i++) {
    const regime = classifyRegime(closes, sma50, vol);
    const isTrendUp = regime === 'TREND_UP';

    if (inPosition) {
      if (!isTrendUp) {
        trades.push({ grossPnl: closes[i] - entryPrice, cost: 0, entryIdx, exitIdx: i, entryPrice, exitPrice: closes[i] });
        inPosition = false;
      } else if (fastSma[i] < slowSma[i] && fastSma[i - 1] >= slowSma[i - 1]) {
        trades.push({ grossPnl: closes[i] - entryPrice, cost: 0, entryIdx, exitIdx: i, entryPrice, exitPrice: closes[i] });
        inPosition = false;
      }
    }

    if (!inPosition && isTrendUp && !Number.isNaN(fastSma[i]) && !Number.isNaN(slowSma[i])) {
      if (fastSma[i] > slowSma[i] && fastSma[i - 1] <= slowSma[i - 1]) {
        inPosition = true;
        entryPrice = closes[i];
        entryIdx = i;
      }
    }
  }

  if (inPosition) {
    const last = closes[closes.length - 1];
    trades.push({ grossPnl: last - entryPrice, cost: 0, entryIdx, exitIdx: candles.length - 1, entryPrice, exitPrice: last });
  }

  return computeMetrics(trades, cost);
}

// ── Report formatting ─────────────────────────────────────────────────────────

const STRATEGY_NAMES: Record<string, string> = {
  'A-SMA': 'A: SMA Crossover',
  'B-Donchian': 'B: Donchian Breakout',
  'C-Volume': 'C: Volume-Confirmed',
  'D-Regime': 'D: Regime-Filtered',
};

function fmtPnl(v: number): string { return `$${v >= 0 ? '+' : ''}${v.toFixed(2)}`; }
function fmtPct(v: number): string { return `${(v * 100).toFixed(1)}%`; }
function fmtPf(v: number): string { return v === Infinity ? 'INF' : v.toFixed(2); }
function fmtPval(v: number): string { return v < 0.001 ? '<0.001' : v.toFixed(3); }

function getStrategyName(id: string): string {
  return STRATEGY_NAMES[id] ?? id;
}

function resultRow(pair: string, strategyId: string, m: Metrics): string {
  const name = getStrategyName(strategyId);
  return `| ${pair} | ${name} | ${fmtPnl(m.netPnl)} | ${fmtPct(m.winRate)} | ${m.numTrades} | ${fmtPf(m.profitFactor)} | ${m.sharpe ?? 'N/A'} | ${fmtPct(m.maxDrawdown)} | ${fmtPval(m.bootstrapPValue)} |`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const stressMode = (process.argv[2] ?? 'conservative') as 'normal' | 'conservative' | 'adverse';
  const VALID_MODES = ['normal', 'conservative', 'adverse'] as const;
  if (!VALID_MODES.includes(stressMode)) {
    console.error(`Invalid stress mode: "${stressMode}". Allowed: normal, conservative, adverse`);
    process.exit(1);
  }

  console.log('=== Breakout & Momentum Strategy Test ===');
  console.log(`Stress mode: ${stressMode}\n`);

  // ── Load cached data ──────────────────────────────────────────────────────

  const data: Record<string, Candle[]> = {};

  for (const [pair, key] of Object.entries(CACHE_KEYS)) {
    const result = loadCandles(key);
    if (!result || result.candles.length === 0) {
      console.warn(`[SKIP] ${pair}: cache key "${key}" is empty or not found`);
      continue;
    }
    const loaded = result.candles as Candle[];
    data[pair] = loaded;
    console.log(`Loaded ${pair}: ${loaded.length} candles from ${key}`);
  }

  const pairs = Object.keys(data);
  if (pairs.length === 0) {
    console.error('No cached candle data available. Cannot run backtest.');
    process.exit(1);
  }

  console.log(`\nPairs with data: ${pairs.join(', ')}\n`);

  const cost = resolveStressConfig(stressMode);
  console.log(`Cost model: fee=${cost.feePct}, slip=${cost.slipPct}, impact=${cost.marketImpactPct}\n`);

  // ── Run strategies ─────────────────────────────────────────────────────────

  const strategies: Record<string, (candles: Candle[], cost: CostConfig) => Metrics> = {
    'A-SMA': strategyASmaCrossover,
    'B-Donchian': strategyBDonchian,
    'C-Volume': strategyCVolumeConfirmed,
    'D-Regime': strategyDRegimeMomentum,
  };

  const strategyIds = Object.keys(strategies);
  const results: Array<{ pair: string; strategyId: string; m: Metrics }> = [];

  for (const pair of pairs) {
    const candles = data[pair];
    for (const strategyId of strategyIds) {
      const m = strategies[strategyId](candles, cost);
      results.push({ pair, strategyId, m });
    }
  }

  // ── Console comparison table ────────────────────────────────────────────────

  console.log('--- Performance Summary ---\n');
  console.log('| Pair | Strategy | Net PnL | Win Rate | Trades | Profit Factor | Sharpe | Max DD | p-value |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const { pair, strategyId, m } of results) {
    console.log(resultRow(pair, strategyId, m));
  }

  // ── Bootstrap significance summary ─────────────────────────────────────────

  console.log('\n--- Bootstrap Significance (H0: mean return <= 0) ---\n');
  const significant: string[] = [];
  for (const { pair, strategyId, m } of results) {
    const marker = m.bootstrapPValue < 0.05 ? '  *** SIGNIFICANT ***' : '';
    console.log(`  ${pair} ${strategyId}: p=${fmtPval(m.bootstrapPValue)}${marker}`);
    if (m.bootstrapPValue < 0.05) significant.push(`${pair} ${strategyId}`);
  }

  if (significant.length === 0) {
    console.log('\n  No strategy shows statistically significant edge at p < 0.05.');
  } else {
    console.log(`\n  Significant strategies: ${significant.join(', ')}`);
  }

  // ── Write report ────────────────────────────────────────────────────────────

  const reportPath = '/Users/macbook/trade-bot/plans/reports/breakout-momentum-results.md';
  let md = `# Breakout & Momentum Strategy Test Results\n\n`;
  md += `**Date:** ${new Date().toISOString().slice(0, 10)}\n`;
  md += `**Stress Mode:** ${stressMode}\n`;
  md += `**Cost Model:** fee=${cost.feePct}, slip=${cost.slipPct}, impact=${cost.marketImpactPct}\n`;
  md += `**Data Source:** Binance cached 1h candles (BTC, ETH — ~1000 each)\n`;
  md += `**Bootstrap:** 1000 resamples per strategy/pair\n\n`;

  md += `## Strategy Descriptions\n\n`;
  md += `| ID | Name | Entry Rule | Exit Rule |\n`;
  md += `|---|---|---|---|\n`;
  md += `| A | SMA Crossover | Fast SMA(10) > Slow SMA(30) | Fast SMA < Slow SMA |\n`;
  md += `| B | Donchian Breakout | Close > 20-bar highest high | Close < 10-bar lowest low |\n`;
  md += `| C | Volume-Confirmed | SMA crossover + volume > 1.5x 20-bar avg | SMA crossover exit |\n`;
  md += `| D | Regime-Filtered | SMA crossover + TREND_UP regime only | SMA crossover exit or regime exit |\n\n`;

  md += `## Regime Filter (Strategy D)\n\n`;
  md += `TREND_UP = price > SMA(50) AND annualized volatility > 1%. All other regimes skipped.\n\n`;

  md += `## Performance Summary\n\n`;
  md += `| Pair | Strategy | Net PnL | Win Rate | Trades | Profit Factor | Sharpe | Max DD | p-value |\n`;
  md += `|---|---|---|---|---|---|---|---|---|\n`;
  for (const { pair, strategyId, m } of results) {
    md += resultRow(pair, strategyId, m) + '\n';
  }

  md += `\n## Bootstrap Significance (p < 0.05 = significant edge)\n\n`;
  md += `| Pair | Strategy | p-value | Significant? |\n`;
  md += `|---|---|---|---|\n`;
  for (const { pair, strategyId, m } of results) {
    const sig = m.bootstrapPValue < 0.05 ? 'YES' : 'NO';
    md += `| ${pair} | ${getStrategyName(strategyId)} | ${fmtPval(m.bootstrapPValue)} | ${sig} |\n`;
  }

  if (significant.length > 0) {
    md += `\n### Significant Results\n\n`;
    for (const { pair, strategyId, m } of results) {
      if (m.bootstrapPValue >= 0.05) continue;
      md += `**${pair} / ${getStrategyName(strategyId)}**: p=${fmtPval(m.bootstrapPValue)}, PnL=${fmtPnl(m.netPnl)}, Sharpe=${m.sharpe ?? 'N/A'}, PF=${fmtPf(m.profitFactor)}\n\n`;
    }
  } else {
    md += `\n**Conclusion:** No strategy tested shows a statistically significant edge at p < 0.05 across BTC/ETH 1h data.\n`;
  }

  md += `\n---\n`;
  md += `*SOLUSDT 1h cache unavailable (only 4h cached) — excluded from this run.*\n`;

  const { writeFileSync, mkdirSync } = await import('fs');
  const { dirname } = await import('path');
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, md);
  console.log(`\nReport written to: ${reportPath}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});