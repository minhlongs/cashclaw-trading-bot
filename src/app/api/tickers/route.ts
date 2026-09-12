// Edge-Native Multi-Exchange Ticker API (ADR-001 Market Data Only)
// Runtime: Cloudflare Workers Edge Runtime

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, getRateLimitHeaders } from '@/forest/api/rate-limiter';
import { DirectTickerProvider, toCanonicalSymbol } from '@/tree/exchange/direct';

export type SupportedExchange = 'binance' | 'okx' | 'bybit';

export const TickerQuerySchema = z.object({
  exchange: z.enum(['binance', 'okx', 'bybit']).default('binance'),
  symbol: z.string().min(3).max(20).default('BTC/USDT'),
});

const providerMap = new Map<SupportedExchange, DirectTickerProvider>();

export function setDirectTickerProviderForTest(
  exchange: SupportedExchange,
  provider: DirectTickerProvider | null,
): void {
  if (provider === null) {
    providerMap.delete(exchange);
  } else {
    providerMap.set(exchange, provider);
  }
}

export function resetProvidersForTest(): void {
  providerMap.clear();
}

function getProvider(exchange: SupportedExchange): DirectTickerProvider {
  let provider = providerMap.get(exchange);
  if (!provider) {
    provider = new DirectTickerProvider({ exchangeId: exchange });
    providerMap.set(exchange, provider);
  }
  return provider;
}

function getClientIp(req: Request): string {
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'anonymous';
}

function parseQueryParams(req: Request) {
  const url = new URL(req.url);
  return {
    exchange: url.searchParams.get('exchange') ?? undefined,
    symbol: url.searchParams.has('symbol') ? url.searchParams.get('symbol') ?? undefined : undefined,
  };
}

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
