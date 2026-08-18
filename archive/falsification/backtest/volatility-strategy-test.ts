#!/usr/bin/env npx tsx
/**
 * Volatility Expansion Strategy Backtester — 4h Cached Data
 * Tests 4 volatility-based strategies on cached 4h BTC, ETH, SOL data.
 * RSI mean-reversion FAILED across all pairs — volatility strategies work in HIGH_VOL regime.
 * Adapted from 1h version with adjusted indicator periods for 4h timeframe.
 *
 * Usage: npx tsx src/forest/backtest/volatility-strategy-test.ts [conservative|normal|adverse]
 */

import { loadCandles } from '@/forest/backtest/ohlcv-cache';
import { resolveStressConfig, applyCosts } from '@/forest/backtest/cost-model';
import type { Candle } from '@/forest/backtest/ohlcv';
import type { CostConfig } from '@/forest/backtest/cost-model';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const PAIRS = [
  { cacheKey: 'binance:BTCUSDT:4h', symbol: 'BTC' },
  { cacheKey: 'binance:ETHUSDT:4h', symbol: 'ETH' },
  { cacheKey: 'binance:SOLUSDT:4h', symbol: 'SOL' },
] as const;

const STRESS_MODE = (process.argv[2] ?? 'conservative') as 'conservative' | 'normal' | 'adverse';
const INITIAL_CAPITAL = 10_000;
const MAX_HOLD_BARS = 6; // 6 x 4h = 24h max-hold for Strategy A
const BOOTSTRAP_RESAMPLES = 1000;

// ──────────────────────────────────────────────
// Strategy result types
// ──────────────────────────────────────────────

interface Trade {
  entryIdx: number;
  exitIdx: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number; // after costs
  grossPnl: number;
}

interface StrategyResult {
  strategyName: string;
  symbol: string;
  netPnl: number;
  grossPnl: number;
  totalFees: number;
  winRate: number;
  numTrades: number;
  profitFactor: number;
  sharpe: number;
  maxDrawdownPct: number;
  pValue: number; // bootstrap significance
}

interface BarState {
  inPosition: boolean;
  entryPrice: number;
  entryIdx: number;
  entryCapital: number;
}

// ──────────────────────────────────────────────
// Indicator helpers (pure, no allocations in hot path)
// ──────────────────────────────────────────────

function sma(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return result;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  result[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    sum += values[i] - values[i - period];
    result[i] = sum / period;
  }
  return result;
}

function ema(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return result;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  result[period - 1] = sum / period;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    result[i] = values[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}

function rollingStd(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return result;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
    sumSq += values[i] * values[i];
  }
  const mean = sum / period;
  result[period - 1] = Math.sqrt(sumSq / period - mean * mean);
  for (let i = period; i < values.length; i++) {
    sum += values[i] - values[i - period];
    sumSq += values[i] * values[i] - values[i - period] * values[i - period];
    const m = sum / period;
    result[i] = Math.sqrt(sumSq / period - m * m);
  }
  return result;
}

function rollingMax(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return result;
  for (let i = period - 1; i < values.length; i++) {
    let max = -Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (values[j] > max) max = values[j];
    }
    result[i] = max;
  }
  return result;
}

function rollingMin(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return result;
  for (let i = period - 1; i < values.length; i++) {
    let min = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (values[j] < min) min = values[j];
    }
    result[i] = min;
  }
  return result;
}

// ──────────────────────────────────────────────
// ATR calculation
// ──────────────────────────────────────────────

function atr(candles: Candle[], period: number): number[] {
  const result: number[] = new Array(candles.length).fill(NaN);
  if (candles.length < period + 1) return result;

  const trueRange: number[] = new Array(candles.length).fill(NaN);
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const pc = candles[i - 1].close;
    trueRange[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  trueRange[0] = candles[0].high - candles[0].low;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += trueRange[i];
  result[period - 1] = sum / period;
  for (let i = period; i < candles.length; i++) {
    result[i] = (result[i - 1] * (period - 1) + trueRange[i]) / period;
  }
  return result;
}

// ──────────────────────────────────────────────
// Bollinger Band width
// ──────────────────────────────────────────────

function bollingerWidth(closes: number[], period: number, stdDev: number): number[] {
  const mid = sma(closes, period);
  const std = rollingStd(closes, period);
  const width: number[] = new Array(closes.length).fill(NaN);
  for (let i = 0; i < closes.length; i++) {
    if (!isNaN(mid[i]) && !isNaN(std[i]) && mid[i] > 0) {
      width[i] = (2 * stdDev * std[i]) / mid[i]; // normalized width = (upper-lower)/mid
    }
  }
  return width;
}

// ──────────────────────────────────────────────
// Strategy A: ATR Breakout
// Enter LONG when close > SMA(60) + 2*ATR(14)
// Exit when close < SMA(60) or after 24h
// ──────────────────────────────────────────────

function strategyATRBreakout(candles: Candle[], costCfg: CostConfig): Trade[] {
  const closes = candles.map(c => c.close);
  const sma60 = sma(closes, 60);
  const atr14 = atr(candles, 14);
  const trades: Trade[] = [];
  const state: BarState = { inPosition: false, entryPrice: 0, entryIdx: 0, entryCapital: 0 };

  for (let i = 75; i < candles.length; i++) {
    if (!state.inPosition) {
      // Entry: close > SMA(60) + 2*ATR(14)
      if (!isNaN(sma60[i]) && !isNaN(atr14[i]) && closes[i] > sma60[i] + 2 * atr14[i]) {
        state.inPosition = true;
        state.entryPrice = closes[i];
        state.entryIdx = i;
      }
    } else {
      const holdBars = i - state.entryIdx;
      const exitSMA = !isNaN(sma60[i]) && closes[i] < sma60[i];
      const exitMaxHold = holdBars >= MAX_HOLD_BARS;

      if (exitSMA || exitMaxHold) {
        const exitPrice = closes[i];
        const grossPnl = exitPrice - state.entryPrice;
        const { netPnl, fees } = applyCosts(grossPnl, state.entryPrice, costCfg);
        trades.push({
          entryIdx: state.entryIdx,
          exitIdx: i,
          entryPrice: state.entryPrice,
          exitPrice,
          pnl: netPnl,
          grossPnl,
        });
        state.inPosition = false;
      }
    }
  }
  return trades;
}

// ──────────────────────────────────────────────
// Strategy B: Bollinger Band Squeeze
// Enter LONG when BB width is at 60-period LOW (squeeze)
// Exit when width expands to 60-period HIGH
// ──────────────────────────────────────────────

function strategyBBSqueeze(candles: Candle[], costCfg: CostConfig): Trade[] {
  const closes = candles.map(c => c.close);
  const bbWidth = bollingerWidth(closes, 60, 2);
  const widthMin60 = rollingMin(bbWidth, 60);
  const widthMax60 = rollingMax(bbWidth, 60);
  const trades: Trade[] = [];
  const state: BarState = { inPosition: false, entryPrice: 0, entryIdx: 0, entryCapital: 0 };

  for (let i = 70; i < candles.length; i++) {
    if (!state.inPosition) {
      // Entry: width at 60-period low (squeeze)
      if (!isNaN(bbWidth[i]) && !isNaN(widthMin60[i]) && bbWidth[i] <= widthMin60[i] * 1.001) {
        state.inPosition = true;
        state.entryPrice = closes[i];
        state.entryIdx = i;
      }
    } else {
      // Exit: width expands to 60-period high
      if (!isNaN(bbWidth[i]) && !isNaN(widthMax60[i]) && bbWidth[i] >= widthMax60[i] * 0.999) {
        const exitPrice = closes[i];
        const grossPnl = exitPrice - state.entryPrice;
        const { netPnl, fees } = applyCosts(grossPnl, state.entryPrice, costCfg);
        trades.push({
          entryIdx: state.entryIdx,
          exitIdx: i,
          entryPrice: state.entryPrice,
          exitPrice,
          pnl: netPnl,
          grossPnl,
        });
        state.inPosition = false;
      }
    }
  }
  return trades;
}

// ──────────────────────────────────────────────
// Strategy C: Volatility Regime Filter
// Only trade when realized vol (60-period) > 2%
// Use SMA crossover (30/90) for entries
// ──────────────────────────────────────────────

function strategyVolRegimeFilter(candles: Candle[], costCfg: CostConfig): Trade[] {
  const closes = candles.map(c => c.close);
  const sma30 = sma(closes, 30);
  const sma90 = sma(closes, 90);

  // Realized vol = annualized std of returns
  const returns: number[] = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    returns[i] = Math.log(closes[i] / closes[i - 1]);
  }
  const vol60 = rollingStd(returns, 60);
  const annualizedVol = vol60.map(v => isNaN(v) ? NaN : v * Math.sqrt(2190)); // 2190 = 4h bars/year

  const trades: Trade[] = [];
  const state: BarState = { inPosition: false, entryPrice: 0, entryIdx: 0, entryCapital: 0 };
  const VOL_THRESHOLD = 0.02; // 2% annualized

  for (let i = 95; i < candles.length; i++) {
    if (!state.inPosition) {
      // Entry: SMA30 crosses above SMA90 AND vol > threshold
      const prevSma30 = sma30[i - 1];
      const prevSma90 = sma90[i - 1];
      const volOk = !isNaN(annualizedVol[i]) && annualizedVol[i] > VOL_THRESHOLD;
      const crossover = !isNaN(prevSma30) && !isNaN(prevSma90) && !isNaN(sma30[i]) && !isNaN(sma90[i])
        && prevSma30 <= prevSma90 && sma30[i] > sma90[i];

      if (crossover && volOk) {
        state.inPosition = true;
        state.entryPrice = closes[i];
        state.entryIdx = i;
      }
    } else {
      // Exit: SMA30 crosses below SMA90
      const prevSma30 = sma30[i - 1];
      const prevSma90 = sma90[i - 1];
      const crossDown = !isNaN(prevSma30) && !isNaN(prevSma90) && !isNaN(sma30[i]) && !isNaN(sma90[i])
        && prevSma30 >= prevSma90 && sma30[i] < sma90[i];

      if (crossDown) {
        const exitPrice = closes[i];
        const grossPnl = exitPrice - state.entryPrice;
        const { netPnl } = applyCosts(grossPnl, state.entryPrice, costCfg);
        trades.push({
          entryIdx: state.entryIdx,
          exitIdx: i,
          entryPrice: state.entryPrice,
          exitPrice,
          pnl: netPnl,
          grossPnl,
        });
        state.inPosition = false;
      }
    }
  }
  return trades;
}

// ──────────────────────────────────────────────
// Strategy D: ATR-Based Position Sizing
// SMA crossover (30/90), size = capital * (0.02 / ATR_pct)
// ──────────────────────────────────────────────

function strategyATRPositionSizing(candles: Candle[], costCfg: CostConfig): Trade[] {
  const closes = candles.map(c => c.close);
  const sma30 = sma(closes, 30);
  const sma90 = sma(closes, 90);
  const atr14 = atr(candles, 14);

  const trades: Trade[] = [];
  const state: BarState = { inPosition: false, entryPrice: 0, entryIdx: 0, entryCapital: 0 };
  let capital = INITIAL_CAPITAL;

  for (let i = 95; i < candles.length; i++) {
    if (!state.inPosition) {
      // Entry: SMA30 crosses above SMA90
      const prevSma30 = sma30[i - 1];
      const prevSma90 = sma90[i - 1];
      const crossover = !isNaN(prevSma30) && !isNaN(prevSma90) && !isNaN(sma30[i]) && !isNaN(sma90[i])
        && prevSma30 <= prevSma90 && sma30[i] > sma90[i];

      if (crossover && !isNaN(atr14[i]) && atr14[i] > 0) {
        const atrPct = atr14[i] / closes[i];
        const sizePct = Math.min(1, 0.02 / atrPct); // cap at 100%
        const notional = capital * sizePct;

        state.inPosition = true;
        state.entryPrice = closes[i];
        state.entryIdx = i;
        state.entryCapital = notional;
      }
    } else {
      // Exit: SMA30 crosses below SMA90
      const prevSma30 = sma30[i - 1];
      const prevSma90 = sma90[i - 1];
      const crossDown = !isNaN(prevSma30) && !isNaN(prevSma90) && !isNaN(sma30[i]) && !isNaN(sma90[i])
        && prevSma30 >= prevSma90 && sma30[i] < sma90[i];

      if (crossDown) {
        const exitPrice = closes[i];
        const pctMove = (exitPrice - state.entryPrice) / state.entryPrice;
        const grossPnl = state.entryCapital * pctMove;
        const { netPnl } = applyCosts(grossPnl, state.entryCapital, costCfg);
        capital += netPnl;

        trades.push({
          entryIdx: state.entryIdx,
          exitIdx: i,
          entryPrice: state.entryPrice,
          exitPrice,
          pnl: netPnl,
          grossPnl,
        });
        state.inPosition = false;
      }
    }
  }
  return trades;
}

// ──────────────────────────────────────────────
// Metrics computation
// ──────────────────────────────────────────────

interface MetricsOnly {
  netPnl: number;
  grossPnl: number;
  totalFees: number;
  winRate: number;
  numTrades: number;
  profitFactor: number;
  sharpe: number;
  maxDrawdownPct: number;
}

function computeMetrics(trades: Trade[], candles: Candle[]): MetricsOnly {
  if (trades.length === 0) {
    return {
      netPnl: 0,
      grossPnl: 0,
      totalFees: 0,
      winRate: 0,
      numTrades: 0,
      profitFactor: 0,
      sharpe: 0,
      maxDrawdownPct: 0,
    };
  }

  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const grossWinSum = wins.reduce((s, t) => s + t.grossPnl, 0);
  const grossLossSum = Math.abs(losses.reduce((s, t) => s + t.grossPnl, 0));
  const totalFees = trades.reduce((s, t) => s + (t.grossPnl - t.pnl), 0);

  // Sharpe from per-trade returns
  const returns = trades.map(t => t.pnl / (t.entryPrice || 1));
  const meanRet = returns.reduce((a, b) => a + b, 0) / returns.length;
  const varRet = returns.reduce((a, b) => a + (b - meanRet) ** 2, 0) / returns.length;
  const stdRet = Math.sqrt(varRet);
  const sharpe = stdRet > 0 ? (meanRet / stdRet) * Math.sqrt(8760) : 0; // annualize hourly

  // Max drawdown from cumulative equity
  let equity = INITIAL_CAPITAL;
  let peak = equity;
  let maxDD = 0;
  for (const t of trades) {
    equity += t.pnl;
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  return {
    netPnl: trades.reduce((s, t) => s + t.pnl, 0),
    grossPnl: trades.reduce((s, t) => s + t.grossPnl, 0),
    totalFees,
    winRate: wins.length / trades.length,
    numTrades: trades.length,
    profitFactor: grossLossSum > 0 ? grossWinSum / grossLossSum : grossWinSum > 0 ? Infinity : 0,
    sharpe,
    maxDrawdownPct: maxDD,
  };
}

// ──────────────────────────────────────────────
// Bootstrap significance test
// Tests if strategy returns are statistically different from zero.
// Resamples trade PnLs with replacement, computes Sharpe for each resample.
// p-value = fraction of bootstrap Sharpes >= 0 (i.e. how often random resample is non-negative).
// ──────────────────────────────────────────────

function bootstrapPValue(trades: Trade[], resamples: number): number {
  if (trades.length < 5) return 1; // too few trades to test
  const pnls = trades.map(t => t.pnl);
  let significantCount = 0;

  for (let r = 0; r < resamples; r++) {
    const sample: number[] = [];
    for (let i = 0; i < pnls.length; i++) {
      sample.push(pnls[Math.floor(Math.random() * pnls.length)]);
    }
    const mean = sample.reduce((a, b) => a + b, 0) / sample.length;
    const variance = sample.reduce((a, b) => a + (b - mean) ** 2, 0) / sample.length;
    const std = Math.sqrt(variance);
    if (std > 0 && mean / std > 0) significantCount++;
  }

  return 1 - significantCount / resamples;
}

// ──────────────────────────────────────────────
// Runner
// ──────────────────────────────────────────────

const STRATEGIES: Array<{
  name: string;
  fn: (candles: Candle[], costCfg: CostConfig) => Trade[];
}> = [
  { name: 'A-ATR-Breakout', fn: strategyATRBreakout },
  { name: 'B-BB-Squeeze', fn: strategyBBSqueeze },
  { name: 'C-Vol-Regime', fn: strategyVolRegimeFilter },
  { name: 'D-ATR-Sizing', fn: strategyATRPositionSizing },
];

function main(): void {
  console.log(`\nVolatility Expansion Strategy Backtester`);
  console.log(`Stress mode: ${STRESS_MODE}`);
  console.log(`Initial capital: $${INITIAL_CAPITAL.toLocaleString()}`);
  console.log('='.repeat(80));

  const costCfg = resolveStressConfig(STRESS_MODE);
  const results: StrategyResult[] = [];

  for (const pair of PAIRS) {
    console.log(`\n--- ${pair.symbol} 4h ---`);
    const result = loadCandles(pair.cacheKey);

    if (!result || !result.candles || result.candles.length === 0) {
      console.log(`  [SKIP] No cached data for ${pair.cacheKey}`);
      continue;
    }

    const { candles } = result;

    console.log(`  Loaded ${candles.length} candles (${new Date(candles[0].timestamp).toISOString().slice(0, 10)} to ${new Date(candles[candles.length - 1].timestamp).toISOString().slice(0, 10)})`);

    for (const strat of STRATEGIES) {
      const trades = strat.fn(candles, costCfg);
      const metrics = computeMetrics(trades, candles);
      const pValue = bootstrapPValue(trades, BOOTSTRAP_RESAMPLES);

      const result: StrategyResult = {
        strategyName: strat.name,
        symbol: pair.symbol,
        ...metrics,
        pValue,
      };
      results.push(result);

      const sig = pValue < 0.05 ? '***' : pValue < 0.10 ? '**' : pValue < 0.20 ? '*' : '';
      console.log(`  ${strat.name}: trades=${result.numTrades}, PnL=$${result.netPnl.toFixed(2)}, winRate=${(result.winRate * 100).toFixed(1)}%, PF=${result.profitFactor.toFixed(2)}, Sharpe=${result.sharpe.toFixed(2)}, MaxDD=${(result.maxDrawdownPct * 100).toFixed(1)}%, p=${pValue.toFixed(3)}${sig}`);
    }
  }

  // ── Summary table ──
  console.log('\n' + '='.repeat(80));
  console.log('COMPARISON TABLE');
  console.log('='.repeat(80));

  const header = [
    'Strategy'.padEnd(18),
    'Pair'.padEnd(5),
    'Trades'.padStart(7),
    'Net PnL'.padStart(12),
    'Win%'.padStart(7),
    'PF'.padStart(7),
    'Sharpe'.padStart(8),
    'MaxDD%'.padStart(8),
    'p-value'.padStart(8),
  ].join(' | ');

  console.log(header);
  console.log('-'.repeat(header.length));

  for (const r of results) {
    const sig = r.pValue < 0.05 ? ' ***' : r.pValue < 0.10 ? ' **' : r.pValue < 0.20 ? ' *' : '';
    const line = [
      r.strategyName.padEnd(18),
      r.symbol.padEnd(5),
      String(r.numTrades).padStart(7),
      (`$${r.netPnl.toFixed(2)}`).padStart(12),
      (`${(r.winRate * 100).toFixed(1)}%`).padStart(7),
      r.profitFactor.toFixed(2).padStart(7),
      r.sharpe.toFixed(2).padStart(8),
      (`${(r.maxDrawdownPct * 100).toFixed(1)}%`).padStart(8),
      (r.pValue.toFixed(3) + sig).padStart(8),
    ].join(' | ');
    console.log(line);
  }

  // ── Write results to markdown ──
  writeResults(results, costCfg);

  // ── Overall winner ──
  const winners = results.filter(r => r.pValue < 0.10 && r.numTrades >= 3);
  if (winners.length > 0) {
    const best = winners.reduce((a, b) => (a.sharpe > b.sharpe ? a : b));
    console.log(`\nBest risk-adjusted (p<0.10): ${best.strategyName} on ${best.symbol} (Sharpe=${best.sharpe.toFixed(2)})`);
  } else {
    console.log('\nNo strategy achieved statistical significance at p<0.10 with >= 3 trades.');
    console.log('Conclusion: Volatility-based strategies also fail on this data.');
  }
}

function writeResults(results: StrategyResult[], costCfg: CostConfig): void {
  const reportsDir = resolve(process.cwd(), 'plans', 'reports');
  try { mkdirSync(reportsDir, { recursive: true }); } catch { /* exists */ }

  const lines: string[] = [];
  lines.push('# Volatility Expansion Strategy Backtest Results');
  lines.push('');
  lines.push(`**Date:** ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`**Stress mode:** ${STRESS_MODE} (fee=${(costCfg.feePct * 10000).toFixed(0)}bps, slip=${(costCfg.slipPct * 10000).toFixed(0)}bps, impact=${(costCfg.marketImpactPct * 10000).toFixed(0)}bps)`);
  lines.push(`**Initial capital:** $${INITIAL_CAPITAL.toLocaleString()}`);
  lines.push(`**Bootstrap resamples:** ${BOOTSTRAP_RESAMPLES}`);
  lines.push('');
  lines.push('## Hypothesis');
  lines.push('');
  lines.push('RSI mean-reversion FAILED across all pairs/timeframes. Testing volatility-based strategies that work in HIGH_VOLATILITY regime.');
  lines.push('');
  lines.push('## Strategy Descriptions');
  lines.push('');
  lines.push('| ID | Strategy | Entry Logic | Exit Logic |');
  lines.push('|-----|----------|-------------|------------|');
  lines.push('| A | ATR Breakout | close > SMA(20) + 2*ATR(14) | close < SMA(20) or 24h max-hold |');
  lines.push('| B | BB Squeeze | BB width at 20-period LOW (squeeze) | Width expands to 20-period HIGH |');
  lines.push('| C | Vol Regime | SMA(10/30) crossover AND realized vol > 2% | SMA(10/30) cross down |');
  lines.push('| D | ATR Sizing | SMA(10/30) crossover, size = cap*(0.02/ATR%) | SMA(10/30) cross down |');
  lines.push('');
  lines.push('## Results');
  lines.push('');
  lines.push('| Strategy | Pair | Trades | Net PnL | Win% | PF | Sharpe | MaxDD | p-value | Sig |');
  lines.push('|----------|------|--------|---------|------|-----|--------|-------|---------|-----|');

  for (const r of results) {
    const sig = r.pValue < 0.05 ? '***' : r.pValue < 0.10 ? '**' : r.pValue < 0.20 ? '*' : '-';
    lines.push(`| ${r.strategyName} | ${r.symbol} | ${r.numTrades} | $${r.netPnl.toFixed(2)} | ${(r.winRate * 100).toFixed(1)}% | ${r.profitFactor.toFixed(2)} | ${r.sharpe.toFixed(2)} | ${(r.maxDrawdownPct * 100).toFixed(1)}% | ${r.pValue.toFixed(3)} | ${sig} |`);
  }

  lines.push('');
  lines.push('## Significance Legend');
  lines.push('');
  lines.push('- `***` p < 0.05 (significant)');
  lines.push('- `**` p < 0.10 (marginal)');
  lines.push('- `*` p < 0.20 (weak)');
  lines.push('- `-` not significant');
  lines.push('');

  // Per-pair summary
  const symbols = [...new Set(results.map(r => r.symbol))];
  for (const sym of symbols) {
    const symResults = results.filter(r => r.symbol === sym);
    const significant = symResults.filter(r => r.pValue < 0.10 && r.numTrades >= 3);

    lines.push(`## ${sym}`);
    lines.push('');

    if (significant.length > 0) {
      const best = significant.reduce((a, b) => (a.sharpe > b.sharpe ? a : b));
      lines.push(`**Winner:** ${best.strategyName} (Sharpe=${best.sharpe.toFixed(2)}, p=${best.pValue.toFixed(3)})`);
    } else {
      lines.push('**No significant strategy found.**');
    }
    lines.push('');
  }

  // Overall conclusion
  lines.push('## Conclusion');
  lines.push('');

  const allSignificant = results.filter(r => r.pValue < 0.10 && r.numTrades >= 3);
  if (allSignificant.length > 0) {
    lines.push(`**${allSignificant.length} strategy-pair combinations achieved statistical significance (p<0.10).**`);
    const best = allSignificant.reduce((a, b) => (a.sharpe > b.sharpe ? a : b));
    lines.push(`Best overall: ${best.strategyName} on ${best.symbol} (Sharpe=${best.sharpe.toFixed(2)}, PnL=$${best.netPnl.toFixed(2)}, p=${best.pValue.toFixed(3)})`);
  } else {
    lines.push('**No volatility strategy achieved statistical significance at p<0.10 with >= 3 trades.**');
    lines.push('');
    lines.push('This suggests the data period may be in a low-volatility regime where volatility strategies underperform,');
    lines.push('OR the strategies require additional filters (e.g., volume confirmation, regime detection).');
    lines.push('');
    lines.push('Recommendation: test regime-aware filtering or wait for higher volatility periods.');
  }

  lines.push('');
  lines.push('---');
  lines.push(`*Generated by volatility-strategy-test.ts — ${new Date().toISOString()}*`);

  const reportPath = resolve(reportsDir, 'volatility-strategy-4h-results.md');
  writeFileSync(reportPath, lines.join('\n'), 'utf-8');
  console.log(`\nResults written to: ${reportPath}`);
}

// ── Entry point ──
main();
