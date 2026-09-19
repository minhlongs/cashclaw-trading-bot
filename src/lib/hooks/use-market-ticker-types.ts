import type { SupportedExchange } from '@/app/api/tickers/route';
import type { Ticker } from '@/tree/exchange/types';

export interface TickerProvenance {
  exchange: string;
  provider: string;
  circuitState: 'closed' | 'open' | 'half-open';
  latencyMs: number;
  timestamp: number;
}

export interface UseMarketTickerOptions {
  exchange?: SupportedExchange | string;
  symbol?: string;
  intervalMs?: number;
  enabled?: boolean;
}

export interface UseMarketTickerResult {
  ticker: Ticker | null;
  provenance: TickerProvenance | null;
  loading: boolean;
  error: string | null;
  isRateLimited: boolean;
  isCircuitOpen: boolean;
  refetch: () => Promise<void>;
}

export interface TickerApiResponse {
  ok: boolean;
  ticker?: Ticker;
  data?: Ticker;
  provenance?: TickerProvenance;
  error?: string;
  message?: string;
}

export interface FetchOutcome {
  ticker: Ticker | null;
  provenance: TickerProvenance | null;
  error: string | null;
  isRateLimited: boolean;
  isCircuitOpen: boolean;
}
