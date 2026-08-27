// Zoo falsification bridge tests (Phase 3, D5/D7): fail-closed Σ-invariant,
// end-to-end evaluation, and NOT_EVALUABLE paths. Fixed fixtures only —
// ZERO assertions on unseeded randomness.

import { describe, expect, it } from 'vitest';
import {
  assertNoSilentSkips,
  computeZooTotals,
  sumZooBuckets,
  type ZooFalsificationReport,
  type ZooFalsificationRow,
} from './report-types';
import { deriveSeed, fnv1a32 } from './verdict';
import { entry, o2Panels, panels, run } from './run-zoo-falsification-fixtures';

describe('Σ-invariant (fail-closed accounting)', () => {
  it('holds on a normal multi-entry run', async () => {
    const report = await run([entry('a', '-1 * ts_corr(open, volume, 10)'), entry('b', 'rank(open)')]);
    expect(() => assertNoSilentSkips(report, report.meta.manifestEntries)).not.toThrow();
    expect(sumZooBuckets(report.totals)).toBe(report.meta.manifestEntries);
    expect(report.totals.total).toBe(report.rows.length);
  });

  it('throws when a row is dropped (tampered rows)', async () => {
    const report = await run([entry('a', 'rank(open)'), entry('b', 'rank(open)')]);
    const tampered: ZooFalsificationReport = { ...report, rows: report.rows.slice(0, 1) };
    expect(() => assertNoSilentSkips(tampered, report.meta.manifestEntries)).toThrow(/silent-skip/);
  });

  it('throws when bucket totals are tampered', async () => {
    const report = await run([entry('a', 'rank(open)')]);
    const tampered: ZooFalsificationReport = {
      ...report,
      totals: { ...report.totals, falsified: report.totals.falsified + 1 },
    };
    expect(() => assertNoSilentSkips(tampered, report.meta.manifestEntries)).toThrow(/silent-skip/);
  });

  it('computeZooTotals buckets every verdict and sumZooBuckets sums them', () => {
    const rows: ZooFalsificationRow[] = [
      { sourceAlphaId: 'x', verdict: 'ALIVE_FOR_FURTHER_RESEARCH', reasons: [] },
      { sourceAlphaId: 'y', verdict: 'FALSIFIED', reasons: ['r'] },
      { sourceAlphaId: 'z', verdict: 'NOT_EVALUABLE', reasons: ['IMPORT_SKIPPED:unsupported'] },
      { sourceAlphaId: 'w', verdict: 'NOT_EVALUABLE', reasons: ['INSUFFICIENT_DATA_WARMUP'] },
    ];
    const totals = computeZooTotals(rows);
    expect(totals.evaluatedAlive).toBe(1);
    expect(totals.falsified).toBe(1);
    expect(totals.skippedImport).toBe(1);
    expect(totals.notEvaluable).toBe(1);
    expect(totals.total).toBe(4);
    expect(sumZooBuckets(totals)).toBe(4);
  });
});

describe('end-to-end evaluation', () => {
  it('alpha101_006-style fixture evaluates to a terminal verdict with IC stats', async () => {
    const report = await run([entry('alpha101_006', '-1 * ts_corr(open, volume, 10)')]);
    const row = report.rows[0];
    expect(row.sourceAlphaId).toBe('alpha101_006');
    expect(row.hypothesisId).toBe('zoo-alpha101_006');
    expect(['ALIVE_FOR_FURTHER_RESEARCH', 'FALSIFIED']).toContain(row.verdict);
    expect(row.icStats).toBeDefined();
    expect(row.icStats?.validIcCount).toBeGreaterThan(0);
    expect(row.checks?.length).toBe(3);
  });

  it('multi-entry manifest lands every entry in exactly one bucket', async () => {
    const report = await run([
      entry('a', '-1 * ts_corr(open, volume, 10)'),
      entry('b', 'rank(open)'),
      entry('log_one', 'log(close)'),
    ]);
    expect(report.totals.total).toBe(3);
    expect(sumZooBuckets(report.totals)).toBe(3);
    expect(report.rows.map((r) => r.sourceAlphaId)).toEqual(['a', 'b', 'log_one']);
  });
});

describe('NOT_EVALUABLE paths', () => {
  it('vsump-style formula → NOT_EVALUABLE with bare-token EVAL_UNSUPPORTED_TOKEN:sum', async () => {
    const report = await run([entry('vsump5', '\\sum \\max(\\Delta v, 0) / \\sum |\\Delta v|')]);
    const row = report.rows[0];
    expect(row.verdict).toBe('NOT_EVALUABLE');
    expect(row.reasons).toContain('EVAL_UNSUPPORTED_TOKEN:sum');
  });

  it('vsump reason carries bare sum token, never backslash-sum', async () => {
    const report = await run([entry('vsump5', '\\sum \\max(\\Delta v, 0) / \\sum |\\Delta v|')]);
    const joined = report.rows[0].reasons.join(' ');
    expect(joined).toContain('sum');
    expect(joined).not.toContain('\\sum');
  });

  it('short panel → INSUFFICIENT_DATA_WARMUP', async () => {
    const report = await run([entry('warmup', '-1 * ts_corr(open, volume, 10)')], panels(3));
    expect(report.rows[0].verdict).toBe('NOT_EVALUABLE');
    expect(report.rows[0].reasons).toContain('INSUFFICIENT_DATA_WARMUP');
  });

  it('too few valid IC observations → INSUFFICIENT_IC_OBSERVATIONS', async () => {
    const report = await run([entry('few', 'rank(open)')], panels(30));
    const row = report.rows[0];
    expect(row.verdict).toBe('NOT_EVALUABLE');
    expect(row.reasons).toContain('INSUFFICIENT_IC_OBSERVATIONS');
    expect(row.icStats?.validIcCount).toBeLessThan(30);
  });

  it('unsupported operator → IMPORT_SKIPPED bucket with import reason', async () => {
    const report = await run([entry('log_one', 'log(close)')]);
    expect(report.totals.skippedImport).toBe(1);
    const row = report.rows[0];
    expect(row.verdict).toBe('NOT_EVALUABLE');
    expect(row.reasons.some((r) => r.startsWith('IMPORT_SKIPPED'))).toBe(true);
  });
});

describe('O-2 zero-signal deterministic FALSIFIED', () => {
  it('constant-over-time distinct-across-symbols scores → FALSIFIED', async () => {
    const report = await run([entry('o2_rank', 'rank(open)')], o2Panels());
    const row = report.rows[0];
    expect(row.verdict).toBe('FALSIFIED');
    expect(row.reasons.length).toBeGreaterThan(0);
  });

  it('O-2 check booleans are deterministic (bootstrap passes, perm + wf fail)', async () => {
    const report = await run([entry('o2_rank', 'rank(open)')], o2Panels());
    const checks = report.rows[0].checks ?? [];
    const byName = (name: string) => checks.find((c) => c.check === name);
    expect(byName('bootstrap_ic_ci')?.passed).toBe(true);
    expect(byName('permutation')?.passed).toBe(false);
    expect(byName('ic_walk_forward_consistency')?.passed).toBe(false);
  });

  it('O-2 is reproducible: two runs deep-equal (no unseeded randomness)', async () => {
    const a = await run([entry('o2_rank', 'rank(open)')], o2Panels());
    const b = await run([entry('o2_rank', 'rank(open)')], o2Panels());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('seed derivation', () => {
  it('deriveSeed is stable and equals fnv1a32 of the hypothesis id', () => {
    expect(deriveSeed('zoo-alpha101_006')).toBe(fnv1a32('zoo-alpha101_006'));
    expect(deriveSeed('zoo-alpha101_006')).toBe(deriveSeed('zoo-alpha101_006'));
  });

  it('distinct hypothesis ids derive distinct seeds', () => {
    expect(deriveSeed('zoo-a')).not.toBe(deriveSeed('zoo-b'));
  });
});

describe('report meta disclosures', () => {
  it('deferred-checks reasons present in report meta', async () => {
    const report = await run([entry('a', 'rank(open)')]);
    const names = report.meta.deferredChecks.map((d) => d.check);
    expect(names).toContain('pbo_proxy');
    expect(names).toContain('random_entry');
    for (const d of report.meta.deferredChecks) expect(d.reason.length).toBeGreaterThan(0);
  });

  it('report meta discloses escrow caveats (permutation covariance proxy)', async () => {
    const report = await run([entry('a', 'rank(open)')]);
    expect(report.meta.caveats.length).toBeGreaterThan(0);
    expect(report.meta.caveats.some((c) => c.includes('covariance proxy'))).toBe(true);
  });

  it('manifestEntries in meta equals the manifest entry count', async () => {
    const report = await run([entry('a', 'rank(open)'), entry('b', 'rank(open)')]);
    expect(report.meta.manifestEntries).toBe(2);
  });
});
