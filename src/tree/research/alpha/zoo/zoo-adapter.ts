// AlphaZooAdapter — pure tree-layer ingestion of Vibe-Trading zoo manifests
// into validated ResearchHypothesis candidates. Fail-closed: every entry lands
// in one D3 bucket; Σ buckets ≡ count asserted before return. Pure: no I/O,
// no eval — zoo data enters as Zod-validated JSON, never as code.
import { z } from 'zod';
import { alphaZooManifestSchema, parseAlphaZooEntry, type AlphaZooEntry } from './zoo-metadata';
import { normalizeFormula } from './operator-vocabulary';
import {
  assertNoSilentSkips,
  computeTotals,
  type AlphaImportReport,
  type PerAlphaResult,
  type ZooAdapterConfig,
} from './import-report';
import { buildDedupPayload, buildZooHypothesis, buildZooProvenance } from './zoo-hypothesis-build';
import { parseResearchHypothesis, type ResearchHypothesis } from '../../hypothesis/types';
import { compile } from '../compiler';
import {
  buildNormalizedRepresentation,
  computeFormulaHash,
  validateProvenance,
  type AlphaProvenance,
} from '../provenance';

/** Envelope fields via alphaZooManifestSchema; entry schemas deferred to
 * parseAlphaZooEntry (per-entry D3 buckets need per-entry parsing). */
const envelopeSchema = alphaZooManifestSchema.extend({ entries: z.array(z.unknown()) });

interface EnvelopeData {
  readonly entries: readonly unknown[];
  readonly sourceRepository: string;
  readonly sourceVersion: string | null;
}


/** One registered candidate: hypothesis + provenance for later persistence. */
export interface RegisteredAlpha {
  readonly hypothesis: ResearchHypothesis;
  readonly provenance: AlphaProvenance;
}

/** Import report extended with registered candidates (D4 output). */
export interface AlphaZooImportReport extends AlphaImportReport {
  readonly registered: readonly RegisteredAlpha[];
}

/** Import a raw zoo manifest. Σ≡N denominator: raw `entries` array length
 * if present, else 1 single envelope-error row with a pseudo-id. */
export async function importAlphaZooManifest(
  manifest: unknown,
  config: ZooAdapterConfig,
): Promise<AlphaZooImportReport> {
  const rawEntries = extractRawEntries(manifest);
  const envelope = envelopeSchema.safeParse(manifest);
  if (!envelope.success) {
    return finishImport(rawEntries.length, envelopeFailureResults(rawEntries, envelope.error.issues.map(envelopeReason)), []);
  }
  const env = envelope.data;
  const args = { entries: env.entries, sourceRepository: env.sourceRepository, sourceVersion: env.sourceVersion };
  const pipeline = await runPipeline(args, config);
  return finishImport(rawEntries.length, pipeline.results, pipeline.registered);
}

/** Assemble report + enforce the Σ≡N no-silent-skip invariant before return. */
function finishImport(entryCount: number, results: readonly PerAlphaResult[], registered: readonly RegisteredAlpha[]): AlphaZooImportReport {
  const report: AlphaImportReport = { totals: computeTotals(results), results };
  assertNoSilentSkips(report, entryCount);
  return { ...report, registered };
}

const envelopeReason = (issue: z.ZodIssue): string =>
  `${issue.path.join('.') || '(root)'}: ${issue.message}`;

/** Per-entry classifications + successfully registered candidates. */
interface PipelineOutput {
  readonly results: readonly PerAlphaResult[];
  readonly registered: readonly RegisteredAlpha[];
}

/** Raw entries array if structurally present (even when envelope fails). */
function extractRawEntries(manifest: unknown): readonly unknown[] {
  if (typeof manifest === 'object' && manifest !== null) {
    const entries = (manifest as { entries?: unknown }).entries;
    if (Array.isArray(entries)) return entries as readonly unknown[];
  }
  return [manifest];
}

/** Whole-manifest rejection: one validation-error row per raw entry slot. */
function envelopeFailureResults(rawEntries: readonly unknown[], reasons: readonly string[]): readonly PerAlphaResult[] {
  return rawEntries.map((raw, index) => ({
    sourceAlphaId: pseudoId(raw, index),
    outcome: 'validation-error',
    reasons: [`envelope rejected: ${reasons.join('; ')}`],
  }));
}

async function runPipeline(envelope: EnvelopeData, config: ZooAdapterConfig): Promise<PipelineOutput> {
  const results: PerAlphaResult[] = [];
  const registered: RegisteredAlpha[] = [];
  const seenKeys = new Map<string, string>();
  for (const [index, raw] of envelope.entries.entries()) {
    results.push(await processEntry(raw, index, envelope, config, seenKeys, registered));
  }
  return { results, registered };
}

function pseudoId(raw: unknown, index: number): string {
  if (typeof raw === 'object' && raw !== null) {
    const id = (raw as { id?: unknown }).id;
    if (typeof id === 'string' && id !== '') return id;
  }
  return `entries.${index}`;
}

/** Sector/extras checks (D2): adapter cannot supply either — fail closed. */
function collectSupportReasons(entry: AlphaZooEntry): readonly string[] {
  const reasons: string[] = [];
  if (entry.requires_sector) reasons.push('SECTOR_DATA_UNAVAILABLE');
  if (entry.extras_required.length > 0) reasons.push(`EXTRAS_REQUIRED:${entry.extras_required.join(',')}`);
  return reasons;
}

/** D3 precedence pipeline for one raw entry (first match wins). */
async function processEntry(
  raw: unknown,
  index: number,
  envelope: EnvelopeData,
  config: ZooAdapterConfig,
  seenKeys: Map<string, string>,
  registered: RegisteredAlpha[],
): Promise<PerAlphaResult> {
  // 1. validation-error — entry fails alphaZooEntrySchema
  const parsed = parseAlphaZooEntry(raw);
  if (!parsed.ok) {
    return { sourceAlphaId: pseudoId(raw, index), outcome: 'validation-error', reasons: parsed.reasons };
  }
  const entry: AlphaZooEntry = parsed.value;

  // 2/3. unsupported (placeholder/unknown op/conditional) vs non-causal
  // (forward reference only — D3: unsupported wins when reasons are mixed)
  const normalized = normalizeFormula(entry.formula_latex);
  if (!normalized.ok) {
    const nonCausalOnly = normalized.reasons.every((r) => r === 'NON_CAUSAL_FORWARD_REFERENCE');
    const outcome = nonCausalOnly ? 'non-causal' : 'unsupported';
    return { sourceAlphaId: entry.id, outcome, reasons: normalized.reasons };
  }

  // 4. unsupported — sector data or extras the adapter cannot supply
  const supportReasons = collectSupportReasons(entry);
  if (supportReasons.length > 0) {
    return { sourceAlphaId: entry.id, outcome: 'unsupported', reasons: supportReasons };
  }

  // 5. rejected OUT_OF_UNIVERSE — no caller universe covers any market tag
  const universe = entry.universe.map((tag) => config.marketUniverses[tag]).find((u) => u !== undefined);
  if (universe === undefined) {
    const tags = entry.universe.join(',');
    return { sourceAlphaId: entry.id, outcome: 'rejected', reasons: [`OUT_OF_UNIVERSE:${tags}`] };
  }

  // 6. duplicate — D1 canonical payload key collision (first wins)
  const dedupKey = await computeFormulaHash(
    buildNormalizedRepresentation(buildDedupPayload(normalized.value.normalizedFormula, entry)),
  );
  const firstId = seenKeys.get(dedupKey);
  if (firstId !== undefined) {
    return { sourceAlphaId: entry.id, outcome: 'duplicate', reasons: [`DUPLICATE_OF:${firstId}`] };
  }
  seenKeys.set(dedupKey, entry.id);

  // 7. build hypothesis → re-parse (mechanism gate included); gate/schema
  // failure ⇒ rejected with gate reasons, never padded to pass
  const hypothesis = buildZooHypothesis(entry, normalized.value, universe, config);
  const reparsed = parseResearchHypothesis(hypothesis);
  if (!reparsed.ok) {
    return { sourceAlphaId: entry.id, outcome: 'rejected', reasons: reparsed.reasons };
  }

  // 8. validated provenance + deterministic compile (CompileFailureCode reasons)
  const formulaHash = await computeFormulaHash(normalized.value.normalizedFormula);
  const provenance = buildZooProvenance(
    entry, normalized.value, formulaHash, envelope.sourceRepository, envelope.sourceVersion, config,
  );
  const provenanceCheck = validateProvenance(provenance);
  if (!provenanceCheck.ok) {
    return { sourceAlphaId: entry.id, outcome: 'rejected', reasons: [...provenanceCheck.reasons] };
  }
  const compiled = await compile(reparsed.value, { dataWindow: config.dataWindow, provenance });
  if (!compiled.ok) {
    return { sourceAlphaId: entry.id, outcome: 'rejected', reasons: [...compiled.reasons] };
  }

  // 9. registered — normalization (formula fold OR '1D'→'1d') drives adapted
  registered.push({ hypothesis: reparsed.value, provenance });
  const timeframeFolded = entry.frequency[0] !== entry.frequency[0].toLowerCase();
  const adapted = normalized.value.normalizationsApplied.length > 0 || timeframeFolded;
  return { sourceAlphaId: entry.id, outcome: adapted ? 'adapted' : 'imported', reasons: [], hypothesisId: reparsed.value.id };
}
