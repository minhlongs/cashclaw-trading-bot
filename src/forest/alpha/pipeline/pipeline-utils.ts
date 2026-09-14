// Alpha Research Pipeline — Utilities & Trade Extraction
// Shared helpers for timeframe parsing, equity curve calculation, and report extraction.

import type { Candle } from '@/forest/backtest/ohlcv';
import type { BacktestTrade, BacktestEquityPoint } from '@/forest/backtest/types';
import type { AlphaSignal } from '@/tree/alpha/types';
import { RegimeLabel } from '@/tree/regime/types';
import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import { computeSharpe } from '@/forest/backtest/metrics';
import { applyCosts } from '@/forest/backtest/cost-model';
import type { PipelineStepResult, RegimeData } from './types';

export const TOP_N = 10;

export function elapsed(t0: number): number {
  return performance.now() - t0;
}

/** Parse timeframe like '1h', '15m', '4h', '1d' into minutes. Defaults to 60. */
export function parseCandleIntervalMinutes(timeframe: string): number {
  const m = timeframe.match(/^(\d+)([mhd])$/);
  if (!m) return 60;
  const n = Number(m[1]);
  const unit = m[2];
  if (unit === 'm') return n;
  if (unit === 'h') return n * 60;
  // The regex guarantees unit ∈ {m, h, d}, so the trailing `return 60` is
  // unreachable — `d` is the last reachable case.
  if (unit === 'd') return n * 1440;
  return 60;
}

// ── Trade Extraction ──────────────────────────────────────────────────────────

export function extractTrades(
  signals: AlphaSignal[],
  candles: Candle[],
  offset: number,
  costCfg?: { feePct: number; slipPct: number; marketImpactPct: number },
): BacktestTrade[] {
  const trades: BacktestTrade[] = [];
  let pos = false;
  let ep = 0;
  let et = 0;
  const mkTrade = (c: Candle) => {
    const grossPnl = c.close - ep;
    const notional = Math.abs(ep);
    const cost = costCfg
      ? applyCosts(grossPnl, notional, costCfg)
      : { netPnl: grossPnl, fees: 0, slippage: 0, marketImpact: 0 };
    return {
      entryTimestamp: et,
      exitTimestamp: c.timestamp,
      side: 'buy' as const,
      entryPrice: ep,
      exitPrice: c.close,
      quantity: 1,
      pnl: cost.netPnl,
      pnlPct: ep > 0 ? (cost.netPnl / ep) * 100 : 0, // guard against ep === 0
      fee: cost.fees + cost.slippage + cost.marketImpact,
      holdingMinutes: Math.max(0, Math.round((c.timestamp - et) / 60000)),
    };
  };
  for (let i = 0; i < signals.length; i++) {
    const s = signals[i];
    const c = candles[i + offset];
    if (!c) continue;
    if (s.direction === 'buy' && !pos) {
      ep = c.close;
      et = c.timestamp;
      pos = true;
    } else if (s.direction === 'sell' && pos) {
      trades.push(mkTrade(c));
      pos = false;
    }
  }
  if (pos) {
    const c = candles[candles.length - 1];
    if (c) trades.push(mkTrade(c));
  }
  return trades;
}

export function computeEquityAndSharpe(
  trades: BacktestTrade[],
  timeframe: string,
): { equityCurve: BacktestEquityPoint[]; sharpe: number; maxDrawdownPct: number } {
  const equityCurve: BacktestEquityPoint[] = [];
  let equity = 10000;
  let peak = equity;
  let maxDrawdownPct = 0;
  for (const t of trades) {
    equity += t.pnl;
    peak = Math.max(peak, equity);
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > maxDrawdownPct) maxDrawdownPct = dd;
    equityCurve.push({ timestamp: t.exitTimestamp, equity, drawdownPct: dd });
  }
  const intervalMin = parseCandleIntervalMinutes(timeframe);
  const sharpe = equityCurve.length >= 2 ? computeSharpe(equityCurve, intervalMin) : 0;
  return { equityCurve, sharpe, maxDrawdownPct };
}

export function extractEvalReport(ev: PipelineStepResult | undefined): EvaluationReport | null {
  if (ev?.status !== 'success' || !ev.data) return null;
  const raw = ev.data;
  if (typeof raw === 'object' && 'report' in raw) {
    return (raw as { report: EvaluationReport }).report;
  }
  return raw as EvaluationReport;
}

export function extractRegimeBreakdown(
  rg: PipelineStepResult | undefined,
): Record<RegimeLabel, { trades: number; winRate: number }> {
  if (rg?.status !== 'success' || !rg.data) {
    return {} as Record<RegimeLabel, { trades: number; winRate: number }>;
  }
  return (rg.data as RegimeData).regimes.reduce((acc, r) => {
    acc[r.label] = { trades: 0, winRate: 0 };
    return acc;
  }, {} as Record<RegimeLabel, { trades: number; winRate: number }>);
}

export function extractSharpe(wf: PipelineStepResult | undefined): number {
  if (wf?.data && typeof wf.data === 'object' && 'sharpe' in wf.data) {
    return (wf.data as { sharpe: number }).sharpe;
  }
  return 0;
}
