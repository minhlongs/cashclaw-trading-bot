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
  CostData, EvalData, AttributeData, BaselineData, DerivativeData,
} from './types';
import { createLogger } from '@/lib/logger';
import { extractRegimeFeatures } from '@/tree/regime/features';
import {
  fetchFundingRate,
  fetchOpenInterestHistory,
  fetchLiquidations,
  fetchPremiumIndex,
  computeDerivativeFeatures,
  generateDerivativeSignals,
} from '@/tree/alpha/signals';
import { RuleBasedRegimeClassifier } from '@/tree/regime/classifier';
import { attributePerformance } from '@/forest/alpha/attribution/analyzer';
import { generateReport, type EvaluationReport } from '@/forest/alpha/evaluation/report';
import { indicators } from '@/tree/alpha/indicators';
import { computeSharpe } from '@/forest/backtest/metrics';
import { applyCosts, resolveStressConfig, type StressMode } from '@/forest/backtest/cost-model';
import { runBaseline } from '@/forest/alpha/baselines';

const TOP_N = 10;
const log = createLogger('pipeline');

function elapsed(t0: number): number { return performance.now() - t0; }

/** Parse timeframe like '1h', '15m', '4h', '1d' into minutes. Defaults to 60. */
function parseCandleIntervalMinutes(timeframe: string): number {
  const m = timeframe.match(/^(\d+)([mhd])$/);
  if (!m) return 60;
  const n = Number(m[1]);
  const unit = m[2];
  if (unit === 'm') return n;
  if (unit === 'h') return n * 60;
  if (unit === 'd') return n * 1440;
  return 60;
}

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
      ? applyCosts(grossPnl, notional, costCfg)
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
      'fetch_data', 'fetch_derivatives', 'compute_indicators', 'detect_regimes',
      'generate_signals', 'label_events', 'run_walkforward',
      'evaluate', 'compute_costs', 'attribute', 'compare_baselines', 'generate_report',
    ];

    for (const step of steps) {
      if (this.stopped) { this.results.push({ step, status: 'skipped', data: null, duration: 0 }); continue; }
      const t0 = performance.now();
      try {
        const data = await this.doStep(step);
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

  // ── Step dispatcher (complexity kept low) ─────────────────────────────────

  private async doStep(step: PipelineStep): Promise<unknown> {
    switch (step) {
      case 'fetch_data': return this.stepFetchData();
      case 'fetch_derivatives': return this.stepFetchDerivatives();
      case 'compute_indicators': return this.stepComputeIndicators();
      case 'detect_regimes': return this.stepDetectRegimes();
      case 'generate_signals': return this.stepGenerateSignals();
      case 'label_events': return this.stepLabelEvents();
      case 'run_walkforward': return this.stepRunWalkforward();
      case 'evaluate': return this.stepEvaluate();
      case 'compute_costs': return this.stepComputeCosts();
      case 'attribute': return this.stepAttribute();
      case 'compare_baselines': return this.stepCompareBaselines();
      default: return null;
    }
  }

  // ── Individual step implementations ───────────────────────────────────────

  private stepFetchData(): Candle[] {
    if (this.cfg.candles.length === 0) throw new Error('No candles');
    return this.cfg.candles;
  }

  private async stepFetchDerivatives(): Promise<DerivativeData> {
    if (this.cfg.derivatives) return this.cfg.derivatives;
    const symbol = this.cfg.symbol;
    const { candles } = this.cfg;
    const t0 = candles[0]?.timestamp ?? 0;
    const t1 = candles[candles.length - 1]?.timestamp ?? Date.now();
    const empty: DerivativeData = { features: [], signals: [] };
    try {
      const fetchWithLog = async <T>(label: string, p: Promise<T>): Promise<T> => {
        try { return await p; }
        catch (err) { log.warn(`derivative source '${label}' failed`, { action: 'fetchDerivatives', error: err instanceof Error ? err.message : String(err) }); return [] as unknown as T; }
      };
      const [funding, oi, liquidations, premium] = await Promise.all([
        fetchWithLog('funding', fetchFundingRate(symbol, t0, t1)),
        fetchWithLog('oi', fetchOpenInterestHistory(symbol, '1h', t0, t1)),
        fetchWithLog('liquidations', fetchLiquidations(symbol, t0)),
        fetchWithLog('premiumIndex', fetchPremiumIndex(symbol, t0, t1)),
      ]);
      const features = computeDerivativeFeatures(candles, funding, oi, liquidations, premium);
      const signals = generateDerivativeSignals(candles, features, symbol);
      return { features, signals } as DerivativeData;
    } catch (err) {
      log.warn('fetch_derivatives failed entirely', { action: 'fetchDerivatives', error: err instanceof Error ? err.message : String(err) });
      return empty;
    }
  }

  private stepComputeIndicators(): IndicatorData {
    const { candles, indicatorSet } = this.cfg;
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
    return { features, names };
  }

  private stepDetectRegimes(): RegimeData {
    const { candles, regimeConfig } = this.cfg;
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
    return { regimes, history: regimes };
  }

  private stepGenerateSignals(): SignalData {
    const { candles, regimeConfig, indicatorSet } = this.cfg;
    const rd = this.map.get('detect_regimes') as { regimes: RegimeResult[] } | undefined;
    const id = this.map.get('compute_indicators') as IndicatorData | undefined;
    const dd = this.map.get('fetch_derivatives') as DerivativeData | undefined;
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
    this.mergeDerivativeSignals(signals, dd);
    return { signals };
  }

  /** Merge non-TA derivative signals (funding rate, OI, liquidations, basis) into signal array. */
  private mergeDerivativeSignals(signals: AlphaSignal[], dd: DerivativeData | undefined): void {
    for (const ds of dd?.signals ?? []) {
      const dir: AlphaSignal['direction'] = ds.direction === 'short' ? 'sell' : ds.direction === 'long' ? 'buy' : 'hold';
      const fv: FeatureVector = {
        features: [{ id: 'derivative', value: ds.confidence, causal: true }],
        computedAt: ds.timestamp, symbol: ds.symbol, lookback: 20,
      };
      signals.push({
        name: ds.reasons[0] ?? 'derivative', direction: dir, confidence: ds.confidence,
        features: fv, source: 'indicator', timestamp: ds.timestamp,
        metadata: { reasons: ds.reasons, features: ds.features },
      });
    }
  }

  private stepLabelEvents(): EventData {
    const sd = this.map.get('generate_signals') as SignalData | undefined;
    return { labels: (sd?.signals ?? []).map(s => s.direction) };
  }

  private stepRunWalkforward(): WalkforwardData {
    const { candles, regimeConfig, walkforwardConfig, costMode, minSharpe, minTrades } = this.cfg;
    const sd = this.map.get('generate_signals') as SignalData | undefined;
    if (!sd) throw new Error('No signals for walkforward');
    const trainBars = walkforwardConfig.trainBars ?? 20;
    const testBars = walkforwardConfig.testBars ?? 10;
    const total = trainBars + testBars * 3;
    if (candles.length < total) throw new Error(`Not enough candles: ${candles.length} < ${total}`);

    // Extract trades for walkforward using canonical extractTrades
    const off = regimeConfig.lookback;
    const costCfgWf = resolveStressConfig(costMode as StressMode);
    const trades = extractTrades(sd.signals, candles.slice(0, total), off, { ...costCfgWf, marketImpactPct: 0 });
    const tc = trades.length;

    // Compute equity curve from trades for Sharpe
    const eq: BacktestEquityPoint[] = [];
    let equity = 10000, peak = equity;
    for (const t of trades) {
      equity += t.pnl;
      peak = Math.max(peak, equity);
      const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
      eq.push({ timestamp: t.exitTimestamp, equity, drawdownPct: dd });
    }
    const intervalMin = parseCandleIntervalMinutes(this.cfg.timeframe);
    const sp = eq.length >= 2 ? computeSharpe(eq, intervalMin) : 0;
    return { sharpe: sp, totalTrades: tc, passed: sp >= minSharpe && tc >= minTrades };
  }

  private stepEvaluate(): EvalData {
    const { candles, regimeConfig, costMode } = this.cfg;
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
    // Compute cost breakdown from trades for the report
    const totalFees = trades.reduce((s, t) => s + t.fee, 0);
    const costBreakdown = { fees: totalFees, slippage: 0, marketImpact: 0 };
    const regimeLabel = rd?.regimes[0]?.label ?? RegimeLabel.UNKNOWN;
    return { report: generateReport({
      experimentId: `pipeline-${this.cfg.symbol}-${this.cfg.timeframe}`,
      symbol: this.cfg.symbol, timeframe: this.cfg.timeframe, regime: regimeLabel,
      metrics: m, costBreakdown,
    }, candles) };
  }

  private stepComputeCosts(): CostData {
    const ev = this.map.get('evaluate') as EvalData | undefined;
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

  private stepAttribute(): AttributeData {
    const { candles, regimeConfig } = this.cfg;
    const sd = this.map.get('generate_signals') as SignalData | undefined;
    const rd = this.map.get('detect_regimes') as RegimeData | undefined;
    const trades = extractTrades(sd?.signals ?? [], candles, regimeConfig.lookback);
    const obs = (rd?.regimes ?? []).map(r => ({ timestamp: r.timestamp, label: r.label }));
    return { attributions: attributePerformance(trades, sd?.signals ?? [], obs) };
  }

  private stepCompareBaselines(): BaselineData {
    if (!this.cfg.baselinesEnabled) return { baselines: [], reports: {} };
    const sm = this.cfg.costMode as StressMode;
    const baselineStrategies: BaselineStrategy[] = ['buy_hold', 'simple_momentum'];
    const configs: BaselineConfig[] = baselineStrategies.map(s => ({
      strategy: s, symbol: this.cfg.symbol, timeframe: this.cfg.timeframe,
      stressMode: sm, feePct: 0.001, slipPct: 0.0005,
    }));
    const reports: Record<string, EvaluationReport> = {};
    for (const c of configs) {
      reports[c.strategy] = runBaseline(this.cfg.candles, c);
    }
    return { baselines: configs, reports };
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
