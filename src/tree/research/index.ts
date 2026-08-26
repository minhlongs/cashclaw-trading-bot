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