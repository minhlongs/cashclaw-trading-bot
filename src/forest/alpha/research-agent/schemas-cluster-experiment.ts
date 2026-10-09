// CashClaw Alpha Research OS — Clustering and Experiment Schemas
import { z } from 'zod';

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
