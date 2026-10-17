import type { Universe } from '@/tree/alpha/universe/types';
import type { RegimeLabel } from '@/tree/regime/types';
import type { StressMode } from '@/tree/alpha/cost-stress';

export const RESEARCH_SOURCES = ['vibe-zoo', 'swarm', 'mcp', 'human', 'import', 'deliberation'] as const;
export type ResearchSource = (typeof RESEARCH_SOURCES)[number];
export const EXPECTED_DIRECTIONS = ['long', 'short', 'neutral'] as const;
export type ExpectedDirection = (typeof EXPECTED_DIRECTIONS)[number];
export interface FeatureRef {
  readonly name: string;
  readonly lookback: number;
  readonly params: Readonly<Record<string, number | string | boolean>>;
}
export interface ResearchHypothesis {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly rationale: string;
  readonly source: ResearchSource;
  readonly parentHypothesisId: string | null;
  readonly universe: Universe;
  readonly timeframe: string;
  readonly horizon: number;
  readonly features: readonly FeatureRef[];
  readonly transformations: readonly string[];
  readonly regimeConstraints: readonly RegimeLabel[];
  readonly expectedMechanism: string;
  readonly expectedDirection: ExpectedDirection;
  readonly expectedHoldingPeriod: number;
  readonly costAssumption: StressMode;
  readonly generatedBy: string;
  readonly createdAt: string;
  readonly experimentVersion: number;
}
