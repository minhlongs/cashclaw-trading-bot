import type { Ticker } from '@/tree/exchange/types';
import type { ExchangeRouter, RoutingConfig } from '@/tree/exchange/provider';
import { ok, err, type Result } from '@/lib/result';
import type { RoutedExecutionDeps } from './routed-execution.types';
import { buildRouteContext, ensureProviders, buildChain } from './routed-execution-helpers';

export async function executeRoutedTicker(sym: string, router: ExchangeRouter, cfg: RoutingConfig, deps: RoutedExecutionDeps): Promise<Result<Ticker>> {
  const dec = router.routeTicker(buildRouteContext(deps.providers));
  if (!dec.ok) return err(dec.error);
  ensureProviders(cfg, deps.providers);
  const chain = buildChain(dec.data, deps.providers);
  const res = await chain.execute((p) => p.fetchTicker(sym));
  deps.onProvenance(dec.data.exchange, res);
  if (!res.ok || !res.data) {
    const m = res.error ?? 'Empty ticker data';
    deps.reportError(new Error(m), `routedFetchTicker/${sym}`);
    return err(m);
  }
  return ok(res.data);
}
