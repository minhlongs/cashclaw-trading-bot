#!/usr/bin/env npx tsx
// Session-Aware Mean Reversion — SOL 8h candles
//
// Hypothesis: Mean reversion is stronger during low-liquidity sessions
// (weekend, Asian overnight) and weaker during US hours.
//
// Method:
//   - RSI(14) signal; LONG when RSI < oversold AND session matches
//   - SHORT when RSI > overbought AND session matches
//   - Exit: maxHold bars OR RSI reverts to 50
//
// Sweep: 48 configs (rsiPeriod x oversold x overbought x maxHold x sessionFilter)
// OOS: 65% train / 35% test, 1000 bootstrap resamples
//
// Usage: npx tsx src/forest/backtest/session-aware-meanreversion.ts

import { fetchOHLCV } from '@/forest/backtest/data-fetcher';
import { applyCosts, resolveStressConfig, type CostConfig } from '@/forest/backtest/cost-model';
import type { Candle } from '@/forest/backtest/ohlcv';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

// ── Constants ─────────────────────────────────────────────────────────────────
const SYMBOL = 'SOLUSDT';
const INTERVAL = '8h';
const END_DATE = '2025-09-19T00:00:00Z';
const DAYS_BACK = 730;
const EXCHANGE = 'binance';
const OOS_SPLIT = 0.65;
const BOOTSTRAP_RESAMPLES = 1000;
const INITIAL_CAPITAL = 10_000;
const CONTRACT_SIZE = 1.0;

interface Config {
  rsiPeriod: number;
  oversold: number;
  overbought: number;
  maxHold: number;
  sessionFilter: 'weekend' | 'asian' | 'us';
}

interface TradeResult {
  entryIdx: number;
  exitIdx: number;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  netPnl: number;
  fees: number;
}

interface ConfigResult {
  config: Config;
  totalTrades: number;
  winCount: number;
  totalPnl: number;
  sharpe: number | null;
  maxDrawdown: number;
  winRate: number;
  avgPnl: number;
  trades: TradeResult[];
}

// ── Session detection ─────────────────────────────────────────────────────────

function isWeekend(ts: number): boolean {
  const day = new Date(ts).getUTCDay();
  return day === 0 || day === 6;
}

function isAsianSession(ts: number): boolean {
  const date = new Date(ts);
  const hour = date.getUTCHours();
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  return hour === 0;
}

function isUSSession(ts: number): boolean {
  const date = new Date(ts);
  const hour = date.getUTCHours();
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  return hour === 16;
}

function matchesSession(ts: number, session: string): boolean {
  if (session === 'weekend') return isWeekend(ts);
  if (session === 'asian') return isAsianSession(ts);
  if (session === 'us') return isUSSession(ts);
  return false;
}

function sessionLabel(ts: number): string {
  if (isWeekend(ts)) return 'weekend';
  if (isAsianSession(ts)) return 'asian';
  if (isUSSession(ts)) return 'us';
  return 'other';
}

// ── RSI ───────────────────────────────────────────────────────────────────────

function rsi(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let gains = 0;
  let losses = 0;
  for (let i = 0; i < closes.length; i++) {
    if (i <= period) { out.push(null); continue; }
    if (i === period + 1) {
      for (let j = 1; j <= period; j++) {
        const d = closes[j] - closes[j - 1];
        if (d > 0) gains += d; else losses -= d;
      }
      gains /= period;
      losses /= period;
    } else {
      const change = closes[i] - closes[i - 1];
      const g = change > 0 ? change : 0;
      const l = change < 0 ? -change : 0;
      gains = (gains * (period - 1) + g) / period;
      losses = (losses * (period - 1) + l) / period;
    }
    const rs = losses > 0 ? gains / losses : 100;
    out.push(100 - (100 / (1 + rs)));
  }
  return out;
}

// ── Stats helpers ─────────────────────────────────────────────────────────────

function sharpeRatio(pnls: number[]): number | null {
  if (pnls.length < 2) return null;
  const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
  const variance = pnls.reduce((a, b) => a + (b - mean) ** 2, 0) / (pnls.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return Number(((mean / std) * Math.sqrt(8760)).toFixed(4));
}

function maxDrawdown(pnls: number[]): number {
  if (pnls.length === 0) return 0;
  let equity = INITIAL_CAPITAL;
  let peak = equity;
  let worst = 0;
  for (const pnl of pnls) {
    equity += pnl;
    if (equity > peak) peak = equity;
    const dd = peak === 0 ? 0 : (equity - peak) / peak;
    if (dd < worst) worst = dd;
  }
  return Number(worst.toFixed(6));
}

function bootstrapCI(trades: TradeResult[], resamples: number): [number, number] {
  if (trades.length < 3) return [-Infinity, Infinity];
  const returns = trades.map(t => t.entryPrice > 0 ? t.netPnl / t.entryPrice : 0);
  const means: number[] = [];
  for (let r = 0; r < resamples; r++) {
    const sample: number[] = [];
    for (let i = 0; i < returns.length; i++) {
      sample.push(returns[Math.floor(Math.random() * returns.length)]);
    }
    means.push(sample.reduce((a, b) => a + b, 0) / sample.length);
  }
  means.sort((a, b) => a - b);
  const lo = means[Math.floor(means.length * 0.025)];
  const hi = means[Math.floor(means.length * 0.975)];
  return [Number(lo.toFixed(6)), Number(hi.toFixed(6))];
}

// ── Backtest engine ───────────────────────────────────────────────────────────

function runBacktest(
  candles: Candle[],
  rsiValues: (number | null)[],
  cfg: Config,
  costConfig: CostConfig,
  startIdx: number,
  endIdx: number,
): TradeResult[] {
  const trades: TradeResult[] = [];
  let i = startIdx;
  while (i < endIdx) {
    const val = rsiValues[i];
    if (val === null || !matchesSession(candles[i].timestamp, cfg.sessionFilter)) {
      i++;
      continue;
    }
    let side: 'long' | 'short' | null = null;
    if (val < cfg.oversold) side = 'long';
    else if (val > cfg.overbought) side = 'short';
    if (!side) { i++; continue; }

    const entryPrice = candles[i].close;
    const entryIdx = i;
    let exitIdx = i;
    for (let h = 1; h <= cfg.maxHold && i + h < endIdx; h++) {
      const rsiH = rsiValues[i + h];
      if (rsiH !== null && Math.abs(rsiH - 50) <= 5) { exitIdx = i + h; break; }
      exitIdx = i + h;
    }

    const exitPrice = candles[exitIdx].close;
    const grossPnl = side === 'long'
      ? (exitPrice - entryPrice) * CONTRACT_SIZE
      : (entryPrice - exitPrice) * CONTRACT_SIZE;
    const notional = entryPrice * CONTRACT_SIZE;
    const { netPnl, fees } = applyCosts(grossPnl, notional, costConfig);
    trades.push({
      entryIdx, exitIdx, side, entryPrice, exitPrice, netPnl, fees,
    });
    i = exitIdx + 1;
  }
  return trades;
}

// ── Sweep ─────────────────────────────────────────────────────────────────────

const SWEEP: Config[] = [];
for (const rsiPeriod of [7, 14]) {
  for (const oversold of [30, 35]) {
    for (const overbought of [65, 70]) {
      for (const maxHold of [6, 12, 24]) {
        for (const sessionFilter of ['weekend', 'asian'] as const) {
          SWEEP.push({ rsiPeriod, oversold, overbought, maxHold, sessionFilter });
        }
      }
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n=== Session-Aware Mean Reversion — SOL ${INTERVAL} ===`);
  console.log(`Pinned end-date: ${END_DATE}  |  ${DAYS_BACK} days back`);
  console.log(`Sweep: ${SWEEP.length} configs\n`);

  const endMs = new Date(END_DATE).getTime();
  const startMs = endMs - DAYS_BACK * 24 * 60 * 60 * 1000;
  const candles = await fetchOHLCV(EXCHANGE, SYMBOL, INTERVAL, startMs, endMs);
  console.log(`Fetched ${candles.length} candles (${SYMBOL} ${INTERVAL})`);

  const closes = candles.map(c => c.close);
  const stressMode = (process.argv[2] || 'normal') as 'normal' | 'conservative' | 'adverse';
  const costConfig = resolveStressConfig(stressMode);
  console.log(`Cost model: ${stressMode}  fee=${costConfig.feePct} slip=${costConfig.slipPct}\n`);

  // Session distribution
  const dist: Record<string, number> = { weekend: 0, asian: 0, us: 0, other: 0 };
  for (const c of candles) dist[sessionLabel(c.timestamp)]++;
  console.log('Session distribution:');
  for (const [k, v] of Object.entries(dist)) console.log(`  ${k}: ${v} bars (${(v / candles.length * 100).toFixed(1)}%)`);
  console.log('');

  const splitIdx = Math.floor(candles.length * OOS_SPLIT);
  const results: (ConfigResult & { ciLow: number; ciHigh: number })[] = [];

  for (let ci = 0; ci < SWEEP.length; ci++) {
    const cfg = SWEEP[ci];
    const rsiVals = rsi(closes, cfg.rsiPeriod);
    const isSessionMatched = candles.map(c => matchesSession(c.timestamp, cfg.sessionFilter));
    const trainTrades = runBacktest(candles, rsiVals, cfg, costConfig, 0, splitIdx);
    const testTrades = runBacktest(candles, rsiVals, cfg, costConfig, splitIdx, candles.length);

    const totalPnl = testTrades.reduce((s, t) => s + t.netPnl, 0);
    const winCount = testTrades.filter(t => t.netPnl > 0).length;
    const pnls = testTrades.map(t => t.netPnl);
    const sharpe = sharpeRatio(pnls);
    const mdd = maxDrawdown(pnls);
    const [ciLow, ciHigh] = bootstrapCI(testTrades, BOOTSTRAP_RESAMPLES);

    results.push({
      config: cfg,
      totalTrades: testTrades.length,
      winCount,
      totalPnl: Number(totalPnl.toFixed(2)),
      sharpe,
      maxDrawdown: mdd,
      winRate: testTrades.length > 0 ? Number((winCount / testTrades.length * 100).toFixed(1)) : 0,
      avgPnl: testTrades.length > 0 ? Number((totalPnl / testTrades.length).toFixed(2)) : 0,
      trades: testTrades,
      ciLow,
      ciHigh,
    });

    if ((ci + 1) % 12 === 0 || ci === SWEEP.length - 1) {
      process.stdout.write(`  [${ci + 1}/${SWEEP.length}] configs done\r`);
    }
  }

  console.log(`\n${results.length} configs complete.\n`);

  // Top 10 by PnL
  results.sort((a, b) => b.totalPnl - a.totalPnl);
  console.log('Top 10 OOS configs by PnL:');
  console.log('Rank | session   | rsiPer | OS | OB | maxH | Trades | Win% | PnL      | Sharpe | MDD      | CI lo');
  console.log('-----+-----------+--------+----+----+------+------+------+----------+--------+----------+--------');
  for (let i = 0; i < Math.min(10, results.length); i++) {
    const r = results[i];
    const c = r.config;
    console.log(
      `  ${String(i + 1).padStart(2)}  | ${c.sessionFilter.padEnd(9)}| ${String(c.rsiPeriod).padStart(6)} | ${String(c.oversold).padStart(2)} | ${String(c.overbought).padStart(2)} | ${String(c.maxHold).padStart(4)} | ${String(r.totalTrades).padStart(6)} | ${String(r.winRate).padStart(4)}% | ${r.totalPnl.toFixed(2).padStart(8)} | ${String(r.sharpe ?? 'null').padStart(6)} | ${r.maxDrawdown.toFixed(4).padStart(8)} | ${r.ciLow.toFixed(4)}`
    );
  }

  // Pass criteria: >=5 OOS trades, positive Sharpe, CI lower bound > 0
  const passCount = results.filter(
    r => r.totalTrades >= 5 && r.sharpe !== null && r.sharpe > 0 && r.ciLow > 0
  ).length;
  console.log(`\nOOS PASS: ${passCount} / ${results.length}`);
  console.log(`Pass criteria: >=5 trades + Sharpe>0 + CI lower bound > 0\n`);

  // Per-session breakdown
  for (const sf of ['weekend', 'asian'] as const) {
    const subset = results.filter(r => r.config.sessionFilter === sf);
    const avgPnl = subset.reduce((s, r) => s + r.totalPnl, 0) / subset.length;
    const avgTrades = subset.reduce((s, r) => s + r.totalTrades, 0) / subset.length;
    const passes = subset.filter(
      r => r.totalTrades >= 5 && r.sharpe !== null && r.sharpe > 0 && r.ciLow > 0
    ).length;
    console.log(`  ${sf}: avg PnL ${avgPnl.toFixed(2)} | avg trades ${avgTrades.toFixed(1)} | PASS ${passes}/${subset.length}`);
  }

  // ── Report ──────────────────────────────────────────────────────────────────
  const reportPath = resolve(process.cwd(), 'plans', 'reports', 'session-aware-meanreversion.md');
  const md = buildReport(results, dist, candles.length, splitIdx, costConfig, stressMode);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, md);
  console.log(`\nReport written to: ${reportPath}`);
}

function buildReport(
  results: (ConfigResult & { ciLow: number; ciHigh: number })[],
  dist: Record<string, number>,
  totalBars: number,
  splitIdx: number,
  costConfig: CostConfig,
  stressMode: string,
): string {
  const lines: string[] = [
    '# Session-Aware Mean Reversion — SOL 8h',
    '',
    '## Hypothesis',
    'Mean reversion is stronger during low-liquidity sessions (weekend, Asian overnight)',
    'and weaker during high-liquidity sessions (weekday US hours).',
    '',
    '## Method',
    `- SOL ${INTERVAL} candles, ${DAYS_BACK} days, pinned end-date ${END_DATE}`,
    `- RSI signal with session filter (weekend / asian / us)`,
    `- Entry: LONG when RSI < oversold, SHORT when RSI > overbought, only in matching session`,
    `- Exit: maxHold bars OR RSI reverts to 50 (neutral)`,
    `- Cost model: ${stressMode} (fee=${costConfig.feePct}, slip=${costConfig.slipPct})`,
    `- OOS: ${OOS_SPLIT * 100}% train / ${(1 - OOS_SPLIT) * 100}% test, ${BOOTSTRAP_RESAMPLES} bootstrap resamples`,
    '',
    '## Session Distribution',
    '',
    '| Session | Bars | % of total |',
    '|---------|------|------------|',
  ];
  for (const [k, v] of Object.entries(dist)) {
    lines.push(`| ${k} | ${v} | ${(v / totalBars * 100).toFixed(1)}% |`);
  }
  lines.push(`| **Total** | **${totalBars}** | **100%** |`);
  lines.push('');

  // Full period results top 10
  const sorted = [...results].sort((a, b) => b.totalPnl - a.totalPnl);
  lines.push('## OOS Results — Top 10 by PnL', '');
  lines.push('| # | Session | RSI | OS | OB | MaxHold | Trades | Win% | PnL | Sharpe | MDD | CI Lo | CI Hi |');
  lines.push('|---|---------|-----|----|----|---------|--------|------|-----|--------|-----|-------|-------|');
  for (let i = 0; i < Math.min(10, sorted.length); i++) {
    const r = sorted[i];
    const c = r.config;
    lines.push(
      `| ${i + 1} | ${c.sessionFilter} | ${c.rsiPeriod} | ${c.oversold} | ${c.overbought} | ${c.maxHold} | ${r.totalTrades} | ${r.winRate}% | ${r.totalPnl.toFixed(2)} | ${r.sharpe ?? 'null'} | ${r.maxDrawdown.toFixed(4)} | ${r.ciLow.toFixed(4)} | ${r.ciHigh.toFixed(4)} |`
    );
  }
  lines.push('');

  // All configs table
  lines.push('## All OOS Configs', '');
  lines.push('| Session | RSI | OS | OB | MaxHold | Trades | Win% | PnL | Sharpe | MDD | CI Lo | CI Hi | PASS |');
  lines.push('|---------|-----|----|----|---------|--------|------|-----|--------|-----|-------|-------|------|');
  for (const r of sorted) {
    const c = r.config;
    const pass = r.totalTrades >= 5 && r.sharpe !== null && r.sharpe > 0 && r.ciLow > 0 ? 'YES' : 'NO';
    lines.push(
      `| ${c.sessionFilter} | ${c.rsiPeriod} | ${c.oversold} | ${c.overbought} | ${c.maxHold} | ${r.totalTrades} | ${r.winRate}% | ${r.totalPnl.toFixed(2)} | ${r.sharpe ?? 'null'} | ${r.maxDrawdown.toFixed(4)} | ${r.ciLow.toFixed(4)} | ${r.ciHigh.toFixed(4)} | ${pass} |`
    );
  }
  lines.push('');

  // Verdict
  const passCount = sorted.filter(
    r => r.totalTrades >= 5 && r.sharpe !== null && r.sharpe > 0 && r.ciLow > 0
  ).length;
  lines.push('## Verdict', '');
  lines.push(`- **OOS PASS: ${passCount} / ${sorted.length}**`);
  lines.push(`- Pass criteria: >=5 OOS trades + Sharpe > 0 + CI lower bound > 0`);
  lines.push('');

  // Per-session breakdown
  lines.push('## Per-Session Breakdown', '');
  lines.push('| Session | Avg PnL | Avg Trades | Configs | PASS |');
  lines.push('|---------|---------|------------|---------|------|');
  for (const sf of ['weekend', 'asian', 'us'] as const) {
    const subset = sorted.filter(r => r.config.sessionFilter === sf);
    if (subset.length === 0) continue;
    const avgPnl = subset.reduce((s, r) => s + r.totalPnl, 0) / subset.length;
    const avgTrades = subset.reduce((s, r) => s + r.totalTrades, 0) / subset.length;
    const passes = subset.filter(
      r => r.totalTrades >= 5 && r.sharpe !== null && r.sharpe > 0 && r.ciLow > 0
    ).length;
    lines.push(`| ${sf} | ${avgPnl.toFixed(2)} | ${avgTrades.toFixed(1)} | ${subset.length} | ${passes}/${subset.length} |`);
  }
  lines.push('');

  return lines.join('\n');
}

main().catch(err => {
  console.error('Session-aware mean reversion failed:', err);
  process.exit(1);
});
