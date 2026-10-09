import { describe, it, expect } from 'vitest';
import { computeSchiedZhangExecution } from '@/tree/quantlib/execution/schied-zhang-engine';
import { computeKyleObizhaevaSpread } from '@/tree/quantlib/microstructure/kyle-obizhaeva-spread-engine';
import {
  initializeCrossCorrelationState,
  updateTickCrossCorrelation,
  getPairLagMetrics,
} from '@/tree/quantlib/leadlag/tick-cross-correlator';
import {
  computeDeliberationTotals,
  sumBuckets,
  assertNoSilentSkips,
  summarizeDeliberationReport,
  DELIBERATION_STAGES,
  type DeliberationReport,
  type StageResult,
} from '@/forest/research/tradingagents/report-types';

describe('Triad v41 Apex Multi-Domain Suite Cross-Domain Simulation', () => {
  it('integrates microstructure invariance, rough volatility execution, modular tick correlator, and deliberation reports', () => {
    // 1. Kyle-Obizhaeva (2018) Microstructure Invariance Spread
    const invarianceRes = computeKyleObizhaevaSpread({
      dollarVolume: 50_000_000,
      volatility: 0.05,
      price: 3_000,
    });
    expect(invarianceRes.invariantSpread).toBeGreaterThan(0);
    expect(invarianceRes.invariantTradeCount).toBeGreaterThan(0);

    // 2. Schied-Zhang (2019) Optimal Execution with Rough Volatility
    const execRes = computeSchiedZhangExecution({
      initialShares: 200,
      initialPrice: 3_000,
      numSteps: 4,
      timeHorizon: 0.25,
      hurstParameter: 0.15,
      baseVolatility: 0.05,
      riskAversion: 2e-4,
      temporaryImpact: 1e-4,
    });
    expect(execRes.trajectory.length).toBe(4);
    expect(execRes.terminalShares).toBe(0);
    expect(execRes.roughnessMultiplier).toBeGreaterThan(1);

    // 3. Modular tick cross-correlator
    let state = initializeCrossCorrelationState(['ETH', 'BTC'], 3);
    expect(state.symbols).toEqual(['ETH', 'BTC']);
    state = updateTickCrossCorrelation(state, { symbol: 'BTC', price: 60000, timestampMs: 1000 }, { maxLag: 3, decayFactor: 0.95, minObservations: 2, sensitivityBps: 10 });
    state = updateTickCrossCorrelation(state, { symbol: 'ETH', price: 3000, timestampMs: 1000 }, { maxLag: 3, decayFactor: 0.95, minObservations: 2, sensitivityBps: 10 });
    state = updateTickCrossCorrelation(state, { symbol: 'BTC', price: 60600, timestampMs: 2000 }, { maxLag: 3, decayFactor: 0.95, minObservations: 2, sensitivityBps: 10 });
    state = updateTickCrossCorrelation(state, { symbol: 'ETH', price: 3030, timestampMs: 2000 }, { maxLag: 3, decayFactor: 0.95, minObservations: 2, sensitivityBps: 10 });
    const metrics = getPairLagMetrics(state, 'BTC', 'ETH', 1);
    expect(metrics.lag).toBe(1);
    expect(metrics.correlation).toBeGreaterThanOrEqual(-1);
    expect(metrics.correlation).toBeLessThanOrEqual(1);

    // 4. Modular deliberation report verification
    const stageResults: StageResult[] = DELIBERATION_STAGES.map((stage) => ({
      stage,
      outcome: 'completed',
      reasons: [],
    }));
    const totals = computeDeliberationTotals(stageResults);
    expect(totals.completed).toBe(7);
    expect(totals.total).toBe(7);
    expect(sumBuckets(totals)).toBe(7);

    const mockReport = {
      totals,
      stageResults,
    } as unknown as DeliberationReport;

    expect(() => assertNoSilentSkips(mockReport, 7)).not.toThrow();
    expect(summarizeDeliberationReport(mockReport)).toContain('7 stages — completed 7');
  });
});
