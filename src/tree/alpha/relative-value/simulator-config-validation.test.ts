import { describe, it, expect } from 'vitest';
import { runPairSpreadSim } from './simulator';
import { buildSpreadSeries } from './spread';
import { validatePairTradable } from './validation';
import { N_OU, T0_OU, ouPanel, simConfig } from './simulator-fixtures';
import type { PairPanel, PairSimConfig } from './types';

/** Ramp panel builder with injectable closes (A = 100+i·10, B = 2·A). */
function rampPanel(n: number, closesA?: number[], closesB?: number[]): PairPanel {
  return {
    legA: 'AAA',
    legB: 'BBB',
    timestamps: Array.from({ length: n }, (_, i) => T0_OU + i * 60_000),
    closesA: closesA ?? Array.from({ length: n }, (_, i) => 100 + i * 10),
    closesB: closesB ?? Array.from({ length: n }, (_, i) => 2 * (100 + i * 10)),
  };
}

describe('runPairSpreadSim — revalidateEvery fail-closed', () => {
  const panel = ouPanel();

  function expectThrow(value: number): void {
    const config: PairSimConfig = simConfig({ revalidateEvery: value });
    expect(() => runPairSpreadSim(panel, config)).toThrow(
      'revalidateEvery must be a positive integer',
    );
  }

  it('throws when revalidateEvery is 0', () => {
    expectThrow(0);
  });

  it('throws when revalidateEvery is negative (-5)', () => {
    expectThrow(-5);
  });

  it('throws when revalidateEvery is fractional (2.5)', () => {
    expectThrow(2.5);
  });

  it('throws when revalidateEvery is NaN', () => {
    expectThrow(Number.NaN);
  });
});

describe('runPairSpreadSim — gate cadence for valid revalidateEvery', () => {
  it('re-runs the gate exactly every N periods starting at the first period', () => {
    const EVERY = 3;
    const panel = ouPanel();
    const result = runPairSpreadSim(panel, simConfig({ revalidateEvery: EVERY }));
    const expectedGates = Math.floor((result.periods.length - 1) / EVERY) + 1;
    expect(result.validationTrail).toHaveLength(expectedGates);
    // First simulated period is always a gate period.
    expect(result.validationTrail[0]!.timestamp).toBe(result.periods[0]!.timestamp);
    // Consecutive gates sit exactly EVERY panel steps apart (60s bars).
    for (let i = 1; i < result.validationTrail.length; i++) {
      const gap =
        result.validationTrail[i]!.timestamp - result.validationTrail[i - 1]!.timestamp;
      expect(gap).toBe(EVERY * 60_000);
    }
  });

  it('cadence 1 trails a gate at every simulated period', () => {
    const result = runPairSpreadSim(ouPanel(), simConfig({ revalidateEvery: 1 }));
    expect(result.validationTrail).toHaveLength(result.periods.length);
  });
});

describe('positive-finite close contract', () => {
  it('runPairSpreadSim throws on a zero legA close, naming leg and index', () => {
    const badA = Array.from({ length: 12 }, (_, i) => (i === 5 ? 0 : 100 + i * 10));
    expect(() =>
      runPairSpreadSim(rampPanel(12, badA), simConfig()),
    ).toThrow('runPairSpreadSim: legA close must be positive finite at index 5');
  });

  it('runPairSpreadSim throws on a negative legB close, naming leg and index', () => {
    const badB = Array.from({ length: 12 }, (_, i) => (i === 9 ? -20 : 2 * (100 + i * 10)));
    expect(() =>
      runPairSpreadSim(rampPanel(12, undefined, badB), simConfig()),
    ).toThrow('runPairSpreadSim: legB close must be positive finite at index 9');
  });

  it('buildSpreadSeries standalone throws on a zero close', () => {
    const base = ouPanel();
    const badB = [...base.closesB];
    badB[3] = 0;
    const panel: PairPanel = { ...base, closesB: badB };
    expect(() =>
      buildSpreadSeries(panel, simConfig()),
    ).toThrow('buildSpreadSeries: legB close must be positive finite at index 3');
  });

  it('validatePairTradable standalone throws on a zero close', () => {
    const base = ouPanel();
    const badA = [...base.closesA];
    badA[N_OU - 1] = 0;
    const panel: PairPanel = { ...base, closesA: badA };
    expect(() =>
      validatePairTradable(
        panel,
        simConfig(),
        base.timestamps[base.timestamps.length - 1]!,
      ),
    ).toThrow(`validatePairTradable: legA close must be positive finite at index ${N_OU - 1}`);
  });
});
