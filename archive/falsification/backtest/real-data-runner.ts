// Real-Data Backtest Runner (standalone script — run via tsx)
// Fetches real OHLCV → runs alpha pipeline → prints metrics + persists to D1.

import { fetchOHLCV } from './data-fetcher';
import { applyCosts, type CostConfig } from './cost-model';
import { loadCandles, saveCandles, getCacheKey } from './ohlcv-cache';

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseIntervalMinutes(interval: string): number {
  const m = interval.match(/^(\d+)([mhd])$/);
  if (!m) return 60;
  const n = Number(m[1]), u = m[2];
  if (u === 'm') return n;
  if (u === 'h') return n * 60;
  if (u === 'd') return n * 1440;
  return 60;
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface RealDataBacktestResult {
  exchange: string;
  symbol: string;
  interval: string;
  candlesFetched: number;
  dataSource: 'cache' | 'exchange';
  regimeDistribution: Record<string, number>;
  netPnl: number;
  sharpe: number;
  maxDrawdown: number;
  winRate: number;
  totalFees: number;
  totalSlippage: number;
  savedToD1: boolean;
  error?: string;
}

export async function runRealDataBacktest(opts: {
  exchange: string;
  symbol: string;
  interval: string;
  lookbackDays: number;
  costMode?: 'normal' | 'conservative' | 'adverse';
}): Promise<RealDataBacktestResult> {
  const { exchange, symbol, interval, lookbackDays, costMode = 'conservative' } = opts;
  const endMs = Date.now();
  const startMs = endMs - lookbackDays * 86400_000;
  const intervalMin = parseIntervalMinutes(interval);

  // 1. Fetch real candles (with filesystem cache)
  let candles;
  let dataSource: 'cache' | 'exchange' = 'exchange';
  try {
    candles = await fetchOHLCV(exchange, symbol, interval, startMs, endMs);
  } catch (err) {
    return {
      exchange, symbol, interval, candlesFetched: 0, dataSource: 'exchange', regimeDistribution: {},
      netPnl: 0, sharpe: 0, maxDrawdown: 0, winRate: 0, totalFees: 0, totalSlippage: 0, savedToD1: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (candles.length < 20) {
    return {
      exchange, symbol, interval, candlesFetched: candles.length, dataSource, regimeDistribution: {},
      netPnl: 0, sharpe: 0, maxDrawdown: 0, winRate: 0, totalFees: 0, totalSlippage: 0, savedToD1: false,
      error: `Insufficient data: ${candles.length} candles (need >= 20)`,
    };
  }

  // 2. Simple regime detection via ATR + return dispersion
  const atrWindow = 14;
  const regimes: string[] = [];
  const regimeDistribution: Record<string, number> = {};
  for (let i = atrWindow; i < candles.length; i++) {
    const window = candles.slice(i - atrWindow, i);
    const atr = window.reduce((s, c) => s + (c.high - c.low), 0) / atrWindow;
    const avgPrice = window.reduce((s, c) => s + c.close, 0) / atrWindow;
    const atrPct = atr / avgPrice;
    const rets: number[] = [];
    for (let j = 1; j < window.length; j++) rets.push((window[j].close - window[j - 1].close) / window[j - 1].close);
    const meanRet = rets.reduce((a, b) => a + b, 0) / rets.length;
    const variance = rets.reduce((a, b) => a + (b - meanRet) ** 2, 0) / rets.length;

    let regime = 'UNKNOWN';
    if (atrPct > 0.03) regime = 'HIGH_VOLATILITY';
    else if (atrPct < 0.005) regime = 'LOW_VOLATILITY';
    else if (variance < 0.0001 && meanRet > 0) regime = 'TREND_UP';
    else if (variance < 0.0001 && meanRet < 0) regime = 'TREND_DOWN';
    else if (variance < 0.0002) regime = 'RANGE';
    regimes.push(regime);
    regimeDistribution[regime] = (regimeDistribution[regime] || 0) + 1;
  }

  // 3. Simple long-only strategy: RSI oversold + trend-up filter
  const rsiPeriod = 14;
  const smaPeriod = 20;
  const trades: { entry: number; exit: number; pnl: number; fee: number; slip: number }[] = [];
  let pos = false, entryPrice = 0, entryIdx = 0;
  const costCfg: CostConfig = {
    feePct: costMode === 'conservative' ? 0.0010 : costMode === 'adverse' ? 0.0020 : 0.0008,
    slipPct: costMode === 'conservative' ? 0.0007 : costMode === 'adverse' ? 0.0020 : 0.0003,
    marketImpactPct: costMode === 'conservative' ? 0.0010 : costMode === 'adverse' ? 0.0020 : 0.0005,
  };

  for (let i = smaPeriod + rsiPeriod; i < candles.length; i++) {
    const closes = candles.slice(i - rsiPeriod, i).map(c => c.close);
    const sma = candles.slice(i - smaPeriod, i).reduce((s, c) => s + c.close, 0) / smaPeriod;

    // RSI
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

    if (!pos && rsi < 35 && candles[i].close > sma && regimes[i - atrWindow] !== 'HIGH_VOLATILITY') {
      pos = true;
      entryPrice = candles[i].close;
      entryIdx = i;
    } else if (pos && (rsi > 65 || candles[i].close < sma * 0.98 || i - entryIdx > intervalMin * 6)) {
      const grossPnl = candles[i].close - entryPrice;
      const notional = Math.abs(entryPrice);
      const cost = applyCosts(grossPnl, notional, costCfg);
      trades.push({ entry: entryPrice, exit: candles[i].close, pnl: cost.netPnl, fee: cost.fees, slip: cost.slippage });
      pos = false;
    }
  }

  // 4. Compute metrics
  const totalTrades = trades.length;
  const wins = trades.filter(t => t.pnl > 0).length;
  const winRate = totalTrades > 0 ? wins / totalTrades : 0;
  const grossProfit = trades.reduce((s, t) => s + Math.max(t.pnl, 0), 0);
  const grossLoss = Math.abs(trades.reduce((s, t) => s + Math.min(t.pnl, 0), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
  const netPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const totalFees = trades.reduce((s, t) => s + t.fee, 0);
  const totalSlippage = trades.reduce((s, t) => s + t.slip, 0);

  // Sharpe
  const pnlSeries: number[] = [];
  let peak = 0, maxDD = 0, equity = 0;
  for (const t of trades) {
    equity += t.pnl;
    peak = Math.max(peak, equity);
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    maxDD = Math.max(maxDD, dd);
    pnlSeries.push(t.pnl);
  }
  const mean = pnlSeries.length > 0 ? pnlSeries.reduce((a, b) => a + b, 0) / pnlSeries.length : 0;
  const variance = pnlSeries.length > 1 ? pnlSeries.reduce((a, b) => a + (b - mean) ** 2, 0) / (pnlSeries.length - 1) : 0;
  const std = Math.sqrt(variance);
  const periodsPerYear = (365 * 24 * 60) / intervalMin;
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(periodsPerYear) : 0;

  const result: RealDataBacktestResult = {
    exchange, symbol, interval, candlesFetched: candles.length, dataSource, regimeDistribution,
    netPnl, sharpe, maxDrawdown: maxDD, winRate, totalFees, totalSlippage, savedToD1: false,
  };

  // 5. Persist to D1
  try {
    const { createServerClient } = await import('@/lib/db/client');
    const db = createServerClient();
    if (db) {
      const id = `${exchange}-${symbol}-${interval}-${startMs}`;
      await db.prepare(
        `INSERT OR REPLACE INTO backtest_results (id, strategy, pair, exchange, start_date, end_date, total_trades, win_count, loss_count, win_rate, total_pnl, net_pnl, max_drawdown, sharpe_ratio, profit_factor, fees, slippage, params_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, 'alpha_real_data', symbol, exchange, startMs, endMs, totalTrades, wins, totalTrades - wins, winRate, netPnl, netPnl, maxDD, sharpe, profitFactor, totalFees, totalSlippage, JSON.stringify({ costMode, intervalMin }), Date.now()).run();
      result.savedToD1 = true;
    }
  } catch (err) {
    // D1 persist is best-effort — result is still valid
  }

  return result;
}

// ── CLI Entry Point ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const exchange = args[0] || 'binance';
  const symbol = args[1] || 'BTCUSDT';
  const interval = args[2] || '1h';
  const days = parseInt(args[3] || '90', 10);
  const mode = (args[4] as 'normal' | 'conservative' | 'adverse') || 'conservative';

  console.log(`\nReal-Data Backtest: ${exchange} ${symbol} ${interval} ${days}d [${mode}]`);
  console.log('─'.repeat(60));
  const result = await runRealDataBacktest({ exchange, symbol, interval, lookbackDays: days, costMode: mode });
  if (result.error) {
    console.error(`ERROR: ${result.error}`);
    process.exit(1);
  }
  console.log(`\nCandles fetched: ${result.candlesFetched} (source: ${result.dataSource})`);
  console.log(`Regime distribution:`, result.regimeDistribution);
  console.log('\nPerformance Metrics:');
  console.log(`  Net PnL:       $${result.netPnl.toFixed(2)}`);
  console.log(`  Win Rate:      ${(result.winRate * 100).toFixed(1)}%`);
  console.log(`  Sharpe:        ${result.sharpe.toFixed(3)}`);
  console.log(`  Max Drawdown:  ${result.maxDrawdown.toFixed(2)}%`);
  console.log(`  Fees:          $${result.totalFees.toFixed(2)}`);
  console.log(`  Slippage:      $${result.totalSlippage.toFixed(2)}`);
  console.log(`  Persisted:     ${result.savedToD1 ? 'YES (D1)' : 'NO'}`);
  console.log('\n⚠️  This is PAPER/BACKTEST only. No real trades executed.\n');
}

main().catch((err) => {
  console.error('Real-data runner failed:', err);
  process.exit(1);
});