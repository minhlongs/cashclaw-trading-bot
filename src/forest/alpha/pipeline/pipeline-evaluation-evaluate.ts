import { RegimeLabel } from '@/tree/regime/types';
import type { ExtendedBacktestMetrics } from '@/forest/backtest/metrics-types';
import type { PipelineConfig, SignalData, RegimeData, EvalData } from './types';
import { generateReport } from '@/forest/alpha/evaluation/report';
import { resolveStressConfig, type StressMode } from '@/forest/backtest/cost-model';
import { extractTrades, computeEquityAndSharpe } from './pipeline-utils';

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
