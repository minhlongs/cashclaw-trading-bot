// Parameter robustness grid for relative-value arms — facade re-exporting
// from robustness-grid.ts and robustness-runner.ts.

export {
  ROBUSTNESS_ENTRY_Z,
  ROBUSTNESS_HEDGE_WINDOWS,
  ROBUSTNESS_STRESS_MODES,
  ROBUSTNESS_RUN_COUNT,
  runGridPoint,
} from './robustness-grid';
export type {
  RvRobustnessEntry,
  RvRobustnessInput,
} from './robustness-grid';
export {
  runRvRobustness,
} from './robustness-runner';
export type {
  RvRobustnessReport,
} from './robustness-runner';
