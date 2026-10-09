import { DEFAULT_PROMOTION_GATE_CONFIG, type PromotionGateConfig, type PromotionGateInput, type PromotionGateResult } from './types';
import { PromotionGateConfigSchema, PromotionGateInputSchema, PromotionGateResultSchema } from './schemas';
import { buildPromotionGateChecks } from './promotion-gate-checks';

export function runPromotionGate(input: PromotionGateInput, config?: Partial<PromotionGateConfig>): PromotionGateResult {
  PromotionGateInputSchema.parse(input);
  const validatedConfig = PromotionGateConfigSchema.parse({ ...DEFAULT_PROMOTION_GATE_CONFIG, ...(config ?? {}) });
  const checks = buildPromotionGateChecks(input, validatedConfig);
  const failedChecks = checks.filter(c => !c.passed);
  const passed = failedChecks.length === 0;
  const verdict: 'PASSED' | 'KILLED' = passed ? 'PASSED' : 'KILLED';
  const diagnosticReasons = failedChecks.map(c => `Check [${c.name}] failed: ${c.detail}`);
  const result: PromotionGateResult = { passed, verdict, checks, failedChecks, diagnosticReasons, timestamp: Date.now() };
  PromotionGateResultSchema.parse(result);
  return result;
}
