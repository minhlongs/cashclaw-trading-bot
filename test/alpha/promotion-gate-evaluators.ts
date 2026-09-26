import { createHash } from 'node:crypto';
import { canonicalize } from '@/lib/canonical-json';
import {
  checkBaselineComparison,
  checkCrossAssetRobustness,
  checkCrossPeriodRobustness,
  checkLeakageInvariance,
  checkNoSingleWindowDependency,
  checkParameterRobustness,
  checkReproducibleHash,
  runPromotionGate,
  type GateCheck,
  type PromotionGateConfig,
  type PromotionGateResult,
  type PromotionGateInput as ProdPromotionGateInput,
} from '@/forest/alpha/gate/index';
import type {
  HashVerificationInput,
  PromotionGateInput,
} from './promotion-gate-fixtures';

export function computeCanonicalSha256(payload: unknown): string {
  const canonical = canonicalize(payload);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export const evalParameterRobustness = checkParameterRobustness;
export const evalCrossPeriodRobustness = checkCrossPeriodRobustness;
export function evalCrossAssetRobustness(
  fraction: number,
  applicable = true,
  threshold = 0.50,
): GateCheck {
  const check = checkCrossAssetRobustness(fraction, applicable, threshold);
  if (!applicable) {
    return {
      ...check,
      actual: 'exempt',
    };
  }
  return check;
}
export const evalLeakageInvariance = checkLeakageInvariance;
export const evalNoSingleWindowDependency = checkNoSingleWindowDependency;
export const evalBaselineComparison = checkBaselineComparison;

export function evalReproducibleHash(input: HashVerificationInput): GateCheck {
  if (input.hashMatches !== undefined) {
    return checkReproducibleHash(input.hashMatches, {
      recordedHash: input.recordedHash ?? 'missing',
      expectedHash: input.hashMatches ? (input.recordedHash ?? 'match') : 'expected-match',
    });
  }
  if (!input.gitSha || input.gitSha.trim().length === 0) {
    return {
      name: 'reproducible_hash',
      passed: false,
      actual: 'missing-git-sha',
      threshold: 'canonical-sha256',
      detail: 'Missing git commit SHA',
    };
  }
  const computed = computeCanonicalSha256({
    gitSha: input.gitSha,
    seed: input.seed ?? 0,
    config: input.config ?? {},
  });
  const passed = input.recordedHash?.toLowerCase() === computed.toLowerCase();
  return checkReproducibleHash(passed, {
    recordedHash: input.recordedHash ?? '',
    expectedHash: computed,
  });
}

export function runOpaquePromotionGate(
  input: PromotionGateInput,
  userConfig: Partial<PromotionGateConfig> = {},
): PromotionGateResult {
  const hashCheck = evalReproducibleHash(input.hashVerification);

  const prodInput: ProdPromotionGateInput = {
    financial: {
      numTrades: input.numTrades,
      expectancy: input.expectancy,
      profitFactor: input.profitFactor,
      maxDrawdown: input.maxDrawdown,
      sharpe: input.sharpe,
      sortino: input.sortino,
      byRegime: input.byRegime,
    },
    stress: {
      netPnlNormal: input.feeStress.netPnlNormal,
      netPnlConservative: input.feeStress.netPnlConservative,
      netPnlAdverse: input.slippageStress.netPnlAdverse,
      netPnlExtreme: input.slippageStress.netPnlExtreme,
    },
    robustness: {
      parameterSpread: input.parameterSensitivitySpread,
      crossPeriodPositiveFraction: input.walkForwardPositiveFraction,
      crossAssetPositiveFraction: input.crossAsset.positiveAssetFraction,
      crossAssetApplicable: input.crossAsset.applicable ?? true,
      leakageViolations: input.leakageViolations,
      windowPnls: input.windowPnls,
      baselineCandidate: input.baselineComparison.candidate,
      baselineBuyHold: input.baselineComparison.buyHold,
      baselineRandomEntry: input.baselineComparison.randomEntry,
      hashMatches: hashCheck.passed,
      hashDetails: hashCheck.detail,
    },
  };

  return runPromotionGate(prodInput, userConfig);
}
