// AlphaImportReport unit tests — bucket counter arithmetic and the
// fail-closed Σ≡N invariant (tampered totals MUST throw).

import { describe, expect, it } from 'vitest';
import {
  ALPHA_IMPORT_OUTCOMES,
  AlphaImportOutcome,
  AlphaImportReport,
  PerAlphaResult,
  assertNoSilentSkips,
  computeTotals,
  sumBuckets,
  summarizeReport,
} from './import-report';

function result(outcome: AlphaImportOutcome, id = 'a1'): PerAlphaResult {
  return { sourceAlphaId: id, outcome, reasons: outcome === 'imported' ? [] : [`reason:${id}`] };
}

describe('computeTotals / sumBuckets counter arithmetic', () => {
  it('counts every bucket correctly for a mixed result set', () => {
    const results = [
      result('validation-error'),
      result('unsupported'),
      result('non-causal'),
      result('duplicate'),
      result('rejected'),
      result('adapted'),
      result('imported'),
    ];
    const totals = computeTotals(results);
    expect(totals).toEqual({
      validationError: 1, unsupported: 1, nonCausal: 1, duplicate: 1,
      rejected: 1, adapted: 1, imported: 1, total: 7,
    });
    expect(sumBuckets(totals)).toBe(7);
  });

  it('empty result set → all-zero counters with total 0', () => {
    const totals = computeTotals([]);
    expect(sumBuckets(totals)).toBe(0);
    expect(totals.total).toBe(0);
  });

  it('total equals results length regardless of bucket mix', () => {
    const totals = computeTotals([result('adapted'), result('adapted'), result('imported')]);
    expect(totals.adapted).toBe(2);
    expect(totals.imported).toBe(1);
    expect(totals.total).toBe(3);
  });

  it('covers all 7 D3 outcomes in the union type', () => {
    expect(ALPHA_IMPORT_OUTCOMES).toHaveLength(7);
  });

  it('summarizeReport renders every bucket count', () => {
    const report: AlphaImportReport = {
      totals: computeTotals([result('imported'), result('unsupported')]),
      results: [],
    };
    const summary = summarizeReport(report);
    expect(summary).toContain('imported 1');
    expect(summary).toContain('unsupported 1');
    expect(summary).toContain('2 entries');
  });
});

describe('assertNoSilentSkips invariant', () => {
  function buildReport(results: PerAlphaResult[], overrides: Partial<AlphaImportReport['totals']> = {}): AlphaImportReport {
    return { totals: { ...computeTotals(results), ...overrides }, results };
  }

  it('passes on a consistent report', () => {
    const results = [result('adapted'), result('imported'), result('unsupported')];
    expect(() => assertNoSilentSkips(buildReport(results), 3)).not.toThrow();
  });

  it('throws when a bucket counter was tampered downward (silent skip)', () => {
    const results = [result('adapted'), result('imported')];
    const report = buildReport(results, { imported: 0 });
    expect(() => assertNoSilentSkips(report, 2)).toThrow(/silent-skip/);
  });

  it('throws when bucket sum exceeds the entry count', () => {
    const results = [result('imported')];
    const report = buildReport(results, { imported: 2 });
    expect(() => assertNoSilentSkips(report, 1)).toThrow(/bucket sum 2 !== entry count 1/);
  });

  it('throws when totals.total disagrees with the entry count', () => {
    const results = [result('imported')];
    const report = buildReport(results, { total: 5 });
    expect(() => assertNoSilentSkips(report, 1)).toThrow(/totals\.total 5 !== entry count 1/);
  });

  it('passes for a zero-entry report', () => {
    expect(() => assertNoSilentSkips(buildReport([]), 0)).not.toThrow();
  });
});
