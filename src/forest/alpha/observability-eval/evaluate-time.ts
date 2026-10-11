import type { ObservabilityEvalInput } from './types';

export function computeObservabilityTimeRange(input: ObservabilityEvalInput, now: number): { start: number; end: number } {
  const tsList: number[] = [];
  for (const a of input.alphaDecisions) tsList.push(a.timestamp);
  for (const p of input.portfolioDecisions) tsList.push(p.timestamp);
  for (const o of input.shadowOrders) tsList.push(o.decisionTimestamp);
  for (const f of input.shadowFills) tsList.push(f.fillTimestamp);
  for (const t of input.operationalTelemetry) {
    if (t.timestamp !== undefined) tsList.push(t.timestamp);
  }
  if (tsList.length === 0) return { start: now, end: now };
  return { start: Math.min(...tsList), end: Math.max(...tsList) };
}
