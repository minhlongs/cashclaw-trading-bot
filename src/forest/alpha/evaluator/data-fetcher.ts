// Multi-Year Multi-Asset Data Fetcher for Alpha Research
// Fetches 2+ years of OHLCV data across BTC, ETH, SOL at 1h and 4h

import { fetchOHLCV } from '@/forest/backtest/data-fetcher';

export interface DataRequest {
  exchange: string;
  symbol: string;
  interval: string;
  yearsBack: number;
}

export interface DataResult {
  symbol: string;
  interval: string;
  candles: { timestamp: number; open: number; high: number; low: number; close: number; volume: number }[];
  source: 'cache' | 'exchange';
}

export async function fetchDataset(requests: DataRequest[]): Promise<DataResult[]> {
  const results: DataResult[] = [];
  const now = Date.now();

  for (const req of requests) {
    const startMs = now - req.yearsBack * 365 * 24 * 60 * 60 * 1000;
    const cacheKey = `${req.exchange}:${req.symbol.replace('/', '-')}:${req.interval}`;

    try {
      const candles = await fetchOHLCV(req.exchange, req.symbol, req.interval, startMs, now);
      const source = candles.length > 0 ? 'exchange' : 'cache';
      results.push({ symbol: req.symbol, interval: req.interval, candles, source });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  Failed to fetch ${req.symbol} ${req.interval}: ${msg}`);
      results.push({ symbol: req.symbol, interval: req.interval, candles: [], source: 'exchange' });
    }
  }

  return results;
}

export function buildDefaultRequests(yearsBack = 2): DataRequest[] {
  const pairs = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
  const intervals = ['1h', '4h'];
  return pairs.flatMap((symbol) =>
    intervals.map((interval) => ({
      exchange: 'binance',
      symbol,
      interval,
      yearsBack,
    }))
  );
}