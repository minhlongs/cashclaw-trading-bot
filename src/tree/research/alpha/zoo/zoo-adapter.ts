// AlphaZooAdapter — pure tree-layer ingestion of Vibe-Trading zoo manifests
// into validated ResearchHypothesis candidates. Fail-closed: every entry lands
// in one D3 bucket; Σ buckets ≡ count asserted before return. Pure: no I/O,
// no eval — zoo data enters as Zod-validated JSON, never as code.
import { z } from 'zod';
import { alphaZooManifestSchema } from './zoo-metadata';
import {
  assertNoSilentSkips,
  computeTotals,
  type AlphaImportReport,
  type PerAlphaResult,
  type RegisteredAlpha,
  type ZooAdapterConfig,
} from './import-report';
import {
  extractRawEntries,
  envelopeFailureResults,
  runPipeline,
  type EnvelopeData,
  type PipelineOutput,
} from './zoo-pipeline';

export type { RegisteredAlpha } from './import-report';

/** Envelope fields via alphaZooManifestSchema; entry schemas deferred to
 * parseAlphaZooEntry (per-entry D3 buckets need per-entry parsing). */
const envelopeSchema = alphaZooManifestSchema.extend({ entries: z.array(z.unknown()) });

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
  const args: EnvelopeData = { entries: env.entries, sourceRepository: env.sourceRepository, sourceVersion: env.sourceVersion };
  const pipeline: PipelineOutput = await runPipeline(args, config);
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
