import { z } from 'zod';
import type { PipelineConfig } from '@/forest/alpha/pipeline/types';

export const PIPELINE_TIMEOUT_MS = 120_000;

export const ResearchRequestSchema = z.object({
  symbol: z.string().min(1).max(20).describe('Trading pair, e.g. BTCUSDT'),
  timeframe: z
    .enum(['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d'])
    .describe('Candle timeframe'),
  candles: z
    .number()
    .int()
    .min(100)
    .max(1000)
    .optional()
    .default(300)
    .describe('Number of historical candles to fetch (100-1000)'),
  config: z
    .object({
      costMode: z.enum(['normal', 'conservative', 'adverse']).optional().default('normal'),
      minSharpe: z.number().min(0).max(10).optional().default(0.5),
      minTrades: z.number().int().min(0).max(1000).optional().default(3),
      baselinesEnabled: z.boolean().optional().default(true),
    })
    .optional(),
});

export type ResearchRequest = z.infer<typeof ResearchRequestSchema>;

export function buildPipelineConfig(req: ResearchRequest, candles: PipelineConfig['candles']): PipelineConfig {
  return {
    symbol: req.symbol,
    timeframe: req.timeframe,
    candles,
    indicatorSet: { rsi: 14, atr: 14, lookback: 20 },
    regimeConfig: {
      minCandles: 10,
      confidenceThreshold: 0.6,
      lookback: 20,
      minDuration: 3,
    },
    walkforwardConfig: {
      trainBars: 60,
      validateBars: 20,
      testBars: 20,
      stepBars: 20,
    },
    costMode: req.config?.costMode ?? 'normal',
    minSharpe: req.config?.minSharpe ?? 0.5,
    minTrades: req.config?.minTrades ?? 3,
    baselinesEnabled: req.config?.baselinesEnabled ?? true,
  };
}
