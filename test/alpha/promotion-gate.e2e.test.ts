import { describe } from 'vitest';
import { registerTier1FinancialTests } from './tier1-financial';
import { registerTier1StressTests } from './tier1-stress';
import { registerTier1RobustnessTests } from './tier1-robustness';
import { registerTier2FinancialTests } from './tier2-financial';
import { registerTier2StressTests } from './tier2-stress';
import { registerTier2RobustnessTests } from './tier2-robustness';
import { registerTier3CrossFeatureTests } from './tier3-cross-feature';
import { registerTier4RealWorldTests } from './tier4-real-world';

describe('Phase 9: Strengthened Promotion Gate 15-Point E2E Test Suite', () => {
  registerTier1FinancialTests();
  registerTier1StressTests();
  registerTier1RobustnessTests();
  registerTier2FinancialTests();
  registerTier2StressTests();
  registerTier2RobustnessTests();
  registerTier3CrossFeatureTests();
  registerTier4RealWorldTests();
});
