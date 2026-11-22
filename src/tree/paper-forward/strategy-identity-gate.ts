// Strategy Identity Safety Gate (§8): Fail-Closed Economic & Provenance Parity Evaluator.
// Pure Open-Core: zero @/ee, @/forest, @/land, node:fs, fetch, or live order authority imports.

import {
  DeclaredStrategyEconomicsSchema,
  RuntimeCapabilityProfileSchema,
  type BarGranularity,
  type DeclaredStrategyEconomics,
  type RuntimeCapabilityProfile,
  type StrategyIdentityDimension,
  type StrategyIdentityGateResult,
  type StrategyIdentityMismatch,
} from './strategy-identity-types';

function mismatch(
  dimension: StrategyIdentityDimension, declared: string, runtime: string,
  severity: 'CRITICAL' | 'HIGH', reason: string,
): StrategyIdentityMismatch {
  return { dimension, declared, runtime, severity, reason };
}

function failInvalid(prefix: string, issues: readonly { message: string }[]): StrategyIdentityGateResult {
  return {
    ok: false, verdict: 'INSUFFICIENT_EVIDENCE', promotionAllowed: false,
    code: 'INVALID_DECLARATION_OR_CAPABILITY', mismatches: [],
    error: `${prefix}: ${issues.map((i) => i.message).join('; ')}`,
  };
}

function collectEconomicMismatches(
  declared: DeclaredStrategyEconomics,
  runtime: RuntimeCapabilityProfile,
): StrategyIdentityMismatch[] {
  const out: StrategyIdentityMismatch[] = [];
  if (declared.legs !== runtime.supportedLegs) {
    out.push(mismatch('legs', String(declared.legs), String(runtime.supportedLegs), 'CRITICAL',
      `Declared strategy requires ${declared.legs} legs, runtime supports ${runtime.supportedLegs}`));
  }
  if (declared.structure !== runtime.structure) {
    out.push(mismatch('structure', declared.structure, runtime.structure, 'CRITICAL',
      `Declared structure '${declared.structure}' does not match runtime '${runtime.structure}'`));
  }
  if (declared.requiresFundingAccrual && !runtime.supportsFundingAccrual) {
    out.push(mismatch('funding_accrual', 'required', 'unsupported', 'CRITICAL',
      'Declared strategy requires funding accrual, which runtime does not support'));
  }
  if (declared.requiresHedgeExecution && !runtime.supportsHedgeExecution) {
    out.push(mismatch('hedge_execution', 'required', 'unsupported', 'CRITICAL',
      'Declared strategy requires hedge leg execution, which runtime does not support'));
  }
  if (declared.requiresBorrowFinancing && !runtime.supportsBorrowFinancing) {
    out.push(mismatch('borrow_financing', 'required', 'unsupported', 'CRITICAL',
      'Declared strategy requires borrow/financing modeling, which runtime does not support'));
  }
  if (declared.feeSettlementModel !== runtime.feeSettlementModel) {
    out.push(mismatch('fee_settlement_model', declared.feeSettlementModel, runtime.feeSettlementModel, 'CRITICAL',
      `Fee/settlement model '${declared.feeSettlementModel}' differs from runtime '${runtime.feeSettlementModel}'`));
  }
  if (!runtime.supportedBarGranularities.includes(declared.barGranularity)) {
    out.push(mismatch('bar_granularity', declared.barGranularity, runtime.supportedBarGranularities.join(','), 'HIGH',
      `Bar granularity '${declared.barGranularity}' is not in runtime supported granularities`));
  }
  if (!runtime.paperExecutionCapable) {
    out.push(mismatch('paper_execution', 'required', 'incapable', 'CRITICAL',
      'PAPER_ONLY invariant requires paper execution capability, which runtime lacks'));
  }
  return out;
}

export function evaluateStrategyIdentityGate(
  declaredRaw: unknown,
  runtimeRaw: unknown,
): StrategyIdentityGateResult {
  const declaredParsed = DeclaredStrategyEconomicsSchema.safeParse(declaredRaw);
  if (!declaredParsed.success) {
    return failInvalid('Invalid declared strategy economics', declaredParsed.error.issues);
  }
  const runtimeParsed = RuntimeCapabilityProfileSchema.safeParse(runtimeRaw);
  if (!runtimeParsed.success) {
    return failInvalid('Invalid runtime capability profile', runtimeParsed.error.issues);
  }
  const declared = declaredParsed.data;
  const runtime = runtimeParsed.data;
  const economicMismatches = collectEconomicMismatches(declared, runtime);
  const provenanceBlocked =
    declared.provenance.oosStatus !== 'UNTOUCHED_FRESH_OOS' || !declared.provenance.paperForwardEligible;
  const mismatches: StrategyIdentityMismatch[] = [...economicMismatches];
  if (provenanceBlocked) {
    mismatches.push(mismatch(
      'research_provenance',
      `${declared.provenance.oosStatus} (paperForwardEligible=${declared.provenance.paperForwardEligible})`,
      'UNTOUCHED_FRESH_OOS (paperForwardEligible=true)',
      'CRITICAL',
      `Provenance status '${declared.provenance.oosStatus}' with paperForwardEligible=${declared.provenance.paperForwardEligible} is not promotable`,
    ));
  }
  if (economicMismatches.length > 0) {
    return {
      ok: false, verdict: 'ECONOMICALLY_DIFFERENT', promotionAllowed: false,
      code: 'ECONOMIC_IDENTITY_MISMATCH', mismatches,
      error: `Strategy '${declared.strategyId}' is economically incompatible with runtime '${runtime.runtimeId}' (${mismatches.length} mismatch(es))`,
    };
  }
  if (provenanceBlocked) {
    return {
      ok: false, verdict: 'INSUFFICIENT_EVIDENCE', promotionAllowed: false,
      code: 'PROVENANCE_NOT_PROMOTABLE', mismatches,
      error: `Strategy '${declared.strategyId}' failed provenance gate: ${declared.provenance.oosStatus}`,
    };
  }
  return {
    ok: true, verdict: 'ECONOMICALLY_IDENTICAL', promotionAllowed: true,
    strategyId: declared.strategyId, runtimeId: runtime.runtimeId, mismatches: [],
  };
}

export function assertStrategyIdentityParity(declaredRaw: unknown, runtimeRaw: unknown): void {
  const result = evaluateStrategyIdentityGate(declaredRaw, runtimeRaw);
  if (!result.ok) throw new Error(`${result.code}: ${result.error}`);
}

export const ALL_BAR_GRANULARITIES: readonly BarGranularity[] = Object.freeze([
  '1m', '5m', '15m', '1h', '4h', '1d',
] as const);
export const DAILY_BAR_GRANULARITIES: readonly BarGranularity[] = Object.freeze(['1d'] as const);

export const H3_MAKER_LAB_DECLARED_ECONOMICS: Readonly<DeclaredStrategyEconomics> = Object.freeze({
  strategyId: 'H3_MAKER', legs: 2, structure: 'market_neutral',
  requiresFundingAccrual: true, requiresHedgeExecution: true, requiresBorrowFinancing: false,
  feeSettlementModel: 'two_leg_spot_perp_maker_taker', barGranularity: '1d', paperExecutionRequired: true,
  provenance: Object.freeze({
    specSha256: '43ac1c5bec68810391da6d366156b933369dada96631fe0c54d66c376ef94169',
    trialCount: 185, oosStatus: 'EXPOSED_HOLDOUT_QUARANTINED', paperForwardEligible: false,
  }),
});

export const H3_MAKER_BOT_RUNTIME_CAPABILITY: Readonly<RuntimeCapabilityProfile> = Object.freeze({
  runtimeId: 'h3_maker_bot_runtime', sourceModule: 'src/tree/bot/strategies/h3-maker.ts',
  supportedLegs: 1, structure: 'directional',
  supportsFundingAccrual: false, supportsHedgeExecution: false, supportsBorrowFinancing: false,
  feeSettlementModel: 'single_leg_spot', supportedBarGranularities: DAILY_BAR_GRANULARITIES,
  paperExecutionCapable: true, liveOrderAuthority: false,
});

export const G13_PAPER_FORWARD_RUNNER_CAPABILITY: Readonly<RuntimeCapabilityProfile> = Object.freeze({
  runtimeId: 'g13_paper_forward_runner', sourceModule: 'src/tree/paper-forward/paper-forward-runner.ts',
  supportedLegs: 2, structure: 'market_neutral',
  supportsFundingAccrual: true, supportsHedgeExecution: true, supportsBorrowFinancing: false,
  feeSettlementModel: 'two_leg_spot_perp_maker_taker', supportedBarGranularities: DAILY_BAR_GRANULARITIES,
  paperExecutionCapable: true, liveOrderAuthority: false,
});

export const H3_BASIS_CARRY_V2_DECLARED_ECONOMICS: Readonly<DeclaredStrategyEconomics> = Object.freeze({
  strategyId: 'H3_BASIS_CARRY_V2', legs: 2, structure: 'market_neutral',
  requiresFundingAccrual: true, requiresHedgeExecution: true, requiresBorrowFinancing: true,
  feeSettlementModel: 'two_leg_spot_perp_maker_taker', barGranularity: '1d', paperExecutionRequired: true,
  provenance: Object.freeze({
    specSha256: '0000000000000000000000000000000000000000000000000000000000000000',
    trialCount: 1, oosStatus: 'PENDING_FRESH_OOS', paperForwardEligible: false,
  }),
});
