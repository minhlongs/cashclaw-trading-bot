export type EndpointCategory = 'api' | 'order' | 'ws';

export interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

export interface RateLimitConfig {
  capacity: number;
  refillMs: number;
}

export interface BackoffEntry {
  delayMs: number;
  expiresAt: number;
}

export type TryAcquireResult = 
  | { allowed: true } 
  | { allowed: false; waitMs: number };

export const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  'binance:api': { capacity: 1200, refillMs: 60000 },
  'binance:order': { capacity: 50, refillMs: 10000 },
  'binance:ws': { capacity: 200, refillMs: 60000 },
  'bybit:api': { capacity: 120, refillMs: 1000 },
  'bybit:order': { capacity: 20, refillMs: 1000 },
  'bybit:ws': { capacity: 200, refillMs: 60000 },
  'okx:api': { capacity: 20, refillMs: 2000 },
  'okx:order': { capacity: 20, refillMs: 1000 },
  'okx:ws': { capacity: 200, refillMs: 60000 },
};

export const FALLBACK_LIMIT: RateLimitConfig = { capacity: 100, refillMs: 60000 };

export function getRateLimiterKey(exchange: string, category: EndpointCategory): string {
  return `${exchange}:${category}`;
}
