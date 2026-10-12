import type { RoutingConfig, RouteDecision } from './routing-types';
import type { RouteContext, ExchangeRouteHealth } from './exchange-router-types';
import { routePinned, routeRoundRobin, routeBestHealth } from './exchange-router-strategies';
import { err, type Result } from '@/lib/result';

export type { ExchangeRouteHealth, RouteContext };

export class ExchangeRouter {
  private readonly config: RoutingConfig;
  private roundRobinIndex = 0;

  constructor(config: RoutingConfig) { this.config = config; }

  routeTicker(ctx: RouteContext): Result<RouteDecision> { return this.route(ctx, 'ticker'); }
  routeOrder(ctx: RouteContext): Result<RouteDecision> { return this.route(ctx, 'order'); }

  private route(ctx: RouteContext, purpose: 'ticker' | 'order'): Result<RouteDecision> {
    const avail = this.config.exchanges.filter(e => !(ctx.health.get(e)?.circuitOpen ?? false));
    if (avail.length === 0) return err(`All exchanges circuit-open — no route for ${purpose} (${this.config.exchanges.join(', ')})`);
    switch (this.config.strategy) {
      case 'pinned': return routePinned(this.config, avail, purpose);
      case 'round-robin': return routeRoundRobin(this.config, avail, this.roundRobinIndex++, purpose);
      case 'best-health': return routeBestHealth(this.config, avail, ctx, purpose);
    }
  }
}
