/**
 * Tail-stress simulation scenario and matrix artifact contracts.
 */

import type { ProtectionPosture } from './protection-types';

export interface TailStressScenarioMetrics {
  readonly scenarioId: string;
  readonly name: string;
  readonly injectedFault: string;
  readonly protectionAction: string;
  readonly posture: ProtectionPosture;
  readonly mddPct: number;
  readonly cvar99Pct: number;
  readonly phantomTrades: number;
  readonly blindRetries: number;
  readonly liqBufferMinPct: number;
  readonly details: Readonly<Record<string, number | string | boolean>>;
  readonly passed: boolean;
}

export interface TailStressSummary {
  readonly totalScenarios: number;
  readonly passedScenarios: number;
  readonly failedScenarios: number;
  readonly phantomTradesTotal: number;
  readonly blindRetriesTotal: number;
  readonly worstMddPct: number;
  readonly worstCvar99Pct: number;
  readonly minLiqBufferPct: number;
  readonly verdict: 'PASS' | 'FAIL';
}

export interface TailStressMatrixArtifact {
  readonly schemaVersion: 1;
  readonly gate: 'G8';
  readonly generatedAt: string;
  readonly seed: number;
  readonly matrixSha256: string;
  readonly scenarios: readonly TailStressScenarioMetrics[];
  readonly summary: TailStressSummary;
}
