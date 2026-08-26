// Committed-artifact consistency test (Phase 3, D7). Re-runs the forest
// bridge on the cached Binance 1d panels and asserts the result reproduces
// the committed JSON byte-for-byte. Also pins the schema, the Σ≡12
// fail-closed invariant, and the per-alpha verdicts so a regression in the
// bridge or the cache is caught before commit. Reads the cache files
// directly (loadCandles is disabled under vitest) — no I/O in the bridge
// itself, so this is the only place the test touches the filesystem.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PHASE2_SEED_MANIFEST } from '@/tree/research/alpha/zoo/seeds/seed-manifest';
import {
  buildSeedAdapterConfig,
  dataWindowFromPanels,
  panelFromCandles,
  type RawCandle,
  ZOO_SEED_SYMBOLS,
} from '@/forest/research/zoo-falsification/zoo-phase3-config';
import { runZooFalsification } from '@/forest/research/zoo-falsification/run-zoo-falsification';
import {
  assertNoSilentSkips,
  type ZooFalsificationReport,
} from '@/forest/research/zoo-falsification/report-types';
import { validateAlignedPanels, type SymbolPanel } from '@/tree/alpha/factors';

const CACHE_DIR = '.cache/ohlcv';
const MIN_BARS = 730;
const MANIFEST_ENTRIES = 12;
const ARTIFACT_PATH = join(process.cwd(), 'plans/reports/zoo-phase3-falsification-report.json');

/** Load the three cached 1d panels from disk (readFileSync — vitest-safe). */
function loadCachedPanels(): SymbolPanel[] {
  const panels: SymbolPanel[] = [];
  for (const symbol of ZOO_SEED_SYMBOLS) {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), CACHE_DIR, `binance:${symbol}:1d.json`), 'utf8'),
    ) as readonly RawCandle[];
    if (raw.length < MIN_BARS) {
      throw new Error(`BLOCKED: ${symbol} thin (${raw.length} < ${MIN_BARS})`);
    }
    panels.push(panelFromCandles(symbol, raw));
  }
  validateAlignedPanels(panels);
  return panels;
}

/** Re-run the bridge on the cached panels (deterministic: fixed nowIso + FNV seeds). */
async function rerunBridge(): Promise<ZooFalsificationReport> {
  const panels = loadCachedPanels();
  return runZooFalsification(PHASE2_SEED_MANIFEST, panels, {
    adapterConfig: buildSeedAdapterConfig(dataWindowFromPanels(panels)),
  });
}

describe('committed artifact consistency (Phase 3)', () => {
  it('reproduces the committed JSON byte-for-byte (determinism pin)', async () => {
    const report = await rerunBridge();
    const committed = readFileSync(ARTIFACT_PATH, 'utf8');
    expect(JSON.stringify(report, null, 2)).toBe(committed);
  });

  it('has the committed schema: 12 rows, 4 bucket keys, valid verdicts', () => {
    const committed = JSON.parse(readFileSync(ARTIFACT_PATH, 'utf8')) as ZooFalsificationReport;
    expect(committed.rows).toHaveLength(MANIFEST_ENTRIES);
    expect(committed.totals.total).toBe(MANIFEST_ENTRIES);
    expect(committed.meta.manifestEntries).toBe(MANIFEST_ENTRIES);
    for (const row of committed.rows) {
      expect(typeof row.sourceAlphaId).toBe('string');
      expect(['ALIVE_FOR_FURTHER_RESEARCH', 'FALSIFIED', 'NOT_EVALUABLE']).toContain(row.verdict);
      expect(row.reasons.length).toBeGreaterThan(0);
    }
  });

  it('enforces Σ≡12 (fail-closed accounting) on the committed artifact', () => {
    const committed = JSON.parse(readFileSync(ARTIFACT_PATH, 'utf8')) as ZooFalsificationReport;
    expect(() => assertNoSilentSkips(committed, MANIFEST_ENTRIES)).not.toThrow();
  });

  it('pins the per-alpha verdicts from the golden audit', () => {
    const committed = JSON.parse(readFileSync(ARTIFACT_PATH, 'utf8')) as ZooFalsificationReport;
    const byId = Object.fromEntries(committed.rows.map((r) => [r.sourceAlphaId, r]));
    // 4 adapted / 7 unsupported / 1 validation-error (Phase 2 D4 golden audit).
    expect(byId['alpha101_006'].verdict).toBe('FALSIFIED');
    expect(byId['qlib158_beta5'].verdict).toBe('FALSIFIED');
    expect(byId['qlib158_vsump5'].verdict).toBe('NOT_EVALUABLE');
    expect(byId['qlib158_vsump5'].reasons.some((r) => r.includes('EVAL_UNSUPPORTED_TOKEN:sum'))).toBe(true);
    expect(byId['qlib158_vsump10'].verdict).toBe('NOT_EVALUABLE');
    expect(byId['qlib158_vsump10'].reasons.some((r) => r.includes('EVAL_UNSUPPORTED_TOKEN:sum'))).toBe(true);
    expect(byId['fund_roe'].verdict).toBe('NOT_EVALUABLE');
    expect(byId['fund_roe'].reasons.some((r) => r.includes('validation-error'))).toBe(true);
  });

  it('records the research-only caveat and deferred checks in report meta', () => {
    const committed = JSON.parse(readFileSync(ARTIFACT_PATH, 'utf8')) as ZooFalsificationReport;
    expect(committed.meta.caveats.some((c) => c.includes('research records only'))).toBe(true);
    expect(committed.meta.deferredChecks.length).toBeGreaterThan(0);
  });
});