// Cross-exchange routing types — pure domain types + Zod boundary schema.
// Paper/backtest only: routing selects among registered paper exchanges.

import { z } from 'zod';
import type { ExchangeId } from '../types';

export type RoutingStrategy = 'pinned' | 'round-robin' | 'best-health';

export interface RoutingConfig {
  strategy: RoutingStrategy;
  exchanges: ExchangeId[];
  pinnedExchange?: ExchangeId;
}

export interface RouteDecision {
  exchange: ExchangeId;
  fallbackOrder: ExchangeId[];
  reason: string;
}

const exchangeIdSchema = z.enum(['binance', 'bybit', 'okx']);

export const RoutingConfigSchema = z
  .object({
    strategy: z.enum(['pinned', 'round-robin', 'best-health']),
    exchanges: z.array(exchangeIdSchema).min(1),
    pinnedExchange: exchangeIdSchema.optional(),
  })
  .refine(
    (config) =>
      config.strategy !== 'pinned' ||
      (config.pinnedExchange !== undefined && config.exchanges.includes(config.pinnedExchange)),
    {
      message: 'pinned strategy requires pinnedExchange to be set and included in exchanges',
      path: ['pinnedExchange'],
    },
  );
