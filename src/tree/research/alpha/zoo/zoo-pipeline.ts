// AlphaZoo pipeline — per-entry D3 precedence classification. Pure tree-layer, fail-closed, no I/O.
import { parseAlphaZooEntry, type AlphaZooEntry } from './zoo-metadata';
import { normalizeFormula } from './operator-vocabulary';
import type { PerAlphaResult, RegisteredAlpha, ZooAdapterConfig } from './import-report';
import { buildDedupPayload, buildZooHypothesis, buildZooProvenance } from './zoo-hypothesis-build';
import { parseResearchHypothesis } from '../../hypothesis/types';
import { compile } from '../compiler';
import { buildNormalizedRepresentation, computeFormulaHash, validateProvenance } from '../provenance';

export interface EnvelopeData {
  readonly entries: readonly unknown[];
  readonly sourceRepository: string;
  readonly sourceVersion: string | null;
}

export interface PipelineOutput {
  readonly results: readonly PerAlphaResult[];
  readonly registered: readonly RegisteredAlpha[];
}

export function extractRawEntries(manifest: unknown): readonly unknown[] {
  if (typeof manifest === 'object' && manifest !== null) {
    const entries = (manifest as { entries?: unknown }).entries;
    if (Array.isArray(entries)) return entries as readonly unknown[];
  }
  return [manifest];
}

export function envelopeFailureResults(rawEntries: readonly unknown[], reasons: readonly string[]): readonly PerAlphaResult[] {
  return rawEntries.map((raw, index) => ({
    sourceAlphaId: pseudoId(raw, index),
    outcome: 'validation-error',
    reasons: [`envelope rejected: ${reasons.join('; ')}`],
  }));
}

export async function processEntry(
  raw: unknown, index: number, envelope: EnvelopeData,
  config: ZooAdapterConfig, seenKeys: Map<string, string>, registered: RegisteredAlpha[],
): Promise<PerAlphaResult> {
  const parsed = parseAlphaZooEntry(raw);
  if (!parsed.ok) return { sourceAlphaId: pseudoId(raw, index), outcome: 'validation-error', reasons: parsed.reasons };
  const entry: AlphaZooEntry = parsed.value;

  const normalized = normalizeFormula(entry.formula_latex);
  if (!normalized.ok) {
    const nonCausalOnly = normalized.reasons.every((r) => r === 'NON_CAUSAL_FORWARD_REFERENCE');
    return { sourceAlphaId: entry.id, outcome: nonCausalOnly ? 'non-causal' : 'unsupported', reasons: normalized.reasons };
  }

  const supportReasons = collectSupportReasons(entry);
  if (supportReasons.length > 0) return { sourceAlphaId: entry.id, outcome: 'unsupported', reasons: supportReasons };

  const universe = entry.universe.map((tag) => config.marketUniverses[tag]).find((u) => u !== undefined);
  if (universe === undefined) return { sourceAlphaId: entry.id, outcome: 'rejected', reasons: [`OUT_OF_UNIVERSE:${entry.universe.join(',')}`] };

  const dedupKey = await computeFormulaHash(buildNormalizedRepresentation(buildDedupPayload(normalized.value.normalizedFormula, entry)));
  const firstId = seenKeys.get(dedupKey);
  if (firstId !== undefined) return { sourceAlphaId: entry.id, outcome: 'duplicate', reasons: [`DUPLICATE_OF:${firstId}`] };
  seenKeys.set(dedupKey, entry.id);

  const hypothesis = buildZooHypothesis(entry, normalized.value, universe, config);
  const reparsed = parseResearchHypothesis(hypothesis);
  if (!reparsed.ok) return { sourceAlphaId: entry.id, outcome: 'rejected', reasons: reparsed.reasons };

  const formulaHash = await computeFormulaHash(normalized.value.normalizedFormula);
  const provenance = buildZooProvenance(entry, normalized.value, formulaHash, envelope.sourceRepository, envelope.sourceVersion, config);
  const provenanceCheck = validateProvenance(provenance);
  if (!provenanceCheck.ok) return { sourceAlphaId: entry.id, outcome: 'rejected', reasons: [...provenanceCheck.reasons] };

  const compiled = await compile(reparsed.value, { dataWindow: config.dataWindow, provenance });
  if (!compiled.ok) return { sourceAlphaId: entry.id, outcome: 'rejected', reasons: [...compiled.reasons] };

  registered.push({ hypothesis: reparsed.value, provenance });
  const timeframeFolded = entry.frequency[0] !== entry.frequency[0].toLowerCase();
  const adapted = normalized.value.normalizationsApplied.length > 0 || timeframeFolded;
  return { sourceAlphaId: entry.id, outcome: adapted ? 'adapted' : 'imported', reasons: [], hypothesisId: reparsed.value.id };
}

export async function runPipeline(envelope: EnvelopeData, config: ZooAdapterConfig): Promise<PipelineOutput> {
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

function collectSupportReasons(entry: AlphaZooEntry): readonly string[] {
  const reasons: string[] = [];
  if (entry.requires_sector) reasons.push('SECTOR_DATA_UNAVAILABLE');
  if (entry.extras_required.length > 0) reasons.push(`EXTRAS_REQUIRED:${entry.extras_required.join(',')}`);
  return reasons;
}
