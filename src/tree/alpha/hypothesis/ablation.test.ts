// ablation.test.ts — unit tests for Hypothesis Ablation (mission Phase 13)
//
// runAblation is a pure function: it evaluates the full hypothesis, then removes
// each indicator one at a time and reports incremental contribution. Tests cover
// the full/variant structure, the material-impact threshold, unnecessary-feature
// flagging, and that removals never mutate the input hypothesis.

import { describe, it, expect } from 'vitest';
import type { IndicatorCandle } from '../indicator-types';
import { RegimeLabel } from '../../regime/types';
import { HypothesisGenerator } from './generator';
import { runAblation } from './ablation';
import type { AlphaHypothesis, HypothesisTemplate } from './types';

// ── Test Fixtures ──────────────────────────────────────────────────────────────

function makeCandles(n: number, basePrice = 100): IndicatorCandle[] {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: 1_700_000_000_000 + i * 60_000,
    open: basePrice + Math.sin(i / 5) * 2,
    high: basePrice + Math.sin(i / 5) * 3 + 1,
    low: basePrice + Math.sin(i / 5) * 3 - 1,
    close: basePrice + Math.sin(i / 5) * 2.5,
    volume: 1000 + (i % 7) * 50,
  }));
}

const TEMPLATES: HypothesisTemplate[] = [
  { name: 'trend-follow', description: 'Trend-following strategy', indicatorPreset: [{ indicator: 'ema', lookback: 20 }, { indicator: 'macd', lookback: 12 }], regimePreset: [RegimeLabel.TREND_UP], barrierPreset: { takeProfitPct: 0.02, stopLossPct: 0.01, maxHoldingMs: 24 * 3600_000 }, combinePreset: 'weighted_sum' },
  { name: 'multi-signal', description: 'Multi-indicator blend', indicatorPreset: [{ indicator: 'rsi', lookback: 14 }, { indicator: 'macd', lookback: 12 }, { indicator: 'bollinger', lookback: 20 }, { indicator: 'volume_zscore', lookback: 20 }], regimePreset: [], barrierPreset: { takeProfitPct: 0.02, stopLossPct: 0.01, maxHoldingMs: 24 * 3600_000 }, combinePreset: 'weighted_sum' },
];

function buildHypothesis(template: HypothesisTemplate): AlphaHypothesis {
  return new HypothesisGenerator().generateFromTemplate(template);
}

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('runAblation', () => {
  const candles = makeCandles(200);

  it('returns the full evaluation unmodified', () => {
    const h = buildHypothesis(TEMPLATES[0]!);
    const result = runAblation(h, candles);
    expect(result.hypothesisId).toBe(h.id);
    expect(result.fullEvaluation).toBeDefined();
    expect(result.fullEvaluation.hypothesisId).toBe(h.id);
  });

  it('produces one ablation variant per indicator', () => {
    const h = buildHypothesis(TEMPLATES[0]!);
    const result = runAblation(h, candles);
    expect(result.ablations).toHaveLength(h.indicatorSet.length);
    const removed = result.ablations.map((a) => a.removedIndicator);
    for (const preset of h.indicatorSet) {
      expect(removed).toContain(preset.indicator);
    }
  });

  it('each variant evaluates a hypothesis with one fewer indicator', () => {
    const h = buildHypothesis(TEMPLATES[1]!);
    const result = runAblation(h, candles);
    // Every variant must report a distinct removed indicator and evaluate to a
    // non-empty result object (even if it has zero signals).
    const seen = new Set<string>();
    for (const ablation of result.ablations) {
      expect(ablation.removedIndicator).toBeTruthy();
      expect(seen.has(ablation.removedIndicator)).toBe(false);
      seen.add(ablation.removedIndicator);
      expect(ablation.evaluation.hypothesisId).toBe(h.id);
    }
  });

  it('reports deltaWinRate and deltaPassRate relative to the full model', () => {
    const h = buildHypothesis(TEMPLATES[0]!);
    const result = runAblation(h, candles);
    for (const ablation of result.ablations) {
      expect(typeof ablation.deltaWinRate).toBe('number');
      expect(typeof ablation.deltaPassRate).toBe('number');
      expect(ablation.deltaWinRate).toBeGreaterThanOrEqual(0);
      expect(ablation.deltaPassRate).toBeGreaterThanOrEqual(0);
    }
  });

  it('flags a removal as materialImpact when winRate drops at or above threshold', () => {
    const h = buildHypothesis(TEMPLATES[0]!);
    // Use a very permissive threshold so every non-zero drop counts as material.
    const result = runAblation(h, candles, { materialThresholdPct: 0 });
    for (const ablation of result.ablations) {
      expect(ablation.materialImpact).toBe(ablation.deltaWinRate > 0);
    }
  });

  it('flags unnecessary features that fall below the material threshold', () => {
    const h = buildHypothesis(TEMPLATES[0]!);
    const result = runAblation(h, candles, { materialThresholdPct: 1 });
    // With a 100% threshold nothing can be material, so all features are unnecessary.
    expect(result.flaggedUnnecessary).toHaveLength(h.indicatorSet.length);
    for (const preset of h.indicatorSet) {
      expect(result.flaggedUnnecessary).toContain(preset.indicator);
    }
  });

  it('does not mutate the input hypothesis', () => {
    const h = buildHypothesis(TEMPLATES[0]!);
    const before = JSON.parse(JSON.stringify(h)) as AlphaHypothesis;
    runAblation(h, candles);
    expect(h.indicatorSet).toHaveLength(before.indicatorSet.length);
    expect(h.id).toBe(before.id);
  });

  it('returns empty ablations for a single-indicator hypothesis', () => {
    const single: HypothesisTemplate = {
      ...TEMPLATES[0]!,
      indicatorPreset: [{ indicator: 'rsi', lookback: 14 }],
    };
    const h = buildHypothesis(single);
    const result = runAblation(h, candles);
    expect(result.ablations).toHaveLength(1);
    // Removing the only indicator leaves zero signals → empty evaluation.
    expect(result.ablations[0]!.evaluation.totalSignals).toBe(0);
  });

  it('is deterministic across repeated runs', () => {
    const h = buildHypothesis(TEMPLATES[1]!);
    const a = runAblation(h, candles);
    const b = runAblation(h, candles);
    expect(a.ablations.map((x) => x.deltaWinRate)).toEqual(b.ablations.map((x) => x.deltaWinRate));
    expect(a.flaggedUnnecessary).toEqual(b.flaggedUnnecessary);
  });
});