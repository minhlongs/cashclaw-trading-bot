// Model provenance — records the selected provider/model for every agent
// call in the deliberation layer (task §F). Pure module: no I/O, no
// routing decisions made here — only validation and recording of what the
// tiered router selected. Provider ids are the allowlisted set transcribed
// verbatim from task.md §F; unknown providers are rejected fail-closed.

import { z } from 'zod';
import type { AgentRole, ModelProvenance, ModelTier } from './types';

/** Supported providers — transcribed verbatim from task.md §F (9 ids). */
export const SUPPORTED_PROVIDERS = ['Anthropic', 'OpenAI', 'Gemini', 'DeepSeek', 'Qwen', 'GLM', 'MiniMax', 'OpenRouter', 'Ollama/local'] as const;
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

/** Which tier each deliberation task maps to (task §F). */
export const TIER_BY_TASK = {
  'data-extraction': 'FAST',
  summarization: 'FAST',
  'research-synthesis': 'REASONING',
  debate: 'REASONING',
  'repetitive-research': 'LOCAL',
} as const satisfies Record<string, ModelTier>;
export type DeliberationTask = keyof typeof TIER_BY_TASK;

/** A recorded provenance entry binding an agent call to its model. */
export interface ModelProvenanceRecord {
  readonly agentRole: AgentRole;
  readonly task: DeliberationTask;
  readonly provenance: ModelProvenance;
}

/** Record outcome: fail-closed. */
export type RecordProvenanceResult =
  | { readonly ok: true; readonly record: ModelProvenanceRecord }
  | { readonly ok: false; readonly reasons: readonly string[] };

const providerSet = new Set<string>(SUPPORTED_PROVIDERS);

const modelProvenanceSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  tier: z.enum(['FAST', 'REASONING', 'LOCAL']),
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
});

/** Whether a provider id is in the allowlisted set. */
export function isSupportedProvider(providerId: string): boolean {
  return providerSet.has(providerId);
}

/** The tier a deliberation task must run on (task §F routing law). */
export function tierForTask(task: DeliberationTask): ModelTier {
  return TIER_BY_TASK[task];
}

/**
 * Record the selected provider/model for one agent call. Fail-closed:
 * - providerId must be one of the 9 supported providers;
 * - modelId must be non-empty;
 * - tier must match the task's required tier (a REASONING task on a FAST
 *   tier is a routing violation, rejected — never silently accepted);
 * - token/latency counters, when present, must be non-negative integers.
 * Collects ALL reasons.
 */
export function recordModelProvenance(
  agentRole: AgentRole,
  task: DeliberationTask,
  provenance: ModelProvenance,
): RecordProvenanceResult {
  const reasons: string[] = [];
  if (agentRole.trim() === '') reasons.push('model provenance: agentRole must be non-empty');
  if (!isSupportedProvider(provenance.providerId)) {
    reasons.push(
      `model provenance: providerId '${provenance.providerId}' is not in the supported provider allowlist`,
    );
  }
  const parsed = modelProvenanceSchema.safeParse(provenance);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      reasons.push(`model provenance: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
  }
  const requiredTier = tierForTask(task);
  if (provenance.tier !== requiredTier) {
    reasons.push(
      `model provenance: task '${task}' requires tier '${requiredTier}', got '${provenance.tier}'`,
    );
  }
  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true, record: { agentRole, task, provenance } };
}
