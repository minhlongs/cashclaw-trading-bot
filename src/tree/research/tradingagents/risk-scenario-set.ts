// RiskScenarioSet — the risk-advisor output (task §D).
// Pure types + Zod validation; no I/O, no LLM. Three risk VIEWS
// (aggressive / neutral / conservative) each produce a scenario. Advisory
// only: the schema cannot set size, and the deterministic portfolio engine
// (buildPortfolio overlays) decides actual sizing downstream. Any input
// carrying an order/sizing-execution field is rejected.

import { z } from 'zod';

/** One risk view's scenario (task §D). Advisory research only. */
export interface RiskScenario {
  readonly view: string;
  readonly expectedRegime: string;
  readonly keyRisks: readonly string[];
  readonly failureConditions: readonly string[];
  readonly maxAcceptableExposure: number;
  readonly liquidityConcern: string;
  readonly volatilityConcern: string;
  readonly correlationConcern: string;
}

/** A set of risk scenarios across views (task §D). */
export interface RiskScenarioSet {
  readonly goalId: string;
  readonly proposalId: string;
  readonly scenarios: readonly RiskScenario[];
  readonly advisoryNote: string;
}

/** Risk views the advisor may emit (task §D). */
export const RISK_VIEWS = ['aggressive', 'neutral', 'conservative'] as const;
export type RiskView = (typeof RISK_VIEWS)[number];

/** Fields that would let an LLM set size or execute — all forbidden. */
export const FORBIDDEN_SIZING_FIELDS = [
  'size',
  'positionSize',
  'quantity',
  'leverage',
  'approved',
  'execute',
  'order',
  'stopLoss',
  'takeProfit',
] as const;

const riskScenarioSchema = z.object({
  view: z.string().min(1),
  expectedRegime: z.string().min(1),
  keyRisks: z.array(z.string().min(1)).min(1),
  failureConditions: z.array(z.string().min(1)).min(1),
  maxAcceptableExposure: z.number().min(0).max(1),
  liquidityConcern: z.string().min(1),
  volatilityConcern: z.string().min(1),
  correlationConcern: z.string().min(1),
});

/** Zod schema for RiskScenarioSet (exactly the 4 fields of §D). */
export const riskScenarioSetSchema = z.object({
  goalId: z.string().min(1),
  proposalId: z.string().min(1),
  scenarios: z.array(riskScenarioSchema).min(1),
  advisoryNote: z.string().min(1),
});

/** Parse outcome: fail-closed with ALL collected reasons. */
export type ParseRiskScenarioSetResult =
  | { readonly ok: true; readonly value: RiskScenarioSet }
  | { readonly ok: false; readonly reasons: readonly string[] };

/**
 * Parse unknown input into a RiskScenarioSet. Fail-closed. Rejects any
 * input carrying a sizing/execution field — the advisor may describe
 * risk but must never set size or place an order (§D, §L).
 */
export function parseRiskScenarioSet(input: unknown): ParseRiskScenarioSetResult {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, reasons: ['risk scenario set: input must be a non-null object'] };
  }
  const obj = input as Record<string, unknown>;
  for (const f of FORBIDDEN_SIZING_FIELDS) {
    if (f in obj) {
      return {
        ok: false,
        reasons: [`risk scenario set: sizing field '${f}' is forbidden (advisory only, risk engine decides size)`],
      };
    }
  }

  const parsed = riskScenarioSetSchema.safeParse(input);
  if (!parsed.success) {
    const reasons = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    return { ok: false, reasons };
  }
  return { ok: true, value: parsed.data as RiskScenarioSet };
}