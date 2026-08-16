// Alpha Research Pipeline — Engine
// Top-level orchestrator running all steps sequentially with typed handoffs.

import type { Candle } from '@/forest/backtest/ohlcv';
import type { BacktestTrade, BacktestEquityPoint } from '@/forest/backtest/types';
import { RegimeLabel, type RegimeResult } from '@/tree/regime/types';
import type { AlphaSignal, FeatureVector } from '@/tree/alpha/types';
import type { ExtendedBacktestMetrics } from '@/forest/backtest/metrics-types';
import type { BaselineConfig, BaselineStrategy } from '@/forest/alpha/baselines/types';
import type {
  PipelineConfig, PipelineStep, PipelineStepResult,
  AlphaResearchReport, IndicatorData, RegimeData,
  SignalData, EventData, WalkforwardData,
  CostData, EvalData, AttributeData, BaselineData,
} from './types';
import { extractRegimeFeatures } from '@/tree/regime/features';
import { RuleBasedRegimeClassifier } from '@/tree/regime/classifier';
import { attributePerformance } from '@/forest/alpha/attribution/analyzer';
import { generateReport, type EvaluationReport } from '@/forest/alpha/evaluation/report';
import { indicators } from '@/tree/alpha/indicators';
import { computeSharpe } from '@/forest/backtest/metrics';
import { applyCosts, resolveStressConfig, type StressMode } from '@/forest/backtest/cost-model';
import { runBaseline } from '@/forest/alpha/baselines';

const TOP_N = 10;

function elapsed(t0: number): number { return performance.now() - t0; }

// ── Trade Extraction ──────────────────────────────────────────────────────────

function extractTrades(
  signals: AlphaSignal[],
  candles: Candle[],
  offset: number,
  costCfg?: { feePct: number; slipPct: number; marketImpactPct: number },
): BacktestTrade[] {
  const trades: BacktestTrade[] = [];
  let pos = false, ep = 0, et = 0;
  const mkTrade = (c: Candle) => {
    const grossPnl = c.close - ep;
    const notional = Math.abs(ep);
    const cost = costCfg
      ? applyCosts(grossPnl, notional, { ...costCfg, stressMode: 'normal' })
      : { netPnl: grossPnl, fees: 0, slippage: 0, marketImpact: 0 };
    return {
      entryTimestamp: et, exitTimestamp: c.timestamp, side: 'buy' as const,
      entryPrice: ep, exitPrice: c.close, quantity: 1,
      pnl: cost.netPnl, pnlPct: ep > 0 ? (cost.netPnl / ep) * 100 : 0,
      fee: cost.fees + cost.slippage + cost.marketImpact,
      holdingMinutes: Math.max(0, Math.round((c.timestamp - et) / 60000)),
    };
  };
  for (let i = 0; i < signals.length; i++) {
    const s = signals[i], c = candles[i + offset];
    if (!c) continue;
    if (s.direction === 'buy' && !pos) { ep = c.close; et = c.timestamp; pos = true; }
    else if (s.direction === 'sell' && pos) { trades.push(mkTrade(c)); pos = false; }
  }
  if (pos) { const c = candles[candles.length - 1]; if (c) trades.push(mkTrade(c)); }
  return trades;
}

// ── Main Pipeline ─────────────────────────────────────────────────────────────

export class AlphaResearchPipeline {
  private results: PipelineStepResult[] = [];
  private map = new Map<string, unknown>();
  private stopped = false;

  constructor(private cfg: PipelineConfig) {}

  async run(): Promise<AlphaResearchReport> {
    this.results = [];
    this.map = new Map();
    this.stopped = false;

    // evaluate must come before compute_costs so cost step can read eval results
    const steps: PipelineStep[] = [
      'fetch_data', 'compute_indicators', 'detect_regimes',
      'generate_signals', 'label_events', 'run_walkforward',
      'evaluate', 'compute_costs', 'attribute', 'compare_baselines', 'generate_report',
    ];

    for (const step of steps) {
      if (this.stopped) { this.results.push({ step, status: 'skipped', data: null, duration: 0 }); continue; }
      const t0 = performance.now();
      try {
        const data = this.doStep(step);
        this.map.set(step, data);
        this.results.push({ step, status: 'success', data, duration: elapsed(t0) });
        if (step === 'run_walkforward' && !(data as { passed: boolean }).passed) this.stopped = true;
      } catch (err: unknown) {
        if (step === 'run_walkforward') this.stopped = true;
        const m = err instanceof Error ? err.message : String(err);
        this.results.push({ step, status: 'error', data: null, duration: elapsed(t0), error: m });
      }
    }
    return this.report();
  }

  getResults(): PipelineStepResult[] { return [...this.results]; }

  private doStep(step: PipelineStep): unknown {
    const { candles, indicatorSet, regimeConfig, walkforwardConfig, costMode, minSharpe, minTrades, baselinesEnabled } = this.cfg;
    switch (step) {
      case 'fetch_data':
        if (candles.length === 0) throw new Error('No candles');
        return candles;

      case 'compute_indicators': {
        const names = Object.keys(indicatorSet);
        const features: Record<string, number>[] = [];
        for (let i = 0; i < candles.length; i++) {
          const win = candles.slice(Math.max(0, i - (indicatorSet.lookback ?? 20) + 1), i + 1);
          const f: Record<string, number> = {};
          for (const n of names) {
            if (n === 'lookback') continue;
            const fn = indicators[n];
            if (fn) {
              const result = fn(win, 20, '1h');
              const v = typeof result.value === 'number' ? result.value : 0;
              f[n] = v;
            }
          }
          features.push(f);
        }
        return { features, names } as IndicatorData;
      }

      case 'detect_regimes': {
        const classifier = new RuleBasedRegimeClassifier();
        const regimes: RegimeResult[] = [];
        for (let i = 0; i < candles.length; i++) {
          const window = candles.slice(Math.max(0, i - 50), i + 1);
          if (window.length < 2) continue;
          const features = extractRegimeFeatures(window, regimeConfig);
          if (!features) continue;
          const result = classifier.classify(features, regimeConfig);
          regimes.push(result);
        }
        return { regimes, history: regimes } as RegimeData;
      }

      case 'generate_signals': {
        const rd = this.map.get('detect_regimes') as { regimes: RegimeResult[] } | undefined;
        const id = this.map.get('compute_indicators') as IndicatorData | undefined;
        const signals: AlphaSignal[] = [];
        const off = regimeConfig.lookback, lb = indicatorSet['lookback'] ?? 20;
        for (let i = 0; rd && id && i < rd.regimes.length; i++) {
          const idx = i + off, f = id.features[idx];
          if (!f) continue;
          const rsi = f['rsi'] ?? 50, regime = rd.regimes[i].label, ts = candles[idx].timestamp;
          const fv: FeatureVector = { features: Object.entries(f).map(([id2, v]) => ({ id: id2, value: v, causal: false })), computedAt: ts, symbol: this.cfg.symbol, lookback: lb };
          let name: string, dir: AlphaSignal['direction'], conf = 0;
          if (rsi < 30 && regime === RegimeLabel.TREND_UP) { name = 'rsi_regime_buy'; dir = 'buy'; conf = (30 - rsi) / 30; }
          else if (rsi > 70 && regime === RegimeLabel.TREND_DOWN) { name = 'rsi_regime_sell'; dir = 'sell'; conf = (rsi - 70) / 30; }
          else { name = 'hold'; dir = 'hold'; }
          signals.push({ name, direction: dir, confidence: conf, features: fv, source: 'indicator', timestamp: ts, metadata: {} });
        }
        return { signals } as SignalData;
      }

      case 'label_events': {
        const sd = this.map.get('generate_signals') as SignalData | undefined;
        return { labels: (sd?.signals ?? []).map(s => s.direction) } as EventData;
      }

      case 'run_walkforward': {
        const sd = this.map.get('generate_signals') as SignalData | undefined;
        if (!sd) throw new Error('No signals for walkforward');
        const trainBars = walkforwardConfig.trainBars ?? 20;
        const testBars = walkforwardConfig.testBars ?? 10;
        const stepBars = walkforwardConfig.stepBars ?? 10;
        const total = trainBars + testBars * 3;
        if (candles.length < total) throw new Error(`Not enough candles: ${candles.length} < ${total}`);
        const _ = { trainBars, testBars, stepBars };

        // Extract trades for walkforward using canonical extractTrades
        const off = regimeConfig.lookback;
        const costCfgWf = resolveStressConfig(costMode as StressMode);
        const trades = extractTrades(sd.signals, candles.slice(0, total), off, { ...costCfgWf, marketImpactPct: 0 });
        const tc = trades.length;
        const tp = trades.reduce((s, t) => s + t.pnl, 0);
        const wc = trades.filter(t => t.pnl > 0).length;
        const m: ExtendedBacktestMetrics = {
          id: '', bot_id: '', strategy: 'alpha-research', pair: this.cfg.symbol, exchange: '',
          start_date: 0, end_date: Date.now(),
          total_trades: trades.length, win_count: wc, loss_count: trades.length - wc,
          win_rate: trades.length ? wc / trades.length : 0, total_pnl: tp, max_drawdown: 0,
          sharpe_ratio: null, params_json: '{}', equity_curve_json: [], trades_json: trades,
          created_at: Date.now(), profit_factor: 0, expectancy: 0, sortino_ratio: null,
          max_drawdown_duration: 0, calmar_ratio: 0, avg_trade: 0, median_trade: 0,
          turnover: 0, recovery_factor: 0, exposure_pct: 0,
        };

        // Compute equity curve from trades for Sharpe
        const eq: BacktestEquityPoint[] = [];
        let equity = 10000, peak = equity;
        for (const t of trades) {
          equity += t.pnl;
          peak = Math.max(peak, equity);
          const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
          eq.push({ timestamp: t.exitTimestamp, equity, drawdownPct: dd });
        }
        const sp = eq.length >= 2 ? computeSharpe(eq) : 0;
        return { sharpe: sp, totalTrades: tc, passed: sp >= minSharpe && tc >= minTrades } as WalkforwardData;
      }

      case 'evaluate': {
        const sd = this.map.get('generate_signals') as SignalData | undefined;
        const rd = this.map.get('detect_regimes') as RegimeData | undefined;
        const off = regimeConfig.lookback;
        const costCfg = resolveStressConfig(costMode as StressMode);
        const trades = extractTrades(sd?.signals ?? [], candles, off, { ...costCfg, marketImpactPct: 0 });
        const tp = trades.reduce((s, t) => s + t.pnl, 0);
        const wc = trades.filter(t => t.pnl > 0).length;
        const m: ExtendedBacktestMetrics = {
          id: '', bot_id: '', strategy: 'alpha-research', pair: this.cfg.symbol, exchange: '',
          start_date: 0, end_date: Date.now(),
          total_trades: trades.length, win_count: wc, loss_count: trades.length - wc,
          win_rate: trades.length ? wc / trades.length : 0, total_pnl: tp, max_drawdown: 0,
          sharpe_ratio: null, params_json: '{}', equity_curve_json: [], trades_json: trades,
          created_at: Date.now(), profit_factor: 0, expectancy: 0, sortino_ratio: null,
          max_drawdown_duration: 0, calmar_ratio: 0, avg_trade: 0, median_trade: 0,
          turnover: 0, recovery_factor: 0, exposure_pct: 0,
        };
        const regimeLabel = rd?.regimes[0]?.label ?? RegimeLabel.UNKNOWN;
        return { report: generateReport({ experimentId: `pipeline-${this.cfg.symbol}-${this.cfg.timeframe}`, symbol: this.cfg.symbol, timeframe: this.cfg.timeframe, regime: regimeLabel, metrics: m }, candles) } as EvalData;
      }

      case 'compute_costs': {
        const ev = this.map.get('evaluate') as EvalData | undefined;
        const report = ev?.report;
        return {
          grossPnl: report?.netPnl ?? 0,
          netPnl: report?.netPnl ?? 0,
          fees: report?.fees ?? 0,
        } as CostData;
      }

      case 'attribute': {
        const sd = this.map.get('generate_signals') as SignalData | undefined;
        const rd = this.map.get('detect_regimes') as RegimeData | undefined;
        const trades = extractTrades(sd?.signals ?? [], candles, regimeConfig.lookback);
        const obs = (rd?.regimes ?? []).map(r => ({ timestamp: r.timestamp, label: r.label }));
        return { attributions: attributePerformance(trades, sd?.signals ?? [], obs) } as AttributeData;
      }

      case 'compare_baselines': {
        if (!baselinesEnabled) return { baselines: [], reports: {} } as BaselineData;
        const sm = costMode as StressMode;
        const baselineStrategies: BaselineStrategy[] = ['buy_hold', 'simple_momentum'];
        const configs: BaselineConfig[] = baselineStrategies.map(s => ({
          strategy: s, symbol: this.cfg.symbol, timeframe: this.cfg.timeframe,
          stressMode: sm, feePct: 0.001, slipPct: 0.0005,
        }));
        const reports: Record<string, EvaluationReport> = {};
        for (const c of configs) {
          reports[c.strategy] = runBaseline(candles, c);
        }
        return { baselines: configs, reports } as BaselineData;
      }

      default: return null;
    }
  }

  private report(): AlphaResearchReport {
    const wf = this.results.find(r => r.step === 'run_walkforward');
    const ev = this.results.find(r => r.step === 'evaluate');
    const at = this.results.find(r => r.step === 'attribute');
    const rg = this.results.find(r => r.step === 'detect_regimes');
    const sp = wf?.data instanceof Object && wf.data && 'sharpe' in (wf.data as object) ? (wf.data as { sharpe: number }).sharpe : 0;
    const attributions = at?.status === 'success' ? (at.data as AttributeData).attributions : [];
    return {
      symbol: this.cfg.symbol, timeframe: this.cfg.timeframe,
      totalSteps: this.results.length, passedSteps: this.results.filter(r => r.status === 'success').length,
      finalSharpe: sp,
      regimeBreakdown: rg?.status === 'success' ? (rg.data as RegimeData)['regimes'].reduce((acc: Record<RegimeLabel, { trades: number; winRate: number }>, r) => { acc[r.label] = { trades: 0, winRate: 0 }; return acc; }, {} as Record<RegimeLabel, { trades: number; winRate: number }>) : {} as Record<RegimeLabel, { trades: number; winRate: number }>,
      topFeatures: attributions.slice(0, TOP_N).map(a => ({ name: a.alphaId, importance: a.totalContribution })),
      recommendation: sp >= this.cfg.minSharpe * 1.5 ? 'deploy' : sp >= this.cfg.minSharpe ? 'refine' : 'discard',
      report: ev?.status === 'success' ? ev.data as AlphaResearchReport['report'] : null,
    };
  }
}