import { fetchOHLCV } from './data-fetcher';
import { runBacktest } from './engine';
import type { BacktestResult } from './types';
import type { BacktestRunInput } from './actions.types';
import type { CandleInterval } from './actions.validation';

export async function fetchAndSimulateBacktest(
  input: BacktestRunInput,
  interval: CandleInterval,
): Promise<{ candlesFetched: number; result?: BacktestResult; error?: string }> {
  let candles;
  try {
    candles = await fetchOHLCV(input.exchange, input.symbol, interval, input.startDate.getTime(), input.endDate.getTime());
  } catch (err) {
    return { candlesFetched: 0, error: err instanceof Error ? err.message : 'Failed to fetch OHLCV data' };
  }
  if (candles.length < 2) {
    return { candlesFetched: candles.length, error: `Insufficient data: only ${candles.length} candles` };
  }
  try {
    const result = runBacktest({
      config: input.config,
      candles,
      feePct: input.feePct ?? 0.1,
      slippagePct: input.slippagePct ?? 0.05,
      initialCapital: input.initialCapital ?? input.config.capital,
      botId: input.botId,
    });
    return { candlesFetched: candles.length, result };
  } catch (err) {
    return { candlesFetched: candles.length, error: err instanceof Error ? err.message : 'Backtest engine failed' };
  }
}
