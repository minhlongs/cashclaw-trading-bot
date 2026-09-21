// Cross-sectional portfolio simulator helpers. Pure, deterministic, causal —
// no I/O, no network, no Math.random/Date.now. Causality contract: weights
// decided at snapshot t earn return for period starting at t; no index touching
// period t reads data from timestamp > t.

export { indexReturnPanel, validateSnapshotAlignment } from './sim-panel-indexer';
export { processPeriod } from './sim-period-processor';
