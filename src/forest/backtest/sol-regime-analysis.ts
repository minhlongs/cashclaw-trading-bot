// SOL 1h Regime Analysis — detailed per-candle regime metrics + trade success breakdown
// Usage: npx tsx src/forest/backtest/sol-regime-analysis.ts [days]
// Default: 365 days of SOL/USDT 1h candles from Binance

import { fetchOHLCV } from './data-fetcher';
import { resolveStressConfig, applyCosts, type CostConfig } from './cost-model';
import { loadCandles, saveCandles, getCacheKey } from './ohlcv-cache';
import type { Candle } from './ohlcv';

// ── Config ───────────────────────────────────────────────────────────────────

interface RSIConfig {
  rsiPeriod: number;
  smaPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  smaStopBuffer: number;
  maxHoldHours: number;
  requireMomentum: boolean;
}

const DEFAULT_RSI_CFG: RSIConfig = {
  rsiPeriod: 14,
  smaPeriod: 50,
  rsiOversold: 30,
  rsiOverbought: 70,
  smaStopBuffer: 0.05,
  maxHoldHours: 48,
  requireMomentum: true,
};

type RegimeType =
  | 'TREND_UP'
  | 'TREND_DOWN'
  | 'RANGE'
  | 'HIGH_VOL'
  | 'LOW_VOL'
  | 'SHOCK'
  | 'UNKNOWN';

interface CandleMetrics {
  index: number;
  timestamp: number;
  date: string;
  close: number;
  regime: RegimeType;
  rsi: number | null;
  sma: number | null;
  smaDistPct: number | null;
  volumeZScore: number | null;
  atr: number | null;
  realizedVol: number | null;
  rsiSignal: 'LONG' | 'SHORT' | 'NONE';
  regimeAtEntry: string | null;
  tradeActive: boolean;
}

interface RegimeStats {
  regime: RegimeType;
  candleCount: number;
  pctOfTime: number;
  rsiSignals: number;
  longEntries: number;
  shortEntries: number;
  longWins: number;
  longLosses: number;
  shortWins: number;
  shortLosses: number;
  avgHoldHours: number;
  avgPnlPerTrade: number;
}

// ── Indicators ───────────────────────────────────────────────────────────────

function computeRSI(closes: number[], period: number): number | null {
  if (closes.length < period + 1) return null;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta > 0) gainSum += delta;
    else lossSum += Math.abs(delta);
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  for (let i = period + 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(delta, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-delta, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function computeSMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function computeATR(candles: Candle[], period: number): number | null {
  if (candles.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const pc = candles[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  if (trs.length < period) return null;
  let avg = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    avg = (avg * (period - 1) + trs[i]) / period;
  }
  return avg;
}

function computeVolumeZScore(volumes: number[], index: number, lookback: number): number | null {
  if (index < lookback) return null;
  const window = volumes.slice(index - lookback, index);
  const avg = window.reduce((a, b) => a + b, 0) / lookback;
  if (avg === 0) return 0;
  const variance = window.reduce((s, v) => s + (v - avg) ** 2, 0) / lookback;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return (volumes[index] - avg) / std;
}

function computeRealizedVol(closes: number[], lookback: number): number | null {
  if (closes.length < lookback + 1) return null;
  const returns: number[] = [];
  for (let i = closes.length - lookback; i < closes.length; i++) {
    returns.push(Math.log(closes[i] / closes[i - 1]));
  }
  const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - avg) ** 2, 0) / returns.length;
  // annualized (8760 hours/year for 1h candles)
  return Math.sqrt(variance * 8760);
}

// ── Regime Classification (matches baseline-compare computeRegime logic) ─────

function classifyRegime(
  candles: Candle[],
  index: number,
  sma: number | null,
  atr: number | null,
  rsi: number | null,
  volZScore: number | null,
): RegimeType {
  if (index < 20) return 'UNKNOWN';

  const closes20 = candles.slice(index - 20, index).map(c => c.close);
  const mean20 = closes20.reduce((a, b) => a + b, 0) / 20;
  const variance20 = closes20.reduce((s, c) => s + (c - mean20) ** 2, 0) / 20;
  const volPct = (Math.sqrt(variance20) / mean20) * 100;

  // Shock = extreme volatility spike
  if (volPct > 5 && volZScore !== null && volZScore > 2.5) return 'SHOCK';
  if (volPct > 3) return 'HIGH_VOL';
  if (volPct < 0.5) return 'LOW_VOL';

  if (sma !== null) {
    if (candles[index].close > sma) return 'TREND_UP';
    if (index > 0 && candles[index - 1].close < sma) return 'TREND_DOWN';
  }
  return 'RANGE';
}

// ── RSI Strategy (same logic as baseline-compare rsiTrendStrategy) ──────────

interface TradeRecord {
  entryIndex: number;
  exitIndex: number;
  entryTimestamp: number;
  exitTimestamp: number;
  side: 'buy' | 'sell';
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  fee: number;
  holdingMinutes: number;
  exitReason: string;
  entryRegime: RegimeType;
}

function rsiTrendStrategyDetailed(
  candles: Candle[],
  cfg: CostConfig,
  rsiCfg: RSIConfig = DEFAULT_RSI_CFG,
): TradeRecord[] {
  const trades: TradeRecord[] = [];
  const closes = candles.map(c => c.close);
  let position: {
    side: 'buy' | 'sell';
    entryPrice: number;
    entryIndex: number;
    entryTimestamp: number;
    entryRegime: RegimeType;
    stopLoss: number;
  } | null = null;

  for (let i = rsiCfg.smaPeriod; i < candles.length; i++) {
    const recentCloses = closes.slice(0, i + 1);
    const rsi = computeRSI(recentCloses, rsiCfg.rsiPeriod);
    const sma = computeSMA(closes.slice(0, i + 1), rsiCfg.smaPeriod);
    const atr = computeATR(candles.slice(0, i + 1), 14);
    const volZ = computeVolumeZScore(candles.map(c => c.volume), i, 20);
    const regime = classifyRegime(candles, i, sma, atr, rsi, volZ);
    if (rsi === null || sma === null || atr === null) continue;

    const price = candles[i].close;
    const holdHours = position
      ? (candles[i].timestamp - position.entryTimestamp) / 3_600_000
      : 0;
    const isMomentumUp = i > 0 && price > candles[i - 1].close;

    // ── Exit logic ──
    if (position) {
      let exitReason = '';
      let shouldExit = false;

      if (position.side === 'buy') {
        if (price <= position.stopLoss) {
          exitReason = 'stop_loss'; shouldExit = true;
        } else if (rsi >= rsiCfg.rsiOverbought) {
          exitReason = 'rsi_overbought'; shouldExit = true;
        } else if (price < sma * (1 - rsiCfg.smaStopBuffer)) {
          exitReason = 'sma_breakdown'; shouldExit = true;
        } else if (holdHours >= rsiCfg.maxHoldHours) {
          exitReason = 'max_hold'; shouldExit = true;
        }
      } else {
        if (price >= position.stopLoss) {
          exitReason = 'stop_loss'; shouldExit = true;
        } else if (rsi <= rsiCfg.rsiOversold) {
          exitReason = 'rsi_oversold'; shouldExit = true;
        } else if (price > sma * (1 + rsiCfg.smaStopBuffer)) {
          exitReason = 'sma_breakup'; shouldExit = true;
        } else if (holdHours >= rsiCfg.maxHoldHours) {
          exitReason = 'max_hold'; shouldExit = true;
        }
      }

      if (shouldExit) {
        const grossPnl = position.side === 'buy'
          ? (price - position.entryPrice)
          : (position.entryPrice - price);
        const cost = applyCosts(
          grossPnl,
          Math.abs(price - position.entryPrice),
          cfg,
        );
        trades.push({
          entryIndex: position.entryIndex,
          exitIndex: i,
          entryTimestamp: position.entryTimestamp,
          exitTimestamp: candles[i].timestamp,
          side: position.side,
          entryPrice: position.entryPrice,
          exitPrice: price,
          pnl: cost.netPnl,
          fee: cost.fees,
          holdingMinutes: Math.round(holdHours * 60),
          exitReason,
          entryRegime: position.entryRegime,
        });
        position = null;
      }
      continue;
    }

    // ── Entry logic (long only, matches original) ──
    if (rsi <= rsiCfg.rsiOversold && price > sma && (!rsiCfg.requireMomentum || isMomentumUp)) {
      const stopLoss = sma * (1 - rsiCfg.smaStopBuffer);
      position = {
        side: 'buy',
        entryPrice: price,
        entryIndex: i,
        entryTimestamp: candles[i].timestamp,
        entryRegime: regime,
        stopLoss,
      };
    }
  }
  return trades;
}

// ── Output Formatting ────────────────────────────────────────────────────────

function fmtPct(v: number | null): string {
  return v !== null ? v.toFixed(2) + '%' : 'N/A';
}

function fmtNum(v: number | null, decimals = 2): string {
  return v !== null ? v.toFixed(decimals) : 'N/A';
}

function regimeEmoji(r: RegimeType): string {
  switch (r) {
    case 'TREND_UP': return '^';
    case 'TREND_DOWN': return 'v';
    case 'RANGE': return '=';
    case 'HIGH_VOL': return 'H';
    case 'LOW_VOL': return 'L';
    case 'SHOCK': return '!';
    default: return '?';
  }
}

function printRegimeSummary(stats: RegimeStats[]): void {
  console.log('\n' + '='.repeat(110));
  console.log('  SOL 1h REGIME SUMMARY');
  console.log('='.repeat(110));
  console.log(
    'Regime'.padEnd(12) +
    '%Time'.padStart(8) +
    'Candles'.padStart(10) +
    'Signals'.padStart(10) +
    'L_Wins'.padStart(8) +
    'L_Loss'.padStart(8) +
    'S_Wins'.padStart(8) +
    'S_Loss'.padStart(8) +
    'WinRate'.padStart(10) +
    'AvgHold'.padStart(10) +
    'AvgPnL$'.padStart(10),
  );
  console.log('-'.repeat(110));
  for (const s of stats) {
    const totalTrades = s.longWins + s.longLosses + s.shortWins + s.shortLosses;
    const totalWins = s.longWins + s.shortWins;
    const winRate = totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(1) + '%' : 'N/A';
    console.log(
      s.regime.padEnd(12) +
      (s.pctOfTime.toFixed(1) + '%').padStart(8) +
      String(s.candleCount).padStart(10) +
      String(s.rsiSignals).padStart(10) +
      String(s.longWins).padStart(8) +
      String(s.longLosses).padStart(8) +
      String(s.shortWins).padStart(8) +
      String(s.shortLosses).padStart(8) +
      winRate.padStart(10) +
      (s.avgHoldHours !== null ? s.avgHoldHours.toFixed(1) + 'h' : 'N/A').padStart(10) +
      (s.avgPnlPerTrade !== null ? '$' + s.avgPnlPerTrade.toFixed(2) : 'N/A').padStart(10),
    );
  }
  console.log('='.repeat(110));
}

function printTradeLog(trades: TradeRecord[], totalCandles: number): void {
  console.log('\n--- TRADE LOG (all trades, newest first) ---');
  console.log(
    '#'.padStart(4) +
    '  Side'.padStart(6) +
    'EntryDate'.padStart(20) +
    'ExitDate'.padStart(20) +
    'Entry$'.padStart(12) +
    'Exit$'.padStart(12) +
    'PnL$'.padStart(10) +
    'Hold'.padStart(8) +
    'ExitReason'.padStart(16) +
    'Regime'.padStart(12),
  );
  console.log('-'.repeat(115));
  for (let i = trades.length - 1; i >= 0; i--) {
    const t = trades[i];
    const entryDate = new Date(t.entryTimestamp).toISOString().slice(0, 16);
    const exitDate = new Date(t.exitTimestamp).toISOString().slice(0, 16);
    const pnlStr = t.pnl >= 0 ? '+$' + t.pnl.toFixed(2) : '-$' + Math.abs(t.pnl).toFixed(2);
    const holdStr = t.holdingMinutes >= 60
      ? (t.holdingMinutes / 60).toFixed(1) + 'h'
      : t.holdingMinutes + 'm';
    console.log(
      String(i + 1).padStart(4) +
      ('  ' + t.side).padStart(6) +
      entryDate.padStart(20) +
      exitDate.padStart(20) +
      ('$' + t.entryPrice.toFixed(2)).padStart(12) +
      ('$' + t.exitPrice.toFixed(2)).padStart(12) +
      pnlStr.padStart(10) +
      holdStr.padStart(8) +
      t.exitReason.padStart(16) +
      t.entryRegime.padStart(12),
    );
  }
  console.log('-'.repeat(115));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const daysArg = process.argv[2] || '365';
  const days = parseInt(daysArg, 10);
  if (isNaN(days) || days <= 0 || days > 3650) {
    console.error(`Invalid days: ${daysArg}. Must be 1-3650`);
    process.exit(1);
  }

  const SYMBOL = 'SOLUSDT';
  const INTERVAL = '1h';
  const EXCHANGE = 'binance';
  const costCfg: CostConfig = resolveStressConfig('conservative');

  console.log(`\n=== SOL 1h Regime Analysis ===`);
  console.log(`Symbol: ${SYMBOL} | Interval: ${INTERVAL} | Days: ${days}`);
  console.log(`Cost model: fee=${(costCfg.feePct * 100).toFixed(2)}%, slip=${(costCfg.slipPct * 100).toFixed(2)}%, impact=${(costCfg.marketImpactPct * 100).toFixed(2)}%\n`);

  // Fetch candles
  console.log('Fetching SOL 1h candles...');
  const endMs = Date.now();
  const startMs = endMs - days * 24 * 60 * 60 * 1000;

  const cacheKey = getCacheKey(EXCHANGE, SYMBOL, INTERVAL);
  let candles: Candle[];
  const cached = loadCandles(cacheKey);
  if (cached && cached.candles && cached.candles.length > 0) {
    candles = cached.candles as Candle[];
    console.log(`  Loaded ${candles.length} candles from cache`);
  } else {
    candles = await fetchOHLCV(EXCHANGE, SYMBOL, INTERVAL, startMs, endMs);
    saveCandles(cacheKey, candles);
    console.log(`  Fetched and cached ${candles.length} candles`);
  }
  if (candles.length < 50) {
    console.error(`Insufficient data: ${candles.length} candles (need >= 50)`);
    process.exit(1);
  }
  const availableDays = Math.round((candles[candles.length - 1].timestamp - candles[0].timestamp) / (24 * 3600 * 1000));
  if (availableDays < days) {
    console.warn(`  Note: Only ${availableDays} days available (requested ${days}). Results reflect available window.`);
  }

  // Run detailed regime analysis
  console.log(`\nComputing per-candle metrics for ${candles.length} candles...`);

  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const regimeCounts: Record<string, number> = {};
  const regimeSignalCounts: Record<string, number> = {};

  // Compute metrics for each candle (sample output for first few + summary stats)
  let lastRegime: RegimeType = 'UNKNOWN';
  for (let i = 0; i < candles.length; i++) {
    const rsi = computeRSI(closes.slice(0, i + 1), 14);
    const sma = computeSMA(closes.slice(0, i + 1), 50);
    const atr = computeATR(candles.slice(0, i + 1), 14);
    const volZ = computeVolumeZScore(volumes, i, 20);
    const realizedVol = computeRealizedVol(closes.slice(0, i + 1), 20);
    const regime = classifyRegime(candles, i, sma, atr, rsi, volZ);
    const smaDistPct = sma !== null ? ((candles[i].close - sma) / sma) * 100 : null;

    lastRegime = regime;
    regimeCounts[regime] = (regimeCounts[regime] || 0) + 1;

    // RSI signal detection
    let rsiSignal: 'LONG' | 'SHORT' | 'NONE' = 'NONE';
    if (rsi !== null && sma !== null) {
      if (rsi <= 30 && candles[i].close > sma) {
        rsiSignal = 'LONG';
        regimeSignalCounts[regime] = (regimeSignalCounts[regime] || 0) + 1;
      } else if (rsi >= 70 && candles[i].close < sma) {
        rsiSignal = 'SHORT';
        regimeSignalCounts[regime] = (regimeSignalCounts[regime] || 0) + 1;
      }
    }

    // Print sample candles (every 500th + first/last 10)
    if (i < 10 || i >= candles.length - 10 || i % 500 === 0) {
      const date = new Date(candles[i].timestamp).toISOString().slice(0, 16);
      console.log(
        `[${String(i).padStart(5)}] ${date} | ` +
        `Regime: ${regime.padEnd(11)} | RSI: ${fmtNum(rsi, 1).padStart(5)} | ` +
        `SMA dist: ${fmtPct(smaDistPct).padStart(7)} | VolZ: ${fmtNum(volZ, 2).padStart(6)} | ` +
        `ATR: ${fmtNum(atr, 4).padStart(8)} | RvVol: ${fmtPct(realizedVol).padStart(7)} | ` +
        `Signal: ${rsiSignal}`,
      );
    }
  }

  // Run RSI strategy for trade analysis
  console.log('\nRunning RSI+Trend strategy for trade analysis...');
  const trades = rsiTrendStrategyDetailed(candles, costCfg);
  console.log(`  Generated ${trades.length} trades`);

  // Print trade log
  printTradeLog(trades, candles.length);

  // Aggregate regime stats
  const regimeStatMap: Record<string, RegimeStats> = {};
  const allRegimes: RegimeType[] = ['TREND_UP', 'TREND_DOWN', 'RANGE', 'HIGH_VOL', 'LOW_VOL', 'SHOCK', 'UNKNOWN'];
  for (const r of allRegimes) {
    regimeStatMap[r] = {
      regime: r,
      candleCount: regimeCounts[r] || 0,
      pctOfTime: ((regimeCounts[r] || 0) / candles.length) * 100,
      rsiSignals: 0,
      longEntries: 0,
      shortEntries: 0,
      longWins: 0,
      longLosses: 0,
      shortWins: 0,
      shortLosses: 0,
      avgHoldHours: 0,
      avgPnlPerTrade: 0,
    };
  }

  for (const t of trades) {
    const stats = regimeStatMap[t.entryRegime];
    if (!stats) continue;
    if (t.side === 'buy') {
      stats.longEntries++;
      if (t.pnl > 0) stats.longWins++;
      else stats.longLosses++;
    } else {
      stats.shortEntries++;
      if (t.pnl > 0) stats.shortWins++;
      else stats.shortLosses++;
    }
  }

  // Fill signal counts from our per-candle scan
  for (const [regime, count] of Object.entries(regimeSignalCounts)) {
    if (regimeStatMap[regime]) regimeStatMap[regime].rsiSignals = count;
  }

  // Compute avg hold hours and avg pnl per regime
  const regimeTrades: Record<string, { holds: number[]; pnls: number[] }> = {};
  for (const t of trades) {
    if (!regimeTrades[t.entryRegime]) regimeTrades[t.entryRegime] = { holds: [], pnls: [] };
    regimeTrades[t.entryRegime].holds.push(t.holdingMinutes / 60);
    regimeTrades[t.entryRegime].pnls.push(t.pnl);
  }
  for (const [regime, data] of Object.entries(regimeTrades)) {
    const stats = regimeStatMap[regime];
    if (!stats) continue;
    stats.avgHoldHours = data.holds.reduce((a, b) => a + b, 0) / data.holds.length;
    stats.avgPnlPerTrade = data.pnls.reduce((a, b) => a + b, 0) / data.pnls.length;
  }

  const statsArray = allRegimes.map(r => regimeStatMap[r]).filter(s => s.candleCount > 0);
  printRegimeSummary(statsArray);

  // Overall summary
  const totalTrades = trades.length;
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);

  console.log('\n' + '='.repeat(80));
  console.log('  OVERALL RSI STRATEGY SUMMARY');
  console.log('='.repeat(80));
  console.log(`  Total candles:      ${candles.length}`);
  console.log(`  Date range:         ${new Date(candles[0].timestamp).toISOString().slice(0, 10)} to ${new Date(candles[candles.length - 1].timestamp).toISOString().slice(0, 10)}`);
  console.log(`  Total trades:       ${totalTrades}`);
  console.log(`  Wins:               ${wins.length} (${totalTrades > 0 ? ((wins.length / totalTrades) * 100).toFixed(1) : 0}%)`);
  console.log(`  Losses:             ${losses.length} (${totalTrades > 0 ? ((losses.length / totalTrades) * 100).toFixed(1) : 0}%)`);
  console.log(`  Net PnL:            $${totalPnl.toFixed(2)}`);
  console.log(`  Avg trade PnL:      $${totalTrades > 0 ? (totalPnl / totalTrades).toFixed(2) : '0.00'}`);
  if (wins.length > 0) {
    console.log(`  Avg win:            $${(wins.reduce((s, t) => s + t.pnl, 0) / wins.length).toFixed(2)}`);
  }
  if (losses.length > 0) {
    console.log(`  Avg loss:           $${(losses.reduce((s, t) => s + t.pnl, 0) / losses.length).toFixed(2)}`);
  }
  console.log('='.repeat(80));

  // Exit reason breakdown
  const exitReasons: Record<string, number> = {};
  for (const t of trades) exitReasons[t.exitReason] = (exitReasons[t.exitReason] || 0) + 1;
  console.log('\n  Exit Reason Breakdown:');
  for (const [reason, count] of Object.entries(exitReasons).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${reason.padEnd(18)} ${count} trades (${((count / totalTrades) * 100).toFixed(1)}%)`);
  }

  // Regime trade breakdown with win rates
  console.log('\n  Per-Regime Trade Results:');
  for (const s of statsArray) {
    const total = s.longWins + s.longLosses + s.shortWins + s.shortLosses;
    if (total === 0) continue;
    const winRate = ((s.longWins + s.shortWins) / total * 100).toFixed(1);
    const pnl = s.avgPnlPerTrade * total;
    console.log(
      `    ${s.regime.padEnd(13)} ` +
      `${String(total).padStart(3)} trades, ` +
      `win ${winRate}%, ` +
      `net $${pnl.toFixed(2)}, ` +
      `avg hold ${s.avgHoldHours.toFixed(1)}h`,
    );
  }
  console.log('');
}

main().catch(err => {
  console.error('SOL regime analysis failed:', err);
  process.exit(1);
});
