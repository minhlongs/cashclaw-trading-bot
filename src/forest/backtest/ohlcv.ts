// OHLCV candle type used by the backtest engine
export interface Candle {
  timestamp: number; // ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
