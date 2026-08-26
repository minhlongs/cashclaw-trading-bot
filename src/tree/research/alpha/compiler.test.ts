// AlphaCompiler — full pipeline tests
// Tests all stages: determinism, non-causal rejection, unknown feature rejection,
// short window rejection, invalid cost mode rejection, mechanism gate integration.

import { describe, it, expect } from 'vitest';
import { compile, type CompilerContext } from './compiler';
import { computeFormulaHash, type AlphaProvenance } from './provenance';
import type { Universe } from '@/tree/alpha/universe/types';
import type { StressMode } from '@/forest/backtest/cost-model';

// ─── Test Fixtures ──────────────────────────────────────────────────────────────

const validUniverse: Universe = {
  id: 'test-universe',
  symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
  weighting: 'equal',
  rebalanceRule: 'daily',
};

const validHypothesisInput = {
  id: 'hyp-1',
  title: 'Funding Dislocation Reversal',
  description: 'When funding rate diverges from spot, mean reversion follows.',
  rationale: 'Empirical observation across multiple exchanges.',
  source: 'human' as const,
  parentHypothesisId: null,
  universe: validUniverse,
  timeframe: '1h',
  horizon: 20,
  features: [
    { name: 'funding_rate', lookback: 48, params: {} },
    { name: 'basis', lookback: 24, params: {} },
    { name: 'oi_change', lookback: 12, params: {} },
  ],
  transformations: ['zscore'],
  regimeConstraints: ['TREND_UP', 'RANGE'] as const,
  expectedMechanism: 'Funding dislocation + OI expansion + liquidation imbalance may indicate crowded positioning and short-horizon reversal',
  expectedDirection: 'short' as const,
  expectedHoldingPeriod: 16,
  costAssumption: 'normal' as StressMode,
  generatedBy: 'test-suite',
  createdAt: new Date().toISOString(),
  experimentVersion: 1,
};

const baseContext: CompilerContext = {
  dataWindow: {
    earliestTimestamp: 1_000_000_000_000,
    latestTimestamp: 1_000_000_000_000 + 2000 * 3_600_000, // 2000 bars of 1h
    barCount: 2000,
  },
  goalId: 'goal-1',
  provenance: null,
  supportedFeatures: ['funding_rate', 'basis', 'oi_change', 'zscore', 'sma', 'ema', 'rsi'],
};

// ─── Helper ─────────────────────────────────────────────────────────────────────

async function compileOnce(input: unknown, ctx = baseContext) {
  return compile(input, ctx);
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('AlphaCompiler — determinism', () => {
  it('compiles twice → identical specId and deep-equal spec body (excl compiledAt)', async () => {
    const r1 = await compileOnce(validHypothesisInput);
    const r2 = await compileOnce(validHypothesisInput);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;

    expect(r1.value.specId).toBe(r2.value.specId);
    // spec body excluding compiledAt should be identical
    const body1 = { ...r1.value };
    const body2 = { ...r2.value };
    delete (body1 as Record<string, unknown>).compiledAt;
    delete (body2 as Record<string, unknown>).compiledAt;
    expect(body1).toEqual(body2);
  });

  it('specId is SHA-256 of canonical spec body (excl compiledAt)', async () => {
    const result = await compileOnce(validHypothesisInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // specId should be 64 hex chars
    expect(result.value.specId).toMatch(/^[0-9a-f]{64}$/);
    // compiledAt should be ISO string
    expect(result.value.compiledAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // compilerVersion = 1
    expect(result.value.compilerVersion).toBe(1);
  });
});

describe('AlphaCompiler — mechanism gate integration', () => {
  it('rejects vacuous mechanism before any later stage', async () => {
    const badInput = {
      ...validHypothesisInput,
      expectedMechanism: 'LLM thinks price will go up because I said so',
    };
    const result = await compileOnce(badInput);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons).toContain('MECHANISM_REJECTED');
  });

  it('accepts valid causal mechanism', async () => {
    const goodInput = {
      ...validHypothesisInput,
      expectedMechanism: 'Funding dislocation + OI expansion + liquidation imbalance may indicate crowded positioning and short-horizon reversal',
    };
    const result = await compileOnce(goodInput);
    expect(result.ok).toBe(true);
  });
});

describe('AlphaCompiler — causal validation (Stage 2)', () => {
  it('rejects feature when declareFeature throws on non-causal (cannot test directly, Zod catches invalid lookback first)', async () => {
    // Zod schema validates lookback > 0 before reaching declareFeature
    // So we test that a feature with lookback=0 gets INVALID_LOOKBACK from Zod
    const input = {
      ...validHypothesisInput,
      features: [
        { name: 'bad_feature', lookback: 0, params: {} }, // zero lookback → Zod rejects
      ],
    };
    const result = await compileOnce(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Zod catches this at Stage 1a, not Stage 2
    expect(result.reasons).toContain('INVALID_LOOKBACK');
  });

  it('accepts valid features with causal: true', async () => {
    const input = {
      ...validHypothesisInput,
      features: [
        { name: 'funding_rate', lookback: 10, params: {} },
      ],
    };
    const result = await compileOnce(input);
    expect(result.ok).toBe(true);
  });
});

describe('AlphaCompiler — feature validation (Stage 3)', () => {
  it('rejects duplicate feature names', async () => {
    const input = {
      ...validHypothesisInput,
      features: [
        { name: 'funding_rate', lookback: 48, params: {} },
        { name: 'funding_rate', lookback: 24, params: {} }, // duplicate
      ],
    };
    const result = await compileOnce(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons).toContain('DUPLICATE_FEATURE');
  });

  it('rejects non-positive or non-finite lookback', async () => {
    const input = {
      ...validHypothesisInput,
      features: [
        { name: 'bad_lookback', lookback: 0, params: {} }, // zero lookback
      ],
    };
    const result = await compileOnce(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons).toContain('INVALID_LOOKBACK');
  });

  it('rejects lookback > dataWindow barCount', async () => {
    const input = {
      ...validHypothesisInput,
      features: [
        { name: 'huge_lookback', lookback: 2500, params: {} }, // > 2000 bars
      ],
    };
    const smallCtx = {
      ...baseContext,
      dataWindow: { ...baseContext.dataWindow, barCount: 2000 },
    };
    const result = await compile(input, smallCtx);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons).toContain('LOOKBACK_EXCEEDS_WINDOW');
  });

  it('rejects unknown feature name not in supportedFeatures allowlist', async () => {
    const input = {
      ...validHypothesisInput,
      features: [
        { name: 'unknown_indicator_xyz', lookback: 20, params: {} },
      ],
    };
    const result = await compileOnce(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons).toContain('UNSUPPORTED_FEATURE');
  });

  it('accepts feature when supportedFeatures not provided (allowlist optional)', async () => {
    const ctxNoAllowlist = { ...baseContext, supportedFeatures: undefined };
    const input = {
      ...validHypothesisInput,
      features: [
        { name: 'any_feature_name', lookback: 20, params: {} },
      ],
    };
    const result = await compile(input, ctxNoAllowlist);
    expect(result.ok).toBe(true);
  });
});

describe('AlphaCompiler — data/universe validation (Stage 4)', () => {
  it('rejects empty universe', async () => {
    const input = {
      ...validHypothesisInput,
      universe: { ...validUniverse, symbols: [] },
    };
    const result = await compileOnce(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons).toContain('EMPTY_UNIVERSE');
  });

  it('rejects empty timeframe', async () => {
    const input = { ...validHypothesisInput, timeframe: '' };
    const result = await compileOnce(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons).toContain('EMPTY_TIMEFRAME');
  });

  it('rejects insufficient data window (horizon + maxLookback + MIN_TRAIN_BARS)', async () => {
    // Need: maxLookback=48 + horizon=20 + MIN_TRAIN_BARS=200 = 268 bars
    // Provide only 250
    const smallCtx = {
      ...baseContext,
      dataWindow: { ...baseContext.dataWindow, barCount: 250 },
    };
    const result = await compileOnce(validHypothesisInput, smallCtx);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons).toContain('INSUFFICIENT_DATA_WINDOW');
  });

  it('accepts sufficient data window', async () => {
    const largeCtx = {
      ...baseContext,
      dataWindow: { ...baseContext.dataWindow, barCount: 500 },
    };
    const result = await compileOnce(validHypothesisInput, largeCtx);
    expect(result.ok).toBe(true);
  });
});

describe('AlphaCompiler — cost validation (Stage 5)', () => {
  it('rejects invalid cost mode', async () => {
    const input = {
      ...validHypothesisInput,
      costAssumption: 'invalid_mode' as StressMode,
    };
    const result = await compileOnce(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons).toContain('INVALID_COST_MODE');
  });

  it('accepts all valid stress modes', async () => {
    for (const mode of ['normal', 'conservative', 'adverse', 'extreme'] as StressMode[]) {
      const input = { ...validHypothesisInput, costAssumption: mode };
      const result = await compileOnce(input);
      expect(result.ok).toBe(true);
    }
  });
});

describe('AlphaCompiler — spec structure', () => {
  it('emits valid ExperimentSpec with all fields', async () => {
    const result = await compileOnce(validHypothesisInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const spec = result.value;
    expect(spec.specId).toMatch(/^[0-9a-f]{64}$/);
    expect(spec.hypothesisId).toBe('hyp-1');
    expect(spec.goalId).toBe('goal-1');
    expect(spec.universe).toEqual(validUniverse);
    expect(spec.timeframe).toBe('1h');
    expect(spec.horizonBars).toBe(20);
    expect(spec.features).toHaveLength(3);
    expect(spec.transformations).toEqual(['zscore']);
    expect(spec.regimeConstraints).toEqual(['TREND_UP', 'RANGE']);
    expect(spec.expectedDirection).toBe('short');
    expect(spec.costMode).toBe('normal');
    expect(spec.costConfig).toEqual({ feePct: 0.0008, slipPct: 0.0003, marketImpactPct: 0.0005 });
    expect(spec.barrierConfig.takeProfitPct).toBe(0.04); // 20 * 0.002
    expect(spec.barrierConfig.stopLossPct).toBe(0.02);  // 20 * 0.001
    expect(spec.trainPeriod.barCount).toBeGreaterThan(0);
    expect(spec.validationPeriod.barCount).toBeGreaterThan(0);
    expect(spec.testPeriod.barCount).toBeGreaterThan(0);
    expect(spec.seed).toBeGreaterThanOrEqual(0);
    expect(spec.provenance).toBeNull();
    expect(spec.compilerVersion).toBe(1);
  });

  it('derives barrierConfig proportional to horizon', async () => {
    const input = { ...validHypothesisInput, horizon: 10 };
    const result = await compileOnce(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.barrierConfig.takeProfitPct).toBe(0.02); // 10 * 0.002
    expect(result.value.barrierConfig.stopLossPct).toBe(0.01);  // 10 * 0.001
  });

  it('derives seed from specId when not provided', async () => {
    const result = await compileOnce(validHypothesisInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // seed should be derived from first 8 chars of specId
    const expectedSeed = parseInt(result.value.specId.slice(0, 8), 16) >>> 0;
    expect(result.value.seed).toBe(expectedSeed);
  });

  it('includes provenance when provided', async () => {
    const provenance: AlphaProvenance = {
      sourceZoo: 'vibe-trading-zoo',
      sourceAlphaId: 'alpha-123',
      sourceRepository: 'https://github.com/vibe/alpha',
      sourceVersion: 'v1.0.0',
      formulaHash: await computeFormulaHash('formula-string'),
      importTimestamp: new Date().toISOString(),
      importerVersion: '1.0.0',
      normalizedRepresentation: '{}',
    };
    const ctx = { ...baseContext, provenance };
    const result = await compileOnce(validHypothesisInput, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.provenance).toEqual(provenance);
  });

  it('goalId is null when not provided', async () => {
    const ctx = { ...baseContext, goalId: null };
    const result = await compileOnce(validHypothesisInput, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.goalId).toBeNull();
  });
});

describe('AlphaCompiler — edge cases', () => {
  it('mechanism-reject hypothesis never reaches later stages', async () => {
    const badInput = {
      ...validHypothesisInput,
      expectedMechanism: 'AI predicts price goes up',
      features: [
        { name: 'would_never_be_validated', lookback: 2500, params: {} }, // would fail lookback check
      ],
    };
    const result = await compileOnce(badInput);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Should be MECHANISM_REJECTED, not LOOKBACK_EXCEEDS_WINDOW
    expect(result.reasons).toContain('MECHANISM_REJECTED');
    expect(result.reasons).not.toContain('LOOKBACK_EXCEEDS_WINDOW');
  });

  it('feature validation catches multiple issues at once', async () => {
    const input = {
      ...validHypothesisInput,
      features: [
        { name: 'dup', lookback: 2500, params: {} },
        { name: 'dup', lookback: 10, params: {} },
        { name: 'unknown_xyz', lookback: 5, params: {} },
      ],
    };
    const result = await compileOnce(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons).toContain('DUPLICATE_FEATURE');
    expect(result.reasons).toContain('LOOKBACK_EXCEEDS_WINDOW');
    expect(result.reasons).toContain('UNSUPPORTED_FEATURE');
  });

  it('compiledAt is ISO timestamp', async () => {
    const result = await compileOnce(validHypothesisInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new Date(result.value.compiledAt).toISOString()).toBe(result.value.compiledAt);
  });
});