// AlphaZooAdapter — duplicate semantics (D1), determinism, and the
// vsump5/vsump10 regression pair (identical formula text, distinct warmups
// MUST both register). Every run asserts Σ buckets ≡ N via expectBuckets.

import { describe, expect, it } from 'vitest';
import { importAlphaZooManifest, type AlphaZooImportReport } from './zoo-adapter';
import { assertNoSilentSkips, type AlphaImportOutcome, type ZooAdapterConfig } from './import-report';
import type { DataWindow } from '../experiment-spec';

const UNIVERSE = {
  id: 'us-equity', symbols: ['AAPL', 'MSFT', 'NVDA'],
  weighting: 'equal' as const, rebalanceRule: 'daily' as const,
};
const WINDOW: DataWindow = { earliestTimestamp: 0, latestTimestamp: 86_400_000 * 1000, barCount: 1000 };
const NOW = '2026-08-26T00:00:00.000Z';

function makeConfig(): ZooAdapterConfig {
  return {
    marketUniverses: { equity_us: UNIVERSE }, dataWindow: WINDOW,
    defaultCostMode: 'conservative', nowIso: NOW, importerVersion: 'alphazoo-adapter@1',
  };
}

function makeEntry(id: string, minWarmupBars: number): Record<string, unknown> {
  return {
    id, nickname: id, theme: ['volume'], formula_latex: 'safe_div(volume, ts_mean(volume, 5))',
    columns_required: ['volume'], extras_required: [], requires_sector: false,
    universe: ['equity_us'], frequency: ['1d'], decay_horizon: 5,
    min_warmup_bars: minWarmupBars, notes: `volume-sum pressure variant ${id}`,
  };
}

function makeManifest(entries: unknown[]): Record<string, unknown> {
  return {
    schemaVersion: 1, sourceRepository: 'github.com/example/vibe-trading',
    sourceVersion: 'abc1234', extractedAt: NOW, entries,
  };
}

async function run(entries: unknown[]) {
  return importAlphaZooManifest(makeManifest(entries), makeConfig());
}

/** Fail-closed assertion used on EVERY fixture run: Σ buckets ≡ N. */
function expectBuckets(report: AlphaZooImportReport, expected: Partial<Record<AlphaImportOutcome, number>>, n?: number) {
  assertNoSilentSkips(report, n ?? report.totals.total);
  const actual = new Map<string, number>();
  for (const r of report.results) actual.set(r.outcome, (actual.get(r.outcome) ?? 0) + 1);
  for (const [outcome, count] of Object.entries(expected)) {
    expect(actual.get(outcome) ?? 0).toBe(count);
  }
}

describe('duplicate semantics (D1 canonical payload key)', () => {
  it('same entry twice in one call → second DUPLICATE citing first id', async () => {
    const entry = makeEntry('dup_me', 10);
    const report = await run([entry, entry]);
    expectBuckets(report, { imported: 1, duplicate: 1 }, 2);
    expect(report.results[1].reasons).toContain('DUPLICATE_OF:dup_me');
    expect(report.registered).toHaveLength(1);
    expect(report.registered[0].hypothesis.id).toBe('zoo-dup_me');
  });

  it('vsump-style pair: identical text, distinct warmups → BOTH registered', async () => {
    const report = await run([makeEntry('vsump5', 5), makeEntry('vsump10', 10)]);
    expectBuckets(report, { imported: 2 }, 2);
    expect(report.results.every((r) => r.outcome === 'imported')).toBe(true);
    expect(report.registered.map((r) => r.hypothesis.id)).toEqual(['zoo-vsump5', 'zoo-vsump10']);
  });

  it("duplicate detection keys on timeframe too ('1D' collapses onto '1d')", async () => {
    // Both entries share formula + warmup; only frequency casing differs.
    const a = { ...makeEntry('tf_a', 10) };
    const b = { ...makeEntry('tf_b', 10), frequency: ['1D'] };
    const report = await run([a, b]);
    expectBuckets(report, { imported: 1, duplicate: 1 }, 2);
    expect(report.results[1].reasons).toContain('DUPLICATE_OF:tf_a');
  });
});

describe('determinism + empty manifest', () => {
  it('fixed nowIso → two runs deep-equal (deterministic pipeline)', async () => {
    const entries = [makeEntry('alpha_a', 10), makeEntry('alpha_b', 20)];
    const r1 = await run(entries);
    const r2 = await run(entries);
    expect(r1).toEqual(r2);
  });

  it('empty entries array → zero totals, invariant holds at 0', async () => {
    const report = await run([]);
    expectBuckets(report, {}, 0);
    expect(report.totals.total).toBe(0);
    expect(report.registered).toHaveLength(0);
  });
});
