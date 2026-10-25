import {
  computeAlmgrenChrissTrajectory,
  type AlmgrenChrissStrategyClass,
} from '../../quantlib/execution/almgren-chriss-trajectory';
import { evaluateVpinThrottling } from '../../execution/almgren-chriss/vpin-execution-throttler';

export interface QuantExecutionInput {
  readonly totalQuantity: number;
  readonly volatilityPct: number;
  readonly vpinCdf?: number;
  readonly horizonSteps?: number;
  readonly stepSeconds?: number;
  readonly riskAversionLambda?: number;
}

export interface QuantExecutionPlan {
  readonly sliceQuantity: number;
  readonly firstSliceRatio: number;
  readonly urgencyKappa: number;
  readonly expectedShortfallCost: number;
  readonly strategyClass: AlmgrenChrissStrategyClass;
  readonly isThrottled: boolean;
  readonly preferPassiveMaker: boolean;
  readonly adjustedHorizonSeconds: number;
}

export function computeQuantExecutionPlan(input: QuantExecutionInput): QuantExecutionPlan {
  const horizonSteps = input.horizonSteps ?? 4;
  const baseHorizon = horizonSteps * (input.stepSeconds ?? 5);
  const throttle = evaluateVpinThrottling(baseHorizon, input.vpinCdf ?? 0);

  const ac = computeAlmgrenChrissTrajectory({
    totalShares: input.totalQuantity,
    horizonSteps,
    stepSeconds: throttle.adjustedHorizonSeconds / horizonSteps,
    volatility: Math.max(0.01, input.volatilityPct / 100),
    riskAversionLambda: input.riskAversionLambda ?? 0.1,
    tempImpactEta: 0.05,
    permImpactGamma: 0.01,
  });

  const effectiveRatio = throttle.preferPassiveMaker
    ? Math.min(ac.firstSliceRatio, 1 / horizonSteps)
    : ac.firstSliceRatio;

  const sliceQuantity = Number((input.totalQuantity * effectiveRatio).toFixed(6));

  return {
    sliceQuantity,
    firstSliceRatio: effectiveRatio,
    urgencyKappa: ac.urgencyKappa,
    expectedShortfallCost: ac.expectedShortfallCost,
    strategyClass: ac.strategyClass,
    isThrottled: throttle.isThrottled,
    preferPassiveMaker: throttle.preferPassiveMaker,
    adjustedHorizonSeconds: throttle.adjustedHorizonSeconds,
  };
}
