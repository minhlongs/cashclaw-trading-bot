// Alpha Research Pipeline — Quantitative Evaluation & Survival Gates
// Steps: run_walkforward, evaluate, compute_costs, attribute, compare_baselines, generate_report

import { RegimeLabel } from '@/tree/regime/types';
import type { ExtendedBacktestMetrics } from '@/forest/backtest/metrics-types';
import type { BaselineConfig, BaselineStrategy } from '@/forest/alpha/baselines/types';
import { runSurvivalGate } from '@/forest/alpha/gate/survival-gate';
import {
  transitionStrategy,
  gateResultToTrigger,
  canTransition,
} from '@/forest/alpha/gate/promotion-states';
import { attributePerformance } from '@/forest/alpha/attribution/analyzer';
import { generateReport, type EvaluationReport } from '@/forest/alpha/evaluation/report';
import { resolveStressConfig, type StressMode } from '@/forest/backtest/cost-model';
import { runBaseline } from '@/forest/alpha/baselines';
import type {
  PipelineConfig,
  SignalData,
  RegimeData,
  WalkforwardData,
  EvalData,
  CostData,
  AttributeData,
  BaselineData,
  ReportData,
} from './types';
import { extractTrades, computeEquityAndSharpe } from './pipeline-utils';

export function stepRunWalkforward(
  cfg: PipelineConfig,
  map: Map<string, unknown>,
): WalkforwardData {
  const { candles, regimeConfig, walkforwardConfig, costMode, minSharpe, minTrades } = cfg;
  const sd = map.get('generate_signals') as SignalData | undefined;
  if (!sd) throw new Error('No signals for walkforward');

  const trainBars = walkforwardConfig.trainBars ?? 20;
  const testBars = walkforwardConfig.testBars ?? 10;
  const total = trainBars + testBars * 3;
  if (candles.length < total) throw new Error(`Not enough candles: ${candles.length} < ${total}`);

  const off = regimeConfig.lookback;
  const costCfgWf = resolveStressConfig(costMode as StressMode);
  const trades = extractTrades(sd.signals, candles.slice(0, total), off, {
    ...costCfgWf,
    marketImpactPct: 0,
  });
  const tc = trades.length;

  const { sharpe } = computeEquityAndSharpe(trades, cfg.timeframe);
  return { sharpe, totalTrades: tc, passed: sharpe >= minSharpe && tc >= minTrades };
}

export function stepEvaluate(cfg: PipelineConfig, map: Map<string, unknown>): EvalData {
  const { candles, regimeConfig, costMode } = cfg;
  const sd = map.get('generate_signals') as SignalData | undefined;
  const rd = map.get('detect_regimes') as RegimeData | undefined;
  const off = regimeConfig.lookback;
  const costCfg = resolveStressConfig(costMode as StressMode);
  const trades = extractTrades(sd?.signals ?? [], candles, off, {
    ...costCfg,
    marketImpactPct: 0,
  });
  const tp = trades.reduce((s, t) => s + t.pnl, 0);
  const wc = trades.filter(t => t.pnl > 0).length;
  const grossWin = trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
  const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? grossWin : 0;
  const exp = trades.length > 0 ? tp / trades.length : 0;

  const { equityCurve, sharpe, maxDrawdownPct } = computeEquityAndSharpe(trades, cfg.timeframe);

  const m: ExtendedBacktestMetrics = {
    id: '',
    bot_id: '',
    strategy: 'alpha-research',
    pair: cfg.symbol,
    exchange: '',
    start_date: 0,
    end_date: Date.now(),
    total_trades: trades.length,
    win_count: wc,
    loss_count: trades.length - wc,
    win_rate: trades.length ? wc / trades.length : 0,
    total_pnl: tp,
    max_drawdown: maxDrawdownPct / 100,
    sharpe_ratio: sharpe,
    params_json: '{}',
    equity_curve_json: equityCurve,
    trades_json: trades,
    created_at: Date.now(),
    profit_factor: pf,
    expectancy: exp,
    sortino_ratio: null,
    max_drawdown_duration: 0,
    calmar_ratio: 0,
    avg_trade: trades.length ? tp / trades.length : 0,
    median_trade: 0,
    turnover: 0,
    recovery_factor: 0,
    exposure_pct: 0,
  };

  const totalFees = trades.reduce((s, t) => s + t.fee, 0);
  const costBreakdown = { fees: totalFees, slippage: 0, marketImpact: 0 };
  const regimeLabel = rd?.regimes[0]?.label ?? RegimeLabel.UNKNOWN;
  return {
    report: generateReport(
      {
        experimentId: `pipeline-${cfg.symbol}-${cfg.timeframe}`,
        symbol: cfg.symbol,
        timeframe: cfg.timeframe,
        regime: regimeLabel,
        metrics: m,
        costBreakdown,
      },
      candles,
    ),
  };
}

export function stepComputeCosts(map: Map<string, unknown>): CostData {
  const ev = map.get('evaluate') as EvalData | undefined;
  const report = ev?.report;
  const fees = report?.fees ?? 0;
  const slippage = report?.slippage ?? 0;
  const grossPnl = (report?.netPnl ?? 0) + fees + slippage;
  return {
    grossPnl,
    netPnl: report?.netPnl ?? 0,
    fees,
    slippage,
  };
}

export function stepAttribute(cfg: PipelineConfig, map: Map<string, unknown>): AttributeData {
  const { candles, regimeConfig } = cfg;
  const sd = map.get('generate_signals') as SignalData | undefined;
  const rd = map.get('detect_regimes') as RegimeData | undefined;
  const trades = extractTrades(sd?.signals ?? [], candles, regimeConfig.lookback);
  const obs = (rd?.regimes ?? []).map(r => ({ timestamp: r.timestamp, label: r.label }));
  return { attributions: attributePerformance(trades, sd?.signals ?? [], obs) };
}

export function stepCompareBaselines(cfg: PipelineConfig): BaselineData {
  if (!cfg.baselinesEnabled) return { baselines: [], reports: {} };
  const sm = cfg.costMode as StressMode;
  const baselineStrategies: BaselineStrategy[] = ['buy_hold', 'simple_momentum'];
  const configs: BaselineConfig[] = baselineStrategies.map(s => ({
    strategy: s,
    symbol: cfg.symbol,
    timeframe: cfg.timeframe,
    stressMode: sm,
    feePct: 0.001,
    slipPct: 0.0005,
  }));
  const reports: Record<string, EvaluationReport> = {};
  for (const c of configs) {
    reports[c.strategy] = runBaseline(cfg.candles, c);
  }
  return { baselines: configs, reports };
}

export function stepGenerateReport(cfg: PipelineConfig, map: Map<string, unknown>): ReportData {
  const ev = map.get('evaluate') as EvalData | undefined;
  const evalReport = ev?.report ?? null;
  if (!evalReport) {
    return { survivalGate: null, promotion: null };
  }
  const survivalGate = runSurvivalGate(evalReport, cfg.survivalGateConfig);
  const initialPhase = cfg.initialStrategyPhase ?? 'RESEARCH';
  const trigger = gateResultToTrigger(survivalGate.status);
  const promotion = canTransition(initialPhase, trigger)
    ? transitionStrategy(initialPhase, trigger)
    : null;
  return { survivalGate, promotion };
}
