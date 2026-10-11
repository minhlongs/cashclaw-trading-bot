import type { ExchangeId, OrderResult } from '@/tree/exchange/types';
import type { PaperExchangeProvider } from '@/tree/exchange/provider';
import { ok, err, type Result } from '@/lib/result';

function getProvider(id: string, aff: Map<string, ExchangeId>, provs: Map<string, PaperExchangeProvider>) {
  const ex = aff.get(id);
  if (!ex) return err(`No affinity for order ${id} — cannot route`);
  const p = provs.get(ex);
  if (!p) return err(`Provider ${ex} not registered for order ${id}`);
  return ok({ ex, p });
}

export async function executeRoutedCancel(id: string, sym: string, aff: Map<string, ExchangeId>, provs: Map<string, PaperExchangeProvider>, onErr: (e: Error, c: string) => void): Promise<Result<boolean>> {
  const r = getProvider(id, aff, provs);
  if (!r.ok) return err(`${r.error} cancel`);
  try { return ok(await r.data.p.cancelOrder(r.data.ex, id, sym)); }
  catch (e) { const m = e instanceof Error ? e.message : String(e); onErr(e instanceof Error ? e : new Error(m), `routedCancelOrder/${id}`); return err(m); }
}

export async function executeRoutedFetchOrder(id: string, sym: string, aff: Map<string, ExchangeId>, provs: Map<string, PaperExchangeProvider>, onErr: (e: Error, c: string) => void): Promise<Result<OrderResult>> {
  const r = getProvider(id, aff, provs);
  if (!r.ok) return err(`${r.error} fetch`);
  try { return ok(await r.data.p.fetchOrder(r.data.ex, id, sym)); }
  catch (e) { const m = e instanceof Error ? e.message : String(e); onErr(e instanceof Error ? e : new Error(m), `routedFetchOrder/${id}`); return err(m); }
}
