/** Canned JSON responses keyed by agent role (detected via systemPrompt). */
export const CANNED_RESPONSES: Record<string, string> = {
  analyst: JSON.stringify({ claim: 'Fundamental metrics support the thesis', evidence: ['Revenue growth 15%', 'Margin expansion'] }),
  'bull-researcher': JSON.stringify({
    thesis: 'Momentum persists in trending regime', evidence: ['Trend strength above 20-day MA', 'Volume confirmation'],
    mechanism: 'Trend-following momentum drives continued returns due to persistent investor flows',
    expectedDirection: 'long', horizon: 20, features: ['momentum_20d', 'volume_ratio'],
  }),
  'bear-researcher': JSON.stringify({
    thesis: 'Mean reversion dominates after overextension', evidence: ['RSI above 70', 'Divergence in volume'],
    mechanism: 'Overextension in momentum leads to reversal as positioning unwinds',
    expectedDirection: 'short', horizon: 20, features: ['rsi_14', 'volume_divergence'],
  }),
  'research-manager': JSON.stringify({
    thesis: 'Momentum with mean-reversion guard', strongestEvidence: 'Trend strength above 20-day MA',
    strongestCounterEvidence: 'RSI above 70', unresolvedUncertainty: 'Regime transition timing',
    falsifiableAssumptions: [{ statement: 'Trend persists 20 bars', howToFalsify: 'Break below 20-day MA' }],
    proposedExperiments: [{ hypothesisRef: 'momentum-20d', method: 'Walk-forward OOS' }],
  }),
  'risk-advisor': JSON.stringify({
    expectedRegime: 'TREND_UP', keyRisks: ['Regime shift', 'Liquidity gap'],
    failureConditions: ['Drawdown exceeds 5%', 'Correlation spike'], maxAcceptableExposure: 0.6,
    liquidityConcern: 'moderate', volatilityConcern: 'high', correlationConcern: 'low',
  }),
  'portfolio-advisor': JSON.stringify({ assets: ['alpha-momentum'], weights: [0.3], hedge: 'volatility overlay', rebalance: 'weekly', exposure: 0.5 }),
};

/** Detect agent role from systemPrompt. */
export function detectRole(systemPrompt: string | undefined): string {
  if (!systemPrompt) return 'analyst';
  if (systemPrompt.includes('bull researcher')) return 'bull-researcher';
  if (systemPrompt.includes('bear researcher')) return 'bear-researcher';
  if (systemPrompt.includes('research manager')) return 'research-manager';
  if (systemPrompt.includes('risk advisor')) return 'risk-advisor';
  if (systemPrompt.includes('portfolio advisor')) return 'portfolio-advisor';
  return 'analyst';
}
