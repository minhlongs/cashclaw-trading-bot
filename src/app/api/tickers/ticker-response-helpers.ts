import { NextResponse } from 'next/server';
import type { DirectTickerProvider } from '@/tree/exchange/direct';
import type { SupportedExchange } from './ticker-provider-registry';

export function buildCircuitOpenResponse(
  exchange: SupportedExchange,
  startTime: number,
): NextResponse {
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

export async function fetchTickerWithProvenance(
  provider: DirectTickerProvider,
  exchange: SupportedExchange,
  symbol: string,
  startTime: number,
): Promise<NextResponse> {
  try {
    const ticker = await provider.fetchTicker(symbol);
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
}

export function buildUnexpectedErrorResponse(
  err: unknown,
  startTime: number,
): NextResponse {
  const latencyMs = Math.round(performance.now() - startTime);
  return NextResponse.json(
    {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs,
    },
    { status: 500 },
  );
}
