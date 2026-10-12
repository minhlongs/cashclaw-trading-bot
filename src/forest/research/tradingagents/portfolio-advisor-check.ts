import type { PortfolioResult, PortfolioConfig } from '@/tree/alpha/portfolio/types';

export function collectPortfolioViolations(
  result: PortfolioResult,
  config: PortfolioConfig
): string[] {
  const reasons: string[] = [];
  const badPatterns = ['clamped', 'clipped', 'scaled to 0', 'de-risked', 'drawdown de-risk'];
  for (const adj of result.riskAdjustments) {
    if (badPatterns.some(p => adj.includes(p))) {
      reasons.push(`portfolio: risk overlay violation — ${adj}`);
    }
  }
  if (result.grossExposure > config.maxGrossExposure + 1e-9) {
    reasons.push(`portfolio: gross exposure ${result.grossExposure} exceeds max ${config.maxGrossExposure}`);
  }
  if (result.netExposure > config.maxNetExposure + 1e-9) {
    reasons.push(`portfolio: net exposure ${result.netExposure} exceeds max ${config.maxNetExposure}`);
  }
  if (result.totalTurnover > config.maxTurnover + 1e-9) {
    reasons.push(`portfolio: turnover ${result.totalTurnover} exceeds max ${config.maxTurnover}`);
  }
  if (result.drawdownDeRisked && result.grossExposure === 0) {
    reasons.push(`portfolio: drawdown de-risked to zero exposure`);
  }
  return reasons;
}
