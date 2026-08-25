// ExchangeRouter — pure selection logic for cross-exchange routing.
// No I/O: health + circuit state arrive pre-composed in the route context.
// Deterministic: same config + same context always yields the same decision.

import type { ExchangeId } from '../types';
import type { RoutingConfig, RouteDecision } from './routing-types';
import { ok, err, type Result } from '@/lib/result';

export interface ExchangeRouteHealth {
  score: number;
  circuitOpen: boolean;
}

export interface RouteContext {
  health: Map<ExchangeId, ExchangeRouteHealth>;
}

export class ExchangeRouter {
  private readonly config: RoutingConfig;
  private roundRobinIndex = 0;

  constructor(config: RoutingConfig) {
    this.config = config;
  }

  routeTicker(ctx: RouteContext): Result<RouteDecision> {
    return this.route(ctx, 'ticker');
  }

  routeOrder(ctx: RouteContext): Result<RouteDecision> {
    return this.route(ctx, 'order');
  }

  private route(ctx: RouteContext, purpose: 'ticker' | 'order'): Result<RouteDecision> {
    const available = this.config.exchanges.filter((exchange) => !this.isCircuitOpen(exchange, ctx));
    if (available.length === 0) {
      return err(`All exchanges circuit-open — no route for ${purpose} (${this.config.exchanges.join(', ')})`);
    }

    switch (this.config.strategy) {
      case 'pinned':
        return this.routePinned(available, purpose);
      case 'round-robin':
        return this.routeRoundRobin(available, purpose);
      case 'best-health':
        return this.routeBestHealth(available, ctx, purpose);
    }
  }

  private routePinned(available: ExchangeId[], purpose: string): Result<RouteDecision> {
    const pinned = this.config.pinnedExchange;
    if (!pinned) {
      return err('pinned strategy requires pinnedExchange');
    }
    if (!available.includes(pinned)) {
      return err(`Pinned exchange ${pinned} circuit-open — refusing to reroute ${purpose}`);
    }
    return ok({
      exchange: pinned,
      fallbackOrder: this.fallbackOrder(pinned),
      reason: `pinned:${pinned}`,
    });
  }

  private routeRoundRobin(available: ExchangeId[], purpose: string): Result<RouteDecision> {
    const exchanges = this.config.exchanges;
    const start = this.roundRobinIndex % exchanges.length;
    this.roundRobinIndex += 1;
    for (let offset = 0; offset < exchanges.length; offset += 1) {
      const candidate = exchanges[(start + offset) % exchanges.length];
      if (available.includes(candidate)) {
        return ok({
          exchange: candidate,
          fallbackOrder: this.fallbackOrder(candidate),
          reason: `round-robin:${purpose}`,
        });
      }
    }
    return err(`No available exchange for ${purpose}`);
  }

  private routeBestHealth(
    available: ExchangeId[],
    ctx: RouteContext,
    purpose: string,
  ): Result<RouteDecision> {
    let best: ExchangeId | undefined;
    let bestScore = -Infinity;
    // Iterate in config order so ties break deterministically toward earlier exchanges.
    for (const exchange of this.config.exchanges) {
      if (!available.includes(exchange)) continue;
      const score = ctx.health.get(exchange)?.score ?? 0;
      if (score > bestScore) {
        best = exchange;
        bestScore = score;
      }
    }
    if (!best) {
      return err(`No available exchange for ${purpose}`);
    }
    return ok({
      exchange: best,
      fallbackOrder: this.fallbackOrder(best),
      reason: `best-health:score=${bestScore}`,
    });
  }

  private isCircuitOpen(exchange: ExchangeId, ctx: RouteContext): boolean {
    return ctx.health.get(exchange)?.circuitOpen ?? false;
  }

  private fallbackOrder(primary: ExchangeId): ExchangeId[] {
    return [primary, ...this.config.exchanges.filter((exchange) => exchange !== primary)];
  }
}
