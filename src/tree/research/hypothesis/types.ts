// ResearchHypothesis — canonical contract for untrusted research output
// (Vibe-Trading zoo, swarm, MCP, human, import) at the trust boundary.
// Pure types + Zod validation; no I/O. Fail-closed: parse collects ALL
// reasons (mirrors src/tree/alpha/queue/validation.ts style).

import { z } from 'zod';
import type { Universe } from '@/tree/alpha/universe/types';
import { RegimeLabel } from '@/tree/regime/types';
import type { StressMode } from '@/forest/backtest/cost-model';
import { checkMechanism } from './mechanism-gate';

/** Where a research hypothesis originated. */
export const RESEARCH_SOURCES = ['vibe-zoo', 'swarm', 'mcp', 'human', 'import', 'deliberation'] as const;
export type ResearchSource = (typeof RESEARCH_SOURCES)[number];

/** Expected trade direction of a hypothesis. */
export const EXPECTED_DIRECTIONS = ['long', 'short', 'neutral'] as const;
export type ExpectedDirection = (typeof EXPECTED_DIRECTIONS)[number];

/** A feature reference inside a hypothesis (maps to FeatureDeclaration at compile time). */
export interface FeatureRef {
  readonly name: string;
  readonly lookback: number;
  readonly params: Readonly<Record<string, number | string | boolean>>;
}

/** Canonical research hypothesis contract (spec §5). */
export interface ResearchHypothesis {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly rationale: string;
  readonly source: ResearchSource;
  readonly parentHypothesisId: string | null;
  readonly universe: Universe;
  readonly timeframe: string;
  /** Forecast horizon in bars (positive integer). */
  readonly horizon: number;
  readonly features: readonly FeatureRef[];
  readonly transformations: readonly string[];
  readonly regimeConstraints: readonly RegimeLabel[];
  /** Non-empty causal mechanism; gated by mechanism-gate.ts. */
  readonly expectedMechanism: string;
  readonly expectedDirection: ExpectedDirection;
  /** Expected holding period in bars (positive integer). */
  readonly expectedHoldingPeriod: number;
  readonly costAssumption: StressMode;
  readonly generatedBy: string;
  /** ISO-8601 timestamp. */
  readonly createdAt: string;
  /** Monotonic experiment version, ≥ 1. */
  readonly experimentVersion: number;
}

const isoDateTime = z.string().datetime({ offset: true });
const positiveInt = z.number().int().positive();

const featureRefSchema = z.object({
  name: z.string().min(1),
  lookback: positiveInt,
  params: z.record(z.union([z.number(), z.string(), z.boolean()])).default({}),
});

const universeSchema = z.object({
  id: z.string().min(1),
  symbols: z.array(z.string().min(1)).min(1),
  weighting: z.enum(['equal', 'market', 'custom']),
  rebalanceRule: z.enum(['daily', 'weekly', 'threshold', 'none']),
});

/** Zod schema for ResearchHypothesis (mechanism gate applied separately). */
export const researchHypothesisSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  rationale: z.string().min(1),
  source: z.enum(RESEARCH_SOURCES),
  parentHypothesisId: z.string().min(1).nullable(),
  universe: universeSchema,
  timeframe: z.string().min(1),
  horizon: positiveInt,
  features: z.array(featureRefSchema).min(1),
  transformations: z.array(z.string()).default([]),
  regimeConstraints: z.array(z.nativeEnum(RegimeLabel)).default([]),
  expectedMechanism: z.string().min(1),
  expectedDirection: z.enum(EXPECTED_DIRECTIONS),
  expectedHoldingPeriod: positiveInt,
  costAssumption: z.enum(['normal', 'conservative', 'adverse', 'extreme']),
  generatedBy: z.string().min(1),
  createdAt: isoDateTime,
  experimentVersion: z.number().int().min(1),
});

/** Parse outcome: fail-closed with ALL collected reasons. */
export type ParseResearchHypothesisResult =
  | { readonly ok: true; readonly value: ResearchHypothesis }
  | { readonly ok: false; readonly reasons: readonly string[] };

/**
 * Parse unknown input into a ResearchHypothesis. Fail-closed:
 * Zod field errors AND mechanism-gate reasons are all collected.
 */
export function parseResearchHypothesis(input: unknown): ParseResearchHypothesisResult {
  const parsed = researchHypothesisSchema.safeParse(input);
  if (!parsed.success) {
    const reasons = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    return { ok: false, reasons };
  }

  const mechanism = checkMechanism(parsed.data.expectedMechanism);
  if (!mechanism.ok) {
    return { ok: false, reasons: mechanism.reasons };
  }

  return { ok: true, value: parsed.data as ResearchHypothesis };
}
