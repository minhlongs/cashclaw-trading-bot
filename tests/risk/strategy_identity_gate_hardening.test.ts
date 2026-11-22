import { describe, expect, it } from 'vitest';
import {
  evaluateStrategyIdentityGate,
  G13_PAPER_FORWARD_RUNNER_CAPABILITY,
  H3_MAKER_BOT_RUNTIME_CAPABILITY,
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

function expectInvalid(decl: unknown, rt: unknown): void {
  const res = evaluateStrategyIdentityGate(decl, rt);
  expect(res.ok).toBe(false);
  if (res.ok) return;
  expect(res.verdict).toBe('INSUFFICIENT_EVIDENCE');
  expect(res.promotionAllowed).toBe(false);
  expect(res.code).toBe('INVALID_DECLARATION_OR_CAPABILITY');
}

describe('Strategy Identity Safety Gate (§8) — Security & Bypass Hardening', () => {
  it.each([
    ['extra key on runtime', VALID_DECLARED, { ...VALID_RUNTIME, liveTradingUnlocked: true }],
    ['extra key on declared', { ...VALID_DECLARED, bypass: true }, VALID_RUNTIME],
    [
      'extra key on provenance',
      { ...VALID_DECLARED, provenance: { ...VALID_DECLARED.provenance, override: true } },
      VALID_RUNTIME,
    ],
  ])('rejects unknown/extra keys fail-closed: %s', (_label, decl, rt) => {
    expectInvalid(decl, rt);
  });

  it('rejects prototype pollution own-properties via JSON.parse fail-closed', () => {
    const poisonedDeclared: unknown = JSON.parse(
      `{"__proto__":{"isAdmin":true},${JSON.stringify(VALID_DECLARED).slice(1)}`,
    );
    const poisonedRuntime: unknown = JSON.parse(
      `{"__proto__":{"liveOrderAuthority":true},${JSON.stringify(VALID_RUNTIME).slice(1)}`,
    );
    expectInvalid(poisonedDeclared, VALID_RUNTIME);
    expectInvalid(VALID_DECLARED, poisonedRuntime);
  });

  it.each([
    ['strategyId spaces', { ...VALID_DECLARED, strategyId: '   ' }, VALID_RUNTIME],
    ['strategyId tabs/newlines', { ...VALID_DECLARED, strategyId: '\t\n' }, VALID_RUNTIME],
    ['runtimeId spaces', VALID_DECLARED, { ...VALID_RUNTIME, runtimeId: '   ' }],
    ['runtimeId tabs/newlines', VALID_DECLARED, { ...VALID_RUNTIME, runtimeId: '\t\n' }],
    ['sourceModule spaces', VALID_DECLARED, { ...VALID_RUNTIME, sourceModule: '   ' }],
    ['sourceModule tabs/newlines', VALID_DECLARED, { ...VALID_RUNTIME, sourceModule: '\t\n' }],
  ])('rejects whitespace-only identifier fail-closed: %s', (_label, decl, rt) => {
    expectInvalid(decl, rt);
  });

  it('freezes supportedBarGranularities on exported runtime capability profiles', () => {
    expect(Object.isFrozen(H3_MAKER_BOT_RUNTIME_CAPABILITY.supportedBarGranularities)).toBe(true);
    expect(Object.isFrozen(G13_PAPER_FORWARD_RUNNER_CAPABILITY.supportedBarGranularities)).toBe(true);
    expect(() => {
      (H3_MAKER_BOT_RUNTIME_CAPABILITY.supportedBarGranularities as string[]).push('1m');
    }).toThrow(TypeError);
    expect(() => {
      (G13_PAPER_FORWARD_RUNNER_CAPABILITY.supportedBarGranularities as string[]).push('1h');
    }).toThrow(TypeError);
  });

  it('rejects paperExecutionRequired: false and paperExecutionCapable: false fail-closed', () => {
    expectInvalid({ ...VALID_DECLARED, paperExecutionRequired: false }, VALID_RUNTIME);
    const res = evaluateStrategyIdentityGate(VALID_DECLARED, {
      ...VALID_RUNTIME,
      paperExecutionCapable: false,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.verdict).toBe('ECONOMICALLY_DIFFERENT');
    expect(res.promotionAllowed).toBe(false);
    expect(res.code).toBe('ECONOMIC_IDENTITY_MISMATCH');
    expect(res.mismatches.map((m) => m.dimension)).toEqual(['paper_execution']);
  });

  it.each([
    ['UNTOUCHED_FRESH_OOS with paperForwardEligible=false', 'UNTOUCHED_FRESH_OOS' as const, false],
    ['EXPOSED_HOLDOUT_QUARANTINED with paperForwardEligible=true', 'EXPOSED_HOLDOUT_QUARANTINED' as const, true],
    ['PENDING_FRESH_OOS with paperForwardEligible=true', 'PENDING_FRESH_OOS' as const, true],
    ['UNVERIFIED with paperForwardEligible=true', 'UNVERIFIED' as const, true],
  ])('rejects non-promotable provenance fail-closed: %s', (_label, oosStatus, paperForwardEligible) => {
    const res = evaluateStrategyIdentityGate(
      { ...VALID_DECLARED, provenance: { ...VALID_DECLARED.provenance, oosStatus, paperForwardEligible } },
      VALID_RUNTIME,
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.verdict).toBe('INSUFFICIENT_EVIDENCE');
    expect(res.promotionAllowed).toBe(false);
    expect(res.code).toBe('PROVENANCE_NOT_PROMOTABLE');
    expect(res.mismatches.map((m) => m.dimension)).toEqual(['research_provenance']);
  });

  it.each([NaN, Infinity, 0, -1, 1.5])('rejects invalid trialCount=%s fail-closed', (trialCount) => {
    expectInvalid(
      { ...VALID_DECLARED, provenance: { ...VALID_DECLARED.provenance, trialCount } },
      VALID_RUNTIME,
    );
  });

  it('rejects liveOrderAuthority: true and malformed inputs fail-closed', () => {
    expectInvalid(VALID_DECLARED, { ...VALID_RUNTIME, liveOrderAuthority: true });
    expectInvalid(null, VALID_RUNTIME);
    expectInvalid(undefined, VALID_RUNTIME);
    expectInvalid({}, VALID_RUNTIME);
    expectInvalid(VALID_DECLARED, null);
    expectInvalid(VALID_DECLARED, undefined);
    expectInvalid(VALID_DECLARED, { runtimeId: '' });
  });
});
