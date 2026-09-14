// Alpha Research Pipeline — Data Ingestion & Signal Generation
// Steps: fetch_data, fetch_derivatives, compute_indicators, detect_regimes, generate_signals, label_events

import type { Candle } from '@/forest/backtest/ohlcv';
import { RegimeLabel, type RegimeResult } from '@/tree/regime/types';
import type { AlphaSignal, FeatureVector } from '@/tree/alpha/types';
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
import { indicators } from '@/tree/alpha/indicators';
import type {
  PipelineConfig,
  IndicatorData,
  RegimeData,
  SignalData,
  EventData,
  DerivativeData,
} from './types';

const log = createLogger('pipeline');

export function stepFetchData(cfg: PipelineConfig): Candle[] {
  if (cfg.candles.length === 0) throw new Error('No candles');
  return cfg.candles;
}

export async function stepFetchDerivatives(cfg: PipelineConfig): Promise<DerivativeData> {
  if (cfg.derivatives) return cfg.derivatives;
  const symbol = cfg.symbol;
  const { candles } = cfg;
  const t0 = candles[0]?.timestamp ?? 0;
  const t1 = candles[candles.length - 1]?.timestamp ?? Date.now();
  const empty: DerivativeData = { features: [], signals: [] };
  try {
    const fetchWithLog = async <T>(label: string, p: Promise<T>): Promise<T> => {
      try {
        return await p;
      } catch (err) {
        log.warn(`derivative source '${label}' failed`, {
          action: 'fetchDerivatives',
          error: err instanceof Error ? err.message : String(err),
        });
        return [] as unknown as T;
      }
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
    log.warn('fetch_derivatives failed entirely', {
      action: 'fetchDerivatives',
      error: err instanceof Error ? err.message : String(err),
    });
    return empty;
  }
}

export function stepComputeIndicators(cfg: PipelineConfig): IndicatorData {
  const { candles, indicatorSet } = cfg;
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

export function stepDetectRegimes(cfg: PipelineConfig): RegimeData {
  const { candles, regimeConfig } = cfg;
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

export function mergeDerivativeSignals(
  signals: AlphaSignal[],
  dd: DerivativeData | undefined,
): void {
  for (const ds of dd?.signals ?? []) {
    const dir: AlphaSignal['direction'] =
      ds.direction === 'short' ? 'sell' : ds.direction === 'long' ? 'buy' : 'hold';
    const fv: FeatureVector = {
      features: [{ id: 'derivative', value: ds.confidence, causal: true }],
      computedAt: ds.timestamp,
      symbol: ds.symbol,
      lookback: 20,
    };
    signals.push({
      name: ds.reasons[0] ?? 'derivative',
      direction: dir,
      confidence: ds.confidence,
      features: fv,
      source: 'indicator',
      timestamp: ds.timestamp,
      metadata: { reasons: ds.reasons, features: ds.features },
    });
  }
}

export function stepGenerateSignals(cfg: PipelineConfig, map: Map<string, unknown>): SignalData {
  const { candles, regimeConfig, indicatorSet } = cfg;
  const rd = map.get('detect_regimes') as { regimes: RegimeResult[] } | undefined;
  const id = map.get('compute_indicators') as IndicatorData | undefined;
  const dd = map.get('fetch_derivatives') as DerivativeData | undefined;
  const signals: AlphaSignal[] = [];
  const off = regimeConfig.lookback;
  const lb = indicatorSet['lookback'] ?? 20;
  for (let i = 0; rd && id && i < rd.regimes.length; i++) {
    const idx = i + off;
    const f = id.features[idx];
    if (!f) continue;
    const rsi = f['rsi'] ?? 50;
    const regime = rd.regimes[i].label;
    const ts = candles[idx].timestamp;
    const fv: FeatureVector = {
      features: Object.entries(f).map(([id2, v]) => ({ id: id2, value: v, causal: false })),
      computedAt: ts,
      symbol: cfg.symbol,
      lookback: lb,
    };
    let name: string;
    let dir: AlphaSignal['direction'];
    let conf = 0;
    if (rsi < 30 && regime === RegimeLabel.TREND_UP) {
      name = 'rsi_regime_buy';
      dir = 'buy';
      conf = (30 - rsi) / 30;
    } else if (rsi > 70 && regime === RegimeLabel.TREND_DOWN) {
      name = 'rsi_regime_sell';
      dir = 'sell';
      conf = (rsi - 70) / 30;
    } else {
      name = 'hold';
      dir = 'hold';
    }
    signals.push({
      name,
      direction: dir,
      confidence: conf,
      features: fv,
      source: 'indicator',
      timestamp: ts,
      metadata: {},
    });
  }
  mergeDerivativeSignals(signals, dd);
  return { signals };
}

export function stepLabelEvents(map: Map<string, unknown>): EventData {
  const sd = map.get('generate_signals') as SignalData | undefined;
  return { labels: (sd?.signals ?? []).map(s => s.direction) };
}
