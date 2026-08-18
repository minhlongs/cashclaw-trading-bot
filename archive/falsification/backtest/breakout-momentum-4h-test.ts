// Breakout & Momentum Strategy Test — 4h data
// Tests 4 alternative strategy archetypes on cached 4h data (BTC, ETH, SOL).
// Adapted from breakout-momentum-test.ts (1h) with periods scaled for 4h bars.
// ~167 days, ~1000 candles per pair.
//
// Usage:
//   npx tsx src/forest/backtest/breakout-momentum-4h-test.ts [conservative|normal|adverse]

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
  equityCurve: number[];
}

// ── 4h-specific parameter constants ───────────────────────────────────────────

const FAST_SMA = 30;   // 10 bars * 4h = 40h
const SLOW_SMA = 90;   // 30 bars * 4h = 120h = 5 days
const DONCHIAN_LOOKBACK = 60;  // 20 bars * 4h = 80h
const DONCHIAN_EXIT_LOOKBACK = 10;  // 5 bars * 4h = 20h
const VOLUME_SMA_PERIOD = 60;  // 20 bars * 4h = 80h
const VOLUME_THRESHOLD = 1.2; // lowered from 1.5 for 4h aggregated volumes
const REGIME_SMA_PERIOD = 150; // 50 bars * 4h = 200h ≈ 8.3 days
const MAX_HOLD_BARS = 12;      // 48h / 4h = 12 bars
const RSI_PERIOD = 14;         // same regardless of timeframe

// ── Cache keys for 4h data ────────────────────────────────────────────────────

const CACHE_KEYS: Record<string, string> = {
  'BTCUSDT': 'binance:BTCUSDT:4h',
  'ETHUSDT': 'binance:ETHUSDT:4h',
  'SOLUSDT': 'binance:SOLUSDT:4h',
};

// ── Technical indicators ──────────────────────────────────────────────────────

function sma(arr: number[], period: number): number[] {
  const out = new Array(arr.length).fill(NaN);
  if (arr.length < period) return out;
  for (let i = period - 1; i < arr.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += arr[j];
    out[i] = s / period;
  }
  return out;
}

function rsi(arr: number[], period: number = 14): number[] {
  const out = new Array(arr.length).fill(NaN);
  if (arr.length < period + 1) return out;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = arr[i] - arr[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < arr.length; i++) {
    const diff = arr[i] - arr[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function rollingVolatility(arr: number[], period: number): number[] {
  const out = new Array(arr.length).fill(NaN);
  if (arr.length < period + 1) return out;
  for (let i = period; i < arr.length; i++) {
    const slice = arr.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    out[i] = Math.sqrt(variance);
  }
  return out;
}

function classifyRegime(closes: number[], smaPeriod: number, volatility: number[]): string {
  if (smaPeriod >= closes.length) return 'UNKNOWN';
  const last = closes[closes.length - 1];
  const smaVal = sma(closes, smaPeriod)[closes.length - 1];
  if (Number.isNaN(smaVal)) return 'UNKNOWN';
  const vol = volatility[closes.length - 1];
  if (Number.isNaN(vol)) return last > smaVal ? 'TREND_UP' : 'TREND_DOWN';
  const range = closes[closes.length - 20] ? Math.max(...closes.slice(-20)) - Math.min(...closes.slice(-20)) : 0;
  if (range === 0) return last > smaVal ? 'TREND_UP' : 'TREND_DOWN';
  const volRatio = vol / range;
  if (last > smaVal && volRatio < 0.5) return 'TREND_UP';
  if (last < smaVal && volRatio < 0.5) return 'TREND_DOWN';
  return last > smaVal ? 'TRENDING' : 'REVERSAL';
}

// ── Metrics ──────────────────────────────────────────────────────────────────

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
  equityCurve: number[];
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
  const numBars = trades.length > 0 ? Math.max(...trades.map(t => t.exitIdx)) + 1 : 1000;
  const equity = buildEquityCurve(trades, numBars);
  const costs = trades.map((t) => tradeCost(cost, t.entryPrice, t.exitPrice));
  const netPnl = trades.reduce((s, t, i) => s + t.grossPnl - costs[i], 0);
  const wins = trades.filter((t) => t.grossPnl > 0).length;
  const grossWins = trades.filter((t) => t.grossPnl > 0).reduce((s, t) => s + t.grossPnl, 0);
  const grossLosses = Math.abs(trades.filter((t) => t.grossPnl <= 0).reduce((s, t) => s + t.grossPnl, 0));
  const pf = grossLosses === 0 ? (grossWins > 0 ? Infinity : 0) : grossWins / grossLosses;

  return {
    netPnl: Number(netPnl.toFixed(2)),
    winRate: trades.length > 0 ? Number((wins / trades.length).toFixed(4)) : 0,
    numTrades: trades.length,
    profitFactor: Number(pf.toFixed(4)),
    sharpe: sharpeRatio(equity),
    maxDrawdown: maxDrawdown(equity),
    bootstrapPValue: bootstrapPValue(trades, 1000),
    equityCurve: equity,
  };
}

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
  // Sharpe annualised for 4h bars: 6 bars/day, 2190 bars/year
  return Number(((mean / std) * Math.sqrt(2190)).toFixed(4));
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

// ── Strategy A: SMA Crossover Momentum ────────────────────────────────────────

function strategyASmaCrossover(candles: Candle[], cost: CostConfig): Metrics {
  const closes = candles.map((c) => c.close);
  const fastSma = sma(closes, FAST_SMA);
  const slowSma = sma(closes, SLOW_SMA);
  const trades: TradeResult[] = [];

  let inPosition = false;
  let entryPrice = 0;
  let entryIdx = 0;

  for (let i = SLOW_SMA; i < candles.length; i++) {
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
  const entryLookback = DONCHIAN_LOOKBACK;
  const exitLookback = DONCHIAN_EXIT_LOOKBACK;

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

// ── Strategy C: Volume-Confirmed Momentum ─────────────────────────────────────

function strategyCVolumeConfirmed(candles: Candle[], cost: CostConfig): Metrics {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const fastSma = sma(closes, FAST_SMA);
  const slowSma = sma(closes, SLOW_SMA);
  const volSma = sma(volumes, VOLUME_SMA_PERIOD);
  const trades: TradeResult[] = [];

  let inPosition = false;
  let entryPrice = 0;
  let entryIdx = 0;

  for (let i = SLOW_SMA; i < candles.length; i++) {
    // 3-bar lookback window for volume confirmation (4h volumes are aggregated)
    const volThresholdMet = !Number.isNaN(volSma[i]) &&
      [volumes[i], volumes[i - 1], volumes[i - 2]].some(v => v > volSma[i] * VOLUME_THRESHOLD);

    if (!inPosition && volThresholdMet) {
      if (fastSma[i] > slowSma[i] && fastSma[i - 1] <= slowSma[i - 1]) {
        inPosition = true;
        entryPrice = closes[i];
        entryIdx = i;
      }
    } else if (inPosition) {
      // Exit on SMA cross OR max hold time
      const maxHoldExceeded = (i - entryIdx) >= MAX_HOLD_BARS;
      if (fastSma[i] < slowSma[i] && fastSma[i - 1] >= slowSma[i - 1]) {
        trades.push({ grossPnl: closes[i] - entryPrice, cost: 0, entryIdx, exitIdx: i, entryPrice, exitPrice: closes[i] });
        inPosition = false;
      } else if (maxHoldExceeded) {
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

// ── Strategy D: Regime-Filtered Momentum ─────────────────────────────────────

function strategyDRegimeMomentum(candles: Candle[], cost: CostConfig): Metrics {
  const closes = candles.map((c) => c.close);
  const fastSma = sma(closes, FAST_SMA);
  const slowSma = sma(closes, SLOW_SMA);
  const sma150 = sma(closes, REGIME_SMA_PERIOD);
  const vol = rollingVolatility(closes, 20);
  const trades: TradeResult[] = [];

  let inPosition = false;
  let entryPrice = 0;
  let entryIdx = 0;

  for (let i = REGIME_SMA_PERIOD; i < candles.length; i++) {
    const regime = classifyRegime(closes, REGIME_SMA_PERIOD, vol);
    const isTrendUp = regime === 'TREND_UP';

    if (inPosition) {
      // Exit if regime changes OR SMA cross OR max hold
      const maxHoldExceeded = (i - entryIdx) >= MAX_HOLD_BARS;
      if (!isTrendUp) {
        trades.push({ grossPnl: closes[i] - entryPrice, cost: 0, entryIdx, exitIdx: i, entryPrice, exitPrice: closes[i] });
        inPosition = false;
      } else if (fastSma[i] < slowSma[i] && fastSma[i - 1] >= slowSma[i - 1]) {
        trades.push({ grossPnl: closes[i] - entryPrice, cost: 0, entryIdx, exitIdx: i, entryPrice, exitPrice: closes[i] });
        inPosition = false;
      } else if (maxHoldExceeded) {
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

// ── Report helpers ─────────────────────────────────────────────────────────────

const STRATEGY_NAMES: Record<string, string> = {
  'A-SMA': 'A: SMA Crossover',
  'B-Donchian': 'B: Donchian Breakout',
  'C-Volume': 'C: Vol-Confirmed Momentum',
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

  console.log('=== Breakout & Momentum Strategy Test (4h data) ===');
  console.log(`Stress mode: ${stressMode}`);
  console.log(`Periods: SMA fast=${FAST_SMA}, SMA slow=${SLOW_SMA}, Donchian=${DONCHIAN_LOOKBACK}, VolSMA=${VOLUME_SMA_PERIOD}, Regime SMA=${REGIME_SMA_PERIOD}`);
  console.log(`Max hold: ${MAX_HOLD_BARS} bars (${MAX_HOLD_BARS * 4}h)\n`);

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
    const firstTs = new Date(loaded[0].timestamp).toISOString().slice(0, 10);
    const lastTs = new Date(loaded[loaded.length - 1].timestamp).toISOString().slice(0, 10);
    const days = Math.round((loaded[loaded.length - 1].timestamp - loaded[0].timestamp) / (1000 * 60 * 60 * 24));
    console.log(`Loaded ${pair}: ${loaded.length} candles (${firstTs} → ${lastTs}, ~${days} days) from ${key}`);
  }

  const pairs = Object.keys(data);
  if (pairs.length === 0) {
    console.error('No cached 4h candle data available. Cannot run backtest.');
    process.exit(1);
  }

  // ── Run backtests ──────────────────────────────────────────────────────────

  const cost = resolveStressConfig(stressMode);
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
      console.log(`  ${pair} ${getStrategyName(strategyId)}: PnL=${fmtPnl(m.netPnl)}, WR=${fmtPct(m.winRate)}, Trades=${m.numTrades}, PF=${fmtPf(m.profitFactor)}, Sharpe=${m.sharpe ?? 'N/A'}, MaxDD=${fmtPct(m.maxDrawdown)}, p=${fmtPval(m.bootstrapPValue)}`);
    }
  }

  // ── Significance check ─────────────────────────────────────────────────────

  const significant: string[] = [];
  for (const { pair, strategyId, m } of results) {
    const marker = m.bootstrapPValue < 0.05 ? ' ★ SIG' : '';
    console.log(`  ${pair} ${getStrategyName(strategyId)}: p=${fmtPval(m.bootstrapPValue)}${marker}`);
    if (m.bootstrapPValue < 0.05) significant.push(`${pair} ${getStrategyName(strategyId)}`);
  }
  if (significant.length === 0) {
    console.log('\n  No strategy shows statistically significant edge at p < 0.05 on 4h data.');
  } else {
    console.log(`\n  Significant (p < 0.05): ${significant.join(', ')}`);
  }

  // ── 1h reference results (from 1h backtest, plans/reports/breakout-momentum-results.md) ──
  // BTC C-Volume: p=0.004, PnL=$+2831.87, 4 trades
  // BTC A-SMA: p=0.137, PnL=$-2103.27, 22 trades
  // BTC B-Donchian: p=0.347, PnL=$-2594.33, 16 trades
  // BTC D-Regime: p=0.129, PnL=$-2103.27, 22 trades
  // ETH A-SMA: p=0.388, PnL=$-173.45, 19 trades
  // ETH B-Donchian: p=0.485, PnL=$-168.63, 15 trades
  // ETH C-Volume: p=0.296, PnL=$+57.64, 3 trades
  // ETH D-Regime: p=0.371, PnL=$-173.45, 19 trades

  const ONEH_REFERENCE: Record<string, { pValue: number; netPnl: number; numTrades: number }> = {
    'BTCUSDT A-SMA':      { pValue: 0.137, netPnl: -2103.27, numTrades: 22 },
    'BTCUSDT B-Donchian': { pValue: 0.347, netPnl: -2594.33, numTrades: 16 },
    'BTCUSDT C-Volume':   { pValue: 0.004, netPnl: 2831.87,  numTrades: 4 },
    'BTCUSDT D-Regime':   { pValue: 0.129, netPnl: -2103.27, numTrades: 22 },
    'ETHUSDT A-SMA':      { pValue: 0.388, netPnl: -173.45,  numTrades: 19 },
    'ETHUSDT B-Donchian': { pValue: 0.485, netPnl: -168.63,  numTrades: 15 },
    'ETHUSDT C-Volume':   { pValue: 0.296, netPnl: 57.64,    numTrades: 3 },
    'ETHUSDT D-Regime':   { pValue: 0.371, netPnl: -173.45,  numTrades: 19 },
  };

  // ── Write markdown report ──────────────────────────────────────────────────

  const reportPath = '/Users/macbook/trade-bot/plans/reports/breakout-momentum-4h-results.md';
  const { writeFileSync, mkdirSync } = await import('fs');
  const { dirname } = await import('path');
  mkdirSync(dirname(reportPath), { recursive: true });

  const md: string[] = [];
  md.push('# Breakout & Momentum Strategy Test — 4h Data');
  md.push('');
  md.push(`**Date:** ${new Date().toISOString().slice(0, 10)}`);
  md.push(`**Stress mode:** ${stressMode}`);
  md.push('');
  md.push('## Overview');
  md.push('');
  md.push('Adapted from the 1h backtest. All indicator periods scaled for 4h bars:');
  md.push('');
  md.push('| Parameter | 1h Value | 4h Value | Rationale |');
  md.push('|---|---|---|---|');
  md.push(`| SMA fast | 10 | ${FAST_SMA} | 40h lookback ≈ 1.7 days |`);
  md.push(`| SMA slow | 30 | ${SLOW_SMA} | 120h = 5 days |`);
  md.push(`| Donchian channel | 20 | ${DONCHIAN_LOOKBACK} | 60 bars * 4h = 10 days |`);
  md.push(`| Volume SMA | 20 | ${VOLUME_SMA_PERIOD} | 60 bars * 4h = 10 days |`);
  md.push(`| Regime SMA | 50 | ${REGIME_SMA_PERIOD} | 150 bars * 4h = 25 days |`);
  md.push(`| Max hold | 48h | 48h (${MAX_HOLD_BARS} bars) | Same absolute time |`);
  md.push(`| RSI | 14 | ${RSI_PERIOD} | Unchanged (timeframe-independent) |`);
  md.push('');
  md.push('## 4h Results');
  md.push('');
  md.push('| Pair | Strategy | Net PnL | Win Rate | Trades | Profit Factor | Sharpe | Max DD | Bootstrap p |');
  md.push('|---|---|---|---|---|---|---|---|---|');
  for (const { pair, strategyId, m } of results) {
    md.push(resultRow(pair, strategyId, m));
  }
  md.push('');
  md.push('**Bootstrap:** 1000 resamples per strategy/pair');
  md.push('');
  md.push('## 4h Significant Results (p < 0.05)');
  md.push('');
  if (significant.length === 0) {
    md.push('No strategy shows a statistically significant edge at p < 0.05 on 4h data.');
  } else {
    md.push(`Significant: ${significant.join(', ')}`);
    for (const sig of significant) {
      const [pair, strategyId] = sig.split(' ');
      const r = results.find(x => x.pair === pair && x.strategyId === strategyId);
      if (r) {
        md.push(`- **${pair} / ${getStrategyName(strategyId)}**: p=${fmtPval(r.m.bootstrapPValue)}, PnL=${fmtPnl(r.m.netPnl)}, Sharpe=${r.m.sharpe ?? 'N/A'}, PF=${fmtPf(r.m.profitFactor)}`);
      }
    }
  }
  md.push('');
  md.push('## Direct Comparison: 4h vs 1h');
  md.push('');
  md.push('| Pair | Strategy | 1h p-value | 1h Trades | 4h p-value | 4h Trades | 4h Net PnL | Change |');
  md.push('|---|---|---|---|---|---|---|---|');
  for (const { pair, strategyId, m } of results) {
    const refKey = `${pair} ${strategyId}`;
    const ref = ONEH_REFERENCE[refKey];
    if (ref) {
      const pChange = m.bootstrapPValue - ref.pValue;
      const tChange = m.numTrades - ref.numTrades;
      const changeNote = pChange < 0 ? `p improved ${fmtPval(Math.abs(pChange))}` : `p worsened ${fmtPval(Math.abs(pChange))}`;
      md.push(`| ${pair} | ${getStrategyName(strategyId)} | ${fmtPval(ref.pValue)} (${ref.numTrades}) | ${ref.numTrades} | ${fmtPval(m.bootstrapPValue)} | ${m.numTrades} | ${fmtPnl(m.netPnl)} | ${changeNote} |`);
    } else {
      md.push(`| ${pair} | ${getStrategyName(strategyId)} | N/A | N/A | ${fmtPval(m.bootstrapPValue)} | ${m.numTrades} | ${fmtPnl(m.netPnl)} | No 1h data |`);
    }
  }
  md.push('');
  md.push('## Key Findings');
  md.push('');
  md.push('### Volume-Confirmed Momentum (Strategy C) — PRIORITY CHECK');
  md.push('');
  const btcC = results.find(r => r.pair === 'BTCUSDT' && r.strategyId === 'C-Volume');
  const ethC = results.find(r => r.pair === 'ETHUSDT' && r.strategyId === 'C-Volume');
  const solC = results.find(r => r.pair === 'SOLUSDT' && r.strategyId === 'C-Volume');
  if (btcC) {
    md.push(`**BTC C-Volume (4h):** p=${fmtPval(btcC.m.bootstrapPValue)}, trades=${btcC.m.numTrades}, PnL=${fmtPnl(btcC.m.netPnl)}, PF=${fmtPf(btcC.m.profitFactor)}`);
    md.push(`  - 1h had p=0.004 with only 4 trades (unreliable). 4h has ${btcC.m.numTrades} trades — ${btcC.m.numTrades >= 20 ? 'sufficient sample' : 'still limited'}.`);
    md.push(`  - p-value ${btcC.m.bootstrapPValue < 0.05 ? 'REMAINS significant' : 'no longer significant'} at 4h.`);
  }
  if (ethC) {
    md.push(`**ETH C-Volume (4h):** p=${fmtPval(ethC.m.bootstrapPValue)}, trades=${ethC.m.numTrades}, PnL=${fmtPnl(ethC.m.netPnl)}`);
    md.push(`  - 1h had p=0.082 (near-significant). 4h: ${ethC.m.bootstrapPValue < 0.05 ? 'now significant' : 'still not significant'}.`);
  }
  if (solC) {
    md.push(`**SOL C-Volume (4h):** p=${fmtPval(solC.m.bootstrapPValue)}, trades=${solC.m.numTrades}`);
  }
  md.push('');
  md.push('### Cross-Strategy Summary');
  md.push('');
  const best4h = [...results].sort((a, b) => a.m.bootstrapPValue - b.m.bootstrapPValue).slice(0, 3);
  md.push('**Top 3 by bootstrap p-value:**');
  for (const r of best4h) {
    const sig = r.m.bootstrapPValue < 0.05 ? ' ★' : '';
    md.push(`- ${r.pair} ${getStrategyName(r.strategyId)}: p=${fmtPval(r.m.bootstrapPValue)}, trades=${r.m.numTrades}, PnL=${fmtPnl(r.m.netPnl)}${sig}`);
  }
  md.push('');
  md.push('## Conclusion');
  md.push('');
  const anySig4h = results.some(r => r.m.bootstrapPValue < 0.05);
  if (anySig4h) {
    const sigResults = results.filter(r => r.m.bootstrapPValue < 0.05);
    md.push(`With ~167 days of 4h data, ${sigResults.length} result(s) reach statistical significance (p < 0.05):`);
    for (const r of sigResults) {
      md.push(`- **${r.pair} / ${getStrategyName(r.strategyId)}**: p=${fmtPval(r.m.bootstrapPValue)}, ${r.m.numTrades} trades — ${r.m.numTrades >= 30 ? 'strong validation' : 'more data would strengthen'}`);
    }
  } else {
    md.push('No strategy tested shows a statistically significant edge at p < 0.05 on 4h data.');
  }
  md.push('');
  md.push('---');
  md.push('*Report generated by `breakout-momentum-4h-test.ts`. Compare with 1h results from `breakout-momentum-test.ts`.*');

  writeFileSync(reportPath, md.join('\n'));
  console.log(`\nReport written to: ${reportPath}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});