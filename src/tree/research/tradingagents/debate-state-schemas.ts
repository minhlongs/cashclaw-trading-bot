// DebateCheckpoint — Zod schemas for every record type in the deliberation
// checkpoint contract. Single source of truth for shape validation used by
// both serialize and deserialize.

import { z } from 'zod';

const HEX64 = /^[0-9a-f]{64}$/;
const isoDateTime = z.string().datetime({ offset: true });

export const debateRoundSchema = z.object({
  agentRole: z.string().min(1),
  agentId: z.string().min(1),
  content: z.string(),
  round: z.number().int().nonnegative(),
});

export const debateStateSchema = z.object({
  researchGoalId: z.string().min(1),
  proposalId: z.string().min(1),
  rounds: z.array(debateRoundSchema),
  status: z.enum(['in-progress', 'complete', 'aborted']),
});

export const modelProvenanceSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  tier: z.enum(['FAST', 'REASONING', 'LOCAL']),
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
});

export const toolProvenanceSchema = z.object({
  toolName: z.string().min(1),
  allowlisted: z.boolean(),
});

/** Zod schema for DebateCheckpoint (exactly the 7 fields of §9). */
export const debateCheckpointSchema = z.object({
  researchGoalId: z.string().min(1),
  proposalId: z.string().min(1),
  debateState: debateStateSchema,
  modelProvenance: z.array(modelProvenanceSchema),
  toolProvenance: z.array(toolProvenanceSchema),
  timestamp: isoDateTime,
  resultHash: z.string().regex(HEX64),
});

/** Format a ZodError's issues into human-readable reasons. */
export function formatZodIssues(error: z.ZodError): readonly string[] {
  return error.issues.map(
    (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
  );
}
