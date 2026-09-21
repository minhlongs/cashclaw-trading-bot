import { AlphaResearchPipeline } from '@/forest/alpha/pipeline/engine';
import { createCandleSource } from '@/forest/alpha/data-fetcher';
import { buildPipelineConfig, type ResearchRequest } from './research-schema';

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms),
    ),
  ]);
}

export async function executeResearchRun(
  data: ResearchRequest,
  timeoutMs: number,
): Promise<{ ok: boolean; status?: number; error?: string; report?: unknown }> {
  const source = createCandleSource('binance');
  const candles = await source.fetchCandles({
    source: 'binance',
    symbol: data.symbol,
    timeframe: data.timeframe,
    limit: data.candles,
  });

  if (candles.length === 0) {
    return {
      ok: false,
      status: 422,
      error: `No candle data returned for ${data.symbol} ${data.timeframe}`,
    };
  }

  const pipelineConfig = buildPipelineConfig(data, candles);
  const pipeline = new AlphaResearchPipeline(pipelineConfig);

  try {
    const report = await withTimeout(
      pipeline.run(),
      timeoutMs,
      `Pipeline timed out after ${timeoutMs}ms`,
    );
    return { ok: true, report };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith('Pipeline timed out')) {
      return {
        ok: false,
        status: 504,
        error: `Research pipeline failed: ${message}`,
      };
    }
    return {
      ok: false,
      status: 500,
      error: `Research pipeline failed: ${message}`,
    };
  }
}
