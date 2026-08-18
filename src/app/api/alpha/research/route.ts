// POST /api/alpha/research — Run an alpha research pipeline job (paper-only)
//
// Accepts a symbol + timeframe, fetches OHLCV candles from a public exchange,
// runs the full AlphaResearchPipeline, and returns the structured report as JSON.
//
// Auth: session-cookie, enforced by middleware (PROTECTED_API_PREFIXES includes
// /api/alpha). No auth logic lives in this handler — matches the /api/bots pattern.
//
// Paper-only by design: this route never touches order execution. It only reads
// public market data and runs deterministic research.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, getRateLimitHeaders } from '@/forest/api/rate-limiter';
import { AlphaResearchPipeline } from '@/forest/alpha/pipeline/engine';
import type { PipelineConfig } from '@/forest/alpha/pipeline/types';
import { createCandleSource } from '@/forest/alpha/data-fetcher';

const PIPELINE_TIMEOUT_MS = 120_000;

const ResearchRequestSchema = z.object({
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

type ResearchRequest = z.infer<typeof ResearchRequestSchema>;

function buildPipelineConfig(req: ResearchRequest, candles: PipelineConfig['candles']): PipelineConfig {
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

export async function POST(req: Request) {
  // Rate limit — pipeline runs are expensive (network + CPU), so a tight limit.
  const rateLimit = checkRateLimit('alpha:research', {
    windowMs: 60_000,
    maxRequests: 5,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded. Try again later.' },
      { status: 429, headers: getRateLimitHeaders(rateLimit) },
    );
  }

  // Validate request body.
  const raw = await req.json().catch(() => ({}));
  const parsed = ResearchRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map(i => i.message).join(', ') },
      { status: 400 },
    );
  }

  const { symbol, timeframe, candles: candleCount } = parsed.data;

  // Fetch candle data from a public exchange (paper-only, public API).
  try {
    const source = createCandleSource('binance');
    const candles = await source.fetchCandles({
      source: 'binance',
      symbol,
      timeframe,
      limit: candleCount,
    });

    if (candles.length === 0) {
      return NextResponse.json(
        { ok: false, error: `No candle data returned for ${symbol} ${timeframe}` },
        { status: 422 },
      );
    }

    // Build pipeline config and run with a timeout so a slow exchange cannot hang the route.
    const pipelineConfig = buildPipelineConfig(parsed.data, candles);
    const pipeline = new AlphaResearchPipeline(pipelineConfig);

    const report = await withTimeout(
      pipeline.run(),
      PIPELINE_TIMEOUT_MS,
      `Pipeline timed out after ${PIPELINE_TIMEOUT_MS}ms`,
    );

    return NextResponse.json({ ok: true, report });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith('Pipeline timed out')) {
      return NextResponse.json(
        { ok: false, error: `Research pipeline failed: ${message}` },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { ok: false, error: `Research pipeline failed: ${message}` },
      { status: 500 },
    );
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms),
    ),
  ]);
}