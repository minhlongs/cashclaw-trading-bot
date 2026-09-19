// Grid Levels — Facade for grid computation, trailing TP/SL, and metrics.
// Re-exports all types and functions from single-responsibility submodules.

export type { CloseAction } from './grid-levels-types';
export { computeGridLevels } from './grid-levels-compute';
export { updateTrailingLevels, findTrailingExits } from './grid-levels-trailing';
export { computeDeployedCapital } from './grid-levels-capital';
