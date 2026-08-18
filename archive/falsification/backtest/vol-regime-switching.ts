#!/usr/bin/env npx tsx
// Volatility Regime Switching Backtest — SOLUSDT
//
// Hypothesis #12: Strategy performance depends on regime.
// Trend-following works in HIGH_VOL/TREND regimes.
// Mean-reversion works in LOW_VOL/RANGE regimes.
// A regime-aware strategy that switches between these should outperform
// either standalone strategy.
//
// Uses the existing rule-based regime classifier from src/tree/regime/classifier.ts.
// Tests SOLUSDT 8h candles with BTC regime context (BTC leads).
//
// Usage:
//   npx tsx src/forest/backtest/vol-regime-switching.ts SOLUSDT conservative 730
//
// Defaults: SOLUSDT, conservative, 730 days

import { resolveStressConfig, applyCosts, type CostConfig, type StressMode } from './cost-model';
import { fetchOHLCV } from './data-fetcher';

// ── Inline regime feature computation (causal, no future data) ───────────────

interface Candle { timestamp: number; open: number; high: number; low: number; close: number; volume: number }

type RegimeType = 'TREND' | 'HIGH_VOL' | 'LOW_VOL' | 'RANGE' | 'SHOCK' | 'UNKNOWN';

function sma(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    result.push(sum / period);
  }
  return result;
}

function computeRegime(candles: Candle[], lookback: number): RegimeType[] {
  const regimes: RegimeType[] = [];
  const closes = candles.map(c => c.close);
  const logRets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) logRets.push(Math.log(closes[i] / closes[i - 1]));
    else logRets.push(0);
  }

  // Rolling realized vol (annualized from 8h bars)
  const rollingVol: (number | null)[] = [];
  for (let i = 0; i < logRets.length; i++) {
    if (i < lookback - 1) { rollingVol.push(null); continue; }
    const window = logRets.slice(i - lookback + 1, i + 1);
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const variance = window.reduce((s, r) => s + (r - mean) ** 2, 0) / (window.length - 1);
    rollingVol.push(Math.sqrt(variance * 1095)); // annualize (3 × 365)
  }

  // ATR-like: rolling mean |return|
  const rollingAtr: (number | null)[] = [];
  for (let i = 0; i < logRets.length; i++) {
    if (i < lookback - 1) { rollingAtr.push(null); continue; }
    const window = logRets.slice(i - lookback + 1, i + 1);
    rollingAtr.push(window.reduce((s, r) => s + Math.abs(r), 0) / window.length);
  }

  // Trend strength: SMA slope (normalized)
  const sma20 = sma(closes, 20);
  const trendStrength: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < 20 || sma20[i] === null || sma20[i - 5] === null) { trendStrength.push(null); continue; }
    const slope = ((sma20[i]! - sma20[i - 5]!) / sma20[i - 5]!) * 100;
    trendStrength.push(slope);
  }

  // Percentiles from valid values
  const validVol = rollingVol.filter((v): v is number => v !== null);
  const validAtr = rollingAtr.filter((v): v is number => v !== null);
  if (validVol.length < 10 || validAtr.length < 10) return candles.map(() => 'UNKNOWN');

  validVol.sort((a, b) => a - b);
  validAtr.sort((a, b) => a - b);
  const p25Vol = validVol[Math.floor(validVol.length * 0.25)];
  const p75Vol = validVol[Math.floor(validVol.length * 0.75)];
  const p25Atr = validAtr[Math.floor(validAtr.length * 0.25)];
  const p75Atr = validAtr[Math.floor(validAtr.length * 0.75)];
  const p90Vol = validVol[Math.floor(validVol.length * 0.90)];

  // Align: regime[i] uses data up to candle i (causal)
  // logRets has length candles.length - 1, regimes should have length candles.length
  regimes.push('UNKNOWN'); // first candle has no regime
  for (let i = 1; i < candles.length; i++) {
    const vol = rollingVol[i - 1];
    const atr = rollingAtr[i - 1];
    const trend = trendStrength[i];
    if (vol === null || atr === null || trend === null) { regimes.push('UNKNOWN'); continue; }

    // SHOCK: extreme vol + extreme trend
    if (vol > p90Vol && Math.abs(trend) > 3) {
      regimes.push('SHOCK');
    } else if (vol > p75Vol && atr > p75Atr) {
      regimes.push('HIGH_VOL');
    } else if (trend > 1.5) {
      regimes.push('TREND');
    } else if (trend < -1.5) {
      regimes.push('TREND');
    } else if (vol < p25Vol && atr < p25Atr) {
      regimes.push('LOW_VOL');
    } else {
      regimes.push('RANGE');
    }
  }

  return regimes;
}

// ── Backtest Engine ──────────────────────────────────────────────────────────

interface Trade {
  entryTs: number; exitTs: number;
  side: 'long' | 'short';
  entryPrice: number; exitPrice: number;
  regime: RegimeType;
  pnlUsd: number;
  holdingBars: number;
  exitReason: string;
}

interface Metrics {
  trades: number; netPnl: number; winRate: number;
  expectancy: number; sharpe: number;
  ci95Lo: number; ci95Hi: number;
  profitFactor: number; maxDrawdown: number;
}

type Strategy = 'trend' | 'meanrev' | 'regime_switch';

function runBacktest(
  candles: Candle[],
  regimes: RegimeType[],
  strategy: Strategy,
  config: { smaFast: number; smaSlow: number; bbPeriod: number; bbMult: number; maxHoldBars: number },
  costConfig: CostConfig,
  capitalUsd: number,
): Trade[] {
  const closes = candles.map(c => c.close);
  const smaFast = sma(closes, config.smaFast);
  const smaSlow = sma(closes, config.smaSlow);

  // Bollinger Bands for mean-reversion
  const bbUpper: (number | null)[] = [];
  const bbLower: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < config.bbPeriod - 1) { bbUpper.push(null); bbLower.push(null); continue; }
    const window = closes.slice(i - config.bbPeriod + 1, i + 1);
    const mean = window.reduce((a, b) => a + b, 0) / config.bbPeriod;
    const std = Math.sqrt(window.reduce((s, v) => s + (v - mean) ** 2, 0) / config.bbPeriod);
    bbUpper.push(mean + config.bbMult * std);
    bbLower.push(mean - config.bbMult * std);
  }

  const trades: Trade[] = [];
  let inPosition = false;
  let entrySide: 'long' | 'short' = 'long';
  let entryPrice = 0;
  let entryTs = 0;
  let entryBarIdx = 0;
  let entryRegime: RegimeType = 'UNKNOWN';

  const startBar = Math.max(config.smaSlow, config.bbPeriod, 20) + 1;

  for (let i = startBar; i < candles.length; i++) {
    const c = candles[i];
    const regime = regimes[i];
    const fast = smaFast[i];
    const slow = smaSlow[i];
    const upper = bbUpper[i];
    const lower = bbLower[i];
    if (fast === null || slow === null || upper === null || lower === null) continue;

    if (inPosition) {
      const barsHeld = i - entryBarIdx;
      if (barsHeld >= config.maxHoldBars) {
        const sideMult = entrySide === 'long' ? 1 : -1;
        const rawPnl = sideMult * (c.close - entryPrice) * (capitalUsd / entryPrice);
        const costed = applyCosts(rawPnl, capitalUsd, costConfig);
        trades.push({
          entryTs, exitTs: c.timestamp, side: entrySide,
          entryPrice, exitPrice: c.close, regime: entryRegime,
          pnlUsd: costed.netPnl, holdingBars: barsHeld, exitReason: 'maxhold',
        });
        inPosition = false;
      }
    } else {
      let signal: 'long' | 'short' | null = null;

      if (strategy === 'trend') {
        // SMA crossover
        if (fast > slow && smaFast[i - 1]! <= smaSlow[i - 1]!) signal = 'long';
        else if (fast < slow && smaFast[i - 1]! >= smaSlow[i - 1]!) signal = 'short';
      } else if (strategy === 'meanrev') {
        // Bollinger bounce
        if (c.close < lower!) signal = 'long';
        else if (c.close > upper!) signal = 'short';
      } else if (strategy === 'regime_switch') {
        // Regime-aware: trend in HIGH_VOL/TREND, mean-rev in LOW_VOL/RANGE
        const isTrendRegime = regime === 'HIGH_VOL' || regime === 'TREND';
        const isMeanRevRegime = regime === 'LOW_VOL' || regime === 'RANGE';

        if (isTrendRegime) {
          if (fast > slow && smaFast[i - 1]! <= smaSlow[i - 1]!) signal = 'long';
          else if (fast < slow && smaFast[i - 1]! >= smaSlow[i - 1]!) signal = 'short';
        } else if (isMeanRevRegime) {
          if (c.close < lower!) signal = 'long';
          else if (c.close > upper!) signal = 'short';
        }
        // SHOCK/UNKNOWN → no trade
      }

      if (signal !== null) {
        inPosition = true;
        entrySide = signal;
        entryPrice = c.close;
        entryTs = c.timestamp;
        entryBarIdx = i;
        entryRegime = regime;
      }
    }
  }

  // Close open position
  if (inPosition) {
    const last = candles[candles.length - 1];
    const sideMult = entrySide === 'long' ? 1 : -1;
    const rawPnl = sideMult * (last.close - entryPrice) * (capitalUsd / entryPrice);
    const costed = applyCosts(rawPnl, capitalUsd, costConfig);
    trades.push({
      entryTs, exitTs: last.timestamp, side: entrySide,
      entryPrice, exitPrice: last.close, regime: entryRegime,
      pnlUsd: costed.netPnl, holdingBars: candles.length - 1 - entryBarIdx, exitReason: 'data-end',
    });
  }

  return trades;
}

// ── Metrics ──────────────────────────────────────────────────────────────────

function computeMetrics(trades: Trade[]): Metrics {
  const pnls = trades.map(t => t.pnlUsd);
  if (pnls.length === 0) return { trades: 0, netPnl: 0, winRate: 0, expectancy: 0, sharpe: 0, ci95Lo: 0, ci95Hi: 0, profitFactor: 0, maxDrawdown: 0 };

  const netPnl = pnls.reduce((a, b) => a + b, 0);
  const wins = pnls.filter(p => p > 0);
  const losses = pnls.filter(p => p <= 0);
  const winRate = wins.length / pnls.length;
  const expectancy = netPnl / pnls.length;
  const mean = expectancy;
  const variance = pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / pnls.length;
  const std = Math.sqrt(variance);
  const avgHolding = trades.reduce((s, t) => s + t.holdingBars, 0) / trades.length;
  const annualizationFactor = avgHolding > 0 ? Math.sqrt(1095 / avgHolding) : 1;
  const sharpe = std > 0 ? (mean / std) * annualizationFactor : 0;

  const { lo, hi } = bootstrapCI(pnls, 1000);
  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  let peak = 0, dd = 0, equity = 0;
  for (const p of pnls) {
    equity += p;
    if (equity > peak) peak = equity;
    const currentDd = peak > 0 ? (peak - equity) / peak : 0;
    if (currentDd > dd) dd = currentDd;
  }

  return { trades: pnls.length, netPnl, winRate, expectancy, sharpe, ci95Lo: lo, ci95Hi: hi, profitFactor, maxDrawdown: dd };
}

function bootstrapCI(values: number[], resamples: number): { lo: number; hi: number } {
  if (values.length < 3) return { lo: 0, hi: 0 };
  const means: number[] = [];
  const n = values.length;
  for (let i = 0; i < resamples; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += values[Math.floor(Math.random() * n)];
    means.push(sum / n);
  }
  means.sort((a, b) => a - b);
  return { lo: means[Math.floor(resamples * 0.025)], hi: means[Math.floor(resamples * 0.975)] };
}

function fmtCI(lo: number, hi: number): string {
  return `$${lo.toFixed(0)}, $${hi.toFixed(0)}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const symbol = process.argv[2] || 'SOLUSDT';
  const stressMode = (process.argv[3] || 'conservative') as StressMode;
  const days = parseInt(process.argv[4] || '730', 10);

  console.log(`\n🔄 Volatility Regime Switching Backtest`);
  console.log(`Symbol: ${symbol} | Mode: ${stressMode} | Window: ${days} days`);

  const costConfig = resolveStressConfig(stressMode);
  const capitalUsd = 10_000;
  const endMs = new Date('2025-09-19').getTime() + 86_400_000 - 1;
  const startMs = endMs - days * 86_400_000;

  // Fetch BTC for regime context + SOL for trading
  console.log('Fetching BTCUSDT 8h candles (regime context)...');
  const btcCandles = await fetchOHLCV('binance', 'BTCUSDT', '8h', startMs, endMs);
  console.log(`  Got ${btcCandles.length} BTC candles`);

  console.log(`Fetching ${symbol} 8h candles...`);
  const solCandles = await fetchOHLCV('binance', symbol, '8h', startMs, endMs);
  console.log(`  Got ${solCandles.length} ${symbol} candles`);

  // Compute regimes from BTC
  const lookback = 24; // 24 bars = 8 days
  console.log(`Computing regimes (lookback=${lookback})...`);
  const regimes = computeRegime(btcCandles, lookback);

  // Count regime distribution
  const regimeCounts: Record<string, number> = {};
  for (const r of regimes) regimeCounts[r] = (regimeCounts[r] || 0) + 1;
  console.log('  Regime distribution:', regimeCounts);

  // Align SOL candles with BTC regime timestamps
  // BTC and SOL have same timestamp grid (both 8h), so regimes[i] corresponds to solCandles[i]
  const solRegimes = regimes.slice(0, solCandles.length);

  // Config sweep
  const configs = [
    { smaFast: 5, smaSlow: 20, bbPeriod: 20, bbMult: 2.0, maxHoldBars: 6 },
    { smaFast: 5, smaSlow: 20, bbPeriod: 20, bbMult: 2.0, maxHoldBars: 12 },
    { smaFast: 10, smaSlow: 30, bbPeriod: 20, bbMult: 2.0, maxHoldBars: 6 },
    { smaFast: 10, smaSlow: 30, bbPeriod: 20, bbMult: 2.0, maxHoldBars: 12 },
    { smaFast: 5, smaSlow: 20, bbPeriod: 20, bbMult: 1.5, maxHoldBars: 6 },
    { smaFast: 10, smaSlow: 30, bbPeriod: 20, bbMult: 1.5, maxHoldBars: 12 },
  ];
  const strategies: Strategy[] = ['trend', 'meanrev', 'regime_switch'];

  // Split for OOS
  const splitTs = startMs + (endMs - startMs) * 0.65;
  const trainSol = solCandles.filter(c => c.timestamp <= splitTs);
  const trainRegimes = solRegimes.slice(0, trainSol.length);
  const testSol = solCandles.filter(c => c.timestamp > splitTs);
  const testRegimes = solRegimes.slice(trainSol.length);

  console.log(`Train: ${trainSol.length} candles | Test: ${testSol.length} candles`);

  console.log('\n--- Results ---\n');

  const md: string[] = [];
  md.push(`# Volatility Regime Switching — ${symbol}`);
  md.push('');
  md.push('**Hypothesis #12:** A regime-aware strategy (trend-follow in HIGH_VOL/TREND, mean-rev in LOW_VOL/RANGE)');
  md.push('outperforms either standalone strategy.');
  md.push('');
  md.push(`| Parameter | Value |`);
  md.push(`|-----------|-------|`);
  md.push(`| Symbol | ${symbol} |`);
  md.push(`| Candles | ${solCandles.length} (8h) |`);
  md.push(`| Regime lookback | ${lookback} bars (${lookback * 8}h) |`);
  md.push(`| Regime source | BTCUSDT (market leader) |`);
  md.push(`| Cost model | ${stressMode} (17bps) |`);
  md.push(`| OOS split | 65/35 |`);
  md.push('---');
  md.push('');

  md.push('## Regime Distribution');
  md.push('');
  md.push('| Regime | Count | % |');
  md.push('|--------|-------|---|');
  const totalRegimes = regimes.length;
  for (const [r, count] of Object.entries(regimeCounts).sort((a, b) => b[1] - a[1])) {
    md.push(`| ${r} | ${count} | ${(count / totalRegimes * 100).toFixed(1)}% |`);
  }
  md.push('');

  md.push('## Full Period Results');
  md.push('');
  md.push('| Strategy | SMA | BB | MaxHold | Trades | PnL | Win% | Exp | Sharpe | 95% CI | PF | MaxDD |');
  md.push('|----------|-----|-----|---------|--------|-----|------|-----|--------|--------|----|-------|');

  for (const cfg of configs) {
    for (const strat of strategies) {
      const trades = runBacktest(solCandles, solRegimes, strat, cfg, costConfig, capitalUsd);
      const m = computeMetrics(trades);
      const label = strat === 'regime_switch' ? '🔄 REGIME' : strat === 'trend' ? '📈 TREND' : '📉 MEANREV';
      md.push(`| ${label} | ${cfg.smaFast}/${cfg.smaSlow} | ${cfg.bbMult}×${cfg.bbPeriod} | ${cfg.maxHoldBars} | ${m.trades} | $${m.netPnl.toFixed(0)} | ${(m.winRate * 100).toFixed(1)}% | $${m.expectancy.toFixed(2)} | ${m.sharpe.toFixed(2)} | [${fmtCI(m.ci95Lo, m.ci95Hi)}] | ${m.profitFactor === Infinity ? 'Inf' : m.profitFactor.toFixed(2)} | ${(m.maxDrawdown * 100).toFixed(1)}% |`);
      console.log(`${label.padEnd(10)} SMA=${cfg.smaFast}/${cfg.smaSlow} H${cfg.maxHoldBars}: trades=${m.trades} PnL=$${m.netPnl.toFixed(0)} Sharpe=${m.sharpe.toFixed(2)}`);
    }
  }
  md.push('');

  md.push('## Out-of-Sample Comparison');
  md.push('');
  md.push('| Strategy | Config | Train# | Train PnL | Train Sharpe | Test# | Test PnL | Test Sharpe | CI 5% | CI 95% | OOS |');
  md.push('|----------|--------|--------|-----------|--------------|-------|----------|-------------|-------|--------|-----|');

  let regimePass = 0;
  let trendPass = 0;
  let mrPass = 0;

  for (const cfg of configs) {
    for (const strat of strategies) {
      const trainTrades = runBacktest(trainSol, trainRegimes, strat, cfg, costConfig, capitalUsd);
      const testTrades = runBacktest(testSol, testRegimes, strat, cfg, costConfig, capitalUsd);
      const tr = computeMetrics(trainTrades);
      const te = computeMetrics(testTrades);
      const pass = te.trades >= 5 && te.sharpe > 0 && te.ci95Lo > 0;
      if (pass) {
        if (strat === 'regime_switch') regimePass++;
        else if (strat === 'trend') trendPass++;
        else mrPass++;
      }
      const label = strat === 'regime_switch' ? '🔄 REGIME' : strat === 'trend' ? '📈 TREND' : '📉 MEANREV';
      const cfgLabel = `${cfg.smaFast}/${cfg.smaSlow} H${cfg.maxHoldBars}`;
      md.push(`| ${label} | ${cfgLabel} | ${tr.trades} | $${tr.netPnl.toFixed(0)} | ${tr.sharpe.toFixed(2)} | ${te.trades} | $${te.netPnl.toFixed(0)} | ${te.sharpe.toFixed(2)} | $${te.ci95Lo.toFixed(0)} | $${te.ci95Hi.toFixed(0)} | ${pass ? '✅ PASS' : '❌ FAIL'} |`);
    }
  }
  md.push('');

  md.push('## Verdict');
  md.push('');
  md.push(`- Trend-follow OOS pass: **${trendPass}/${configs.length}**`);
  md.push(`- Mean-reversion OOS pass: **${mrPass}/${configs.length}**`);
  md.push(`- Regime-switching OOS pass: **${regimePass}/${configs.length}**`);
  md.push('');
  if (regimePass === 0 && trendPass === 0 && mrPass === 0) {
    md.push('**No strategy passes OOS. Neither standalone nor regime-aware approach produces alpha.**');
  } else if (regimePass > trendPass && regimePass > mrPass) {
    md.push('**Regime switching outperforms both standalone strategies** — regime-awareness adds value.');
  } else {
    md.push('**Regime switching does NOT outperform standalone strategies** — regime-awareness adds no value at this parameter scale.');
  }
  md.push('');
  md.push('---');
  md.push('*Research backtest — not a production recommendation.*');

  const fs = require('fs');
  fs.writeFileSync('plans/reports/vol-regime-switching.md', md.join('\n'));
  console.log('\n📄 Report written to plans/reports/vol-regime-switching.md');
}

main().catch(console.error);
