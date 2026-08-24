// Shared deterministic fixtures for pair-spread simulator tests.
// NOT a test file — imported by simulator*.test.ts to keep every fixture
// identical across suites (single source of truth for expected arithmetic).
//
// No Math.random / Date.now anywhere: the spread deviation is a fixed
// AR(1) sequence (phi = 0.3) drawn once from an LCG (Numerical Recipes
// constants, seed 48) and hard-coded below.

import type { PairPanel, PairSimConfig } from './types';

/** Fixed AR(1) deviation sequence: B = 2A + dev. */
export const OU_DEV_48: readonly number[] = [
  15, 1, 2, 3, 0, -2, 0, -7, 0, 6, -1, 1, 2, 1, 1, 7, 8, -4, -8, 1,
  -4, 2, 1, 1, 3, 3, 1, 4, 0, -3, 3, 2, 0, 2, 0, -6, 4, 5, 3, -5,
  0, -2, 4, 0, 1, -6, -8, -8, -9, -1,
];

export const N_OU = OU_DEV_48.length;
export const T0_OU = 1_700_000_000_000;

/**
 * Panel where leg A ramps linearly and leg B = 2·A + dev.
 * The pair passes the tradability gate during warm-up; z crosses −entryZ
 * at panel index 18 (long entry) and −exitZ at panel index 20 (exit).
 */
export function ouPanel(): PairPanel {
  const closesA = Array.from({ length: N_OU }, (_, i) => 100 + i * 10);
  const closesB = closesA.map((a, i) => 2 * a + OU_DEV_48[i]!);
  return {
    legA: 'AAA',
    legB: 'BBB',
    timestamps: Array.from({ length: N_OU }, (_, i) => T0_OU + i * 60_000),
    closesA,
    closesB,
  };
}

/** Panel indices of the entry / exit decisions on ouPanel(). */
export const ENTRY_IDX = 18;
export const EXIT_IDX = 20;

/** Baseline simulator config for the OU fixture. */
export function simConfig(overrides: Partial<PairSimConfig> = {}): PairSimConfig {
  return {
    hedgeWindow: N_OU,
    zWindow: 6,
    minObs: 10,
    entryZ: 2.0,
    exitZ: 0.5,
    maxHalfLife: 50,
    minCorrelation: 0.0,
    validationWindow: N_OU,
    revalidateEvery: 10_000,
    costBps: 0,
    stressMode: 'conservative',
    minObservations: 4,
    ...overrides,
  };
}

/**
 * Degenerate-leg fixture: leg B tracks 2·A until DIVERGE_FROM, then decays
 * linearly while A keeps ramping. With hedgeWindow=10 + entryZ=2.2 the sim
 * enters short_spread at index SHORT_ENTRY_IDX; the rolling β collapses
 * toward zero and nulls at index NULL_BETA_IDX while still positioned, which
 * exercises the simulator's forced-FLAT fail-closed path.
 */
export const DIVERGE_FROM = 35;
export const SHORT_ENTRY_IDX = 37;
export const NULL_BETA_IDX = 40;

export function divergePanel(): PairPanel {
  const closesA = Array.from({ length: N_OU }, (_, i) => 100 + i * 10);
  const bRef = 2 * closesA[DIVERGE_FROM]! + OU_DEV_48[DIVERGE_FROM]!;
  const closesB = closesA.map((a, i) => {
    if (i < DIVERGE_FROM) return 2 * a + OU_DEV_48[i]!;
    return bRef - (i - DIVERGE_FROM) * 30;
  });
  return {
    legA: 'AAA',
    legB: 'BBB',
    timestamps: Array.from({ length: N_OU }, (_, i) => T0_OU + i * 60_000),
    closesA,
    closesB,
  };
}

/** Deterministic LCG (same constants as other alpha tests). */
export function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
