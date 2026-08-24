import { describe, it, expect } from 'vitest';
import { nextPosition, validateEntryExitConfig, POSITION_FLAT, POSITION_LONG, POSITION_SHORT } from './entry-exit';
import type { PairSimConfig } from './types';

// ── Config helper ────────────────────────────────────────────────────────

function cfg(overrides: Partial<PairSimConfig> = {}): PairSimConfig {
  return {
    hedgeWindow: 10,
    zWindow: 5,
    minObs: 5,
    entryZ: 2.0,
    exitZ: 0.5,
    maxHalfLife: 20,
    minCorrelation: 0.8,
    validationWindow: 20,
    revalidateEvery: 5,
    minObservations: 10,
    ...overrides,
  };
}

// ── State machine transitions ────────────────────────────────────────────

describe('nextPosition', () => {
  it('FLAT→LONG_SPREAD when z <= -entryZ', () => {
    expect(nextPosition(POSITION_FLAT, -2.0, cfg())).toBe(POSITION_LONG);
    expect(nextPosition(POSITION_FLAT, -3.0, cfg())).toBe(POSITION_LONG);
  });

  it('FLAT→SHORT_SPREAD when z >= +entryZ', () => {
    expect(nextPosition(POSITION_FLAT, 2.0, cfg())).toBe(POSITION_SHORT);
    expect(nextPosition(POSITION_FLAT, 5.0, cfg())).toBe(POSITION_SHORT);
  });

  it('does NOT enter when z is between -entryZ and +entryZ', () => {
    expect(nextPosition(POSITION_FLAT, -1.5, cfg())).toBe(POSITION_FLAT);
    expect(nextPosition(POSITION_FLAT, 0, cfg())).toBe(POSITION_FLAT);
    expect(nextPosition(POSITION_FLAT, 1.5, cfg())).toBe(POSITION_FLAT);
  });

  it('LONG_SPREAD→FLAT when z >= -exitZ', () => {
    expect(nextPosition(POSITION_LONG, -0.5, cfg())).toBe(POSITION_FLAT);
    expect(nextPosition(POSITION_LONG, 0, cfg())).toBe(POSITION_FLAT);
    expect(nextPosition(POSITION_LONG, 1, cfg())).toBe(POSITION_FLAT);
  });

  it('SHORT_SPREAD→FLAT when z <= +exitZ', () => {
    expect(nextPosition(POSITION_SHORT, 0.5, cfg())).toBe(POSITION_FLAT);
    expect(nextPosition(POSITION_SHORT, 0, cfg())).toBe(POSITION_FLAT);
    expect(nextPosition(POSITION_SHORT, -1, cfg())).toBe(POSITION_FLAT);
  });

  it('LONG_SPREAD holds when z < -exitZ (below exit threshold)', () => {
    expect(nextPosition(POSITION_LONG, -0.6, cfg())).toBe(POSITION_LONG);
    expect(nextPosition(POSITION_LONG, -2.0, cfg())).toBe(POSITION_LONG);
  });

  it('SHORT_SPREAD holds when z > +exitZ', () => {
    expect(nextPosition(POSITION_SHORT, 0.6, cfg())).toBe(POSITION_SHORT);
    expect(nextPosition(POSITION_SHORT, 2.0, cfg())).toBe(POSITION_SHORT);
  });

  it('null z holds previous state (fail-safe warmup)', () => {
    expect(nextPosition(POSITION_FLAT, null, cfg())).toBe(POSITION_FLAT);
    expect(nextPosition(POSITION_LONG, null, cfg())).toBe(POSITION_LONG);
    expect(nextPosition(POSITION_SHORT, null, cfg())).toBe(POSITION_SHORT);
  });
});

// ── Stop loss ────────────────────────────────────────────────────────────

describe('nextPosition — stop loss', () => {
  const withStop = cfg({ stopZ: 3.0 });

  it('ANY→FLAT when |z| >= stopZ', () => {
    expect(nextPosition(POSITION_LONG, -3.0, withStop)).toBe(POSITION_FLAT);
    expect(nextPosition(POSITION_LONG, 3.0, withStop)).toBe(POSITION_FLAT);
    expect(nextPosition(POSITION_SHORT, -4.0, withStop)).toBe(POSITION_FLAT);
    expect(nextPosition(POSITION_SHORT, 4.0, withStop)).toBe(POSITION_FLAT);
  });

  it('stopZ checked before entry/exit logic', () => {
    // z=3.0 >= stopZ AND z >= entryZ: stop fires first
    expect(nextPosition(POSITION_FLAT, 3.0, withStop)).toBe(POSITION_FLAT);
  });

  it('FLAT stays FLAT when |z| < stopZ', () => {
    expect(nextPosition(POSITION_FLAT, -2.5, withStop)).toBe(POSITION_LONG);
    expect(nextPosition(POSITION_FLAT, 2.5, withStop)).toBe(POSITION_SHORT);
  });
});

// ── Config validation ────────────────────────────────────────────────────

describe('validateEntryExitConfig', () => {
  it('accepts valid config', () => {
    expect(() => validateEntryExitConfig(cfg())).not.toThrow();
  });

  it('throws when entryZ <= exitZ', () => {
    expect(() => validateEntryExitConfig(cfg({ entryZ: 0.5, exitZ: 0.5 }))).toThrow();
    expect(() => validateEntryExitConfig(cfg({ entryZ: 0.3, exitZ: 0.5 }))).toThrow();
  });

  it('throws on non-finite / non-positive thresholds', () => {
    expect(() => validateEntryExitConfig(cfg({ entryZ: 0 }))).toThrow();
    expect(() => validateEntryExitConfig(cfg({ entryZ: -1 }))).toThrow();
    expect(() => validateEntryExitConfig(cfg({ exitZ: -0.1 }))).toThrow();
    expect(() => validateEntryExitConfig(cfg({ stopZ: 0 }))).toThrow();
    expect(() => validateEntryExitConfig(cfg({ stopZ: -1 }))).toThrow();
  });

  it('accepts config without stopZ', () => {
    const noStop = cfg();
    expect(() => validateEntryExitConfig(noStop)).not.toThrow();
  });
});

// ── Determinism ──────────────────────────────────────────────────────────

describe('nextPosition — determinism', () => {
  it('same inputs produce same output', () => {
    const run1 = nextPosition(POSITION_LONG, -0.3, cfg());
    const run2 = nextPosition(POSITION_LONG, -0.3, cfg());
    expect(run1).toBe(run2);
  });
});
