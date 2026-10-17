// AlphaCompiler — pipeline stage validation tests (Stages 1–5)

import { describe, it, expect } from 'vitest';
import { compile, type CompilerContext } from './compiler';
import type { Universe } from '@/tree/alpha/universe/types';
import type { StressMode } from '@/tree/alpha/cost-stress';

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
    latestTimestamp: 1_000_000_000_000 + 2000 * 3_600_000,
    barCount: 2000,
  },
  goalId: 'goal-1',
  provenance: null,
  supportedFeatures: ['funding_rate', 'basis', 'oi_change', 'zscore', 'sma', 'ema', 'rsi'],
};

async function compileOnce(input: unknown, ctx = baseContext) {
  return compile(input, ctx);
}

describe('AlphaCompiler — determinism & mechanism gate', () => {
  it('compiles twice → identical specId and deep-equal spec body (excl compiledAt)', async () => {
    const r1 = await compileOnce(validHypothesisInput);
    const r2 = await compileOnce(validHypothesisInput);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;

    expect(r1.value.specId).toBe(r2.value.specId);
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

    expect(result.value.specId).toMatch(/^[0-9a-f]{64}$/);
    expect(result.value.compiledAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(result.value.compilerVersion).toBe(1);
  });

  it('rejects vacuous mechanism before any later stage and accepts causal mechanism', async () => {
    const badResult = await compileOnce({
      ...validHypothesisInput,
      expectedMechanism: 'LLM thinks price will go up because I said so',
    });
    expect(badResult.ok).toBe(false);
    if (!badResult.ok) expect(badResult.reasons).toContain('MECHANISM_REJECTED');

    const goodResult = await compileOnce(validHypothesisInput);
    expect(goodResult.ok).toBe(true);
  });
});

describe('AlphaCompiler — feature, data & cost validation (Stages 2–5)', () => {
  it('rejects zero lookback and accepts valid causal features', async () => {
    const bad = await compileOnce({
      ...validHypothesisInput,
      features: [{ name: 'bad_feature', lookback: 0, params: {} }],
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reasons).toContain('INVALID_LOOKBACK');

    const good = await compileOnce({
      ...validHypothesisInput,
      features: [{ name: 'funding_rate', lookback: 10, params: {} }],
    });
    expect(good.ok).toBe(true);
  });

  it('rejects duplicate features, lookback > window, and unsupported features', async () => {
    const dup = await compileOnce({
      ...validHypothesisInput,
      features: [
        { name: 'funding_rate', lookback: 48, params: {} },
        { name: 'funding_rate', lookback: 24, params: {} },
      ],
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.reasons).toContain('DUPLICATE_FEATURE');

    const huge = await compile({
      ...validHypothesisInput,
      features: [{ name: 'huge_lookback', lookback: 2500, params: {} }],
    }, baseContext);
    expect(huge.ok).toBe(false);
    if (!huge.ok) expect(huge.reasons).toContain('LOOKBACK_EXCEEDS_WINDOW');

    const unsupported = await compileOnce({
      ...validHypothesisInput,
      features: [{ name: 'unknown_indicator_xyz', lookback: 20, params: {} }],
    });
    expect(unsupported.ok).toBe(false);
    if (!unsupported.ok) expect(unsupported.reasons).toContain('UNSUPPORTED_FEATURE');
  });

  it('accepts feature when supportedFeatures allowlist is omitted', async () => {
    const ctxNoAllowlist = { ...baseContext, supportedFeatures: undefined };
    const result = await compile({
      ...validHypothesisInput,
      features: [{ name: 'any_feature_name', lookback: 20, params: {} }],
    }, ctxNoAllowlist);
    expect(result.ok).toBe(true);
  });

  it('validates universe, timeframe, data window and cost stress modes', async () => {
    const emptyUniv = await compileOnce({
      ...validHypothesisInput,
      universe: { ...validUniverse, symbols: [] },
    });
    expect(emptyUniv.ok).toBe(false);
    if (!emptyUniv.ok) expect(emptyUniv.reasons).toContain('EMPTY_UNIVERSE');

    const emptyTf = await compileOnce({ ...validHypothesisInput, timeframe: '' });
    expect(emptyTf.ok).toBe(false);
    if (!emptyTf.ok) expect(emptyTf.reasons).toContain('EMPTY_TIMEFRAME');

    const smallWin = await compileOnce(validHypothesisInput, {
      ...baseContext,
      dataWindow: { ...baseContext.dataWindow, barCount: 250 },
    });
    expect(smallWin.ok).toBe(false);
    if (!smallWin.ok) expect(smallWin.reasons).toContain('INSUFFICIENT_DATA_WINDOW');

    const invalidCost = await compileOnce({
      ...validHypothesisInput,
      costAssumption: 'invalid_mode' as StressMode,
    });
    expect(invalidCost.ok).toBe(false);
    if (!invalidCost.ok) expect(invalidCost.reasons).toContain('INVALID_COST_MODE');

    for (const mode of ['normal', 'conservative', 'adverse', 'extreme'] as StressMode[]) {
      const okCost = await compileOnce({ ...validHypothesisInput, costAssumption: mode });
      expect(okCost.ok).toBe(true);
    }
  });
});
