// Component ablation for relative-value arms.
// Variant inputs: swap the factory / strip selection ranking per component.

import type { PairSelectionConfig, PairSimConfig } from '@/tree/alpha/relative-value';
import type { PairConfigFactory } from './walk-forward';
import type { RvAblationInput, RvComponent } from './ablation.types';

/** Variant inputs: swap the factory / strip selection ranking per component. */
export function variantInputs(
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
