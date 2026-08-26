// ResearchGoalAdapter — pure binding functions between goals and hypotheses.
// No I/O, deterministic: same inputs always produce the same binding view.

import type { ResearchGoal } from './types';
import type { ResearchHypothesis } from '@/tree/research/hypothesis/types';

/** Outcome of binding one hypothesis to a goal. */
export type GoalBindingResult =
  | { readonly ok: true; readonly goalId: string; readonly hypothesisId: string }
  | { readonly ok: false; readonly reasons: readonly string[] };

/** One row of the GOAL → HYPOTHESES linkage view. */
export interface GoalBindingEntry {
  readonly hypothesisId: string;
  readonly bound: boolean;
  readonly reasons: readonly string[];
}

/** GOAL → HYPOTHESES linkage view. */
export interface GoalBindingSummary {
  readonly goalId: string;
  readonly objective: string;
  readonly boundHypothesisIds: readonly string[];
  readonly entries: readonly GoalBindingEntry[];
}

/**
 * Bind a hypothesis to a goal. Fail-closed, pure, deterministic.
 *
 * Checks:
 * 1. Universe overlap — every hypothesis universe symbol must be a member
 *    of the goal universe (hypothesis symbols ⊆ goal universe).
 * 2. Timeframe compatibility — the hypothesis must have been created inside
 *    the goal's research time period (createdAt within [start, end]).
 */
export function bindHypothesisToGoal(
  goal: ResearchGoal,
  hypothesis: ResearchHypothesis,
): GoalBindingResult {
  const reasons: string[] = [];

  const goalSymbols = new Set(goal.universe.symbols);
  const outside = hypothesis.universe.symbols.filter((s) => !goalSymbols.has(s));
  if (outside.length > 0) {
    reasons.push(
      `universe mismatch: hypothesis symbols [${outside.join(', ')}] are outside goal universe '${goal.universe.id}'`,
    );
  }

  const created = Date.parse(hypothesis.createdAt);
  const start = Date.parse(goal.timePeriod.start);
  const end = Date.parse(goal.timePeriod.end);
  if (created < start || created > end) {
    reasons.push(
      `timeframe incompatible: hypothesis createdAt '${hypothesis.createdAt}' is outside goal period [${goal.timePeriod.start}, ${goal.timePeriod.end}]`,
    );
  }

  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true, goalId: goal.id, hypothesisId: hypothesis.id };
}

/**
 * Produce the GOAL → HYPOTHESES linkage view for a goal. Pure: evaluates
 * each hypothesis independently and never mutates inputs.
 */
export function goalBindingSummary(
  goal: ResearchGoal,
  hypotheses: readonly ResearchHypothesis[],
): GoalBindingSummary {
  const entries: GoalBindingEntry[] = hypotheses.map((h) => {
    const result = bindHypothesisToGoal(goal, h);
    return {
      hypothesisId: h.id,
      bound: result.ok,
      reasons: result.ok ? [] : result.reasons,
    };
  });
  return {
    goalId: goal.id,
    objective: goal.objective,
    boundHypothesisIds: entries.filter((e) => e.bound).map((e) => e.hypothesisId),
    entries,
  };
}
