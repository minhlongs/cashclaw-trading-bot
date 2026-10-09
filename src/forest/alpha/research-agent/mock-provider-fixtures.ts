export const DEFAULT_HYPOTHESIS_FIXTURE = JSON.stringify([
  {
    id: 'hyp-mock-001',
    title: 'Funding-Volume Divergence Reversion',
    rationale: 'Extreme divergence between perpetual funding rates and spot trade volume predicts short-term mean reversion.',
    domainCategory: 'derivatives_interaction',
    proposedMetrics: { minSharpe: 1.2, minTrades: 30 },
    falsificationCriteria: ['Bootstrap CI lower bound <= 0', 'Permutation p-value >= 0.05'],
  },
]);

export const DEFAULT_FEATURE_FIXTURE = JSON.stringify([
  {
    name: 'orderbook_volume_ratio',
    indicators: ['order_book_imbalance', 'volume_delta'],
    combinationLogic: 'order_book_imbalance / (abs(volume_delta) + 1e-4)',
    lookbackPeriods: [14, 28],
    causalJustification: 'Uses backward-looking realized depth and trade volume with zero look-ahead bias.',
  },
]);

export const DEFAULT_DIAGNOSIS_FIXTURE = JSON.stringify({
  jobId: 'job-mock-falsified-001',
  primaryFailureReason: 'Transaction cost drag under 27 bps round-trip fee model',
  contributingFactors: ['High trade turnover', 'Inadequate holding horizon'],
  metricShortfalls: {
    netPnlUsd: { expected: 1500, actual: -420 },
    profitFactor: { expected: 1.2, actual: 0.82 },
  },
  recommendations: ['Increase signal threshold to filter low-conviction entries', 'Extend minimum holding period'],
});

export const DEFAULT_CLUSTERING_FIXTURE = JSON.stringify([
  {
    clusterId: 'cluster-mock-001',
    theme: 'Order Book Microstructure',
    memberIds: ['hyp-mock-001', 'hyp-mock-002'],
    redundancyScore: 0.88,
    recommendedRepresentativeId: 'hyp-mock-001',
  },
]);

export const DEFAULT_NEXT_EXPERIMENT_FIXTURE = JSON.stringify([
  {
    hypothesisId: 'hyp-mock-followup-001',
    title: 'Filtered Funding Divergence with Volatility Regime Lock',
    proposedParameters: { minVolumeZ: 2.0, regimeFilter: 'trending_up' },
    targetRegime: 'trending_up',
    rationale: 'Restricts trading to trending regimes to mitigate turnover cost drag observed in prior run.',
  },
]);
