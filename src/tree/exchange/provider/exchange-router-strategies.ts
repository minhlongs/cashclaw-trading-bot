import type { ExchangeId } from '../types';
import type { RoutingConfig, RouteDecision } from './routing-types';
import type { RouteContext } from './exchange-router-types';
import { ok, err, type Result } from '@/lib/result';

export function routePinned(config: RoutingConfig, avail: ExchangeId[], purp: string): Result<RouteDecision> {
  const p = config.pinnedExchange;
  if (!p) return err('pinned strategy requires pinnedExchange');
  if (!avail.includes(p)) return err(`Pinned exchange ${p} circuit-open — refusing to reroute ${purp}`);
  return ok({ exchange: p, fallbackOrder: [p, ...config.exchanges.filter(e => e !== p)], reason: `pinned:${p}` });
}

export function routeRoundRobin(config: RoutingConfig, avail: ExchangeId[], idx: number, purp: string): Result<RouteDecision> {
  const ex = config.exchanges;
  const start = idx % ex.length;
  for (let offset = 0; offset < ex.length; offset++) {
    const cand = ex[(start + offset) % ex.length];
    if (avail.includes(cand)) {
      return ok({ exchange: cand, fallbackOrder: [cand, ...ex.filter(e => e !== cand)], reason: `round-robin:${purp}` });
    }
  }
  return err(`No available exchange for ${purp}`);
}

export function routeBestHealth(config: RoutingConfig, avail: ExchangeId[], ctx: RouteContext, purp: string): Result<RouteDecision> {
  let best: ExchangeId | undefined;
  let bestScore = -Infinity;
  for (const e of config.exchanges) {
    if (!avail.includes(e)) continue;
    const score = ctx.health.get(e)?.score ?? 0;
    if (score > bestScore) { best = e; bestScore = score; }
  }
  if (!best) return err(`No available exchange for ${purp}`);
  return ok({ exchange: best, fallbackOrder: [best, ...config.exchanges.filter(e => e !== best)], reason: `best-health:score=${bestScore}` });
}
