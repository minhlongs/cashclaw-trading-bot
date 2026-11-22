import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertStrategyIdentityParity,
  evaluateStrategyIdentityGate,
  G13_PAPER_FORWARD_RUNNER_CAPABILITY,
  H3_BASIS_CARRY_V2_DECLARED_ECONOMICS,
  H3_MAKER_BOT_RUNTIME_CAPABILITY,
  H3_MAKER_LAB_DECLARED_ECONOMICS,
  type DeclaredStrategyEconomics,
  type RuntimeCapabilityProfile,
} from '../../src/tree/paper-forward';

const VALID_DECLARED: DeclaredStrategyEconomics = {
  strategyId: 'H3_FRESH_OOS_CANDIDATE',
  legs: 2,
  structure: 'market_neutral',
  requiresFundingAccrual: true,
  requiresHedgeExecution: true,
  requiresBorrowFinancing: false,
  feeSettlementModel: 'two_leg_spot_perp_maker_taker',
  barGranularity: '1d',
  paperExecutionRequired: true,
  provenance: {
    specSha256: 'a'.repeat(64),
    trialCount: 1,
    oosStatus: 'UNTOUCHED_FRESH_OOS',
    paperForwardEligible: true,
  },
};

const VALID_RUNTIME: RuntimeCapabilityProfile = {
  runtimeId: 'two_leg_paper_runner',
  sourceModule: 'src/tree/paper-forward/paper-forward-runner.ts',
  supportedLegs: 2,
  structure: 'market_neutral',
  supportsFundingAccrual: true,
  supportsHedgeExecution: true,
  supportsBorrowFinancing: false,
  feeSettlementModel: 'two_leg_spot_perp_maker_taker',
  supportedBarGranularities: ['1d'],
  paperExecutionCapable: true,
  liveOrderAuthority: false,
};

function sha256File(relPath: string): string {
  return createHash('sha256').update(readFileSync(resolve(process.cwd(), relPath))).digest('hex');
}

describe('Strategy Identity Safety Gate (§8)', () => {
  it('passes when 2-leg spec with UNTOUCHED_FRESH_OOS matches 2-leg runtime', () => {
    const res = evaluateStrategyIdentityGate(VALID_DECLARED, VALID_RUNTIME);
    expect(res).toEqual({
      ok: true,
      verdict: 'ECONOMICALLY_IDENTICAL',
      promotionAllowed: true,
      strategyId: VALID_DECLARED.strategyId,
      runtimeId: VALID_RUNTIME.runtimeId,
      mismatches: [],
    });
    expect(() => assertStrategyIdentityParity(VALID_DECLARED, VALID_RUNTIME)).not.toThrow();
  });

  it('fails closed for H3_MAKER lab economics vs single-leg H3MakerStrategy bot runtime', () => {
    const res = evaluateStrategyIdentityGate(
      H3_MAKER_LAB_DECLARED_ECONOMICS,
      H3_MAKER_BOT_RUNTIME_CAPABILITY,
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.verdict).toBe('ECONOMICALLY_DIFFERENT');
    expect(res.promotionAllowed).toBe(false);
    expect(res.code).toBe('ECONOMIC_IDENTITY_MISMATCH');
    expect(res.mismatches.map((m) => m.dimension)).toEqual(
      expect.arrayContaining([
        'legs',
        'structure',
        'funding_accrual',
        'hedge_execution',
        'fee_settlement_model',
        'research_provenance',
      ]),
    );
    expect(H3_MAKER_BOT_RUNTIME_CAPABILITY.supportedBarGranularities).toEqual(['1d']);
    expect(() =>
      assertStrategyIdentityParity(H3_MAKER_LAB_DECLARED_ECONOMICS, H3_MAKER_BOT_RUNTIME_CAPABILITY),
    ).toThrow(/ECONOMIC_IDENTITY_MISMATCH/);
  });

  it('fails closed for H3_BASIS_CARRY_V2 vs G13_PAPER_FORWARD_RUNNER_CAPABILITY (borrow + PENDING_FRESH_OOS)', () => {
    const res = evaluateStrategyIdentityGate(
      H3_BASIS_CARRY_V2_DECLARED_ECONOMICS,
      G13_PAPER_FORWARD_RUNNER_CAPABILITY,
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.verdict).toBe('ECONOMICALLY_DIFFERENT');
    expect(res.promotionAllowed).toBe(false);
    expect(res.code).toBe('ECONOMIC_IDENTITY_MISMATCH');
    expect(res.mismatches.map((m) => m.dimension)).toEqual(['borrow_financing', 'research_provenance']);
  });

  it.each([
    ['legs', { ...VALID_RUNTIME, supportedLegs: 1 as const }],
    ['structure', { ...VALID_RUNTIME, structure: 'directional' as const }],
    ['funding_accrual', { ...VALID_RUNTIME, supportsFundingAccrual: false }],
    ['hedge_execution', { ...VALID_RUNTIME, supportsHedgeExecution: false }],
    ['fee_settlement_model', { ...VALID_RUNTIME, feeSettlementModel: 'two_leg_spot_perp_taker_only' as const }],
    ['bar_granularity', { ...VALID_RUNTIME, supportedBarGranularities: ['1h' as const] }],
    ['paper_execution', { ...VALID_RUNTIME, paperExecutionCapable: false }],
  ])('fails closed on individual economic dimension mismatch: %s', (dimension, runtimeOverride) => {
    const res = evaluateStrategyIdentityGate(VALID_DECLARED, runtimeOverride);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.verdict).toBe('ECONOMICALLY_DIFFERENT');
    expect(res.code).toBe('ECONOMIC_IDENTITY_MISMATCH');
    expect(res.mismatches.map((m) => m.dimension)).toEqual([dimension]);
  });

  it('fails closed on individual borrow_financing mismatch', () => {
    const res = evaluateStrategyIdentityGate(
      { ...VALID_DECLARED, requiresBorrowFinancing: true },
      VALID_RUNTIME,
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('ECONOMIC_IDENTITY_MISMATCH');
    expect(res.mismatches.map((m) => m.dimension)).toEqual(['borrow_financing']);
  });

  it('verifies strategy_identity_assessment.json pins exact SHA-256 of untouched historical records', () => {
    const assessmentPath = resolve(process.cwd(), 'artifacts/strategy_identity_assessment.json');
    const assessment = JSON.parse(readFileSync(assessmentPath, 'utf8')) as {
      assessment_version: string;
      immutable_historical_records_preserved: {
        signed_strategy_spec_h3_maker_sha256: string;
        strategy_lifecycle_registry_sha256: string;
      };
      economic_identity_verdict: string;
      proposed_v2_candidate: {
        strategy_id: string;
        paper_forward_allowed: boolean;
        live_order_authority: boolean;
      };
    };
    expect(assessment.assessment_version).toBe('1.0.0');
    expect(assessment.economic_identity_verdict).toBe('ECONOMICALLY_DIFFERENT');
    expect(assessment.proposed_v2_candidate.strategy_id).toBe('H3_BASIS_CARRY_V2');
    expect(assessment.proposed_v2_candidate.paper_forward_allowed).toBe(false);
    expect(assessment.proposed_v2_candidate.live_order_authority).toBe(false);
    expect(assessment.immutable_historical_records_preserved.signed_strategy_spec_h3_maker_sha256).toBe(
      sha256File('artifacts/signed_strategy_spec_h3_maker.json'),
    );
    expect(assessment.immutable_historical_records_preserved.strategy_lifecycle_registry_sha256).toBe(
      sha256File('artifacts/strategy_lifecycle_registry.json'),
    );
  });

  it('exposes 185-trial historical lineage on H3_BASIS_CARRY_V2 and pins immutable registration + erratum + observation contract', () => {
    expect(H3_BASIS_CARRY_V2_DECLARED_ECONOMICS.provenance.trialCount).toBe(1);
    expect(H3_BASIS_CARRY_V2_DECLARED_ECONOMICS.provenance.priorFamilyTrialCount).toBe(185);
    expect(H3_BASIS_CARRY_V2_DECLARED_ECONOMICS.provenance.cumulativeFamilyTrialCount).toBe(186);
    expect(H3_BASIS_CARRY_V2_DECLARED_ECONOMICS.provenance.parentHypothesis).toBe('H3_MAKER');
    expect(H3_BASIS_CARRY_V2_DECLARED_ECONOMICS.provenance.paperForwardEligible).toBe(false);

    const regSha = 'c089527416420ac11dfea01a2ad7ca0b18a167ad13bb775575af5b1ef70d0012';
    const specSha = '187e1974069bc1d70950b475804b670a8510a413411652c2c71b1e370b22ee53';
    expect(sha256File('artifacts/h3_basis_carry_v2_prospective_oos_registration.json')).toBe(regSha);

    const erratum = JSON.parse(
      readFileSync(resolve(process.cwd(), 'artifacts/h3_basis_carry_v2_evidence_erratum_v1.json'), 'utf8'),
    ) as {
      original_registration_reference: { exact_sha256: string; original_frozen_spec_sha256: string };
      safety_invariants: { paper_forward_allowed: boolean; live_order_authority: boolean };
    };
    expect(erratum.original_registration_reference.exact_sha256).toBe(regSha);
    expect(erratum.original_registration_reference.original_frozen_spec_sha256).toBe(specSha);
    expect(erratum.safety_invariants.paper_forward_allowed).toBe(false);
    expect(erratum.safety_invariants.live_order_authority).toBe(false);

    const contract = JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'artifacts/h3_basis_carry_v2_prospective_observation_contract.json'),
        'utf8',
      ),
    ) as {
      references: {
        original_registration_sha256: string;
        original_frozen_spec_sha256: string;
        evidence_erratum_sha256: string;
      };
      execution_authority_guards: { paper_forward_allowed: boolean; live_order_authority: boolean };
    };
    expect(contract.references.original_registration_sha256).toBe(regSha);
    expect(contract.references.original_frozen_spec_sha256).toBe(specSha);
    expect(contract.references.evidence_erratum_sha256).toBe(
      sha256File('artifacts/h3_basis_carry_v2_evidence_erratum_v1.json'),
    );
    expect(contract.execution_authority_guards.paper_forward_allowed).toBe(false);
    expect(contract.execution_authority_guards.live_order_authority).toBe(false);
  });
});
