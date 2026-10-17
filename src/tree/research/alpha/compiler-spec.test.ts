// AlphaCompiler — ExperimentSpec output & edge-case tests

import { describe, it, expect } from 'vitest';
import { compile, type CompilerContext } from './compiler';
import { computeFormulaHash, type AlphaProvenance } from './provenance';
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

describe('AlphaCompiler — spec structure & edge cases', () => {
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
    expect(spec.barrierConfig.takeProfitPct).toBe(0.04);
    expect(spec.barrierConfig.stopLossPct).toBe(0.02);
    expect(spec.trainPeriod.barCount).toBeGreaterThan(0);
    expect(spec.validationPeriod.barCount).toBeGreaterThan(0);
    expect(spec.testPeriod.barCount).toBeGreaterThan(0);
    expect(spec.seed).toBeGreaterThanOrEqual(0);
    expect(spec.provenance).toBeNull();
    expect(spec.compilerVersion).toBe(1);
  });

  it('derives barrierConfig proportional to horizon and seed from specId', async () => {
    const input = { ...validHypothesisInput, horizon: 10 };
    const result = await compileOnce(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.barrierConfig.takeProfitPct).toBe(0.02);
    expect(result.value.barrierConfig.stopLossPct).toBe(0.01);
    const expectedSeed = parseInt(result.value.specId.slice(0, 8), 16) >>> 0;
    expect(result.value.seed).toBe(expectedSeed);
  });

  it('includes provenance when provided and sets goalId null when omitted', async () => {
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
    const rProv = await compileOnce(validHypothesisInput, { ...baseContext, provenance });
    expect(rProv.ok).toBe(true);
    if (rProv.ok) expect(rProv.value.provenance).toEqual(provenance);

    const rGoal = await compileOnce(validHypothesisInput, { ...baseContext, goalId: null });
    expect(rGoal.ok).toBe(true);
    if (rGoal.ok) expect(rGoal.value.goalId).toBeNull();
  });

  it('mechanism-reject hypothesis never reaches later stages and feature validation collects all issues', async () => {
    const badMechanism = await compileOnce({
      ...validHypothesisInput,
      expectedMechanism: 'AI predicts price goes up',
      features: [{ name: 'would_never_be_validated', lookback: 2500, params: {} }],
    });
    expect(badMechanism.ok).toBe(false);
    if (!badMechanism.ok) {
      expect(badMechanism.reasons).toContain('MECHANISM_REJECTED');
      expect(badMechanism.reasons).not.toContain('LOOKBACK_EXCEEDS_WINDOW');
    }

    const multiBad = await compileOnce({
      ...validHypothesisInput,
      features: [
        { name: 'dup', lookback: 2500, params: {} },
        { name: 'dup', lookback: 10, params: {} },
        { name: 'unknown_xyz', lookback: 5, params: {} },
      ],
    });
    expect(multiBad.ok).toBe(false);
    if (!multiBad.ok) {
      expect(multiBad.reasons).toContain('DUPLICATE_FEATURE');
      expect(multiBad.reasons).toContain('LOOKBACK_EXCEEDS_WINDOW');
      expect(multiBad.reasons).toContain('UNSUPPORTED_FEATURE');
    }
  });
});
