// Edge-Native Multi-Exchange Ticker API (ADR-001 Market Data Only)
// Runtime: Cloudflare Workers Edge Runtime

import { NextResponse } from 'next/server';
import { checkRateLimit, getRateLimitHeaders } from '@/forest/api/rate-limiter';
import { toCanonicalSymbol } from '@/tree/exchange/direct';
import {
  TickerQuerySchema,
  getProvider,
} from './ticker-provider-registry';
import { getClientIp, parseQueryParams } from './ticker-request-helpers';

export {
  type SupportedExchange,
  TickerQuerySchema,
  setDirectTickerProviderForTest,
  resetProvidersForTest,
} from './ticker-provider-registry';

export async function GET(req: Request): Promise<NextResponse> {
  const startTime = performance.now();

  try {
    const clientIp = getClientIp(req);

    const rateLimit = checkRateLimit(`tickers:${clientIp}`, {
      windowMs: 60_000,
      maxRequests: 60,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Try again later.',
        },
        {
          status: 429,
          headers: getRateLimitHeaders(rateLimit),
        },
      );
    }

    const parseResult = TickerQuerySchema.safeParse(parseQueryParams(req));

    if (!parseResult.success) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid query parameters',
          details: parseResult.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { exchange, symbol } = parseResult.data;

    let canonicalSymbol: string;
    try {
      canonicalSymbol = toCanonicalSymbol(symbol);
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          error: `Malformed symbol: ${symbol}`,
          details: err instanceof Error ? err.message : String(err),
        },
        { status: 400 },
      );
    }

    const provider = getProvider(exchange);

    if (provider.circuitBreaker.getState() === 'open') {
      const latencyMs = Math.round(performance.now() - startTime);
      return NextResponse.json(
        {
          ok: false,
          error: `Circuit breaker is open for exchange: ${exchange}`,
          provenance: {
            exchange,
            provider: 'DirectTickerProvider',
            circuitState: 'open',
            latencyMs,
            timestamp: Date.now(),
          },
        },
        { status: 503 },
      );
    }

    try {
      const ticker = await provider.fetchTicker(canonicalSymbol);
      const latencyMs = Math.round(performance.now() - startTime);

      return NextResponse.json({
        ok: true,
        ticker,
        data: ticker,
        provenance: {
          exchange,
          provider: 'DirectTickerProvider',
          circuitState: provider.circuitBreaker.getState(),
          latencyMs,
          timestamp: Date.now(),
        },
      });
    } catch (fetchError) {
      const latencyMs = Math.round(performance.now() - startTime);
      const circuitState = provider.circuitBreaker.getState();
      const status = circuitState === 'open' ? 503 : 502;

      return NextResponse.json(
        {
          ok: false,
          error: fetchError instanceof Error ? fetchError.message : String(fetchError),
          provenance: {
            exchange,
            provider: 'DirectTickerProvider',
            circuitState,
            latencyMs,
            timestamp: Date.now(),
          },
        },
        { status },
      );
    }
  } catch (unexpectedError) {
    const latencyMs = Math.round(performance.now() - startTime);
    return NextResponse.json(
      {
        ok: false,
        error: unexpectedError instanceof Error ? unexpectedError.message : String(unexpectedError),
        latencyMs,
      },
      { status: 500 },
    );
  }
}
