// Research Contracts — Alpha Zoo Exports
// Alpha Zoo adapter (Phase 2 & 3), metadata, vocabulary, seeds, parser, AST, and evaluator.

// Alpha Zoo adapter (Phase 2) — fail-closed ingestion of Vibe-Trading zoo
// manifests into validated ResearchHypothesis candidates.
export {
  importAlphaZooManifest,
  type AlphaZooImportReport,
  type RegisteredAlpha,
} from './alpha/zoo/zoo-adapter';

export {
  ALPHA_IMPORT_OUTCOMES,
  ZOO_IMPORTER_VERSION,
  type AlphaImportOutcome,
  type AlphaImportReport,
  type AlphaImportTotals,
  type PerAlphaResult,
  type ZooAdapterConfig,
  computeTotals,
  sumBuckets,
  summarizeReport,
  assertNoSilentSkips,
} from './alpha/zoo/import-report';

export {
  ZOO_MARKET_TAGS,
  ZOO_THEMES,
  SUPPORTED_DATA_FIELDS,
  alphaZooEntrySchema,
  alphaZooManifestSchema,
  parseAlphaZooEntry,
  parseAlphaZooManifest,
  type ZooMarketTag,
  type ZooTheme,
  type SupportedDataField,
  type AlphaZooEntry,
  type AlphaZooManifest,
} from './alpha/zoo/zoo-metadata';

export {
  SUPPORTED_OPERATORS,
  OPERATOR_ALIASES,
  normalizeFormula,
  type SupportedOperator,
  type NormalizedFormula,
} from './alpha/zoo/operator-vocabulary';

export {
  PHASE2_SEED_MANIFEST,
  loadPhase2SeedManifest,
  seedEnvelopeSchema,
  type Phase2SeedEnvelope,
} from './alpha/zoo/seeds/seed-manifest';

// Alpha Zoo operator evaluator (Phase 3) — pure formula parse + evaluate.
// No I/O, no randomness; lookahead-free by construction (append-invariant).
export { parseFormula } from './alpha/zoo/operator-parser';

export {
  evaluateFormula,
  type EvalResult,
  type SymbolPanel as EvalSymbolPanel,
} from './alpha/zoo/operator-evaluator';

export {
  OperatorParseError,
  type AstNode,
  type ParsedFormula,
  type ParseFormulaResult,
} from './alpha/zoo/operator-ast';
