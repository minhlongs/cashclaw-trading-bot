// Alpha Research Data Fetcher — Types

export type DataSource = 'binance' | 'bybit' | 'okx';

export interface FetchConfig {
  source: DataSource;
  symbol: string;
  timeframe: string;
  limit: number;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandleSource {
  fetchCandles(config: FetchConfig): Promise<Candle[]>;
}
