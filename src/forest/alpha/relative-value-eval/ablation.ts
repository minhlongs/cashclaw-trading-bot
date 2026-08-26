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
//
// OOS expectancy convention: PER-PERIOD mean of stitched net returns —
// defined even when a variant completes zero trades.

import type {
  PairSelectionConfig,
  PairSimConfig,
  UniversePanel,
} from '@/tree/alpha/relative-value';
import type { WindowConfig, WindowMode } from '@/forest/backtest/walkforward';
import { runRVWalkForward, type PairConfigFactory } from './walk-forward';
import { oosExpectancy } from './oos-windows';

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

/** Variant inputs: swap the factory / strip selection ranking per component. */
function variantInputs(
  base: RvAblationInput,
  component: RvComponent,
): { selection: PairSelectionConfig; factory: PairConfigFactory } {
  const stripSimField =
    (field: keyof PairSimConfig) => (pair: Parameters<PairConfigFactory>[0]): PairSimConfig => ({
      ...base.configFactory(pair),
      [field]: undefined,
    });
  switch (component) {
    case 'regime_entry_filter':
      return { selection: base.selectionConfig, factory: stripSimField('entryFilter') };
    case 'stability_ranked_selection': {
      const selection: PairSelectionConfig = {
        ...base.selectionConfig,
        stability: undefined,
      };
      return { selection, factory: base.configFactory };
    }
    case 'dynamic_beta':
      return {
        selection: base.selectionConfig,
        factory: (pair) => ({ ...base.configFactory(pair), hedgeMode: 'frozen' }),
      };
    case 'stop_z':
      return { selection: base.selectionConfig, factory: stripSimField('stopZ') };
    case 'in_sim_gate':
      return {
        selection: base.selectionConfig,
        factory: (pair) => ({
          ...base.configFactory(pair),
          inSimTradabilityGate: false,
        }),
      };
  }
}

/**
 * Run the FULL model once, then remove each component one at a time and
 * re-run the walk-forward driver. A component whose removal does not drop
 * stitched OOS expectancy by more than `materialThreshold` (default 0.05)
 * lands in flaggedUnnecessary.
 */
export function runRvAblation(
  input: RvAblationInput,
  materialThreshold = 0.05,
): RvAblationResult {
  if (!Number.isFinite(materialThreshold) || materialThreshold < 0) {
    throw new Error('runRvAblation: materialThreshold must be finite >= 0');
  }
  const full = runRVWalkForward({
    universe: input.universe,
    windowConfig: input.windowConfig,
    mode: input.mode,
    selectionConfig: input.selectionConfig,
    configFactory: input.configFactory,
  });
  const fullExpectancy = oosExpectancy(full);

  const variants: RvAblationVariant[] = [];
  const flaggedUnnecessary: RvComponent[] = [];
  for (const component of RV_COMPONENTS) {
    const { selection, factory } = variantInputs(input, component);
    const result = runRVWalkForward({
      universe: input.universe,
      windowConfig: input.windowConfig,
      mode: input.mode,
      selectionConfig: selection,
      configFactory: factory,
    });
    const expectancy = oosExpectancy(result);
    const deltaExpectancy = fullExpectancy - expectancy;
    variants.push({
      removedComponent: component,
      expectancy,
      deltaExpectancy,
      materialImpact: deltaExpectancy > materialThreshold,
      periods: result.stitched.netReturns.length,
    });
    if (!(deltaExpectancy > materialThreshold)) flaggedUnnecessary.push(component);
  }

  return {
    fullExpectancy,
    fullPeriods: full.stitched.netReturns.length,
    variants,
    flaggedUnnecessary,
  };
}
