// Alpha Research Pipeline — Data Fetch Steps
// Steps: fetch_data, fetch_derivatives

import type { Candle } from '@/forest/backtest/ohlcv';
import { createLogger } from '@/lib/logger';
import {
  fetchFundingRate,
  fetchOpenInterestHistory,
  fetchLiquidations,
  fetchPremiumIndex,
  computeDerivativeFeatures,
  generateDerivativeSignals,
} from '@/tree/alpha/signals';
import type { PipelineConfig, DerivativeData } from './types';

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
