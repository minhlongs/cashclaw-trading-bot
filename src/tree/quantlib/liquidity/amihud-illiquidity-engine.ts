import type {
  AmihudPriceVolumeBar,
  AmihudIlliqConfig,
  AmihudIlliqResult,
} from './amihud-illiq-types';
import { AmihudIlliqEngine } from './amihud-illiq-engine';

export class AmihudIlliquidityEngine extends AmihudIlliqEngine {
  constructor(config: Partial<AmihudIlliqConfig> = {}) {
    super(config);
  }
}

export type { AmihudPriceVolumeBar, AmihudIlliqConfig, AmihudIlliqResult };
