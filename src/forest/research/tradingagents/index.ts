// TradingAgents Deliberation Adapter — Forest Layer Barrel
// Re-exports all public forest-layer modules for the deliberation engine.

export {
  buildCalibrationAggregates,
  computeAgentCalibrationScores,
  rankUsefulness,
  computeExpectationGap,
  aggregateExpectationGapByRegime,
  type ProvenanceOutcome,
  type AgentCalibrationAggregate,
  type ExpectationGap,
  type RegimeGapSummary,
} from './calibration';
export {
  computeArmMetrics,
  evaluateDebateQuality,
  runDebateQualityComparison,
  type ArmEvaluationInput,
  type ComputedArmMetrics,
} from './debate-quality';
export {
  runDebateOrchestrator,
  type DebateOrchestratorConfig,
  type DebateSide,
  type OrchestratorResult,
} from './debate-orchestrator';
export { composeDecisionProposal } from './decision-proposal-composer';
export {
  debateToHypothesis,
  type DebateToHypothesisResult,
  type DebateToHypothesisOutcome,
  type DebateToHypothesisConfig,
} from './debate-to-hypothesis';
export {
  DECISION_LOG_KINDS_EXT,
  DecisionLogWriter,
  logDeliberationRun,
  type DecisionLogKindExt,
} from './decision-log';
export {
  generateRiskAdvisory,
  constrainConfigByAdvisory,
  type RiskAdvisory,
  type RiskAdvisorySet,
  type RiskAdvisorConfig,
} from './risk-advisor';
export {
  advisePortfolio,
  proposalToScoredAlphas,
  type PortfolioAsset,
  type PortfolioProposal,
  type PortfolioAdvisorResult,
} from './portfolio-advisor';
export {
  runDeliberation,
  type RunDeliberationConfig,
  type RunDeliberationResult,
} from './run-deliberation';
export {
  DELIBERATION_STAGES,
  STAGE_OUTCOMES,
  computeDeliberationTotals,
  sumBuckets,
  assertNoSilentSkips,
  summarizeDeliberationReport,
  type DeliberationStage,
  type StageOutcome,
  type StageResult,
  type DeliberationTotals,
  type DeliberationReport,
} from './report-types';
export {
  createModelRouter,
  ModelRouter,
  RoutingError,
  type ModelRouterConfig,
  type RoutedCallOutcome,
} from './model-router';
export { DeterministicFixtureProvider, FailingProvider } from './test-fixtures';
export {
  createProviderRegistry,
  NoProviderAvailableError,
  ProviderCallFailedError,
  type LlmProviderResult,
  type LlmProviderInput,
  type LlmProvider,
  type ProviderRegistry,
  type RoutedCallResult,
} from './provider-adapter';
export {
  serializeCheckpointEnvelope,
  deserializeCheckpointEnvelope,
  createCheckpoint,
  resumeFromCheckpoint,
  verifyCheckpoint,
  type CheckpointEnvelope,
  type CheckpointAdapterResult,
} from './checkpoint-adapter';
