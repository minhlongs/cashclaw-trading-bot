import type { Ticker, OrderRequest, OrderResult } from '@/tree/exchange/types';
import type { PaperExchangeProvider, ProviderChain, ProviderResult } from '@/tree/exchange/provider';
import type { DirectTickerProvider } from '@/tree/exchange/direct';
import type { Killswitch } from '@/tree/bot/killswitch';
import { ok, err, type Result } from '@/lib/result';
import { createLogger } from '@/lib/logger';
import { createDefaultPaperExchangeProvider } from './provider-factory';

const log = createLogger('exchange-orchestration');

export type ErrorReporter = (err: Error, ctx: string) => void;

export function reportError(this: void, onError: ErrorReporter | undefined, err: Error, ctx: string): void {
  try {
    if (onError) onError(err, ctx);
  } catch (error) {
    log.error('Error reporter failed', error instanceof Error ? error : new Error(String(error)), { action: 'reportError' });
  }
}

export async function safeExecute<T>(
  reporter: ErrorReporter | undefined,
  ctx: string,
  fn: () => Promise<T>,
): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    reportError(reporter, error instanceof Error ? error : new Error(msg), ctx);
    return err(msg);
  }
}

export function resolveDirectTicker(
  dtpMap: Map<string, DirectTickerProvider> | Record<string, DirectTickerProvider> | undefined,
  exchange: string,
): DirectTickerProvider | undefined {
  if (!dtpMap) return undefined;
  return dtpMap instanceof Map ? dtpMap.get(exchange) : dtpMap[exchange];
}

export function createExchangeProvider(
  exchange: string,
  dtpMap?: Map<string, DirectTickerProvider> | Record<string, DirectTickerProvider>,
): PaperExchangeProvider {
  const dtp = resolveDirectTicker(dtpMap, exchange);
  return createDefaultPaperExchangeProvider(exchange, { directTickerProvider: dtp });
}

export async function executeChainTicker(
  chain: ProviderChain,
  symbol: string,
  onError?: ErrorReporter,
): Promise<{ result: Result<Ticker>; provenance: ProviderResult<Ticker> }> {
  const chainResult = await chain.execute((p) => p.fetchTicker(symbol));
  if (!chainResult.ok || chainResult.data === undefined) {
    const msg = chainResult.ok ? 'Empty ticker data' : chainResult.error ?? 'Unknown error';
    reportError(onError, new Error(msg), `fetchTicker/${symbol}`);
    return { result: err(msg), provenance: chainResult };
  }
  return { result: ok(chainResult.data), provenance: chainResult };
}

export async function executeChainOrder(
  chain: ProviderChain,
  provider: PaperExchangeProvider,
  exchange: string,
  request: OrderRequest,
  killswitch: Killswitch,
  onError?: ErrorReporter,
): Promise<{ result: Result<OrderResult>; provenance?: ProviderResult<OrderResult> }> {
  if (!killswitch.isTradingEnabled()) {
    reportError(onError, new Error('Trading halted by killswitch'), `placeOrder/${request.symbol}`);
    return { result: err('Trading halted by killswitch') };
  }
  if (provider.isCircuitOpen()) {
    const health = provider.getHealth();
    const msg = `Trading paused for ${exchange} — provider score ${health.score}, failures ${health.failureCount}`;
    reportError(onError, new Error(msg), `placeOrder/${request.symbol}`);
    return { result: err(msg) };
  }
  const chainResult = await chain.execute((p) => p.placeOrder(request));
  if (!chainResult.ok || chainResult.data === undefined) {
    const msg = chainResult.ok ? 'Empty order data' : chainResult.error ?? 'Unknown error';
    reportError(onError, new Error(msg), `placeOrder/${request.symbol}`);
    return { result: err(msg), provenance: chainResult };
  }
  return { result: ok(chainResult.data), provenance: chainResult };
}
