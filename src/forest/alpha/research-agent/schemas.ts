// CashClaw Alpha Research OS — Phase 7 ResearchAgent Schemas
// Universal .strict() Zod schemas to reject hallucinations, extra keys, and prompt injections.
import { z } from 'zod';

export function cleanJsonString(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    const lines = trimmed.split('\n');
    const filtered = lines.slice(1, lines[lines.length - 1].trim() === '```' ? -1 : undefined);
    return filtered.join('\n').trim();
  }
  return trimmed;
}

export function parseRawJson(rawJson: string, context: string): unknown {
  try {
    return JSON.parse(cleanJsonString(rawJson));
  } catch (err) {
    throw new Error(
      `Failed to parse JSON for ${context}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ── Capability 1: Hypothesis Generation ───────────────────────────────────────
export const HypothesisProposalSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  rationale: z.string().min(1).max(2000),
  domainCategory: z.string().min(1).max(100),
  proposedMetrics: z.record(z.string().min(1).max(50), z.number()),
  falsificationCriteria: z.array(z.string().min(1).max(500)).min(1),
  proposedFeatures: z.array(z.string().min(1).max(100)).optional(),
}).strict();

export const GenerateHypothesesRequestSchema = z.object({
  domainCategory: z.string().trim().min(1).max(100),
  falsifiedClassesToExclude: z.array(z.string().min(1).max(100)).optional(),
  maxProposals: z.number().int().min(1).max(10).optional().default(3),
  contextPrompt: z.string().max(2000).optional(),
  targetRegime: z.string().max(50).optional(),
  strictFalsificationBlock: z.boolean().optional(),
}).strict();

export const HypothesisGenerationRequestSchema = GenerateHypothesesRequestSchema;

export const HypothesisGenerationResponseSchema = z.object({
  proposals: z.array(HypothesisProposalSchema).min(1),
  rationaleSummary: z.string().min(1).max(2000).optional(),
}).strict();

// ── Capability 2: Feature Combination Proposals ───────────────────────────────
export const FeatureProposalSchema = z.object({
  name: z.string().min(1).max(100),
  indicators: z.array(z.string().min(1).max(100)).min(1),
  combinationLogic: z.string().min(1).max(2000),
  lookbackPeriods: z.array(z.number().int().positive()).min(1),
  causalJustification: z.string().min(1).max(2000),
}).strict();

export const ProposeFeaturesRequestSchema = z.object({
  targetHypothesisId: z.string().min(1).max(100),
  candidateIndicators: z.array(z.string().min(1).max(100)).min(1),
  maxLookback: z.number().int().positive().optional(),
  context: z.string().max(2000).optional(),
}).strict();

export const FeatureProposalRequestSchema = ProposeFeaturesRequestSchema;

export const FeatureProposalResponseSchema = z.object({
  proposals: z.array(FeatureProposalSchema).min(1),
  rejectedNonCausalCount: z.number().int().nonnegative().optional().default(0),
}).strict();

// ── Capability 3: Failure Explanations ────────────────────────────────────────
export const MetricShortfallSchema = z.object({
  expected: z.number(),
  actual: z.number(),
}).strict();

export const FailureDiagnosisSchema = z.object({
  jobId: z.string().min(1).max(100),
  primaryFailureReason: z.string().min(1).max(1000),
  contributingFactors: z.array(z.string().min(1).max(500)),
  metricShortfalls: z.record(z.string().min(1).max(50), MetricShortfallSchema),
  recommendations: z.array(z.string().min(1).max(500)).min(1),
}).strict();

export const ExplainFailureRequestSchema = z.object({
  jobId: z.string().min(1).max(100),
  hypothesisId: z.string().min(1).max(100).optional(),
  hypothesis: z.string().min(1).max(1000),
  reasons: z.array(z.string().min(1).max(500)).min(1),
  metrics: z.record(z.string().min(1).max(50), z.number()).optional(),
  verdict: z.unknown().optional(),
  summary: z.string().max(1000).optional(),
}).strict();

export const FailureDiagnosisRequestSchema = ExplainFailureRequestSchema;

export const FailureDiagnosisResponseSchema = z.object({
  diagnosis: FailureDiagnosisSchema,
}).strict();

// ── Capability 4: Hypothesis Clustering ───────────────────────────────────────
export const ClusteringCandidateSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  rationale: z.string().min(1).max(2000).nullable(),
  indicators: z.array(z.string().min(1).max(100)).optional(),
}).strict();

export const ClusterHypothesesRequestSchema = z.object({
  hypotheses: z.array(ClusteringCandidateSchema),
  similarityThreshold: z.number().min(0).max(1).optional().default(0.7),
}).strict();

export const HypothesisClusteringRequestSchema = ClusterHypothesesRequestSchema;

export const HypothesisClusterSchema = z.object({
  clusterId: z.string().min(1).max(100),
  theme: z.string().min(1).max(200),
  memberIds: z.array(z.string().min(1).max(100)).min(1),
  redundancyScore: z.number().min(0).max(1),
  recommendedRepresentativeId: z.string().min(1).max(100),
}).strict();

export const HypothesisClusteringResponseSchema = z.object({
  clusters: z.array(HypothesisClusterSchema),
  totalAnalyzed: z.number().int().nonnegative().optional(),
}).strict();

// ── Capability 5: Next-Experiment Recommendations ─────────────────────────────
export const NextExperimentSpecSchema = z.object({
  parentJobId: z.string().min(1).max(100).optional(),
  hypothesisId: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  proposedParameters: z.record(z.string().min(1).max(100), z.unknown()),
  targetRegime: z.string().min(1).max(50).optional(),
  rationale: z.string().min(1).max(2000),
}).strict();

export const RecommendExperimentsRequestSchema = z.object({
  completedJobId: z.string().min(1).max(100).optional(),
  predecessorJobId: z.string().min(1).max(100).optional(),
  hypothesisId: z.string().min(1).max(100).optional(),
  hypothesis: z.string().min(1).max(1000),
  status: z.enum(['SURVIVED', 'FALSIFIED', 'survived', 'falsified']).optional(),
  outcome: z.enum(['SURVIVED', 'FALSIFIED', 'survived', 'falsified']).optional(),
  failureReasons: z.array(z.string().min(1).max(500)).optional(),
  currentRegime: z.string().max(50).optional(),
  currentFeatures: z.array(z.string().max(100)).optional(),
  currentDataset: z.string().max(100).optional(),
  verdict: z.unknown().optional(),
  maxRecommendations: z.number().int().min(1).max(10).optional().default(2),
}).strict();

export const NextExperimentRequestSchema = RecommendExperimentsRequestSchema;

export const NextExperimentResponseSchema = z.object({
  recommendations: z.array(NextExperimentSpecSchema).min(1),
}).strict();
