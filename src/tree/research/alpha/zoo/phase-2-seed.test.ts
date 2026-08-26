// Phase-2 seed golden audit — imports the REAL committed seed manifest
// (transcribed verbatim from vibe-trading @ 5cd08ee1) and pins every
// entry's D3 outcome. This is the audit artifact: if an observed outcome
// drifts, adapter/normalizer behavior changed — update the table ONLY with
// a recorded reason in this header, never by weakening the adapter.
//
// Deviations from the plan-time prediction table (observed reality, kept):
// - academic_strev / academic_high52w: plan predicted registered; observed
//   unsupported — their raw-string formulas contain LaTeX delimiter macros
//   (`\bigl(`, `\Bigr`, `\..._max`) that classify as unrecognized call
//   tokens under the committed fail-closed normalizer
//   (recognition ≠ implementation; REIMPLEMENT backlog input).
// - fund_roe: plan predicted unsupported(data field); observed
//   validation-error — alphaZooEntrySchema validates columns_required
//   against SUPPORTED_DATA_FIELDS, so 'fund:roe' fails Zod at D3
//   precedence 1 (fail-closed, never silent).
// - qlib158_vsump5/_vsump10: real metas carry `\sum`/`\max` macros; the
//   alias table folds `max(` → `ts_max(` and the distinct warmup/horizon
//   windows keep the D1 canonical payloads different, so BOTH register.
//   The identical-formula-text duplicate case remains covered synthetically
//   in zoo-adapter-determinism.test.ts.

import { describe, expect, it } from 'vitest';
import type { Universe } from '@/tree/alpha/universe/types';
import { importAlphaZooManifest } from './zoo-adapter';
import { loadPhase2SeedManifest, PHASE2_SEED_MANIFEST } from './seeds/seed-manifest';
import {
  assertNoSilentSkips,
  type AlphaImportOutcome,
  type ZooAdapterConfig,
} from './import-report';
import { validateProvenance } from '../provenance';
import { parseResearchHypothesis } from '../../hypothesis/types';
import type { DataWindow } from '../experiment-spec';

const CRYPTO_UNIVERSE: Universe = {
  id: 'crypto-core', symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
  weighting: 'equal', rebalanceRule: 'daily',
};
const WINDOW: DataWindow = { earliestTimestamp: 0, latestTimestamp: 86_400_000 * 1000, barCount: 1000 };
const NOW = '2026-08-26T00:00:00.000Z';

function seedConfig(): ZooAdapterConfig {
  const marketUniverses: Record<string, Universe> = {};
  for (const tag of ['equity_us', 'equity_cn', 'equity_hk', 'equity_in', 'equity_kr', 'crypto']) {
    marketUniverses[tag] = CRYPTO_UNIVERSE;
  }
  return {
    marketUniverses, dataWindow: WINDOW, defaultCostMode: 'conservative',
    nowIso: NOW, importerVersion: 'alphazoo-adapter@1',
  };
}

/** Audit table pinned to OBSERVED behavior — manifest order (see header). */
const AUDIT_TABLE: ReadonlyArray<readonly [string, AlphaImportOutcome]> = [
  ['alpha101_006', 'adapted'],
  ['alpha101_001', 'unsupported'],
  ['alpha101_048', 'unsupported'],
  ['gtja191_001', 'unsupported'],
  ['gtja191_122', 'unsupported'],
  ['qlib158_beta5', 'adapted'],
  ['qlib158_vsump5', 'adapted'],
  ['qlib158_vsump10', 'adapted'],
  ['academic_strev', 'unsupported'],
  ['academic_high52w', 'unsupported'],
  ['academic_corr_rewire', 'unsupported'],
  ['fund_roe', 'validation-error'],
];

async function runSeed() {
  return importAlphaZooManifest(PHASE2_SEED_MANIFEST, seedConfig());
}

describe('phase-2 seed golden audit', () => {
  it('committed seed bytes pass their own envelope schema (12 entries)', () => {
    const parsed = loadPhase2SeedManifest();
    expect(parsed.entries).toHaveLength(AUDIT_TABLE.length);
    expect(PHASE2_SEED_MANIFEST.schemaVersion).toBe(1);
    expect(PHASE2_SEED_MANIFEST.sourceVersion).toMatch(/^[0-9a-f]{40}$/);
  });

  it('per-entry outcome matches the audit table EXACTLY; Σ buckets ≡ N', async () => {
    const report = await runSeed();
    assertNoSilentSkips(report, AUDIT_TABLE.length);
    expect(report.results.map((r) => [r.sourceAlphaId, r.outcome] as const)).toEqual(AUDIT_TABLE);
  });

  it('bucket totals: adapted=4, unsupported=7, validation-error=1, rest 0', async () => {
    const report = await runSeed();
    const t = report.totals;
    expect(t.total).toBe(12);
    expect(t.adapted).toBe(4);
    expect(t.unsupported).toBe(7);
    expect(t.validationError).toBe(1);
    expect(t.imported).toBe(0);
    expect(t.nonCausal).toBe(0);
    expect(t.duplicate).toBe(0);
    expect(t.rejected).toBe(0);
  });

  it('registered candidates re-validate hypothesis + provenance bound to the envelope', async () => {
    const report = await runSeed();
    expect(report.registered.map((r) => r.hypothesis.id)).toEqual([
      'zoo-alpha101_006', 'zoo-qlib158_beta5', 'zoo-qlib158_vsump5', 'zoo-qlib158_vsump10',
    ]);
    for (const { hypothesis, provenance } of report.registered) {
      expect(parseResearchHypothesis(hypothesis).ok).toBe(true);
      expect(validateProvenance(provenance).ok).toBe(true);
      expect(provenance.sourceZoo).toBe('vibe-trading-zoo');
      expect(provenance.sourceRepository).toBe(PHASE2_SEED_MANIFEST.sourceRepository);
      expect(provenance.sourceVersion).toBe(PHASE2_SEED_MANIFEST.sourceVersion);
    }
  });

  it('vsump regression pair registers BOTH entries — never duplicates', async () => {
    const report = await runSeed();
    for (const result of report.results) {
      expect(result.reasons.some((r) => r.startsWith('DUPLICATE_OF'))).toBe(false);
    }
    const pair = report.registered.filter((r) => r.hypothesis.id.startsWith('zoo-qlib158_vsump'));
    expect(pair).toHaveLength(2);
    expect(new Set(pair.map((r) => r.provenance.normalizedRepresentation)).size).toBe(2);
  });

  it('unsupported reasons name the blocking token/form honestly', async () => {
    const report = await runSeed();
    const byId = new Map(report.results.map((r) => [r.sourceAlphaId, r]));
    expect(byId.get('gtja191_001')?.reasons).toContain('UNSUPPORTED_OPERATOR:LOG');
    expect(byId.get('gtja191_122')?.reasons).toContain('FORMULA_UNPARSEABLE');
    expect(byId.get('alpha101_001')?.reasons).toContain('UNSUPPORTED_EXPRESSION_FORM:conditional');
    expect(byId.get('alpha101_048')?.reasons).toContain('UNSUPPORTED_OPERATOR:INDNEUTRALIZE');
    expect(byId.get('alpha101_048')?.reasons).toContain('UNSUPPORTED_OPERATOR:SUM');
    expect(byId.get('academic_strev')?.reasons.join()).toContain('UNSUPPORTED_OPERATOR:');
    expect(byId.get('academic_high52w')?.reasons.join()).toContain('UNSUPPORTED_OPERATOR:');
    expect(byId.get('academic_corr_rewire')?.reasons.join()).toContain('UNSUPPORTED_OPERATOR:');
    expect(byId.get('fund_roe')?.reasons.join()).toContain('columns_required');
  });

  it('fixed clock → two runs deep-equal (deterministic pipeline on real data)', async () => {
    const [r1, r2] = await Promise.all([runSeed(), runSeed()]);
    expect(r1).toEqual(r2);
  });
});
