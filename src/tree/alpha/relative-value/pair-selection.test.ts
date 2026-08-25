import { describe, expect, it } from 'vitest';
import { selectPairs, type PairSelectionConfig, type UniversePanel } from './pair-selection';
import { estimateRollingHedgeRatio } from './hedge-ratio';

// ── Fixtures ───────────────────────────────────────────────────────────────

const T0 = 1_700_000_000_000;
const N = 120;
const AS_OF_IDX = 100;

function ts(): number[] {
  return Array.from({ length: N }, (_, i) => T0 + i * 60_000);
}

/**
 * Deterministic AR(1) deviation (phi = 0.3), drawn once from an LCG
 * (Numerical Recipes constants, seed 48) — same pattern as simulator-fixtures.
 */
const DEV_AR1: readonly number[] = (() => {
  let state = 48 >>> 0;
  const rnd = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const out: number[] = [15];
  for (let i = 1; i < N; i++) out.push(0.3 * out[i - 1]! + (rnd() - 0.5) * 20);
  return out;
})();

/**
 * Universe: RAMP and two cointegrated legs (AR(1)-deviation around exact
 * linear relations) plus an uncorrelated slow oscillator.
 * Expected gate-mode selection: RAMP/LEG1 and RAMP/LEG2 only.
 */
function universe(): UniversePanel {
  const ramp = Array.from({ length: N }, (_, i) => 100 + i * 0.5);
  const leg1 = ramp.map((r, i) => 2 * r + DEV_AR1[i]!);
  const leg2 = ramp.map((r, i) => 0.5 * r + 0.6 * DEV_AR1[i]! + 40);
  const osc = Array.from({ length: N }, (_, i) => 100 + 30 * Math.sin(i / 7));
  return {
    symbols: ['RAMP', 'LEG1', 'LEG2', 'OSC'],
    timestamps: ts(),
    closes: [ramp, leg1, leg2, osc],
  };
}

function selectionConfig(overrides: Partial<PairSelectionConfig> = {}): PairSelectionConfig {
  return {
    validationWindow: 80,
    minObs: 10,
    maxHalfLife: 50,
    minCorrelation: 0.5,
    hedgeWindow: 80,
    topK: 5,
    ...overrides,
  };
}

const AS_OF = T0 + AS_OF_IDX * 60_000;

// ── Tests ──────────────────────────────────────────────────────────────────

describe('selectPairs', () => {
  it('selects the cointegrated pairs and rejects the uncorrelated symbol', () => {
    const selected = selectPairs(universe(), AS_OF, selectionConfig());
    expect(selected.length).toBeGreaterThanOrEqual(2);
    const labels = selected.map((p) => `${p.legA}/${p.legB}`);
    expect(labels).toContain('RAMP/LEG1');
    expect(labels).toContain('RAMP/LEG2');
    for (const label of labels) expect(label).not.toContain('OSC');
    for (const pair of selected) {
      expect(pair.betaFrozen).toBeGreaterThan(0);
      expect(pair.diagnostics.cointegrated).toBe(true);
      expect(Math.abs(pair.diagnostics.correlation)).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('distance mode skips the cointegration gate (corr floor + minObs only)', () => {
    const selected = selectPairs(universe(), AS_OF, selectionConfig({ distanceMode: true }));
    expect(selected.length).toBeGreaterThanOrEqual(2);
    for (const pair of selected) {
      expect(Math.abs(pair.diagnostics.correlation)).toBeGreaterThanOrEqual(0.5);
      expect(pair.betaFrozen).toBeGreaterThan(0);
    }
  });

  it('causality — mutating rows at/after asOf leaves selection identical', () => {
    const base = selectPairs(universe(), AS_OF, selectionConfig());
    const u = universe();
    const mutated: UniversePanel = {
      ...u,
      closes: u.closes.map((row) => row.map((v, i) => (i >= AS_OF_IDX ? 9999 : v))),
    };
    const after = selectPairs(mutated, AS_OF, selectionConfig());
    expect(after).toEqual(base);
  });

  it('is deterministic — two runs deep-equal', () => {
    const r1 = selectPairs(universe(), AS_OF, selectionConfig());
    const r2 = selectPairs(universe(), AS_OF, selectionConfig());
    expect(r2).toEqual(r1);
  });

  it('dedups — no pair appears twice and count never exceeds C(n,2)', () => {
    const selected = selectPairs(universe(), AS_OF, selectionConfig({ topK: 100 }));
    const labels = selected.map((p) => `${p.legA}/${p.legB}`);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.length).toBeLessThanOrEqual(6); // C(4,2)
    for (const pair of selected) {
      expect(pair.legA).not.toBe(pair.legB);
    }
  });

  it('topK ordering — stability-ranked when stability config present, capped at topK', () => {
    const config = selectionConfig({
      topK: 1,
      stability: {
        validationWindow: 40,
        minObs: 10,
        maxHalfLife: 50,
        minCorrelation: 0,
        subWindows: 4,
        hedgeWindow: 40,
      },
    });
    const selected = selectPairs(universe(), AS_OF, config);
    expect(selected).toHaveLength(1);
    const all = selectPairs(universe(), AS_OF, { ...config, topK: 10 });
    for (let i = 1; i < all.length; i++) {
      expect(all[i]!.stability).toBeLessThanOrEqual(all[i - 1]!.stability);
    }
  });

  it('fail-closed — too-short causal slice returns [] (never throws)', () => {
    const selected = selectPairs(universe(), T0 + 5 * 60_000, selectionConfig());
    expect(selected).toEqual([]);
  });

  it('fail-closed — degenerate universes throw with clear messages', () => {
    const u = universe();
    expect(() =>
      selectPairs({ ...u, symbols: ['ONLY'], closes: [u.closes[0]!] }, AS_OF, selectionConfig()),
    ).toThrow(/at least 2 symbols/);
    expect(() => selectPairs(u, AS_OF, selectionConfig({ topK: 0 }))).toThrow(/topK/);
    expect(() => selectPairs(u, Number.NaN, selectionConfig())).toThrow(/NaN/);
    expect(() =>
      selectPairs({ ...u, closes: [u.closes[0]!.slice(0, N - 1), ...u.closes.slice(1)] }, AS_OF, selectionConfig()),
    ).toThrow(/length differs/);
  });

  it('betaFrozen matches a direct estimateRollingHedgeRatio call at asOf', () => {
    const selected = selectPairs(universe(), AS_OF, selectionConfig());
    const u = universe();
    const i = u.symbols.indexOf(selected[0]!.legA);
    const j = u.symbols.indexOf(selected[0]!.legB);
    const direct = estimateRollingHedgeRatio(
      {
        legA: selected[0]!.legA,
        legB: selected[0]!.legB,
        timestamps: u.timestamps,
        closesA: u.closes[i]!,
        closesB: u.closes[j]!,
      },
      80,
      10,
      AS_OF,
    );
    expect(selected[0]!.betaFrozen).toBe(direct.hedgeRatio);
  });
});
