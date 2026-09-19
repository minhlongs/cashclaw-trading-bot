// Alpha Research Data Fetcher — Constants

export const KLINE_LIMIT = 1000;
export const MAX_RETRIES = 3;
export const MAX_BACKOFF_MS = 30_000;

export const TIMEFRAME_MS: Record<string, number> = {
  '1m': 60_000, '3m': 180_000, '5m': 300_000,
  '15m': 900_000, '30m': 1_800_000, '1h': 3_600_000,
  '4h': 14_400_000, '1d': 86_400_000,
};

export function timeframeToMs(tf: string): number {
  return TIMEFRAME_MS[tf] ?? 3_600_000;
}
