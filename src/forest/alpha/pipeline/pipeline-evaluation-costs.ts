// Alpha Research Pipeline — Cost Computation Step
// Step: compute_costs

import type { EvalData, CostData } from './types';

export function stepComputeCosts(map: Map<string, unknown>): CostData {
  const ev = map.get('evaluate') as EvalData | undefined;
  const report = ev?.report;
  const fees = report?.fees ?? 0;
  const slippage = report?.slippage ?? 0;
  const grossPnl = (report?.netPnl ?? 0) + fees + slippage;
  return {
    grossPnl,
    netPnl: report?.netPnl ?? 0,
    fees,
    slippage,
  };
}
