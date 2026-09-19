// Composition evaluation seam — score → portfolio → report.
// Wire-in seam composing composition scoring, portfolio construction, and
// performance metrics (plan §6+§7). Pure orchestration — no I/O, no network,
// no ambient randomness or clock access.
//
// Composition order: validate inputs → per-decision-time scoring
// (scoreComposedAlphas) → portfolio construction (buildPortfolio) →
// gross/net return computation → equity curve → performance report.
// Errors propagate verbatim — nothing is swallowed (fail-closed).

export { resolveCostFraction } from './evaluate-cost';
export { evaluateComposition, toWeightMap } from './evaluate-core';
