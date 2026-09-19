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

import { runRVWalkForward } from './walk-forward';
import { oosExpectancy } from './oos-windows';
import { variantInputs } from './ablation.variants';
import {
  RV_COMPONENTS,
  type RvAblationInput,
  type RvAblationResult,
  type RvAblationVariant,
  type RvComponent,
} from './ablation.types';

export type { RvComponent, RvAblationInput, RvAblationVariant, RvAblationResult } from './ablation.types';
export { RV_COMPONENTS } from './ablation.types';

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
