// Research Contracts — Phase 1 public API barrel.
// Re-exports all research-domain contracts for downstream adapters
// (AlphaZooAdapter, ResearchWorkerAdapter, MCPResearchAdapter).

// Hypothesis contract + mechanism gate
export {
  RESEARCH_SOURCES,
  EXPECTED_DIRECTIONS,
  type ResearchSource,
  type ExpectedDirection,
  type FeatureRef,
  type ResearchHypothesis,
  researchHypothesisSchema,
  parseResearchHypothesis,
  type ParseResearchHypothesisResult,
} from './hypothesis/types';

export {
  MECHANISM_MIN_LENGTH,
  type MechanismGateResult,
  checkMechanism,
} from './hypothesis/mechanism-gate';

// Goal contract + adapter
export {
  type ResearchTimePeriod,
  type ResearchGoal,
  researchGoalSchema,
  parseResearchGoal,
  type ParseResearchGoalResult,
} from './goals/types';

export {
  type GoalBindingResult,
  type GoalBindingEntry,
  type GoalBindingSummary,
  bindHypothesisToGoal,
  goalBindingSummary,
} from './goals/adapter';

// Evidence objects + lineage graph
export {
  EVIDENCE_KINDS,
  EVIDENCE_VERDICTS,
  type EvidenceKind,
  type EvidenceVerdict,
  type EvidenceObject,
} from './evidence/types';

export {
  type ResearchLineage,
  type SpawnGuardResult,
  buildLineage,
  spawnFromFalsified,
} from './evidence/lineage';

// Alpha provenance
export {
  type AlphaProvenance,
  type ProvenanceValidationResult,
  computeFormulaHash,
  buildNormalizedRepresentation,
  validateProvenance,
} from './alpha/provenance';

// Experiment spec + deterministic compiler
export {
  type DataWindow,
  type ExperimentPeriod,
  type ExperimentSpec,
  type CompileResult,
  type CompileFailureCode,
  BARRIER_DERIVATION,
  MIN_TRAIN_BARS,
  DEFAULT_SEED,
  deriveBarrierConfig,
  derivePeriods,
  deriveSeedFromSpecId,
  parseTimeframeToMs,
} from './alpha/experiment-spec';

export {
  compile,
  type CompilerContext,
} from './alpha/compiler';

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

// TradingAgents deliberation layer — fail-closed contracts for untrusted
// multi-agent output (decision proposals, debate, risk, calibration).
export * from './tradingagents';
