import { describe, it, expect } from 'vitest';
import { runPairSpreadSim } from './simulator';
import { buildSpreadSeries } from './spread';
import { ENTRY_IDX, EXIT_IDX, ouPanel, simConfig } from './simulator-fixtures';

// ── Hand-computed fixture (deterministic OU spread) ─────────────────────
// Leg A ramps linearly; leg B = 2·A + dev where dev is a fixed AR(1)
// sequence (phi = 0.3 — see simulator-fixtures.ts). The pair passes the
// tradability gate at warm-up; z crosses −entryZ exactly once (panel index
// 18) and exits above −exitZ (panel index 20).
//
// Hand arithmetic (verified):
//   β(18) from rolling OLS over all prior closes;
//   Entry turnover = (1 + β)/2;
//   grossReturn(entry) = −β·rA + rB with rA = A[19]/A[18] − 1,
//     rB = B[19]/B[18] − 1;
//   Exit turnover = (1 + β(19))/2;
//   tradeCount = 2 (one entry transition + one exit transition).

describe('runPairSpreadSim — hand-computed fixture', () => {
  const panel = ouPanel();
  const config = simConfig();
  const result = runPairSpreadSim(panel, config);

  // Expected values derived by hand from the panel + buildSpreadSeries.
  const series = buildSpreadSeries(panel, config);
  const betaEntry = series[ENTRY_IDX]!.hedgeRatio as number;
  const betaHold = series[EXIT_IDX - 1]!.hedgeRatio as number;

  it('produces exactly one round trip (2 trades)', () => {
    expect(result.tradeCount).toBe(2);
  });

  it('enters long_spread when z crosses below −entryZ at panel index 18', () => {
    const entry = result.periods.find((p) => p.position !== 'flat');
    expect(entry).toBeDefined();
    expect(series[ENTRY_IDX]!.zScore as number).toBeLessThanOrEqual(-config.entryZ);
    expect(entry!.timestamp).toBe(panel.timestamps[ENTRY_IDX]);
    expect(entry!.position).toBe('long_spread');
    // Weights: long 1 unit B, short β units A.
    expect(entry!.weights['BBB']).toBe(1);
    expect(entry!.weights['AAA']).toBeCloseTo(-betaEntry, 12);
  });

  it('holds through index 19 then exits flat at index 20', () => {
    const positions = result.periods.map((p) => p.position);
    const entryPos = positions.indexOf('long_spread');
    expect(positions[entryPos + 1]).toBe('long_spread'); // hold while z < −exitZ
    expect(series[EXIT_IDX]!.zScore as number).toBeGreaterThanOrEqual(-config.exitZ);
    expect(positions[entryPos + 2]).toBe('flat');
    // No re-entry afterwards.
    expect(positions.slice(entryPos + 3).every((pos) => pos === 'flat')).toBe(true);
  });

  it('entry turnover equals (1+β)/2 exactly', () => {
    const entry = result.periods.find((p) => p.turnover > 0)!;
    expect(entry.turnover).toBeCloseTo((1 + betaEntry) / 2, 12);
  });

  it('exit turnover equals (1+β_hold)/2 exactly', () => {
    const positions = result.periods.map((p) => p.position);
    const entryPos = positions.indexOf('long_spread');
    const exitPeriod = result.periods[entryPos + 2]!;
    expect(exitPeriod.position).toBe('flat');
    expect(exitPeriod.turnover).toBeCloseTo((1 + betaHold) / 2, 12);
  });

  it('grossReturn matches manual arithmetic w_A·r_A + w_B·r_B', () => {
    const entry = result.periods.find((p) => p.position !== 'flat')!;
    const rA = panel.closesA[ENTRY_IDX + 1]! / panel.closesA[ENTRY_IDX]! - 1;
    const rB = panel.closesB[ENTRY_IDX + 1]! / panel.closesB[ENTRY_IDX]! - 1;
    const expected = (entry.weights['AAA'] ?? 0) * rA + (entry.weights['BBB'] ?? 0) * rB;
    expect(entry.grossReturn).toBeCloseTo(expected, 14);
    // Sign sanity: short-A/long-B on a rising market loses money here.
    expect(entry.grossReturn).toBeLessThan(0);
  });

  it('netReturn equals grossReturn when costBps=0 even with turnover', () => {
    for (const p of result.periods) {
      expect(p.netReturn).toBe(p.grossReturn);
      expect(p.costPct).toBe(0);
    }
  });

  it('equity compounds from 1.0 via Π(1+netReturn)', () => {
    expect(result.equityCurve).toHaveLength(result.periods.length + 1);
    expect(result.equityCurve[0]).toBe(1);
    let expected = 1;
    for (let i = 0; i < result.periods.length; i++) {
      expected *= 1 + result.periods[i]!.netReturn;
      expect(result.equityCurve[i + 1]).toBeCloseTo(expected, 14);
    }
    // The round trip lost money (grossReturn was negative).
    expect(result.equityCurve[result.equityCurve.length - 1]).toBeLessThan(1);
  });

  it('exposures match Σ|w| and Σw per period', () => {
    for (const p of result.periods) {
      if (p.position === 'flat') {
        expect(p.grossExposure).toBe(0);
        expect(p.netExposure).toBe(0);
      } else {
        expect(p.grossExposure).toBeCloseTo(1 + Math.abs(p.hedgeRatio!), 12);
        expect(p.netExposure).toBeCloseTo(1 - p.hedgeRatio!, 12);
      }
    }
  });

  it('totalTurnover is the sum of per-period turnover', () => {
    const sum = result.periods.reduce((s, p) => s + p.turnover, 0);
    expect(result.totalTurnover).toBeCloseTo(sum, 14);
    expect(result.totalTurnover).toBeGreaterThan(2); // entry + exit both paid
    expect(result.totalCosts).toBe(0);
  });

  it('emits no warnings in the clean scenario', () => {
    expect(result.warnings).toEqual([]);
  });
});
