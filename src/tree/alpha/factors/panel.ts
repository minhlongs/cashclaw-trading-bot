// Symbol×time OHLCV panel types + causal forward-return builder (Phase 3, D3).
// Pure, deterministic — no I/O, no network, no Node APIs. Validation mirrors
// the fail-closed style of cross-sectional/simulator.ts `indexReturnPanel`.
//
// FORWARD-DATA BOUNDARY (binding): `buildForwardReturnSeries` reads future
// closes BY DEFINITION, so forward returns exist ONLY here and in the IC
// metrics module. They are an EVALUATION metric (measuring how well past
// scores predicted realized returns) and must NEVER feed signal construction:
// the zoo evaluator (src/tree/research/alpha/zoo/operator-*) cannot reach
// this module by construction.

export type { SymbolPanel, ForwardReturnSeries } from './panel-validate';
export { validateSymbolPanel } from './panel-validate';
export { materializeVwap, buildForwardReturnSeries } from './panel-forward-return';
export { validateAlignedPanels } from './panel-aligned';
