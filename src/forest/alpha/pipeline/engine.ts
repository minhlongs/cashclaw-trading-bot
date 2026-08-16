// Alpha Research Pipeline — Engine
// Top-level orchestrator running all steps sequentially with typed handoffs.

import type { Candle } from '@/forest/backtest/ohlcv';
import type { BacktestTrade, BacktestEquityPoint } from '@/forest/backtest/types';
import { RegimeLabel, type RegimeResult } from '@/tree/regime/types';
import type { AlphaSignal, FeatureVector } from '@/tree/alpha/types';
import type { ExtendedBacktestMetrics } from '@/forest/backtest/metrics-types';
import type { BaselineConfig } from '@/forest/alpha/baselines/types';
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
import { computeSharpe } from '@/forest/backtest/metrics';

const TOP_N = 10;

function elapsed(t0: number): number { return performance.now() - t0; }
function indicator(name: string, win: Candle[], p: number): number {
  if (win.length === 0) return 0;
  if (name === 'sma') return win.reduce((a, c) => a + c.close, 0) / win.length;
  if (name === 'rsi') {
    let g = 0, l = 0;
    for (let i = 1; i < win.length; i++) { const d = win[i].close - win[i - 1].close; if (d > 0) g += d; else l -= d; }
    const ag = g / (win.length - 1 || 1), al = l / (win.length - 1 || 1);
    return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  if (name === 'atr') { let s = 0; for (let i = 1; i < win.length; i++) { const h = win[i].high - win[i].low, pc = win[i - 1]; s += Math.max(h, Math.abs(win[i].high - pc.close), Math.abs(win[i].low - pc.close)); } return s / (win.length - 1 || 1); }
  return p;
}
function toTrades(signals: AlphaSignal[], candles: Candle[], lb: number): BacktestTrade[] {
  const trades: BacktestTrade[] = [];
  let pos = false, ep = 0, et = 0;
  const mkTrade = (c: Candle) => {
    const pnl = c.close - ep;
    return { entryTimestamp: et, exitTimestamp: c.timestamp, side: 'buy' as const, entryPrice: ep, exitPrice: c.close, quantity: 1, pnl, pnlPct: ep > 0 ? (pnl / ep) * 100 : 0, fee: 0, holdingMinutes: Math.max(0, Math.round((c.timestamp - et) / 60000)) };
  };
  for (let i = 0; i < signals.length; i++) {
    const s = signals[i], c = candles[i + lb];
    if (!c) continue;
    if (s.direction === 'buy' && !pos) { ep = c.close; et = c.timestamp; pos = true; }
    else if (s.direction === 'sell' && pos) { trades.push(mkTrade(c)); pos = false; }
  }
  if (pos) { const c = candles[candles.length - 1]; if (c) trades.push(mkTrade(c)); }
  return trades;
}
function equityCurve(candles: Candle[], signals: AlphaSignal[] | undefined, off: number): BacktestEquityPoint[] {
  let eq = 10000, peak = eq, pos = false, ep = 0;
  const pts: BacktestEquityPoint[] = [];
  for (let i = 0; i < candles.length; i++) {
    const s = (signals ?? [])[i - off];
    if (s?.direction === 'buy' && !pos) { ep = candles[i].close; pos = true; }
    else if (s?.direction === 'sell' && pos) { eq *= 1 + (candles[i].close - ep) / ep; pos = false; }
    if (eq > peak) peak = eq;
    pts.push({ timestamp: candles[i].timestamp, equity: eq, drawdownPct: peak > 0 ? ((peak - eq) / peak) * 100 : 0 });
  }
  return pts;
}

export class AlphaResearchPipeline {
  private cfg: PipelineConfig;
  private results: PipelineStepResult[] = [];
  private stopped = false;
  private map = new Map<string, unknown>();
  constructor(cfg: PipelineConfig) { this.cfg = cfg; }

  async run(): Promise<AlphaResearchReport> {
    const steps: PipelineStep[] = ['fetch_data', 'compute_indicators', 'detect_regimes', 'generate_signals', 'label_events', 'run_walkforward', 'compute_costs', 'evaluate', 'attribute', 'compare_baselines', 'generate_report'];
    for (const step of steps) {
      if (this.stopped) { this.results.push({ step, status: 'skipped', data: null, duration: 0 }); continue; }
      const t0 = performance.now();
      try {
        const data = this.doStep(step);
        this.map.set(step, data);
        this.results.push({ step, status: 'success', data, duration: elapsed(t0) });
        if (step === 'run_walkforward' && !(data as { passed: boolean }).passed) this.stopped = true;
      } catch (err: unknown) {
        const m = err instanceof Error ? err.message : String(err);
        this.results.push({ step, status: 'error', data: null, duration: elapsed(t0), error: m });
        if (step === 'run_walkforward') this.stopped = true;
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
          for (const n of names) { if (n !== 'lookback') f[n] = indicator(n, win, indicatorSet[n]); }
          features.push(f);
        }
        return { features, names } as IndicatorData;
      }
      case 'detect_regimes': {
        const cls = new RuleBasedRegimeClassifier();
        const regimes: RegimeResult[] = [];
        const lb = regimeConfig.lookback;
        const rc = { minCandles: regimeConfig.minCandles ?? 10, confidenceThreshold: regimeConfig.confidenceThreshold ?? 0.6, lookback: lb, minDuration: regimeConfig.minDuration ?? 3 };
        for (let i = lb; i < candles.length; i++) {
          const rf = extractRegimeFeatures(candles.slice(i - lb, i + 1), rc);
          if (rf) regimes.push(cls.classify(rf, rc));
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
          if (rsi < 30 && regime === 'TREND_UP') { name = 'rsi_regime_buy'; dir = 'buy'; conf = (30 - rsi) / 30; }
          else if (rsi > 70 && regime === 'TREND_DOWN') { name = 'rsi_regime_sell'; dir = 'sell'; conf = (rsi - 70) / 30; }
          else { name = 'hold'; dir = 'hold'; }
          signals.push({ name, direction: dir, confidence: conf, features: fv, source: 'indicator', timestamp: ts, metadata: {} });
        }
        return { signals } as SignalData;
      }
      case 'label_events': return { labels: ((this.map.get('generate_signals') as SignalData | undefined)?.signals ?? []).map(s => s.direction === 'buy' ? 'buy' : s.direction === 'sell' ? 'sell' : 'hold') } as EventData;
      case 'run_walkforward': {
        const total = walkforwardConfig.trainBars + walkforwardConfig.validateBars + walkforwardConfig.testBars;
        if (candles.length < total) throw new Error(`Not enough candles: ${candles.length} < ${total}`);
        const sd = this.map.get('generate_signals') as SignalData | undefined;
        const tc = (sd?.signals ?? []).filter(s => s.direction !== 'hold').length;
        const eq = equityCurve(candles.slice(0, total), sd?.signals, regimeConfig.lookback);
        const sp = computeSharpe(eq);
        return { sharpe: sp, totalTrades: tc, passed: sp >= minSharpe && tc >= minTrades } as WalkforwardData;
      }
      case 'compute_costs': {
        const ev = this.map.get('evaluate') as EvalData | undefined;
        return { grossPnl: ev?.report?.netPnl ?? 0, netPnl: ev?.report?.netPnl ?? 0, fees: ev?.report?.fees ?? 0 } as CostData;
      }
      case 'evaluate': {
        const sd = this.map.get('generate_signals') as SignalData | undefined;
        const rd = this.map.get('detect_regimes') as RegimeData | undefined;
        const trades = toTrades(sd?.signals ?? [], candles, regimeConfig.lookback);
        const tp = trades.reduce((s, t) => s + t.pnl, 0), wc = trades.filter(t => t.pnl > 0).length;
        const m: ExtendedBacktestMetrics = { id: '', bot_id: '', strategy: 'alpha-research', pair: this.cfg.symbol, exchange: '', start_date: 0, end_date: Date.now(), total_trades: trades.length, win_count: wc, loss_count: trades.length - wc, win_rate: trades.length ? wc / trades.length : 0, total_pnl: tp, max_drawdown: 0, sharpe_ratio: null, params_json: '{}', equity_curve_json: [], trades_json: trades, created_at: Date.now(), profit_factor: 0, expectancy: 0, sortino_ratio: null, max_drawdown_duration: 0, calmar_ratio: 0, avg_trade: 0, median_trade: 0, turnover: 0, recovery_factor: 0, exposure_pct: 0 };
        return { report: generateReport({ experimentId: `pipeline-${this.cfg.symbol}-${this.cfg.timeframe}`, symbol: this.cfg.symbol, timeframe: this.cfg.timeframe, regime: rd?.regimes[0]?.label ?? RegimeLabel.UNKNOWN, metrics: m }, candles) } as EvalData;
      }
      case 'attribute': {
        const sd = this.map.get('generate_signals') as SignalData | undefined;
        const rd = this.map.get('detect_regimes') as RegimeData | undefined;
        const trades = toTrades(sd?.signals ?? [], candles, regimeConfig.lookback);
        const obs = (rd?.regimes ?? []).map(r => ({ timestamp: r.timestamp, label: r.label }));
        return { attributions: attributePerformance(trades, sd?.signals ?? [], obs) } as AttributeData;
      }
      case 'compare_baselines': {
        if (!baselinesEnabled) return { baselines: [], reports: {} } as BaselineData;
        const sm = costMode as BaselineConfig['stressMode'];
        const cfgs: BaselineConfig[] = (['buy_hold', 'simple_momentum'] as const).map(s => ({ strategy: s, symbol: this.cfg.symbol, timeframe: this.cfg.timeframe, stressMode: sm, feePct: 0.001, slipPct: 0.0005 }));
        const empty: ExtendedBacktestMetrics = { id: '', bot_id: '', strategy: 'baseline', pair: this.cfg.symbol, exchange: '', start_date: 0, end_date: Date.now(), total_trades: 0, win_count: 0, loss_count: 0, win_rate: 0, total_pnl: 0, max_drawdown: 0, sharpe_ratio: null, params_json: '{}', equity_curve_json: [], trades_json: [], created_at: Date.now(), profit_factor: 0, expectancy: 0, sortino_ratio: null, max_drawdown_duration: 0, calmar_ratio: 0, avg_trade: 0, median_trade: 0, turnover: 0, recovery_factor: 0, exposure_pct: 0 };
        const reports: Record<string, EvaluationReport> = {};
        for (const c of cfgs) reports[c.strategy] = generateReport({ experimentId: `baseline-${c.strategy}-${this.cfg.symbol}`, symbol: this.cfg.symbol, timeframe: this.cfg.timeframe, regime: RegimeLabel.UNKNOWN, metrics: empty }, candles);
        return { baselines: cfgs, reports } as BaselineData;
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
      regimeBreakdown: rg?.status === 'success' ? rg.data as AlphaResearchReport['regimeBreakdown'] : {} as AlphaResearchReport['regimeBreakdown'],
      topFeatures: attributions.slice(0, TOP_N).map(a => ({ name: a.alphaId, importance: a.totalContribution })),
      recommendation: sp >= this.cfg.minSharpe * 1.5 ? 'deploy' : sp >= this.cfg.minSharpe ? 'refine' : 'discard',
      report: ev?.status === 'success' ? ev.data as AlphaResearchReport['report'] : null,
    };
  }
}