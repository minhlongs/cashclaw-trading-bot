// AlphaImportReport — fail-closed classification report for zoo imports.
// Every manifest entry lands in EXACTLY ONE of 7 buckets (D3 precedence);
// the Σ-buckets ≡ entry-count invariant is enforced by assertNoSilentSkips,
// which the adapter itself invokes before returning. Pure module: no I/O.

export {
  ZOO_IMPORTER_VERSION,
  ALPHA_IMPORT_OUTCOMES,
} from './import-report-types';

export type {
  ZooImporterVersion,
  AlphaImportOutcome,
  ZooAdapterConfig,
  PerAlphaResult,
  AlphaImportTotals,
  AlphaImportReport,
  RegisteredAlpha,
} from './import-report-types';

export {
  computeTotals,
  sumBuckets,
  summarizeReport,
  assertNoSilentSkips,
} from './import-report-helpers';
