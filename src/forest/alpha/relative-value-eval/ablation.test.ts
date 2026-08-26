import { describe, expect, it } from 'vitest';
import { RV_COMPONENTS, runRvAblation } from './ablation';
import type {
  PairSelectionConfig,
  UniversePanel,
} from '@/tree/alpha/relative-value';
import type { PairConfigFactory } from './walk-forward';

// ── Fixtures (same deterministic AR(1) pattern as walk-forward tests) ──────

const T0 = 1_700_000_000_000;
const N = 600;

const DEV_AR1: readonly number[] = (() => {
  let state = 48 >>> 0;
  const rnd = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const out: number[] = [5];
  for (let i = 1; i < N; i++) out.push(0.3 * out[i - 1]! + (rnd() - 0.5) * 12);
  return out;
})();

function universe(): UniversePanel {
  const ramp = Array.from({ length: N }, (_, i) => 100 + i * 0.5);
  const legA = ramp.map((r, i) => 1.3 * r + DEV_AR1[i]! + 30);
  const legB = ramp.map((r, i) => 0.7 * r - DEV_AR1[i]! + 80);
  return {
    symbols: ['RAMP', 'LEGA', 'LEGB'],
    timestamps: Array.from({ length: N }, (_, i) => T0 + i * 3_600_000),
    closes: [ramp, legA, legB],
  };
}

const WINDOW_CONFIG = { trainBars: 250, validateBars: 50, testBars: 100, stepBars: 100 };

const selectionConfig: PairSelectionConfig = {
  validationWindow: 80,
  minObs: 10,
  maxHalfLife: 50,
  minCorrelation: 0.5,
  hedgeWindow: 80,
  topK: 3,
};

const M4_FACTORY: PairConfigFactory = () => ({
  hedgeWindow: 60,
  zWindow: 5,
  minObs: 10,
  entryZ: 2.0,
  exitZ: 0.5,
  stopZ: 3.5,
  maxHalfLife: 50,
  minCorrelation: 0,
  validationWindow: 60,
  revalidateEvery: 20,
  stressMode: 'conservative',
  minObservations: 30,
});

describe('runRvAblation', () => {
  const result = runRvAblation({
    universe: universe(),
    windowConfig: WINDOW_CONFIG,
    mode: 'rolling',
    selectionConfig,
    configFactory: M4_FACTORY,
  });

  it('evaluates the full model plus exactly one variant per component', () => {
    expect(result.variants.map((v) => v.removedComponent)).toEqual([
      ...RV_COMPONENTS,
    ]);
    expect(result.fullPeriods).toBeGreaterThan(0);
    for (const v of result.variants) {
      expect(v.periods).toBeGreaterThan(0);
      expect(Number.isFinite(v.expectancy)).toBe(true);
      expect(v.expectancy).toBeCloseTo(
        v.deltaExpectancy + result.fullExpectancy, 12,
      );
      // Materiality follows the threshold strictly (> 0.05).
      expect(v.materialImpact).toBe(v.deltaExpectancy > 0.05);
    }
  });

  it('flags every component when no removal is material on this fixture', () => {
    // Deterministic fixture: deltas are tiny; the flag list must match the
    // materialImpact computation exactly either way.
    const flagged = new Set(result.flaggedUnnecessary);
    for (const v of result.variants) {
      expect(flagged.has(v.removedComponent)).toBe(!v.materialImpact);
    }
  });

  it('is deterministic — two runs deep-equal', () => {
    const again = runRvAblation({
      universe: universe(),
      windowConfig: WINDOW_CONFIG,
      mode: 'rolling',
      selectionConfig,
      configFactory: M4_FACTORY,
    });
    expect(again).toEqual(result);
  });

  it('fails closed on an invalid material threshold', () => {
    expect(() =>
      runRvAblation(
        {
          universe: universe(),
          windowConfig: WINDOW_CONFIG,
          mode: 'rolling',
          selectionConfig,
          configFactory: M4_FACTORY,
        },
        -1,
      ),
    ).toThrow(/materialThreshold/);
    expect(() =>
      runRvAblation(
        {
          universe: universe(),
          windowConfig: WINDOW_CONFIG,
          mode: 'rolling',
          selectionConfig,
          configFactory: M4_FACTORY,
        },
        NaN,
      ),
    ).toThrow(/materialThreshold/);
  });
});
