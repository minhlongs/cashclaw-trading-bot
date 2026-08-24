import { describe, it, expect } from 'vitest';
import { scoreAlpha, scoreComposedAlphas, type AlphaScore } from './scoring';
import type { ComposedAlpha, CompositionConfig } from './types';
import { RegimeLabel } from '@/tree/regime/types';

/** Test helper: unwrap a finite score or fail loudly (never silently 0). */
function requireFiniteScore(result: AlphaScore): number {
  if (result.score === null) {
    throw new Error(`expected finite score, got rejection: ${result.reason}`);
  }
  return result.score;
}

type NumericField =
  | 'confidence'
  | 'expectedReturn'
  | 'expectedCost'
  | 'expectedTurnover';

function withField(
  alpha: ComposedAlpha,
  field: NumericField,
  value: number,
): ComposedAlpha {
  switch (field) {
    case 'confidence':
      return { ...alpha, confidence: value };
    case 'expectedReturn':
      return { ...alpha, expectedReturn: value };
    case 'expectedCost':
      return { ...alpha, expectedCost: value };
    case 'expectedTurnover':
      return { ...alpha, expectedTurnover: value };
  }
}

function makeAlpha(overrides: Partial<ComposedAlpha> = {}): ComposedAlpha {
  return {
    alphaId: 'alpha-1',
    direction: 'buy',
    confidence: 0.8,
    expectedReturn: 0.05,
    expectedCost: 0.01,
    expectedTurnover: 0.4,
    regime: RegimeLabel.RANGE,
    horizon: '1h',
    provenance: 'test-fixture',
    featureDependencies: ['f1', 'f2'],
    timestamp: 1_700_000_000_000,
    ...overrides,
  };
}

const WEIGHTS = {
  returnWeight: 2,
  costWeight: 1.5,
  riskPenaltyWeight: 0.5,
  turnoverPenaltyWeight: 0.25,
  confidenceWeight: 1,
} as const;

const CONFIG: CompositionConfig = {
  weights: WEIGHTS,
  minNetEdge: Number.NEGATIVE_INFINITY,
  maxTurnover: Number.POSITIVE_INFINITY,
};

describe('scoreAlpha — deterministic net-edge scoring', () => {
  it('is deterministic: same input yields identical output', () => {
    const alpha = makeAlpha();
    expect(scoreAlpha(alpha, CONFIG)).toEqual(scoreAlpha(alpha, CONFIG));
  });

  it('matches hand-computed net edge within 1e-12', () => {
    // net_edge = 2*0.8*0.05 - 1.5*0.01 - 0.5*(1-0.8) - 0.25*0.4
    //          = 0.08 - 0.015 - 0.10 - 0.10 = -0.135
    const score = requireFiniteScore(scoreAlpha(makeAlpha(), CONFIG));
    expect(score).toBeCloseTo(-0.135, 12);
  });

  it('scales with confidence at fixed expectedReturn', () => {
    const low = requireFiniteScore(
      scoreAlpha(makeAlpha({ confidence: 0.6 }), CONFIG),
    );
    const high = requireFiniteScore(
      scoreAlpha(makeAlpha({ confidence: 0.9 }), CONFIG),
    );
    expect(high).toBeGreaterThan(low);
  });

  it('responds linearly to weight changes (config, not learned params)', () => {
    const base = requireFiniteScore(scoreAlpha(makeAlpha(), CONFIG));
    const doubledCost = requireFiniteScore(
      scoreAlpha(makeAlpha(), {
        ...CONFIG,
        weights: { ...WEIGHTS, costWeight: 3 },
      }),
    );
    // Doubling costWeight shifts the score by exactly -(delta * expectedCost).
    expect(doubledCost - base).toBeCloseTo(-(3 - 1.5) * 0.01, 12);

    // confidenceWeight is reserved for downstream sizing: no effect here.
    const otherConfidence = requireFiniteScore(
      scoreAlpha(makeAlpha(), {
        ...CONFIG,
        weights: { ...WEIGHTS, confidenceWeight: 99 },
      }),
    );
    expect(otherConfidence).toBe(base);
  });

  it('scores hold direction 0 with an explicit reason (no edge in hold)', () => {
    const result = scoreAlpha(makeAlpha({ direction: 'hold' }), CONFIG);
    if (result.score === null) {
      expect.unreachable('hold must not be rejected');
    }
    expect(result.score).toBe(0);
    expect(result.reason).toContain('hold');
  });
});

describe('scoreAlpha — fail-closed validation', () => {
  it.each([
    ['expectedReturn', Number.NaN],
    ['expectedCost', Number.POSITIVE_INFINITY],
    ['expectedTurnover', Number.NEGATIVE_INFINITY],
    ['confidence', Number.NaN],
  ] as ReadonlyArray<readonly [NumericField, number]>)(
    'rejects non-finite %s instead of silently defaulting to 0',
    (field, value) => {
      const result = scoreAlpha(withField(makeAlpha(), field, value), CONFIG);
      if (result.score !== null) {
        expect.unreachable('non-finite input must be rejected');
      }
      expect(result.reason).toContain('non-finite');
      expect(result.reason).toContain(field);
    },
  );
});

describe('scoreComposedAlphas — filtering and ranking', () => {
  it('ranks survivors descending with deterministic alphaId tie-break', () => {
    const weak = makeAlpha({ alphaId: 'weak', expectedReturn: 0.01 });
    const strong = makeAlpha({ alphaId: 'strong', expectedReturn: 0.09 });
    const tieA = makeAlpha({ alphaId: 'tie-a', expectedReturn: 0.05 });
    const tieB = makeAlpha({ alphaId: 'tie-b', expectedReturn: 0.05 });
    const { scored } = scoreComposedAlphas([weak, tieB, strong, tieA], CONFIG);
    expect(scored.map((entry) => entry.alpha.alphaId)).toEqual([
      'strong',
      'tie-a',
      'tie-b',
      'weak',
    ]);
  });

  it('filters below minNetEdge and records the rejection reason', () => {
    const config: CompositionConfig = { ...CONFIG, minNetEdge: -0.05 };
    // bad:   1.6*0.01 - 0.215 = -0.199 < -0.05 -> rejected
    // good:  1.6*0.20 - 0.215 = +0.105 >= -0.05 -> kept
    const bad = makeAlpha({ alphaId: 'bad', expectedReturn: 0.01 });
    const good = makeAlpha({ alphaId: 'good', expectedReturn: 0.20 });
    const { scored, rejected } = scoreComposedAlphas([bad, good], config);
    expect(scored.map((entry) => entry.alpha.alphaId)).toEqual(['good']);
    expect(rejected).toEqual([
      { alphaId: 'bad', reason: 'net edge below minimum' },
    ]);
  });

  it('filters above maxTurnover and records the rejection reason', () => {
    const config: CompositionConfig = { ...CONFIG, maxTurnover: 0.5 };
    const churny = makeAlpha({ alphaId: 'churny', expectedTurnover: 0.6 });
    const calm = makeAlpha({ alphaId: 'calm', expectedTurnover: 0.45 });
    const { scored, rejected } = scoreComposedAlphas([churny, calm], config);
    expect(scored.map((entry) => entry.alpha.alphaId)).toEqual(['calm']);
    expect(rejected).toEqual([
      { alphaId: 'churny', reason: 'turnover above cap' },
    ]);
  });
});

describe('causality and purity', () => {
  it('treats alpha.timestamp as opaque — scoring ignores it entirely', () => {
    const early = makeAlpha({ timestamp: 1_000 });
    const late = makeAlpha({ timestamp: 9_999_999_999_999 });
    expect(scoreAlpha(early, CONFIG)).toEqual(scoreAlpha(late, CONFIG));

    const ordered = scoreComposedAlphas([early, late], CONFIG);
    const flipped = scoreComposedAlphas([late, early], CONFIG);
    expect(flipped.scored.map((entry) => entry.alpha.alphaId)).toEqual(
      ordered.scored.map((entry) => entry.alpha.alphaId),
    );
  });
});
