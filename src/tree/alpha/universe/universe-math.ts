// Cross-sectional universe math (mission §3C).
// Pure, deterministic — no I/O, no network, no Node APIs, no Math.random/Date.now.

export { rankAssets, percentileNormalize, selectLongShort } from './universe-ranking';
export { marketNeutralWeights, basketNeutralize } from './universe-neutralization';
