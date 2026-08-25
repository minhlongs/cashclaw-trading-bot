import { describe, expect, it } from 'vitest';
import { runPairSpreadSim } from './simulator';
import { buildSpreadSeries } from './spread';
import { GATE_SKIPPED_REASON } from './simulator';
import { ouPanel, simConfig, ENTRY_IDX } from './simulator-fixtures';

describe('additive simulator options (defaults unchanged)', () => {
  // ── hedgeMode: 'frozen' ────────────────────────────────────────────────

  it('frozen β is constant across all periods after the anchor', () => {
    const panel = ouPanel();
    const config = simConfig({ hedgeMode: 'frozen' });
    const series = buildSpreadSeries(panel, config);
    // Anchor = estimate at timestamps[1]; every later state carries it.
    let anchor: number | null = null;
    for (const state of series) {
      if (state.hedgeRatio !== null && anchor === null) anchor = state.hedgeRatio;
      if (state.hedgeRatio !== null) expect(state.hedgeRatio).toBe(anchor);
    }
    expect(anchor).not.toBeNull();
  });

  it('frozen-β series differs from rolling (rolling drifts as window slides)', () => {
    const panel = ouPanel();
    const frozen = buildSpreadSeries(panel, simConfig({ hedgeMode: 'frozen' }));
    const rolling = buildSpreadSeries(panel, simConfig());
    const frozenBetas = frozen.map((s) => s.hedgeRatio).filter((b): b is number => b !== null);
    const uniqueFrozen = new Set(frozenBetas);
    expect(uniqueFrozen.size).toBe(1);
    // The fixture's rolling β varies across the window — sanity-check the two modes differ.
    const rollingBetas = new Set(
      rolling.map((s) => s.hedgeRatio).filter((b): b is number => b !== null),
    );
    expect(rollingBetas.size).toBeGreaterThan(1);
  });

  it('omitting hedgeMode preserves exact rolling behavior (deep-equal to explicit rolling)', () => {
    const panel = ouPanel();
    const omitted = runPairSpreadSim(panel, simConfig());
    const explicit = runPairSpreadSim(panel, simConfig({ hedgeMode: 'rolling' }));
    expect(explicit).toEqual(omitted);
  });

  // ── inSimTradabilityGate: false ────────────────────────────────────────

  it('gate off — trail records skipped and gateOpen stays true', () => {
    const panel = ouPanel();
    const result = runPairSpreadSim(panel, simConfig({ inSimTradabilityGate: false, revalidateEvery: 5 }));
    expect(result.validationTrail.length).toBeGreaterThan(0);
    for (const entry of result.validationTrail) {
      expect(entry.tradable).toBe(true);
      expect(entry.reasons).toEqual([GATE_SKIPPED_REASON]);
    }
  });

  it('gate off with a failing pair still trades where gated mode would stay flat', () => {
    const panel = ouPanel();
    // minCorrelation 1.0 can never pass → gated run must never enter.
    const harshGate = simConfig({ minCorrelation: 1 });
    const gated = runPairSpreadSim(panel, harshGate);
    expect(gated.tradeCount).toBe(0);
    for (const p of gated.periods) expect(p.position).toBe('flat');

    const gateOff = runPairSpreadSim(panel, { ...harshGate, inSimTradabilityGate: false });
    expect(gateOff.tradeCount).toBeGreaterThan(0);
  });

  // ── entryFilter ────────────────────────────────────────────────────────

  it('entryFilter blocks entries at disallowed timestamps', () => {
    const panel = ouPanel();
    const baseline = runPairSpreadSim(panel, simConfig());
    expect(baseline.tradeCount).toBeGreaterThan(0);
    // Block everything → zero entries, all periods flat.
    const blocked = runPairSpreadSim(panel, simConfig({ entryFilter: () => false }));
    expect(blocked.tradeCount).toBe(0);
    for (const p of blocked.periods) expect(p.position).toBe('flat');
  });

  it('entryFilter never traps positions — exits still fire when filter is false', () => {
    const panel = ouPanel();
    const baseline = runPairSpreadSim(panel, simConfig());
    const entryTs = panel.timestamps[ENTRY_IDX]!;
    // Allow only the baseline entry timestamp; every later exit must still occur.
    const filtered = runPairSpreadSim(
      panel,
      simConfig({ entryFilter: (t) => t === entryTs }),
    );
    expect(filtered.periods.some((p) => p.position === 'long_spread')).toBe(true);
    // Position eventually returns to flat (exit not trapped by the filter).
    expect(filtered.periods.slice(-5).some((p) => p.position === 'flat')).toBe(true);
    expect(baseline.warnings.length).toBeGreaterThanOrEqual(0);
  });

  it('entryFilter receives decision timestamps only (pure callback contract)', () => {
    const seen: number[] = [];
    const panel = ouPanel();
    runPairSpreadSim(panel, simConfig({
      entryFilter: (t) => {
        seen.push(t);
        return true;
      },
    }));
    expect(seen.length).toBeGreaterThan(0);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]!).toBeGreaterThan(seen[i - 1]!); // chronological, per-period
    }
  });

  // ── Combined defaults ──────────────────────────────────────────────────

  it('all three knobs absent → byte-identical behavior vs pre-change semantics', () => {
    const panel = ouPanel();
    const a = runPairSpreadSim(panel, simConfig());
    const b = runPairSpreadSim(panel, simConfig({
      hedgeMode: undefined,
      inSimTradabilityGate: undefined,
      entryFilter: undefined,
    }));
    expect(b).toEqual(a);
  });
});
