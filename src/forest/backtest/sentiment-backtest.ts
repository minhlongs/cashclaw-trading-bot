#!/usr/bin/env npx tsx
// Fear & Greed Index Contrarian Backtest — SOL
//
// Hypothesis: Contrarian positioning on Fear & Greed Index extremes produces alpha.
// When F&G < low_threshold (extreme fear) → LONG (buy the fear).
// When F&G > high_threshold (extreme greed) → SHORT (sell the greed).
// Exit after maxHold days or when F&G returns to neutral (40-60).
//
// Data: https://api.alternative.me/fng/ (daily 0-100 scale)
//
// Usage:
//   npx tsx src/forest/backtest/sentiment-backtest.ts SOLUSDT conservative 730
//
// Defaults: SOLUSDT, conservative, 730 days

import { resolveStressConfig, applyCosts, type CostConfig, type StressMode } from './cost-model';

// ── Types ────────────────────────────────────────────────────────────────────

interface FngPoint {
  timestamp: number; // ms
  value: number;     // 0-100
  classification: string;
}

interface Trade {
  entryTimestamp: number;
  exitTimestamp: number;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  fngEntry: number;
  fngExit: number;
  pnlUsd: number;
  holdingDays: number;
  exitReason: string;
}

interface Metrics {
  trades: number;
  netPnl: number;
  winRate: number;
  expectancy: number;
  sharpe: number;
  ci95Lo: number;
  ci95Hi: number;
  profitFactor: number;
  maxDrawdown: number;
}

interface Config {
  lowThreshold: number;
  highThreshold: number;
  maxHoldDays: number;
}

// ── Data Fetching ────────────────────────────────────────────────────────────

async function fetchFngHistory(days: number): Promise<FngPoint[]> {
  const all: FngPoint[] = [];
  // API returns max 365 per request; page backwards using limit
  let page = 1;
  const perPage = 365;
  const cutoffMs = Date.now() - days * 86_400_000;

  while (true) {
    const url = `https://api.alternative.me/fng/?limit=${perPage}&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FNG API ${res.status}`);
    const body = await res.json() as { data: Array<{ value: string; value_classification: string; timestamp: string }> };
    if (body.data.length === 0) break;

    for (const d of body.data) {
      const ts = Number(d.timestamp) * 1000;
      if (ts < cutoffMs) break;
      all.push({
        timestamp: ts,
        value: parseInt(d.value, 10),
        classification: d.value_classification,
      });
    }
    // Check if oldest entry in this page is before cutoff
    const oldestTs = Number(body.data[body.data.length - 1].timestamp) * 1000;
    if (oldestTs < cutoffMs || body.data.length < perPage) break;
    page++;
  }

  all.sort((a, b) => a.timestamp - b.timestamp);
  return all;
}

// Fetch BTC/SOL OHLCV from Binance (1d candles)
async function fetchDailyOhlcv(symbol: string, startMs: number, endMs: number): Promise<Array<{
  timestamp: number; open: number; high: number; low: number; close: number; volume: number;
}>> {
  const all: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> = [];
  const seen = new Set<number>();
  let cursor = endMs;

  while (cursor > startMs) {
    const params = new URLSearchParams({
      symbol,
      interval: '1d',
      endTime: String(cursor),
      limit: '1000',
    });
    const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?${params}`);
    if (!res.ok) throw new Error(`OHLCV fetch ${res.status}`);
    const data = await res.json() as Array<Array<number>>;
    if (data.length === 0) break;

    for (const k of data) {
      const ts = k[0];
      if (!seen.has(ts) && ts >= startMs) {
        seen.add(ts);
        all.push({
          timestamp: ts,
          open: k[1], high: k[2], low: k[3], close: k[4], volume: k[5],
        });
      }
    }
    cursor = data[0][0] - 1;
    if (cursor <= startMs) break;
  }

  all.sort((a, b) => a.timestamp - b.timestamp);
  return all;
}

// ── Backtest Engine ──────────────────────────────────────────────────────────

function runBacktest(
  fng: FngPoint[],
  candles: Array<{ timestamp: number; close: number }>,
  config: Config,
  costConfig: CostConfig,
  capitalUsd: number,
): Trade[] {
  // Build FNG lookup (timestamp → value)
  const fngByDate = new Map<number, number>();
  for (const p of fng) {
    // Align to day boundary
    const dayKey = Math.floor(p.timestamp / 86_400_000);
    fngByDate.set(dayKey, p.value);
  }

  // Build price lookup (dayKey → close)
  const priceByDay = new Map<number, number>();
  for (const c of candles) {
    const dayKey = Math.floor(c.timestamp / 86_400_000);
    priceByDay.set(dayKey, c.close);
  }

  const trades: Trade[] = [];
  let inPosition = false;
  let entrySide: 'long' | 'short' = 'long';
  let entryPrice = 0;
  let entryFng = 0;
  let entryDayKey = 0;
  let entryTimestamp = 0;

  // Get sorted day keys
  const allDays = Array.from(fngByDate.keys()).sort((a, b) => a - b);

  for (const dayKey of allDays) {
    const fngVal = fngByDate.get(dayKey)!;
    const price = priceByDay.get(dayKey);
    if (price === undefined) continue;

    const timestamp = dayKey * 86_400_000;

    if (inPosition) {
      const holdingDays = (dayKey - entryDayKey);
      const exitNeutral = fngVal >= 40 && fngVal <= 60;
      const exitLong = entrySide === 'long' && fngVal >= config.highThreshold;
      const exitShort = entrySide === 'short' && fngVal <= config.lowThreshold;
      const exitTimeout = holdingDays >= config.maxHoldDays;

      if (exitNeutral || exitLong || exitShort || exitTimeout) {
        const exitReason = exitTimeout ? 'timeout' :
          (exitLong || exitShort) ? 'signal-reverse' : 'neutral';

        const sideMult = entrySide === 'long' ? 1 : -1;
        const rawPnl = sideMult * (price - entryPrice) * (capitalUsd / entryPrice);
        const costed = applyCosts(rawPnl, capitalUsd, costConfig);
        const pnlUsd = costed.netPnl;

        trades.push({
          entryTimestamp,
          exitTimestamp: timestamp,
          side: entrySide,
          entryPrice,
          exitPrice: price,
          fngEntry: entryFng,
          fngExit: fngVal,
          pnlUsd,
          holdingDays,
          exitReason,
        });
        inPosition = false;
      }
    } else {
      // Entry signals
      if (fngVal < config.lowThreshold) {
        // Extreme fear → LONG
        inPosition = true;
        entrySide = 'long';
        entryPrice = price;
        entryFng = fngVal;
        entryDayKey = dayKey;
        entryTimestamp = timestamp;
      } else if (fngVal > config.highThreshold) {
        // Extreme greed → SHORT
        inPosition = true;
        entrySide = 'short';
        entryPrice = price;
        entryFng = fngVal;
        entryDayKey = dayKey;
        entryTimestamp = timestamp;
      }
    }
  }

  // Close any open position at end of data
  if (inPosition && allDays.length > 0) {
    const lastDay = allDays[allDays.length - 1];
    const price = priceByDay.get(lastDay);
    if (price !== undefined) {
      const sideMult = entrySide === 'long' ? 1 : -1;
      const rawPnl = sideMult * (price - entryPrice) * (capitalUsd / entryPrice);
      const costed = applyCosts(rawPnl, capitalUsd, costConfig);
      trades.push({
        entryTimestamp,
        exitTimestamp: lastDay * 86_400_000,
        side: entrySide,
        entryPrice,
        exitPrice: price,
        fngEntry: entryFng,
        fngExit: fngByDate.get(lastDay) ?? 50,
        pnlUsd: costed.netPnl,
        holdingDays: lastDay - entryDayKey,
        exitReason: 'data-end',
      });
    }
  }

  return trades;
}

// ── Metrics ──────────────────────────────────────────────────────────────────

function computeMetrics(trades: Trade[]): Metrics {
  const pnls = trades.map(t => t.pnlUsd);
  if (pnls.length === 0) {
    return { trades: 0, netPnl: 0, winRate: 0, expectancy: 0, sharpe: 0, ci95Lo: 0, ci95Hi: 0, profitFactor: 0, maxDrawdown: 0 };
  }

  const netPnl = pnls.reduce((a, b) => a + b, 0);
  const wins = pnls.filter(p => p > 0);
  const losses = pnls.filter(p => p <= 0);
  const winRate = wins.length / pnls.length;
  const expectancy = netPnl / pnls.length;

  // Sharpe
  const mean = netPnl / pnls.length;
  const variance = pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / pnls.length;
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(252 / Math.max(...trades.map(t => t.holdingDays || 1))) : 0;

  // Bootstrap CI
  const { lo, hi } = bootstrapCI(pnls, 1000);

  // Profit factor
  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // Max drawdown
  let peak = 0;
  let dd = 0;
  let equity = 0;
  for (const p of pnls) {
    equity += p;
    if (equity > peak) peak = equity;
    const currentDd = (peak - equity) / Math.max(peak, 1);
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
    for (let j = 0; j < n; j++) {
      sum += values[Math.floor(Math.random() * n)];
    }
    means.push(sum / n);
  }
  means.sort((a, b) => a - b);
  return {
    lo: means[Math.floor(resamples * 0.025)],
    hi: means[Math.floor(resamples * 0.975)],
  };
}

// ── Report Generation ────────────────────────────────────────────────────────

function generateReport(
  symbol: string,
  stressMode: string,
  fng: FngPoint[],
  allResults: Array<{ config: Config; allMetrics: Metrics; oosMetrics: Metrics | null }>,
  md: string[],
) {
  md.push(`# Fear & Greed Contrarian Backtest — ${symbol}`);
  md.push('');
  md.push(`**Date:** ${new Date().toISOString().slice(0, 10)}`);
  md.push(`**Symbol:** ${symbol} | **Exchange:** Binance Futures`);
  md.push(`**FNG data points:** ${fng.length} days`);
  md.push(`**Cost Model:** ${stressMode}`);
  md.push('---');
  md.push('');

  // ── Full period results
  md.push('## Full Period Results');
  md.push('');
  md.push('| Low | High | MaxHold | Trades | Net PnL | Win Rate | Expectancy | Sharpe | 95% CI | PF | Max DD |');
  md.push('|-----|------|---------|--------|---------|----------|------------|--------|--------|----|--------|');

  const sorted = [...allResults].sort((a, b) => b.allMetrics.expectancy - a.allMetrics.expectancy);
  for (const r of sorted) {
    const m = r.allMetrics;
    md.push(`| ${r.config.lowThreshold} | ${r.config.highThreshold} | ${r.config.maxHoldDays}d | ${m.trades} | $${m.netPnl.toFixed(0)} | ${(m.winRate * 100).toFixed(1)}% | $${m.expectancy.toFixed(2)} | ${m.sharpe.toFixed(2)} | [${fmtCI(m.ci95Lo, m.ci95Hi)}] | ${m.profitFactor === Infinity ? 'Inf' : m.profitFactor.toFixed(2)} | ${(m.maxDrawdown * 100).toFixed(1)}% |`);
  }
  md.push('');

  // ── OOS results
  md.push('## Out-of-Sample Results (65/35 split, pinned end-date)');
  md.push('');
  md.push('| Low | High | MaxHold | Train# | Train PnL | Train Sharpe | Test# | Test PnL | Test Sharpe | CI 5% | CI 95% | OOS |');
  md.push('|-----|------|---------|--------|-----------|--------------|-------|----------|-------------|-------|--------|-----|');

  let passCount = 0;
  for (const r of sorted) {
    if (!r.oosMetrics) continue;
    const a = r.allMetrics;
    const o = r.oosMetrics;
    const pass = o.trades >= 5 && o.sharpe > 0 && o.ci95Lo > 0;
    if (pass) passCount++;
    md.push(`| ${r.config.lowThreshold} | ${r.config.highThreshold} | ${r.config.maxHoldDays}d | ${a.trades} | $${a.netPnl.toFixed(0)} | ${a.sharpe.toFixed(2)} | ${o.trades} | $${o.netPnl.toFixed(0)} | ${o.sharpe.toFixed(2)} | $${o.ci95Lo.toFixed(0)} | $${o.ci95Hi.toFixed(0)} | ${pass ? '✅ PASS' : '❌ FAIL'} |`);
  }
  md.push('');
  md.push(`**PASSED OOS: ${passCount}/${allResults.length}**`);
  md.push('');

  // ── Trade details for best config
  md.push('---');
  md.push('*Research backtest — not a production recommendation.*');
}

function fmtCI(lo: number, hi: number): string {
  return `$${lo.toFixed(0)}, $${hi.toFixed(0)}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const symbol = process.argv[2] || 'SOLUSDT';
  const stressMode = (process.argv[3] || 'conservative') as StressMode;
  const days = parseInt(process.argv[4] || '730', 10);

  console.log(`\n🧠 Fear & Greed Contrarian Backtest`);
  console.log(`Symbol: ${symbol} | Mode: ${stressMode} | Window: ${days} days`);

  const costConfig = resolveStressConfig(stressMode);
  const capitalUsd = 10_000;

  // Pin end-date to match other backtests
  const endDateMs = new Date('2025-09-19').getTime() + 86_400_000 - 1;
  const startDateMs = endDateMs - days * 86_400_000;

  // Fetch data
  console.log('Fetching Fear & Greed Index data...');
  const fngRaw = await fetchFngHistory(days + 30); // extra buffer
  console.log(`  Got ${fngRaw.length} FNG points`);

  console.log(`Fetching ${symbol} daily OHLCV...`);
  const candles = await fetchDailyOhlcv(symbol, startDateMs, endDateMs);
  console.log(`  Got ${candles.length} candles`);

  // Filter FNG to our date range
  const fng = fngRaw.filter(p => p.timestamp >= startDateMs && p.timestamp <= endDateMs);
  console.log(`  FNG in range: ${fng.length} days`);

  // Configs to sweep
  const configs: Config[] = [];
  for (const low of [15, 20, 25]) {
    for (const high of [75, 80, 85]) {
      for (const hold of [3, 7, 14]) {
        configs.push({ lowThreshold: low, highThreshold: high, maxHoldDays: hold });
      }
    }
  }

  console.log(`\nSweeping ${configs.length} configurations...`);

  // Split data for OOS
  const splitIdx = Math.floor(fng.length * 0.65);
  const trainFng = fng.slice(0, splitIdx);
  const testFng = fng.slice(splitIdx);
  const trainCandles = candles.filter(c => c.timestamp <= (trainFng[trainFng.length - 1]?.timestamp ?? Infinity));
  const testCandles = candles.filter(c => c.timestamp >= (testFng[0]?.timestamp ?? 0));

  console.log(`Train: ${trainFng.length} days | Test: ${testFng.length} days`);

  const results: Array<{
    config: Config;
    allMetrics: Metrics;
    oosMetrics: Metrics | null;
  }> = [];

  for (const cfg of configs) {
    const allTrades = runBacktest(fng, candles, cfg, costConfig, capitalUsd);
    const allMetrics = computeMetrics(allTrades);

    // OOS
    const trainTrades = runBacktest(trainFng, trainCandles, cfg, costConfig, capitalUsd);
    const testTrades = runBacktest(testFng, testCandles, cfg, costConfig, capitalUsd);
    const trainMetrics = computeMetrics(trainTrades);
    const testMetrics = computeMetrics(testTrades);

    // Pass criteria: ≥5 OOS trades, positive Sharpe, CI lower > 0
    const oosPass = testMetrics.trades >= 5 && testMetrics.sharpe > 0 && testMetrics.ci95Lo > 0;

    results.push({
      config: cfg,
      allMetrics,
      oosMetrics: testMetrics,
    });

    const status = oosPass ? '✅' : testMetrics.trades < 5 ? '⚠️' : '❌';
    console.log(`  ${status} L${cfg.lowThreshold}/H${cfg.highThreshold}/H${cfg.maxHoldDays}d: trades=${allMetrics.trades} PnL=$${allMetrics.netPnl.toFixed(0)} Sharpe=${allMetrics.sharpe.toFixed(2)} | OOS: trades=${testMetrics.trades} Sharpe=${testMetrics.sharpe.toFixed(2)}`);
  }

  // Generate report
  const md: string[] = [];
  generateReport(symbol, stressMode, fng, results, md);

  const reportPath = 'plans/reports/sentiment-backtest.md';
  const fs = await import('fs');
  fs.writeFileSync(reportPath, md.join('\n'));
  console.log(`\n📄 Report written to ${reportPath}`);

  // Summary
  const passCount = results.filter(r => r.oosMetrics && r.oosMetrics.trades >= 5 && r.oosMetrics.sharpe > 0 && r.oosMetrics.ci95Lo > 0).length;
  console.log(`\n📊 OOS PASS: ${passCount}/${results.length}`);
  if (passCount === 0) {
    console.log('❌ Fear & Greed contrarian strategy FALSIFIED — no config passes OOS');
  }
}

main().catch(console.error);
