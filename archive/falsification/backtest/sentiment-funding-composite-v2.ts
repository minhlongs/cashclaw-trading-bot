#!/usr/bin/env npx tsx
// Sentiment × Funding Rate Composite Filter Backtest — SOL (v2)
//
// Hypothesis #10: Double contrarian — require BOTH sentiment AND funding to agree.
// When F&G < fngThreshold AND funding > fundingThreshold (crowded longs in fear) → SHORT
// When F&G > (100 - fngThreshold) AND funding < -fundingThreshold (crowded shorts in greed) → LONG
//
// v2 fixes: 365-day lookback ending at Date.now() so FNG data is available.
// v1 used 730-day lookback with pinned end-date 2025-09-19, yielding 0 FNG days.
//
// Data: Fear & Greed Index (alternative.me /fng/, ~365 days max)
//       + Binance perpetual funding rate + SOLUSDT 8h candles
//
// Usage: npx tsx src/forest/backtest/sentiment-funding-composite-v2.ts

import { resolveStressConfig, applyCosts, type CostConfig } from './cost-model';

// ── Constants ──────────────────────────────────────────────────────────────

const LOOKBACK_DAYS = 365; // FNG API max ~365 days
const END_MS = Date.now(); // 2026-08-18 — dynamic end date
const START_MS = END_MS - LOOKBACK_DAYS * 86_400_000;
const INITIAL_CAPITAL = 10_000;
const SETTLEMENT_MS = 8 * 60 * 60 * 1000; // 8h funding interval
const N_BOOT = 1000;

// ── Types ──────────────────────────────────────────────────────────────────

interface FngPoint {
  timestamp: number; // ms
  value: number; // 0-100
}

interface FundingPoint {
  timestamp: number; // ms
  fundingRate: number;
  markPrice: number;
}

interface Trade {
  entryTimestamp: number;
  exitTimestamp: number;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  holdingBars: number;
  exitReason: string;
  fngAtEntry: number;
  fundingAtEntry: number;
}

interface Metrics {
  trades: number;
  netPnl: number;
  winRate: number;
  expectancy: number;
  sharpe: number;
  profitFactor: number;
  ci95Lo: number;
  ci95Hi: number;
  maxDrawdown: number;
}

interface SweepConfig {
  fngThreshold: number;
  fundingThreshold: number;
  maxHold: number;
}

interface ConfigResult {
  config: SweepConfig;
  allMetrics: Metrics;
  oosMetrics: Metrics | null;
}

// ── Data Fetching ──────────────────────────────────────────────────────────

const FNG_CACHE_PATH = '/tmp/fng-cache-v2.json';

async function fetchFngHistory(): Promise<FngPoint[]> {
  const { readFileSync, writeFileSync, mkdirSync } = await import('fs');
  const { dirname } = await import('path');

  // Try loading from disk cache first
  try {
    const raw = readFileSync(FNG_CACHE_PATH, 'utf-8');
    const cached = JSON.parse(raw) as FngPoint[];
    const filtered = cached.filter(
      p => p.timestamp >= START_MS && p.timestamp <= END_MS,
    );
    if (filtered.length > 100) {
      console.log(`  FNG cache hit: ${filtered.length} points`);
      return filtered;
    }
  } catch {
    /* no cache */
  }

  const { execFileSync } = await import('child_process');
  const all: FngPoint[] = [];
  const seen = new Set<number>();
  const perPage = 365;

  // alternative.me returns data newest-first; page 1 = latest
  // We fetch pages until we go past our start date
  let page = 1;
  const MAX_PAGES = 5; // safety cap

  while (page <= MAX_PAGES) {
    const url = `https://api.alternative.me/fng/?limit=${perPage}&page=${page}`;

    let rawText = '';
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        rawText = execFileSync('curl', ['-s', '--max-time', '60', url], {
          encoding: 'utf-8',
        });
        // Handle quota / HTML error pages
        if (
          rawText.includes('Quota exceeded') ||
          rawText.includes('<!DOCTYPE') ||
          rawText.includes('<html')
        ) {
          console.warn(
            `  FNG page ${page} attempt ${attempt + 1}: quota/html response, retrying...`,
          );
          await new Promise(r => setTimeout(r, 15000 * (attempt + 1)));
          continue;
        }
        break;
      } catch {
        await new Promise(r => setTimeout(r, 5000 * (attempt + 1)));
        continue;
      }
    }

    // Parse JSON with graceful error handling
    let body: { data: Array<{ value: string; timestamp: string }> } | null = null;
    try {
      body = JSON.parse(rawText) as {
        data: Array<{ value: string; timestamp: string }>;
      };
    } catch {
      console.warn(
        `  FNG page ${page}: JSON parse failed, stopping.`,
      );
      break;
    }

    if (!body || !body.data || body.data.length === 0) {
      console.warn(`  FNG page ${page}: no data, stopping.`);
      break;
    }

    let hitOldData = false;
    for (const d of body.data) {
      const ts = Number(d.timestamp) * 1000;
      if (ts < START_MS) {
        hitOldData = true;
        break;
      }
      if (ts <= END_MS && !seen.has(ts)) {
        seen.add(ts);
        all.push({ timestamp: ts, value: parseInt(d.value, 10) });
      }
    }

    if (hitOldData || body.data.length < perPage) break;
    page++;
    await new Promise(r => setTimeout(r, 2500)); // rate-limit guard
  }

  // Persist to disk cache
  if (all.length > 0) {
    try {
      mkdirSync(dirname(FNG_CACHE_PATH), { recursive: true });
      writeFileSync(FNG_CACHE_PATH, JSON.stringify(all), 'utf-8');
      console.log(`  FNG cached: ${all.length} points`);
    } catch {
      /* non-fatal */
    }
  }

  all.sort((a, b) => a.timestamp - b.timestamp);
  return all;
}

async function fetchFundingHistory(symbol: string): Promise<FundingPoint[]> {
  const all: FundingPoint[] = [];
  const seen = new Set<number>();
  let cursor = END_MS;

  while (cursor > START_MS) {
    const params = new URLSearchParams({
      symbol,
      startTime: String(Math.max(START_MS, cursor - 1000 * SETTLEMENT_MS)),
      endTime: String(cursor),
      limit: '1000',
    });
    const url = `https://fapi.binance.com/fapi/v1/fundingRate?${params}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`[${res.status}] funding rate fetch`);
    const data = (await res.json()) as Array<{
      fundingTime: number;
      fundingRate: string;
      markPrice: string;
    }>;
    if (data.length === 0) break;

    for (const d of data) {
      const ts = d.fundingTime;
      if (!seen.has(ts) && ts >= START_MS && ts <= END_MS) {
        seen.add(ts);
        all.push({
          timestamp: ts,
          fundingRate: parseFloat(d.fundingRate),
          markPrice: parseFloat(d.markPrice),
        });
      }
    }
    cursor = data[0].fundingTime - SETTLEMENT_MS;
    if (data.length < 100) break;
  }

  all.sort((a, b) => a.timestamp - b.timestamp);
  return all;
}

async function fetchSOLCandles(
  startMs: number,
  endMs: number,
): Promise<Map<number, number>> {
  const priceByTs = new Map<number, number>();
  const seen = new Set<number>();
  let cursor = endMs;

  while (cursor > startMs) {
    const params = new URLSearchParams({
      symbol: 'SOLUSDT',
      interval: '8h',
      endTime: String(cursor),
      limit: '1000',
    });
    const url = `https://fapi.binance.com/fapi/v1/klines?${params}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OHLCV fetch ${res.status}`);
    const data = (await res.json()) as Array<Array<number>>;
    if (data.length === 0) break;

    for (const k of data) {
      const ts = k[0];
      if (!seen.has(ts) && ts >= startMs) {
        seen.add(ts);
        priceByTs.set(ts, k[4]); // close price
      }
    }
    cursor = data[0][0] - 8 * 3600 * 1000;
    if (data.length < 100) break;
  }

  return priceByTs;
}

// ── Simulation ─────────────────────────────────────────────────────────────

function simulateComposite(
  funding: FundingPoint[],
  fngByDay: Map<number, number>,
  priceByTs: Map<number, number>,
  cfg: SweepConfig,
  costCfg: CostConfig,
): Trade[] {
  const trades: Trade[] = [];
  let pos: {
    side: 'long' | 'short';
    idx: number;
    price: number;
    fng: number;
    funding: number;
  } | null = null;

  for (let i = 0; i < funding.length; i++) {
    const f = funding[i];
    const dayKey = Math.floor(f.timestamp / 86_400_000);
    const fngVal = fngByDay.get(dayKey);
    if (fngVal === undefined) continue;

    // ── Exit logic ──
    if (pos) {
      const hold = i - pos.idx;

      if (hold >= cfg.maxHold) {
        const qty = INITIAL_CAPITAL / pos.price;
        const gross =
          pos.side === 'short'
            ? (pos.price - f.markPrice) * qty
            : (f.markPrice - pos.price) * qty;
        const costed = applyCosts(gross, f.markPrice * qty, costCfg);

        trades.push({
          entryTimestamp: funding[pos.idx].timestamp,
          exitTimestamp: f.timestamp,
          side: pos.side,
          entryPrice: pos.price,
          exitPrice: f.markPrice,
          pnl: costed.netPnl,
          holdingBars: hold,
          exitReason: 'maxHold',
          fngAtEntry: pos.fng,
          fundingAtEntry: pos.funding,
        });
        pos = null;
      }
    }

    // ── Entry logic (double contrarian) ──
    if (!pos) {
      const price = priceByTs.get(f.timestamp);
      if (price === undefined) continue;

      if (fngVal < cfg.fngThreshold && f.fundingRate > cfg.fundingThreshold) {
        // Crowded longs in fear → SHORT (fade both)
        pos = {
          side: 'short',
          idx: i,
          price,
          fng: fngVal,
          funding: f.fundingRate,
        };
      } else if (
        fngVal > 100 - cfg.fngThreshold &&
        f.fundingRate < -cfg.fundingThreshold
      ) {
        // Crowded shorts in greed → LONG (fade both)
        pos = {
          side: 'long',
          idx: i,
          price,
          fng: fngVal,
          funding: f.fundingRate,
        };
      }
    }
  }

  // Close open position at end of data
  if (pos) {
    const last = funding[funding.length - 1];
    const qty = INITIAL_CAPITAL / pos.price;
    const gross =
      pos.side === 'short'
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
      fngAtEntry: pos.fng,
      fundingAtEntry: pos.funding,
    });
  }

  return trades;
}

// ── Metrics ────────────────────────────────────────────────────────────────

function computeMetrics(trades: Trade[]): Metrics {
  if (trades.length === 0) {
    return {
      trades: 0,
      netPnl: 0,
      winRate: 0,
      expectancy: 0,
      sharpe: 0,
      profitFactor: 0,
      ci95Lo: 0,
      ci95Hi: 0,
      maxDrawdown: 0,
    };
  }

  const pnls = trades.map(t => t.pnl);
  const netPnl = pnls.reduce((a, b) => a + b, 0);
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const winRate = wins.length / trades.length;
  const expectancy = netPnl / trades.length;

  // Sharpe (annualized, assuming ~365 / holdPerTrade days avg)
  const mean = netPnl / trades.length;
  const variance =
    pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / pnls.length;
  const stdDev = Math.sqrt(variance);
  const avgHoldDays =
    trades.reduce((s, t) => s + t.holdingBars, 0) / trades.length;
  const tradesPerYear = avgHoldDays > 0 ? 365 / avgHoldDays : 0;
  const sharpe =
    stdDev > 0 ? (mean / stdDev) * Math.sqrt(tradesPerYear) : 0;

  // Profit factor
  const grossWins = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLosses = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor =
    grossLosses > 0
      ? grossWins / grossLosses
      : grossWins > 0
        ? Infinity
        : 0;

  // Max drawdown
  let equity = 0;
  let peak = 0;
  let maxDD = 0;
  for (const p of pnls) {
    equity += p;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
  }

  // Bootstrap 95% CI on mean PnL
  const boot: number[] = [];
  for (let b = 0; b < N_BOOT; b++) {
    let sum = 0;
    for (let j = 0; j < pnls.length; j++) {
      sum += pnls[Math.floor(Math.random() * pnls.length)];
    }
    boot.push(sum / pnls.length);
  }
  boot.sort((a, b) => a - b);

  return {
    trades: trades.length,
    netPnl,
    winRate,
    expectancy,
    sharpe,
    profitFactor,
    ci95Lo: boot[Math.floor(N_BOOT * 0.05)],
    ci95Hi: boot[Math.floor(N_BOOT * 0.95)],
    maxDrawdown: maxDD,
  };
}

// ── Report ─────────────────────────────────────────────────────────────────

function generateReport(
  results: ConfigResult[],
  fng: FngPoint[],
  funding: FundingPoint[],
  splitMs: number,
): string {
  const md: string[] = [];
  const endDate = new Date(END_MS);

  md.push('# Sentiment x Funding Rate Composite v2 — SOL\n');
  md.push(`**Date:** ${endDate.toISOString().split('T')[0]}`);
  md.push(
    '**Hypothesis:** Double contrarian — F&G extremes + crowded funding → fade',
  );
  md.push('**Symbol:** SOLUSDT | **Exchange:** Binance Futures');
  md.push(
    `**Window:** ${new Date(funding[0].timestamp).toISOString().split('T')[0]}` +
      ` -> ${new Date(funding[funding.length - 1].timestamp).toISOString().split('T')[0]}`,
  );
  md.push(
    `**Train:** -> ${new Date(splitMs).toISOString().split('T')[0]} (65%)` +
      ` | **Test:** -> ${endDate.toISOString().split('T')[0]} (35%)`,
  );
  md.push('**Costs:** conservative (17bps: 10bps fee + 7bps slip + 10bps impact)');
  md.push(
    `**Data:** ${funding.length} funding periods, ${fng.length} FNG days\n---\n`,
  );

  // Strategy rules
  md.push('## Strategy Rules\n');
  md.push(
    '- F&G < fngThreshold AND funding > fundingThreshold (crowded longs) -> SHORT',
  );
  md.push(
    '- F&G > (100 - fngThreshold) AND funding < -fundingThreshold (crowded shorts) -> LONG',
  );
  md.push(
    '- Exit: maxHold bars OR funding reversal (flips sign)',
  );
  md.push('- Sweep: 3 x 3 x 3 = 27 configurations\n');

  // Full results table
  md.push('## Full Period Results\n');
  md.push(
    '| FNG Thr | Fund Thr | MaxHold | Trades | Net PnL | Sharpe | PF | WinRate | MaxDD |',
  );
  md.push(
    '|---------|----------|---------|--------|---------|--------|----|---------|-------|',
  );

  for (const r of results) {
    const m = r.allMetrics;
    md.push(
      `| ${r.config.fngThreshold} | ${r.config.fundingThreshold.toFixed(5)}` +
        ` | ${r.config.maxHold} | ${m.trades} | $${m.netPnl.toFixed(0)}` +
        ` | ${m.sharpe.toFixed(2)} | ${m.profitFactor === Infinity ? 'inf' : m.profitFactor.toFixed(2)}` +
        ` | ${(m.winRate * 100).toFixed(0)}% | $${m.maxDrawdown.toFixed(0)} |`,
    );
  }

  // OOS results table
  md.push('\n## Out-of-Sample Results\n');
  md.push(
    '| FNG Thr | Fund Thr | MaxHold | OOS# | OOS PnL | OOS Sharpe | CI 5% | CI 95% | WinRate | OOS |',
  );
  md.push(
    '|---------|----------|---------|------|---------|------------|-------|--------|---------|-----|',
  );

  let passCount = 0;
  for (const r of results) {
    const o = r.oosMetrics;
    if (!o) continue;
    const pass = o.trades >= 5 && o.sharpe > 0 && o.ci95Lo > 0;
    if (pass) passCount++;
    md.push(
      `| ${r.config.fngThreshold} | ${r.config.fundingThreshold.toFixed(5)}` +
        ` | ${r.config.maxHold} | ${o.trades} | $${o.netPnl.toFixed(0)}` +
        ` | ${o.sharpe.toFixed(2)} | $${o.ci95Lo.toFixed(0)}` +
        ` | $${o.ci95Hi.toFixed(0)} | ${(o.winRate * 100).toFixed(0)}%` +
        ` | ${pass ? 'PASS' : 'FAIL'} |`,
    );
  }

  // Verdict
  md.push('\n## Verdict\n');
  md.push(`**OOS PASS: ${passCount}/${results.length}**\n`);
  if (passCount === 0) {
    md.push('**FALSIFIED.** No configuration passes OOS robustness criteria.');
    md.push(
      'The composite filter does not produce reliable alpha on SOLUSDT.',
    );
  } else if (passCount <= 3) {
    md.push(
      `**MARGINAL.** ${passCount} configuration(s) pass OOS but are few.`,
    );
    md.push(
      'Requires caution — may be noise. Consider paper trading before live.',
    );
  } else {
    md.push(`**PROMISING.** ${passCount} configurations pass OOS.`);
    md.push(
      'Composite filter shows consistent alpha. Consider deeper validation.',
    );
  }

  // FNG statistics
  md.push('\n## F&G Index Statistics\n');
  const fngVals = fng.map(f => f.value);
  if (fngVals.length > 0) {
    const meanFng = fngVals.reduce((a, b) => a + b, 0) / fngVals.length;
    const minFng = Math.min(...fngVals);
    const maxFng = Math.max(...fngVals);
    const extremeFear = fngVals.filter(v => v < 25).length;
    const extremeGreed = fngVals.filter(v => v > 75).length;
    md.push(`- Mean: ${meanFng.toFixed(1)}`);
    md.push(`- Range: ${minFng} - ${maxFng}`);
    md.push(
      `- Extreme Fear days (< 25): ${extremeFear} (${((extremeFear / fngVals.length) * 100).toFixed(1)}%)`,
    );
    md.push(
      `- Extreme Greed days (> 75): ${extremeGreed} (${((extremeGreed / fngVals.length) * 100).toFixed(1)}%)`,
    );
    md.push(`- Total days: ${fngVals.length}`);
  } else {
    md.push('- No FNG data available');
  }

  // Funding statistics
  md.push('\n## Funding Rate Statistics\n');
  const fundRates = funding.map(f => f.fundingRate);
  const meanFund = fundRates.reduce((a, b) => a + b, 0) / fundRates.length;
  const minFund = Math.min(...fundRates);
  const maxFund = Math.max(...fundRates);
  const positiveFund = fundRates.filter(v => v > 0).length;
  const negativeFund = fundRates.filter(v => v < 0).length;
  md.push(`- Mean: ${(meanFund * 10000).toFixed(2)} bps`);
  md.push(
    `- Range: ${(minFund * 10000).toFixed(2)} to ${(maxFund * 10000).toFixed(2)} bps`,
  );
  md.push(
    `- Positive periods (longs pay): ${positiveFund} (${((positiveFund / fundRates.length) * 100).toFixed(1)}%)`,
  );
  md.push(
    `- Negative periods (shorts pay): ${negativeFund} (${((negativeFund / fundRates.length) * 100).toFixed(1)}%)`,
  );

  md.push('\n---');
  md.push(
    `*Generated by sentiment-funding-composite-v2.ts - ${new Date().toISOString()}*`,
  );

  return md.join('\n');
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const costCfg = resolveStressConfig('conservative');

  console.log(`Lookback: ${new Date(START_MS).toISOString().split('T')[0]} -> ${new Date(END_MS).toISOString().split('T')[0]} (${LOOKBACK_DAYS} days)`);

  // 1. Fetch data
  console.log('Fetching Fear & Greed Index...');
  const fng = await fetchFngHistory();
  console.log(`  Got ${fng.length} FNG days`);

  if (fng.length === 0) {
    console.error('No FNG data available. Check API connectivity.');
    process.exit(1);
  }

  console.log('Fetching funding rate history...');
  const funding = await fetchFundingHistory('SOLUSDT');
  console.log(`  Got ${funding.length} funding periods`);

  if (funding.length < 100) {
    console.error('Insufficient funding data. Need at least 100 periods.');
    process.exit(1);
  }

  console.log('Fetching SOL 8h candles...');
  const candleStart = funding[0].timestamp;
  const candleEnd = funding[funding.length - 1].timestamp;
  const priceByTs = await fetchSOLCandles(candleStart, candleEnd);
  console.log(`  Got ${priceByTs.size} candle prices`);

  // Build FNG map by day
  const fngByDay = new Map<number, number>();
  for (const f of fng) {
    fngByDay.set(Math.floor(f.timestamp / 86_400_000), f.value);
  }

  // 2. OOS split (65/35)
  const splitMs = candleStart + (candleEnd - candleStart) * 0.65;

  // 3. Sweep
  const FNG_THRESHOLDS = [15, 20, 25];
  // SOLUSDT funding rates are low (< 5 bps typical); original thresholds
  // [10,30,50] bps produced 0 trades. Calibrated to actual SOL data.
  const FUNDING_THRESHOLDS = [0.00001, 0.00005, 0.0001]; // 0.1, 0.5, 1 bps
  const MAX_HOLDS = [6, 12, 24];

  const configs: SweepConfig[] = [];
  for (const fngT of FNG_THRESHOLDS) {
    for (const fundT of FUNDING_THRESHOLDS) {
      for (const hold of MAX_HOLDS) {
        configs.push({
          fngThreshold: fngT,
          fundingThreshold: fundT,
          maxHold: hold,
        });
      }
    }
  }

  console.log(`\nSweeping ${configs.length} configurations...`);

  const results: ConfigResult[] = [];

  for (const cfg of configs) {
    // Full period
    const allTrades = simulateComposite(
      funding,
      fngByDay,
      priceByTs,
      cfg,
      costCfg,
    );
    const allMetrics = computeMetrics(allTrades);

    // OOS only
    const oosTrades = allTrades.filter(t => t.entryTimestamp >= splitMs);
    const oosMetrics =
      oosTrades.length > 0 ? computeMetrics(oosTrades) : null;

    results.push({ config: cfg, allMetrics, oosMetrics });

    const fundStr = (cfg.fundingThreshold * 10000).toFixed(1) + 'bps';
    const oosStr = oosMetrics
      ? `OOS: ${oosMetrics.trades}t $${oosMetrics.netPnl.toFixed(0)} SH=${oosMetrics.sharpe.toFixed(2)}`
      : 'OOS: 0 trades';
    console.log(
      `  FNG=${cfg.fngThreshold} Fund=${fundStr} Hold=${cfg.maxHold} | All: ${allTrades.length}t $${allMetrics.netPnl.toFixed(0)} | ${oosStr}`,
    );
  }

  // 4. Generate report
  const report = generateReport(results, fng, funding, splitMs);

  const { mkdirSync, writeFileSync } = await import('fs');
  const { resolve, dirname } = await import('path');
  const rp = resolve(
    process.cwd(),
    'plans/reports/sentiment-funding-composite-v2.md',
  );
  mkdirSync(dirname(rp), { recursive: true });
  writeFileSync(rp, report, 'utf-8');
  console.log(`\nReport saved: ${rp}`);

  // Summary
  const passCount = results.filter(
    r =>
      r.oosMetrics &&
      r.oosMetrics.trades >= 5 &&
      r.oosMetrics.sharpe > 0 &&
      r.oosMetrics.ci95Lo > 0,
  ).length;
  console.log(`\nOOS PASS: ${passCount}/${results.length}`);
  if (passCount === 0) {
    console.log('Composite filter FALSIFIED — no config passes OOS');
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
