import type { ExchangeId, OrderRequest, OrderResult } from '@/tree/exchange/types';
import type { ExchangeRouter, RoutingConfig } from '@/tree/exchange/provider';
import { ok, err, type Result } from '@/lib/result';
import type { RoutedExecutionDeps } from './routed-execution.types';
import { buildRouteContext, ensureProviders, buildChain } from './routed-execution-helpers';

export async function executeRoutedOrder(
  request: OrderRequest,
  router: ExchangeRouter,
  config: RoutingConfig,
  deps: RoutedExecutionDeps,
  affinity: Map<string, ExchangeId>
): Promise<Result<OrderResult>> {
  if (!deps.killswitch.isTradingEnabled()) {
    deps.reportError(new Error('Trading halted by killswitch'), `routedPlaceOrder/${request.symbol}`);
    return err('Trading halted by killswitch');
  }
  const decision = router.routeOrder(buildRouteContext(deps.providers));
  if (!decision.ok) return err(decision.error);
  ensureProviders(config, deps.providers);
  const chain = buildChain(decision.data, deps.providers);
  const result = await chain.execute((provider) => provider.placeOrder(request));
  deps.onProvenance(decision.data.exchange, result);
  if (!result.ok || result.data === undefined) {
    const msg = result.error ?? 'Empty order data';
    deps.reportError(new Error(msg), `routedPlaceOrder/${request.symbol}`);
    return err(msg);
  }
  affinity.set(result.data.id, decision.data.exchange);
  return ok(result.data);
}
