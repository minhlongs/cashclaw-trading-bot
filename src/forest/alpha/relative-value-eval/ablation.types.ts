// Component ablation for relative-value arms.
// Follows the SHAPE of tree/alpha/hypothesis/ablation.ts (full run, remove
// one component at a time, Δ-metric + flaggedUnnecessary) WITHOUT importing
// it — the domains are incompatible (indicator hypotheses vs RV configs).
// Every variant re-runs the REAL walk-forward driver (runRVWalkForward →
// runPairSpreadSim only); nothing here re-simulates. Pure + deterministic.
//
// Removal semantics (M4 baseline):
//   - regime_entry_filter        → sim config WITHOUT its entry filter
//   - stability_ranked_selection → plain corr topK (stability config unset)
//   - dynamic_beta               → hedgeMode pinned to 'frozen'
//   - stop_z                     → hard-stop threshold unset
//   - in_sim_gate                → in-simulator tradability gate disabled

import type {
  PairSelectionConfig,
  UniversePanel,
} from '@/tree/alpha/relative-value';
import type { WindowConfig, WindowMode } from '@/forest/backtest/walkforward';
import type { PairConfigFactory } from './walk-forward';

/** Removable M4 components (toggle OFF one at a time). */
export type RvComponent =
  | 'regime_entry_filter'
  | 'stability_ranked_selection'
  | 'dynamic_beta'
  | 'stop_z'
  | 'in_sim_gate';

export const RV_COMPONENTS: readonly RvComponent[] = [
  'regime_entry_filter',
  'stability_ranked_selection',
  'dynamic_beta',
  'stop_z',
  'in_sim_gate',
];

/** Full-model (M4) definition the ablation strips components from. */
export interface RvAblationInput {
  readonly universe: UniversePanel;
  readonly windowConfig: WindowConfig;
  readonly mode: WindowMode;
  readonly selectionConfig: PairSelectionConfig;
  readonly configFactory: PairConfigFactory;
}

/** One removed-component variant outcome. */
export interface RvAblationVariant {
  readonly removedComponent: RvComponent;
  /** Stitched OOS expectancy with the component removed. */
  readonly expectancy: number;
  /** Full-model expectancy minus variant expectancy. */
  readonly deltaExpectancy: number;
  /** True when removal dropped expectancy by more than the threshold. */
  readonly materialImpact: boolean;
  /** Stitched OOS period count for the variant. */
  readonly periods: number;
}

/** Full ablation result. */
export interface RvAblationResult {
  readonly fullExpectancy: number;
  readonly fullPeriods: number;
  readonly variants: readonly RvAblationVariant[];
  /** Components whose removal did NOT materially hurt. */
  readonly flaggedUnnecessary: readonly RvComponent[];
}
