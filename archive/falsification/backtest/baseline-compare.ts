// Baseline Comparison — runs 4 benchmark baselines + RSI strategy on real candles
// Prints side-by-side comparison table with key performance metrics.
// Single pair: npx tsx src/forest/backtest/baseline-compare.ts binance BTCUSDT 1h 90 conservative
// Batch mode: npx tsx src/forest/backtest/baseline-compare.ts binance BTCUSDT,ETHUSDT,SOLUSDT 1h,4h 730 conservative

import { fetchOHLCV } from './data-fetcher';
import { resolveStressConfig, applyCosts, type CostConfig, type StressMode } from './cost-model';
import { loadCandles, saveCandles, getCacheKey, clearCacheEntry } from './ohlcv-cache';
import { runBaseline } from '@/forest/alpha/baselines/runner';
import type { BaselineStrategy } from '@/forest/alpha/baselines/types';
import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import type { BacktestTrade } from './types';
import type { Candle } from './ohlcv';

// ── RSI + Trend Strategy (extracted from real-data-runner) ────────────────────

interface RSIConfig {
  rsiPeriod: number;
  smaPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  smaStopBuffer: number;       // % below SMA to trigger stop (e.g. 0.05 = 5%)
  maxHoldHours: number;        // max holding period in hours
  requireMomentum: boolean;    // require close > prevClose at entry
}

function computeRegime(candles: Candle[], index: number, sma: number): string {
  if (index < 20) return 'UNKNOWN';
  const closes20 = candles.slice(index - 20, index).map(c => c.close);
  const mean20 = closes20.reduce((a, b) => a + b, 0) / 20;
  const variance20 = closes20.reduce((s, c) => s + (c - mean20) ** 2, 0) / 20;
  const volPct = (Math.sqrt(variance20) / mean20) * 100;
  if (volPct > 3) return 'HIGH_VOLATILITY';
  if (volPct < 0.5) return 'LOW_VOLATILITY';
  if (candles[index].close > sma) return 'TREND_UP';
  if (index > 0 && candles[index - 1].close < sma) return 'TREND_DOWN';
  return 'RANGE';
}

function rsiTrendStrategy(
  candles: Candle[],
  cfg: CostConfig,
  rsiCfg: RSIConfig = {
    rsiPeriod: 14, smaPeriod: 20, rsiOversold: 35, rsiOverbought: 65,
    smaStopBuffer: 0.05, maxHoldHours: 48, requireMomentum: true,
  },
): BacktestTrade[] {
  const { rsiPeriod, smaPeriod, rsiOversold, rsiOverbought, smaStopBuffer, maxHoldHours, requireMomentum } = rsiCfg;
  const trades: BacktestTrade[] = [];
  const initialCapital = 10_000;
  let position: { side: 'buy' | 'sell'; entryPrice: number; entryIndex: number } | null = null;

  for (let i = smaPeriod + rsiPeriod; i < candles.length; i++) {
    const closes = candles.slice(i - rsiPeriod, i).map(c => c.close);
    const sma = candles.slice(i - smaPeriod, i).reduce((s, c) => s + c.close, 0) / smaPeriod;
    const gains: number[] = [], losses: number[] = [];
    for (let j = 1; j < closes.length; j++) {
      const d = closes[j] - closes[j - 1];
      gains.push(Math.max(d, 0));
      losses.push(Math.max(-d, 0));
    }
    const avgGain = gains.reduce((a, b) => a + b, 0) / gains.length;
    const avgLoss = losses.reduce((a, b) => a + b, 0) / losses.length;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);
    const price = candles[i].close;
    const prevPrice = i > 0 ? candles[i - 1].close : price;

    if (!position) {
      // Skip entries during TREND_DOWN
      const regime = computeRegime(candles, i, sma);
      if (regime === 'TREND_DOWN') continue;

      const momentumOk = !requireMomentum || price > prevPrice;
      if (rsi < rsiOversold && price > sma && momentumOk) {
        position = { side: 'buy', entryPrice: price, entryIndex: i };
      }
    } else if (position) {
      const holdMin = (candles[i].timestamp - candles[position.entryIndex].timestamp) / 60_000;
      let exitReason: string | null = null;
      if (holdMin >= maxHoldHours * 60) exitReason = 'maxhold';
      else if (position.side === 'buy' && price < sma * (1 - smaStopBuffer)) exitReason = 'sma';
      else if (rsi > rsiOverbought) exitReason = 'rsi';

      if (exitReason) {
        const quantity = initialCapital / position.entryPrice;
        const grossPnl = (price - position.entryPrice) * quantity;
        const notional = price * quantity;
        const cost = applyCosts(grossPnl, notional, cfg);
        const entryRegime = computeRegime(candles, position.entryIndex, sma);

        trades.push({
          entryTimestamp: candles[position.entryIndex].timestamp,
          exitTimestamp: candles[i].timestamp,
          side: 'buy', entryPrice: position.entryPrice, exitPrice: price,
          pnl: cost.netPnl, fee: cost.fees,
          pnlPct: position.entryPrice > 0 ? ((price - position.entryPrice) / position.entryPrice) * 100 : 0,
          holdingMinutes: holdMin,
          quantity, exitReason, entryRegime,
        });
        position = null;
      }
    }
  }
  return trades;
}

function runRSIStrategy(candles: Candle[], cfg: CostConfig, symbol: string, timeframe: string): EvaluationReport {
  const trades = rsiTrendStrategy(candles, cfg);
  const pnls = trades.map(t => t.pnl);
  const wins = pnls.filter(p => p > 0), losses = pnls.filter(p => p <= 0);
  const totalFees = trades.reduce((s, t) => s + t.fee, 0);
  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const netPnl = pnls.reduce((a, b) => a + b, 0);

  return {
    experimentId: 'rsi_trend',
    symbol, timeframe, regime: 'unknown' as any,
    totalReturn: netPnl / 10_000, netPnl,
    cagr: 0, winRate: trades.length > 0 ? wins.length / trades.length : 0,
    lossRate: trades.length > 0 ? losses.length / trades.length : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    expectancy: trades.length > 0 ? netPnl / trades.length : 0,
    sharpe: 0, sortino: null, maxDrawdown: 0,
    avgTrade: trades.length > 0 ? netPnl / trades.length : 0,
    medianTrade: 0, numTrades: trades.length, turnover: 0,
    fees: totalFees, slippage: 0, exposure: 0, recoveryFactor: 0,
    byRegime: {} as any, byMonth: {}, byVolBucket: {} as any,
    byDuration: { short: {}, medium: {}, long: {} },
  } as EvaluationReport;
}

// ── Table Formatting ─────────────────────────────────────────────────────────

type ComparisonRow = Record<string, string | number>;

function formatRow(name: string, r: EvaluationReport): ComparisonRow {
  return {
    Strategy: name, 'Net PnL ($)': r.netPnl.toFixed(2), 'Win Rate (%)': (r.winRate * 100).toFixed(1),
    'Total Trades': r.numTrades, 'Total Fees ($)': r.fees.toFixed(2),
    'Total Slippage ($)': r.slippage.toFixed(2),
    'Profit Factor': r.profitFactor === Infinity ? '∞' : r.profitFactor.toFixed(2),
    'Expectancy ($/trade)': r.expectancy.toFixed(2),
  };
}

// ── Trade-Level Diagnostics ──────────────────────────────────────────────────

type AggBucket = { count: number; pnlSum: number; wins: number };

function printDiagnostics(trades: BacktestTrade[]): void {
  if (trades.length === 0) { console.log('\nNo trades to analyze.'); return; }

  // 1) Exit Reason Distribution
  console.log('\n--- Exit Reason Distribution (RSI + Trend) ---');
  const exitReasons: Record<string, AggBucket> = {};
  for (const t of trades) {
    const k = t.exitReason ?? 'unknown';
    if (!exitReasons[k]) exitReasons[k] = { count: 0, pnlSum: 0, wins: 0 };
    exitReasons[k].count++;
    exitReasons[k].pnlSum += t.pnl;
    if (t.pnl > 0) exitReasons[k].wins++;
  }
  const rLabels: Record<string, string> = { rsi: 'RSI Overbought', sma: 'SMA Stop', maxhold: 'Max-Hold Timeout' };
  console.table(Object.entries(exitReasons).map(([k, v]) => ({
    'Exit Reason': rLabels[k] ?? k, Count: v.count,
    'Avg PnL ($)': (v.pnlSum / v.count).toFixed(4),
    'Win Rate (%)': ((v.wins / v.count) * 100).toFixed(1),
  })));

  // 2) Regime-Stratified Performance
  console.log('\n--- Regime-Stratified Performance (RSI + Trend) ---');
  const regimes: Record<string, AggBucket> = {};
  for (const t of trades) {
    const r = t.entryRegime ?? 'UNKNOWN';
    if (!regimes[r]) regimes[r] = { count: 0, pnlSum: 0, wins: 0 };
    regimes[r].count++;
    regimes[r].pnlSum += t.pnl;
    if (t.pnl > 0) regimes[r].wins++;
  }
  if (Object.keys(regimes).length === 0) { console.log('No regime data available.'); }
  else {
    console.table(Object.entries(regimes).map(([regime, v]) => ({
      Regime: regime, 'Trade Count': v.count,
      'Win Rate (%)': ((v.wins / v.count) * 100).toFixed(1),
      'Avg PnL ($)': (v.pnlSum / v.count).toFixed(4),
    })));
  }

  // 3) Trade Duration Histogram
  console.log('\n--- Trade Duration Histogram (RSI + Trend) ---');
  const buckets = [
    { label: '0-6h', min: 0, max: 360 }, { label: '6-12h', min: 360, max: 720 },
    { label: '12-24h', min: 720, max: 1440 }, { label: '24h+', min: 1440, max: Infinity },
  ];
  console.table(buckets.map(b => {
    const inB = trades.filter(t => t.holdingMinutes >= b.min && t.holdingMinutes < b.max);
    const pnlSum = inB.reduce((s, t) => s + t.pnl, 0);
    return { Duration: b.label, Count: inB.length, 'Avg PnL ($)': inB.length > 0 ? (pnlSum / inB.length).toFixed(4) : '0.0000' };
  }));
}

// ── CLI Argument Validation ──────────────────────────────────────────────────

const ALLOWED_EXCHANGES = new Set(['binance', 'bybit', 'okx']);
const ALLOWED_INTERVALS = new Set(['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d']);
const SYMBOL_REGEX = /^[A-Z0-9]{1,20}$/;

function validateCLIArgs(exchange: string, symbol: string, interval: string, daysArg: string, stressMode: string): void {
  if (!ALLOWED_EXCHANGES.has(exchange)) { console.error(`Invalid exchange: ${exchange}. Allowed: ${[...ALLOWED_EXCHANGES].join(', ')}`); process.exit(1); }
  if (!SYMBOL_REGEX.test(symbol)) { console.error(`Invalid symbol: ${symbol}. Must match ${SYMBOL_REGEX}`); process.exit(1); }
  if (!ALLOWED_INTERVALS.has(interval)) { console.error(`Invalid interval: ${interval}. Allowed: ${[...ALLOWED_INTERVALS].join(', ')}`); process.exit(1); }
  const days = parseInt(daysArg, 10);
  if (isNaN(days) || days <= 0 || days > 3650) { console.error(`Invalid days: ${daysArg}. Must be 1-3650`); process.exit(1); }
  if (!['normal', 'conservative', 'adverse'].includes(stressMode)) { console.error(`Invalid stressMode: ${stressMode}. Allowed: normal, conservative, adverse`); process.exit(1); }
}

// ── Data Fetching ─────────────────────────────────────────────────────────────

async function fetchForPair(exchange: string, symbol: string, interval: string, days: number): Promise<Candle[]> {
  const endMs = Date.now(), startMs = endMs - days * 24 * 60 * 60 * 1000;

  // Check if cache covers the full requested range before returning stale data
  const cacheKey = getCacheKey(exchange, symbol, interval);
  const cached = loadCandles(cacheKey);
  if (cached && cached.candles.length >= 50) {
    const firstTs = cached.candles[0].timestamp;
    const lastTs = cached.candles[cached.candles.length - 1].timestamp;
    const coversStart = firstTs <= startMs + 24 * 60 * 60 * 1000; // within 1 day tolerance
    const coversEnd = lastTs >= endMs - 24 * 60 * 60 * 1000;
    if (coversStart && coversEnd) {
      return cached.candles.filter(c => c.timestamp >= startMs && c.timestamp <= endMs) as Candle[];
    }
    // Cache is partial — clear and re-fetch full range
    console.log(`  Cache partial (covers ${((lastTs - firstTs) / (24*3600000)).toFixed(0)}d, need ${days}d) — re-fetching...`);
    try { clearCacheEntry(cacheKey); } catch { /* best-effort */ }
  }

  const candles = await fetchOHLCV(exchange, symbol, interval, startMs, endMs);
  if (candles.length > 0) saveCandles(cacheKey, candles);
  return candles;
}

// ── Single Evaluation ─────────────────────────────────────────────────────────

function evaluateOne(
  exchange: string, symbol: string, interval: string,
  days: number, stressMode: StressMode, costCfg: CostConfig,
): { label: string; rows: ComparisonRow[]; rsiTrades: BacktestTrade[]; candleCount: number } {
  const label = `${symbol} ${interval}`;
  return {
    label,
    candleCount: 0,
    rows: [],
    rsiTrades: [],
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const [exchange, symbolsArg, intervalsArg, daysArg, stressMode] = process.argv.slice(2);
  if (!exchange || !symbolsArg || !intervalsArg || !daysArg || !stressMode) {
    console.error('Usage: npx tsx baseline-compare.ts <exchange> <symbols> <intervals> <days> <stressMode>');
    console.error('  symbols: comma-separated (e.g. BTCUSDT,ETHUSDT,SOLUSDT)');
    console.error('  intervals: comma-separated (e.g. 1h,4h)');
    console.error('  Example: npx tsx baseline-compare.ts binance BTCUSDT,ETHUSDT 1h,4h 730 conservative');
    process.exit(1);
  }
  const symbols = symbolsArg.split(',').map(s => s.trim());
  const intervals = intervalsArg.split(',').map(s => s.trim());
  const days = parseInt(daysArg, 10);
  validateCLIArgs(exchange, symbols[0], intervals[0], daysArg, stressMode);

  const costCfg: CostConfig = resolveStressConfig(stressMode as StressMode);
  const baselines: [BaselineStrategy, string][] = [
    ['buy_hold', 'Buy & Hold'], ['random_entry', 'Random Entry'],
    ['simple_momentum', 'Simple Momentum'], ['simple_mean_reversion', 'Mean Reversion'],
  ];

  console.log(`\n=== Multi-Asset Baseline Comparison ===`);
  console.log(`Exchange: ${exchange} | Symbols: ${symbols.join(', ')} | Intervals: ${intervals.join(', ')} | Days: ${days} | Stress: ${stressMode}\n`);

  const allRows: ComparisonRow[] = [];
  for (const symbol of symbols) {
    for (const interval of intervals) {
      if (!SYMBOL_REGEX.test(symbol) || !ALLOWED_INTERVALS.has(interval)) {
        console.error(`Skipping invalid pair: ${symbol} ${interval}`);
        continue;
      }
      console.log(`Fetching ${days}d ${interval} ${symbol}...`);
      const candles = await fetchForPair(exchange, symbol, interval, days);
      if (candles.length < 50) { console.error(`  Insufficient data: ${candles.length} candles`); continue; }
      console.log(`  Loaded ${candles.length} candles`);

      for (const [strategy, name] of baselines) {
        const report = runBaseline(candles, {
          strategy, symbol, timeframe: interval,
          stressMode: stressMode as StressMode, feePct: costCfg.feePct, slipPct: costCfg.slipPct,
        });
        allRows.push(formatRow(`${name} (${symbol} ${interval})`, report));
      }

      const rsiTrades = rsiTrendStrategy(candles, costCfg);
      const rsiReport = runRSIStrategy(candles, costCfg, symbol, interval);
      allRows.push(formatRow(`RSI + Trend (${symbol} ${interval})`, rsiReport));
      console.log(`  RSI diagnostics (${symbol} ${interval}):`);
      printDiagnostics(rsiTrades);
      console.log('');
    }
  }

  console.log('\n=== Aggregated Results ===\n');
  console.table(allRows);
  console.log(`\nCost model (${stressMode}): fee=${costCfg.feePct}, slip=${costCfg.slipPct}, impact=${costCfg.marketImpactPct}`);
}

main().catch((err) => {
  console.error('Baseline comparison failed:', err);
  process.exit(1);
});
