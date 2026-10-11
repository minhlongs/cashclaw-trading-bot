import type { PortfolioDecisionRecord } from '../../../tree/alpha/observability/types';
import type { PortfolioDiagnosticsSection } from './types';

const round4 = (v: number): number => Number(v.toFixed(4));

export function computePortfolioDiagnostics(records: readonly PortfolioDecisionRecord[]): PortfolioDiagnosticsSection {
  const count = records.length;
  if (count === 0) {
    return { meanGrossExposure: 0, meanNetExposure: 0, meanVolTargetingScale: 0, totalTurnover: 0, activeRiskOverlayTriggers: {} };
  }
  const grossSum = records.reduce((acc, p) => acc + p.grossExposure, 0);
  const netSum = records.reduce((acc, p) => acc + p.netExposure, 0);
  const volSum = records.reduce((acc, p) => acc + p.volTargetingScale, 0);
  const turnoverSum = records.reduce((acc, p) => acc + (p.totalTurnover ?? 0), 0);
  const activeRiskOverlayTriggers: Record<string, number> = {};
  for (const p of records) {
    for (const adj of p.activeRiskOverlayAdjustments) {
      activeRiskOverlayTriggers[adj] = (activeRiskOverlayTriggers[adj] ?? 0) + 1;
    }
  }
  return {
    meanGrossExposure: round4(grossSum / count),
    meanNetExposure: round4(netSum / count),
    meanVolTargetingScale: round4(volSum / count),
    totalTurnover: round4(turnoverSum),
    activeRiskOverlayTriggers,
  };
}
