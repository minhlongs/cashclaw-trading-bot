// Range Mean-Reversion Strategy Test
// Usage: npx tsx src/forest/backtest/range-mean-reversion-test.ts [conservative|normal|adverse]
// Tests mean-reversion in RANGE regime only (vs LOW_VOLATILITY which failed)

import { loadCandles } from '@/forest/backtest/ohlcv-cache';
import { resolveStressConfig, applyCosts, type CostConfig, type StressMode } from '@/forest/backtest/cost-model';
import type { Candle } from '@/forest/backtest/ohlcv';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

// ── Constants ────────────────────────────────────────────────────────────────

const PAIRS = [
  { cacheKey: 'binance:BTCUSDT:1h', symbol: 'BTC' },
  { cacheKey: 'binance:ETHUSDT:1h', symbol: 'ETH' },
  { cacheKey: 'binance:SOLUSDT:1h', symbol: 'SOL' },
] as const;

const STRESS_MODE = (process.argv[2] ?? 'conservative') as 'conservative' | 'normal' | 'adverse';
const INITIAL_CAPITAL = 10_000;
const BOOTSTRAP_RESAMPLES = 1000;

// ── Types ────────────────────────────────────────────────────────────────────

interface TradeResult {
  grossPnl: number;
  entryPrice: number;
  exitPrice: number;
  entryIdx: number;
  exitIdx: number;
}

interface Metrics {
  netPnl: number;
  winRate: number;
  numTrades: number;
  profitFactor: number;
  sharpe: number;
  maxDrawdown: number;
  bootstrapPValue: number;
  trades: TradeResult[];
  equityCurve: number[];
}

// ── Regime Classification ────────────────────────────────────────────────────
// Uses same logic as sol-regime-analysis.ts — vol% based with SMA proximity check

type RegimeType = 'TREND_UP' | 'TREND_DOWN' | 'RANGE' | 'HIGH_VOL' | 'LOW_VOL' | 'SHOCK' | 'UNKNOWN';

function computeRegime(candles: Candle[], index: number, sma20: number): RegimeType {
  if (index < 20) return 'UNKNOWN';
  const closes20 = candles.slice(index - 20, index).map(c => c.close);
  const mean20 = closes20.reduce((a, b) => a + b, 0) / 20;
  const variance20 = closes20.reduce((s, c) => s + (c - mean20) ** 2, 0) / 20;
  const volPct = (Math.sqrt(variance20) / mean20) * 100;

  if (volPct > 3) return 'HIGH_VOL';
  if (volPct < 0.5) return 'LOW_VOL';

  if (sma20 > 0) {
    const close = candles[index].close;
    if (close > sma20 * 1.005) return 'TREND_UP';
    if (index > 0 && candles[index - 1].close < sma20 * 0.995) return 'TREND_DOWN';
  }
  return 'RANGE';
}

// ── Indicator Helpers ────────────────────────────────────────────────────────

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

function computeRSI(closes: number[], period: number = 14): number[] {
  const result: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return result;
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gainSum += d; else lossSum += Math.abs(d);
  }
  let avgGain = gainSum / period, avgLoss = lossSum / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    if (avgLoss === 0) { result[i] = 100; continue; }
    result[i] = 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

// ── Metrics ──────────────────────────────────────────────────────────────────

function computeMetrics(trades: TradeResult[], equity: number[], cost: CostConfig): Metrics {
  const grossPnls = trades.map(t => t.grossPnl);
  const wins = grossPnls.filter(p => p > 0);
  const losses = grossPnls.filter(p => p <= 0);
  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const netPnl = trades.reduce((s, t) => {
    const c = applyCosts(t.grossPnl, 0, cost);
    return s + c.netPnl;
  }, 0);

  const winRate = trades.length > 0 ? wins.length / trades.length : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : wins.length > 0 ? Infinity : 0;

  // Sharpe from equity curve
  let sharpe = 0;
  if (equity.length > 1) {
    const rets: number[] = [];
    for (let i = 1; i < equity.length; i++) {
      if (equity[i - 1] > 0) rets.push((equity[i] - equity[i - 1]) / equity[i - 1]);
    }
    if (rets.length > 0) {
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
      const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length;
      const std = Math.sqrt(variance);
      if (std > 0) sharpe = (mean / std) * Math.sqrt(8760); // 8760h/year
    }
  }

  // Max drawdown from equity curve
  let maxDD = 0;
  let peak = 0;
  for (const eq of equity) {
    if (eq > peak) peak = eq;
    const dd = peak > 0 ? (peak - eq) / peak : 0;
    if (dd > maxDD) maxDD = dd;
  }

  // Bootstrap p-value
  const pValue = bootstrapPValue(trades, BOOTSTRAP_RESAMPLES);

  return { netPnl, winRate, numTrades: trades.length, profitFactor, sharpe, maxDrawdown: maxDD * 100, bootstrapPValue: pValue, trades, equityCurve: equity };
}

function bootstrapPValue(trades: TradeResult[], nResamples: number): number {
  if (trades.length < 3) return 1;
  const returns = trades.map(t => t.entryPrice > 0 ? (t.exitPrice - t.entryPrice) / t.entryPrice : 0);
  const observedMean = returns.reduce((a, b) => a + b, 0) / returns.length;
  let count = 0;
  for (let i = 0; i < nResamples; i++) {
    const sample: number[] = [];
    for (let j = 0; j < returns.length; j++) {
      sample.push(returns[Math.floor(Math.random() * returns.length)]);
    }
    const sampleMean = sample.reduce((a, b) => a + b, 0) / sample.length;
    if (sampleMean >= observedMean) count++;
  }
  return count / nResamples;
}

// ── Strategy A: RSI in RANGE Regime ─────────────────────────────────────────

function strategyA_RSI_RANGE(candles: Candle[], cost: CostConfig): Metrics {
  const closes = candles.map(c => c.close);
  const sma20Arr = sma(closes, 20);
  const rsi = computeRSI(closes, 14);

  let inPosition = false, entryPrice = 0, entryIdx = 0, holdings = 0;
  const trades: TradeResult[] = [];
  const equity: number[] = [];
  let cash = INITIAL_CAPITAL;
  let cumCost = 0;

  for (let i = 50; i < candles.length; i++) {
    const s20 = sma20Arr[i];
    if (!inPosition && !Number.isNaN(rsi[i]) && !Number.isNaN(s20)) {
      const regime = computeRegime(candles, i, s20);
      if (regime === 'RANGE' && rsi[i]! < 35 && closes[i] > s20) {
        inPosition = true;
        entryPrice = closes[i];
        entryIdx = i;
        holdings = cash / entryPrice;
        cash = 0;
        const c = applyCosts(0, entryPrice, cost);
        cumCost += c.fees + c.slippage + c.marketImpact;
      }
    } else if (inPosition && !Number.isNaN(rsi[i]) && !Number.isNaN(s20)) {
      const regime = computeRegime(candles, i, s20);
      if (rsi[i]! > 65 || regime !== 'RANGE') {
        const exitPrice = closes[i];
        const grossPnl = (exitPrice - entryPrice) * holdings;
        const c = applyCosts(grossPnl, exitPrice * holdings, cost);
        cash = holdings * exitPrice - c.fees - c.slippage - c.marketImpact;
        trades.push({ grossPnl, entryPrice, exitPrice, entryIdx, exitIdx: i });
        holdings = 0;
        inPosition = false;
      }
    }
    equity.push(inPosition ? closes[i] * holdings - cumCost : cash - cumCost);
  }
  return computeMetrics(trades, equity, cost);
}

// ── Strategy B: Bollinger Band Bounce in RANGE ───────────────────────────────

function strategyB_BB_Bounce(candles: Candle[], cost: CostConfig): Metrics {
  const closes = candles.map(c => c.close);
  const sma20Arr = sma(closes, 20);
  const bb = computeBollingerBands(closes, 20, 2);
  let inPosition = false, entryPrice = 0, entryIdx = 0, holdings = 0;
  const trades: TradeResult[] = [];
  const equity: number[] = [];
  let cash = INITIAL_CAPITAL;
  let cumCost = 0;

  for (let i = 50; i < candles.length; i++) {
    if (!inPosition && !Number.isNaN(sma20Arr[i]) && !Number.isNaN(bb.lower[i])) {
      const s20 = sma20Arr[i]!;
      const regime = computeRegime(candles, i, s20);
      const bbWidth = bb.width[i]!;
      if (regime === 'RANGE' && bbWidth < 1.5 && closes[i] <= bb.lower[i]!) {
        inPosition = true;
        entryPrice = closes[i];
        entryIdx = i;
        holdings = cash / entryPrice;
        cash = 0;
        const c = applyCosts(0, entryPrice, cost);
        cumCost += c.fees + c.slippage + c.marketImpact;
      }
    } else if (inPosition && !Number.isNaN(sma20Arr[i]) && !Number.isNaN(bb.middle[i])) {
      const s20 = sma20Arr[i]!;
      const regime = computeRegime(candles, i, s20);
      if (closes[i] >= bb.middle[i]! || regime !== 'RANGE') {
        const exitPrice = closes[i];
        const grossPnl = (exitPrice - entryPrice) * holdings;
        const c = applyCosts(grossPnl, exitPrice * holdings, cost);
        cash = holdings * exitPrice - c.fees - c.slippage - c.marketImpact;
        trades.push({ grossPnl, entryPrice, exitPrice, entryIdx, exitIdx: i });
        holdings = 0;
        inPosition = false;
      }
    }
    equity.push(inPosition ? closes[i] * holdings - cumCost : cash - cumCost);
  }
  return computeMetrics(trades, equity, cost);
}

function computeBollingerBands(values: number[], period: number = 20, mult: number = 2): { upper: number[]; middle: number[]; lower: number[]; width: number[] } {
  const middle = sma(values, period);
  const upper: number[] = new Array(values.length).fill(NaN);
  const lower: number[] = new Array(values.length).fill(NaN);
  const width: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    const window = values.slice(i - period + 1, i + 1);
    const mean = middle[i]!;
    const std = Math.sqrt(window.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
    upper[i] = mean + mult * std;
    lower[i] = mean - mult * std;
    width[i] = mean > 0 ? (std / mean) * 100 : NaN;
  }
  return { upper, middle, lower, width };
}

// ── Strategy C: Z-Score Mean Reversion in RANGE ──────────────────────────────

function strategyC_ZScore(candles: Candle[], cost: CostConfig): Metrics {
  const closes = candles.map(c => c.close);
  const sma20Arr = sma(closes, 20);
  const zScores = computeZScore(closes, 20);

  let inPosition = false, entryPrice = 0, entryIdx = 0, holdings = 0;
  const trades: TradeResult[] = [];
  const equity: number[] = [];
  let cash = INITIAL_CAPITAL;
  let cumCost = 0;

  for (let i = 50; i < candles.length; i++) {
    if (!inPosition && !Number.isNaN(sma20Arr[i]) && !Number.isNaN(zScores[i])) {
      const s20 = sma20Arr[i]!;
      const regime = computeRegime(candles, i, s20);
      if (regime === 'RANGE' && zScores[i]! < -1.5) {
        inPosition = true;
        entryPrice = closes[i];
        entryIdx = i;
        holdings = cash / entryPrice;
        cash = 0;
        const c = applyCosts(0, entryPrice, cost);
        cumCost += c.fees + c.slippage + c.marketImpact;
      }
    } else if (inPosition && !Number.isNaN(sma20Arr[i]) && !Number.isNaN(zScores[i])) {
      const s20 = sma20Arr[i]!;
      const regime = computeRegime(candles, i, s20);
      if (zScores[i]! > 0.5 || regime !== 'RANGE') {
        const exitPrice = closes[i];
        const grossPnl = (exitPrice - entryPrice) * holdings;
        const c = applyCosts(grossPnl, exitPrice * holdings, cost);
        cash = holdings * exitPrice - c.fees - c.slippage - c.marketImpact;
        trades.push({ grossPnl, entryPrice, exitPrice, entryIdx, exitIdx: i });
        holdings = 0;
        inPosition = false;
      }
    }
    equity.push(inPosition ? closes[i] * holdings - cumCost : cash - cumCost);
  }
  return computeMetrics(trades, equity, cost);
}

function computeZScore(values: number[], period: number = 20): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    const window = values.slice(i - period + 1, i + 1);
    const mean = window.reduce((a, b) => a + b, 0) / period;
    const variance = window.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    result[i] = std === 0 ? 0 : (values[i] - mean) / std;
  }
  return result;
}

// ── Strategy D: RSI + RANGE + Volume Decline ─────────────────────────────────

function strategyD_RSI_RANGE_Vol(candles: Candle[], cost: CostConfig): Metrics {
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const sma20Arr = sma(closes, 20);
  const rsi = computeRSI(closes, 14);

  let inPosition = false, entryPrice = 0, entryIdx = 0, holdings = 0;
  const trades: TradeResult[] = [];
  const equity: number[] = [];
  let cash = INITIAL_CAPITAL;
  let cumCost = 0;

  for (let i = 50; i < candles.length; i++) {
    if (!inPosition && !Number.isNaN(rsi[i]) && !Number.isNaN(sma20Arr[i])) {
      const s20 = sma20Arr[i]!;
      const regime = computeRegime(candles, i, s20);
      // Volume declining = current bar volume < previous bar volume (exhaustion)
      const volDeclining = i > 0 && volumes[i] < volumes[i - 1];
      if (regime === 'RANGE' && rsi[i]! < 35 && volDeclining) {
        inPosition = true;
        entryPrice = closes[i];
        entryIdx = i;
        holdings = cash / entryPrice;
        cash = 0;
        const c = applyCosts(0, entryPrice, cost);
        cumCost += c.fees + c.slippage + c.marketImpact;
      }
    } else if (inPosition && !Number.isNaN(rsi[i]) && !Number.isNaN(sma20Arr[i])) {
      const s20 = sma20Arr[i]!;
      const regime = computeRegime(candles, i, s20);
      if (rsi[i]! > 65 || regime !== 'RANGE') {
        const exitPrice = closes[i];
        const grossPnl = (exitPrice - entryPrice) * holdings;
        const c = applyCosts(grossPnl, exitPrice * holdings, cost);
        cash = holdings * exitPrice - c.fees - c.slippage - c.marketImpact;
        trades.push({ grossPnl, entryPrice, exitPrice, entryIdx, exitIdx: i });
        holdings = 0;
        inPosition = false;
      }
    }
    equity.push(inPosition ? closes[i] * holdings - cumCost : cash - cumCost);
  }
  return computeMetrics(trades, equity, cost);
}

// ── Baselines ────────────────────────────────────────────────────────────────

function runBuyAndHold(candles: Candle[], cost: CostConfig): Metrics {
  if (candles.length < 2) return emptyMetrics();
  const entryPrice = candles[0].open;
  const exitPrice = candles[candles.length - 1].close;
  const grossPnl = ((exitPrice - entryPrice) / entryPrice) * INITIAL_CAPITAL;
  const notional = INITIAL_CAPITAL;
  const c = applyCosts(grossPnl, notional, cost);
  const equity = [INITIAL_CAPITAL];
  for (let i = 1; i < candles.length; i++) {
    const v = INITIAL_CAPITAL * (candles[i].close / entryPrice) - (c.fees + c.slippage + c.marketImpact);
    equity.push(Math.max(0, v));
  }
  return computeMetrics([{ grossPnl, entryPrice, exitPrice, entryIdx: 0, exitIdx: candles.length - 1 }], equity, cost);
}

function runRandomEntry(candles: Candle[], cost: CostConfig): Metrics {
  // Random entry at 30% of bars, exit after 12 bars
  const closes = candles.map(c => c.close);
  const trades: TradeResult[] = [];
  const equity: number[] = [];
  let cash = INITIAL_CAPITAL;
  let cumCost = 0;
  let inPosition = false, entryPrice = 0, entryIdx = 0, holdings = 0;

  for (let i = 50; i < candles.length; i++) {
    if (!inPosition && Math.random() < 0.3) {
      inPosition = true;
      entryPrice = closes[i];
      entryIdx = i;
      holdings = cash / entryPrice;
      cash = 0;
      const c = applyCosts(0, entryPrice, cost);
      cumCost += c.fees + c.slippage + c.marketImpact;
    } else if (inPosition && (i - entryIdx >= 12)) {
      const exitPrice = closes[i];
      const grossPnl = (exitPrice - entryPrice) * holdings;
      const c = applyCosts(grossPnl, exitPrice * holdings, cost);
      cash = holdings * exitPrice - c.fees - c.slippage - c.marketImpact;
      trades.push({ grossPnl, entryPrice, exitPrice, entryIdx, exitIdx: i });
      holdings = 0;
      inPosition = false;
    }
    equity.push(inPosition ? closes[i] * holdings - cumCost : cash - cumCost);
  }
  return computeMetrics(trades, equity, cost);
}

function emptyMetrics(): Metrics {
  return { netPnl: 0, winRate: 0, numTrades: 0, profitFactor: 0, sharpe: 0, maxDrawdown: 0, bootstrapPValue: 1, trades: [], equityCurve: [] };
}

// ── Report Generation ────────────────────────────────────────────────────────

function buildReport(results: Array<{ pair: string; strategy: number; metrics: Metrics }>, stressMode: StressMode): string {
  const costCfg = resolveStressConfig(stressMode);
  const lines: string[] = [];
  lines.push('# Range Mean-Reversion Test Results');
  lines.push('');
  lines.push(`**Date:** ${new Date().toISOString().split('T')[0]}`);
  lines.push(`**Stress Mode:** ${stressMode}`);
  lines.push(`**Cost Model:** fee=${costCfg.feePct}, slip=${costCfg.slipPct}, impact=${costCfg.marketImpactPct}`);
  lines.push(`**Data:** Cached 1h candles (BTC, ETH, SOL)`);
  lines.push(`**Bootstrap:** ${BOOTSTRAP_RESAMPLES} resamples per strategy/pair`);
  lines.push('');
  lines.push('## Results');
  lines.push('');
  lines.push('| Pair | Strategy | Net PnL | Win Rate | Trades | PF | Sharpe | Max DD | p-value | Significant |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const r of results) {
    const name = ['', 'RSI RANGE', 'BB Bounce', 'Z-Score', 'RSI+RANGE+Vol'][r.strategy] ?? 'Unknown';
    const sig = r.metrics.bootstrapPValue < 0.05 ? 'YES' : 'NO';
    const pfStr = r.metrics.profitFactor === Infinity ? '∞' : r.metrics.profitFactor.toFixed(2);
    lines.push(`| ${r.pair} | ${name} | $${r.metrics.netPnl.toFixed(2)} | ${(r.metrics.winRate * 100).toFixed(1)}% | ${r.metrics.numTrades} | ${pfStr} | ${r.metrics.sharpe.toFixed(2)} | ${r.metrics.maxDrawdown.toFixed(1)}% | ${r.metrics.bootstrapPValue.toFixed(3)} | ${sig} |`);
  }

  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  const sigResults = results.filter(r => r.metrics.bootstrapPValue < 0.05 && r.metrics.numTrades >= 5);
  if (sigResults.length === 0) {
    lines.push('**NO SIGNIFICANT EDGE FOUND.** Mean-reversion strategies in RANGE regime do not produce statistically significant results on cached 1h data.');
    lines.push('');
    lines.push('Possible reasons:');
    lines.push('- Insufficient RANGE regime occurrences (crypto 1h data rarely spends significant time in strict RANGE)');
    lines.push('- Transaction costs dominate the small mean-reversion edge');
    lines.push('- RANGE regime detection too narrow for mean-reversion to fire');
  } else {
    lines.push('**PARTIAL EDGE FOUND.** The following variants show statistical significance:');
    for (const r of sigResults) {
      const name = ['', 'RSI RANGE', 'BB Bounce', 'Z-Score', 'RSI+RANGE+Vol'][r.strategy] ?? 'Unknown';
      lines.push(`- **${r.pair} ${name}**: p=${r.metrics.bootstrapPValue.toFixed(3)}, net PnL=$${r.metrics.netPnl.toFixed(2)}, ${r.metrics.numTrades} trades`);
    }
  }
  lines.push('');
  lines.push('---');
  lines.push(`*Generated by range-mean-reversion-test.ts — ${new Date().toISOString()}*`);
  return lines.join('\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const costCfg = resolveStressConfig(STRESS_MODE);
  console.log(`=== Range Mean-Reversion Strategy Test ===`);
  console.log(`Stress mode: ${STRESS_MODE} | Cost: fee=${costCfg.feePct}, slip=${costCfg.slipPct}, impact=${costCfg.marketImpactPct}`);
  console.log('');

  const results: Array<{ pair: string; strategy: number; metrics: Metrics }> = [];

  for (const pair of PAIRS) {
    const data = loadCandles(pair.cacheKey);
    if (!data || data.candles.length < 50) {
      console.log(`[SKIP] ${pair.symbol}: insufficient cache (${data?.candles.length ?? 0} candles)`);
      continue;
    }
    console.log(`${pair.symbol}: ${data.candles.length} candles`);

    const candles = data.candles;
    const strategies = [
      { fn: strategyA_RSI_RANGE, id: 1 },
      { fn: strategyB_BB_Bounce, id: 2 },
      { fn: strategyC_ZScore, id: 3 },
      { fn: strategyD_RSI_RANGE_Vol, id: 4 },
    ];

    for (const s of strategies) {
      const metrics = s.fn(candles, costCfg);
      results.push({ pair: pair.symbol, strategy: s.id, metrics });
      const sig = metrics.bootstrapPValue < 0.05 ? ' ***' : '';
      console.log(`  ${s.id}. Net $${metrics.netPnl.toFixed(2)} | WR: ${(metrics.winRate * 100).toFixed(1)}% | ${metrics.numTrades} trades | p: ${metrics.bootstrapPValue.toFixed(3)}${sig}`);
    }
    console.log('');
  }

  // Write report
  const reportsDir = resolve(process.cwd(), 'plans', 'reports');
  mkdirSync(reportsDir, { recursive: true });
  const reportPath = resolve(reportsDir, 'range-mean-reversion-results.md');
  writeFileSync(reportPath, buildReport(results, STRESS_MODE), 'utf-8');
  console.log(`\nResults written to: ${reportPath}`);
}

main().catch(err => {
  console.error('Range mean-reversion test failed:', err);
  process.exit(1);
});