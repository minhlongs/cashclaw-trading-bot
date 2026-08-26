// ResearchGoal — contract binding research effort to an objective.
// Pure types + Zod validation; no I/O. Fail-closed parse collects ALL
// reasons (mirrors src/tree/alpha/queue/validation.ts style).

import { z } from 'zod';
import type { Universe } from '@/tree/alpha/universe/types';

/** ISO-8601 time period. */
export interface ResearchTimePeriod {
  readonly start: string;
  readonly end: string;
}

/** A research objective that hypotheses bind to (GOAL → HYPOTHESES). */
export interface ResearchGoal {
  readonly id: string;
  /** Objective statement, min 10 chars. */
  readonly objective: string;
  readonly universe: Universe;
  readonly timePeriod: ResearchTimePeriod;
  readonly constraints: readonly string[];
  readonly evidenceRequirements: readonly string[];
  readonly successCriteria: readonly string[];
  readonly failureCriteria: readonly string[];
  /** ISO-8601 timestamp. */
  readonly createdAt: string;
  readonly createdBy: string;
}

const isoDateTime = z.string().datetime({ offset: true });

const universeSchema = z.object({
  id: z.string().min(1),
  symbols: z.array(z.string().min(1)).min(1),
  weighting: z.enum(['equal', 'market', 'custom']),
  rebalanceRule: z.enum(['daily', 'weekly', 'threshold', 'none']),
});

/** Zod schema for ResearchGoal. */
export const researchGoalSchema = z.object({
  id: z.string().min(1),
  objective: z.string().min(10),
  universe: universeSchema,
  timePeriod: z.object({ start: isoDateTime, end: isoDateTime }),
  constraints: z.array(z.string()).default([]),
  evidenceRequirements: z.array(z.string()).default([]),
  successCriteria: z.array(z.string().min(1)).min(1),
  failureCriteria: z.array(z.string().min(1)).min(1),
  createdAt: isoDateTime,
  createdBy: z.string().min(1),
});

/** Parse outcome: fail-closed with ALL collected reasons. */
export type ParseResearchGoalResult =
  | { readonly ok: true; readonly value: ResearchGoal }
  | { readonly ok: false; readonly reasons: readonly string[] };

/** Parse unknown input into a ResearchGoal. Fail-closed. */
export function parseResearchGoal(input: unknown): ParseResearchGoalResult {
  const parsed = researchGoalSchema.safeParse(input);
  if (!parsed.success) {
    const reasons = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    return { ok: false, reasons };
  }

  const reasons: string[] = [];
  const { start, end } = parsed.data.timePeriod;
  if (Date.parse(end) <= Date.parse(start)) {
    reasons.push('timePeriod.end must be strictly after timePeriod.start');
  }

  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true, value: parsed.data as ResearchGoal };
}
