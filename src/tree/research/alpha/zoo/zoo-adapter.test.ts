// AlphaZooAdapter tests — golden path + EVERY D3 bucket. Duplicate
// semantics, determinism, and the vsump regression pair live in
// zoo-adapter-determinism.test.ts. Every run asserts Σ buckets ≡ N
// via expectBuckets (no silent skips).

import { describe, expect, it } from 'vitest';
import { importAlphaZooManifest, type AlphaZooImportReport } from './zoo-adapter';
import {
  assertNoSilentSkips,
  type AlphaImportOutcome,
  type AlphaImportTotals,
  type ZooAdapterConfig,
} from './import-report';
import { parseResearchHypothesis } from '../../hypothesis/types';
import { validateProvenance } from '../provenance';
import type { DataWindow } from '../experiment-spec';

export const UNIVERSE = {
  id: 'us-equity', symbols: ['AAPL', 'MSFT', 'NVDA'],
  weighting: 'equal' as const, rebalanceRule: 'daily' as const,
};
export const WINDOW: DataWindow = { earliestTimestamp: 0, latestTimestamp: 86_400_000 * 1000, barCount: 1000 };
export const NOW = '2026-08-26T00:00:00.000Z';

function makeConfig(overrides: Partial<ZooAdapterConfig> = {}): ZooAdapterConfig {
  return {
    marketUniverses: { equity_us: UNIVERSE }, dataWindow: WINDOW,
    defaultCostMode: 'conservative', nowIso: NOW, importerVersion: 'alphazoo-adapter@1',
    ...overrides,
  };
}

function makeEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'alpha101_006', nickname: 'open-volume correlation', theme: ['volume'],
    formula_latex: '-1 * correlation(open, volume, 10)',
    columns_required: ['open', 'volume'], extras_required: [], requires_sector: false,
    universe: ['equity_us'], frequency: ['1D'], decay_horizon: 5, min_warmup_bars: 10,
    notes: 'negative open-volume correlation tends to mean-revert intraday',
    ...overrides,
  };
}

function makeManifest(entries: unknown[]): Record<string, unknown> {
  return {
    schemaVersion: 1, sourceRepository: 'github.com/example/vibe-trading',
    sourceVersion: 'abc1234', extractedAt: NOW, entries,
  };
}

async function run(entries: unknown[], configOverrides: Partial<ZooAdapterConfig> = {}) {
  return importAlphaZooManifest(makeManifest(entries), makeConfig(configOverrides));
}

/** Fail-closed assertion used on EVERY fixture run: Σ buckets ≡ N. */
function expectBuckets(report: AlphaZooImportReport, expected: Partial<Record<AlphaImportOutcome, number>>, n?: number) {
  assertNoSilentSkips(report, n ?? report.totals.total);
  const pairs: ReadonlyArray<readonly [AlphaImportOutcome, keyof AlphaImportTotals]> = [
    ['validation-error', 'validationError'], ['unsupported', 'unsupported'],
    ['non-causal', 'nonCausal'], ['duplicate', 'duplicate'], ['rejected', 'rejected'],
    ['adapted', 'adapted'], ['imported', 'imported'],
  ];
  for (const [outcome, key] of pairs) expect(report.totals[key]).toBe(expected[outcome] ?? 0);
}

describe('golden path + registered output', () => {
  it('adapts a canonicalizable formula and registers hypothesis + provenance', async () => {
    const report = await run([makeEntry()]);
    expectBuckets(report, { adapted: 1 }, 1);
    expect(report.results[0].outcome).toBe('adapted');
    expect(report.results[0].hypothesisId).toBe('zoo-alpha101_006');
    const h = report.registered[0].hypothesis;
    expect(h.source).toBe('vibe-zoo');
    expect(h.timeframe).toBe('1d');
    expect(h.universe).toEqual(UNIVERSE);
    expect(h.transformations).toEqual(['-1 * ts_corr(open, volume, 10)']);
  });

  it('imports cleanly when no normalization is needed', async () => {
    const report = await run([makeEntry({ id: 'clean1', formula_latex: 'ts_mean(close, 5)', columns_required: ['close'], frequency: ['1d'] })]);
    expectBuckets(report, { imported: 1 }, 1);
    expect(report.results[0].outcome).toBe('imported');
  });

  it('stamps D4 fields deterministically (horizon, direction, cost, clock)', async () => {
    const { registered } = await run([makeEntry({ decay_horizon: 7 })]);
    const h = registered[0].hypothesis;
    expect(h.horizon).toBe(7);
    expect(h.expectedHoldingPeriod).toBe(7);
    expect(h.expectedDirection).toBe('neutral');
    expect(h.costAssumption).toBe('conservative');
    expect(h.generatedBy).toBe('alphazoo-adapter@1');
    expect(h.createdAt).toBe(NOW);
    expect(h.parentHypothesisId).toBeNull();
  });

  it('produces valid provenance bound to the manifest envelope', async () => {
    const { registered } = await run([makeEntry()]);
    const p = registered[0].provenance;
    expect(p.sourceZoo).toBe('vibe-trading-zoo');
    expect(p.sourceRepository).toBe('github.com/example/vibe-trading');
    expect(p.formulaHash).toMatch(/^[0-9a-f]{64}$/);
    expect(validateProvenance(p).ok).toBe(true);
    expect(parseResearchHypothesis(registered[0].hypothesis).ok).toBe(true);
  });
});

describe('D3 bucket coverage', () => {
  it('whole-manifest failure (non-object input) → single validation-error row', async () => {
    const report = await importAlphaZooManifest('not-a-manifest', makeConfig());
    expectBuckets(report, { 'validation-error': 1 }, 1);
    expect(report.results[0].reasons.length).toBeGreaterThan(0);
    expect(report.registered).toHaveLength(0);
  });

  it('envelope field failure with parseable entries → per-entry validation-error rows', async () => {
    const manifest = makeManifest([makeEntry(), makeEntry({ id: 'second' })]);
    manifest.extractedAt = 'not-a-date';
    const report = await importAlphaZooManifest(manifest, makeConfig());
    expectBuckets(report, { 'validation-error': 2 }, 2);
    expect(report.results.map((r) => r.sourceAlphaId)).toEqual(['alpha101_006', 'second']);
  });

  it('one malformed entry among good ones fails alone with path-named reason', async () => {
    const report = await run([{ ...makeEntry(), id: '' }, makeEntry({ id: 'ok-one' })]);
    expectBuckets(report, { 'validation-error': 1, adapted: 1 }, 2);
    expect(report.results[0].reasons.some((r) => r.startsWith('id:'))).toBe(true);
    expect(report.results[1].sourceAlphaId).toBe('ok-one');
  });

  it('schema-failing entry without usable id gets an index pseudo-id', async () => {
    const report = await run([{ nickname: 'no-id-here' }]);
    expectBuckets(report, { 'validation-error': 1 }, 1);
    expect(report.results[0].sourceAlphaId).toBe('entries.0');
  });

  it("placeholder formula 'see body' → unsupported FORMULA_UNPARSEABLE", async () => {
    const report = await run([makeEntry({ id: 'gtja_see', formula_latex: 'see body' })]);
    expectBuckets(report, { unsupported: 1 }, 1);
    expect(report.results[0].reasons).toContain('FORMULA_UNPARSEABLE');
  });

  it('unknown operator log() → unsupported with named token', async () => {
    const report = await run([makeEntry({ id: 'log_one', formula_latex: 'log(close)' })]);
    expectBuckets(report, { unsupported: 1 }, 1);
    expect(report.results[0].reasons).toContain('UNSUPPORTED_OPERATOR:LOG');
  });

  it('conditional ? expression → unsupported expression form', async () => {
    const report = await run([makeEntry({ id: 'cond1', formula_latex: '(close < open) ? close : open' })]);
    expectBuckets(report, { unsupported: 1 }, 1);
    expect(report.results[0].reasons).toContain('UNSUPPORTED_EXPRESSION_FORM:conditional');
  });

  it('forward reference delta(close,-1) → non-causal', async () => {
    const report = await run([makeEntry({ id: 'nc1', formula_latex: 'delta(close, -1)' })]);
    expectBuckets(report, { 'non-causal': 1 }, 1);
    expect(report.results[0].reasons).toContain('NON_CAUSAL_FORWARD_REFERENCE');
  });

  it('requires_sector → unsupported SECTOR_DATA_UNAVAILABLE', async () => {
    const report = await run([makeEntry({ requires_sector: true })]);
    expectBuckets(report, { unsupported: 1 }, 1);
    expect(report.results[0].reasons).toContain('SECTOR_DATA_UNAVAILABLE');
  });

  it('non-empty extras_required → unsupported EXTRAS_REQUIRED', async () => {
    const report = await run([makeEntry({ extras_required: ['group_data'] })]);
    expectBuckets(report, { unsupported: 1 }, 1);
    expect(report.results[0].reasons).toContain('EXTRAS_REQUIRED:group_data');
  });

  it('unconfigured market tag → rejected OUT_OF_UNIVERSE naming the tags', async () => {
    const report = await run([makeEntry({ id: 'cn1', universe: ['equity_cn'] })]);
    expectBuckets(report, { rejected: 1 }, 1);
    expect(report.results[0].reasons).toContain('OUT_OF_UNIVERSE:equity_cn');
  });

  it('compile-stage lookback>window → rejected LOOKBACK_EXCEEDS_WINDOW', async () => {
    const tiny: DataWindow = { earliestTimestamp: 0, latestTimestamp: 86_400_000 * 50, barCount: 50 };
    const report = await run([makeEntry({ min_warmup_bars: 60 })], { dataWindow: tiny });
    expectBuckets(report, { rejected: 1 }, 1);
    expect(report.results[0].reasons).toContain('LOOKBACK_EXCEEDS_WINDOW');
    expect(report.registered).toHaveLength(0);
  });

  it('mechanism-gate blocklist notes → rejected with gate reason', async () => {
    const report = await run([makeEntry({ notes: 'llm thinks price will go up' })]);
    expectBuckets(report, { rejected: 1 }, 1);
    expect(report.results[0].reasons.some((r) => r.includes('mechanism gate'))).toBe(true);
    expect(report.registered).toHaveLength(0);
  });
});
