/**
 * Deterministic 16-scenario adversarial tail-risk and fault-injection runner.
 * Produces byte-reproducible matrix metrics and SHA-256 integrity digest.
 */

import { canonicalJson, DeterministicPrng, sha256HexSync } from './tail-stress-math';
import {
  runScenario13BrokenPairLeg,
  runScenario14DuplicateWebhookBurst,
  runScenario15LeaseContentionAndRunawayLoop,
  runScenario16LedgerInvariantBreach,
} from './tail-stress-scenarios-execution';
import {
  runScenario05GatewayOutage,
  runScenario06D1PartitionPendingIntent,
  runScenario07StaleFeedLag,
  runScenario08VenueDislocation,
} from './tail-stress-scenarios-infra';
import {
  runScenario01GapJump,
  runScenario02NegativeFundingFlip,
  runScenario03OrderbookEvaporation,
  runScenario04SpreadBlowout,
} from './tail-stress-scenarios-market';
import {
  runScenario09CollateralDepeg,
  runScenario10OiCascadeDrop,
  runScenario11CorrelationConvergence,
  runScenario12VReversalWhipsaw,
} from './tail-stress-scenarios-portfolio';
import type {
  TailStressMatrixArtifact,
  TailStressScenarioMetrics,
  TailStressSummary,
} from './tail-stress-types';

export const DEFAULT_STRESS_SEED = 42;
export const DETERMINISTIC_GENERATED_AT = '2026-11-14T00:00:00.000Z';

export function buildTailStressSummary(scenarios: readonly TailStressScenarioMetrics[]): TailStressSummary {
  let passedScenarios = 0;
  let phantomTradesTotal = 0;
  let blindRetriesTotal = 0;
  let worstMddPct = 0;
  let worstCvar99Pct = 0;
  let minLiqBufferPct = scenarios.length > 0 ? scenarios[0].liqBufferMinPct : 0;

  for (const s of scenarios) {
    if (s.passed) passedScenarios += 1;
    phantomTradesTotal += s.phantomTrades;
    blindRetriesTotal += s.blindRetries;
    if (s.mddPct > worstMddPct) worstMddPct = s.mddPct;
    if (s.cvar99Pct > worstCvar99Pct) worstCvar99Pct = s.cvar99Pct;
    if (s.liqBufferMinPct < minLiqBufferPct) minLiqBufferPct = s.liqBufferMinPct;
  }

  const totalScenarios = scenarios.length;
  const failedScenarios = totalScenarios - passedScenarios;
  const allPassed = totalScenarios > 0 && failedScenarios === 0 && phantomTradesTotal === 0 && blindRetriesTotal === 0;

  return {
    totalScenarios,
    passedScenarios,
    failedScenarios,
    phantomTradesTotal,
    blindRetriesTotal,
    worstMddPct: Number(worstMddPct.toFixed(4)),
    worstCvar99Pct: Number(worstCvar99Pct.toFixed(4)),
    minLiqBufferPct: Number(minLiqBufferPct.toFixed(4)),
    verdict: allPassed ? 'PASS' : 'FAIL',
  };
}

export function runTailStressSuite(seed = DEFAULT_STRESS_SEED): TailStressMatrixArtifact {
  const prng = new DeterministicPrng(seed);
  const scenarios: TailStressScenarioMetrics[] = [
    runScenario01GapJump(prng),
    runScenario02NegativeFundingFlip(),
    runScenario03OrderbookEvaporation(),
    runScenario04SpreadBlowout(),
    runScenario05GatewayOutage(),
    runScenario06D1PartitionPendingIntent(),
    runScenario07StaleFeedLag(),
    runScenario08VenueDislocation(),
    runScenario09CollateralDepeg(),
    runScenario10OiCascadeDrop(),
    runScenario11CorrelationConvergence(),
    runScenario12VReversalWhipsaw(),
    runScenario13BrokenPairLeg(),
    runScenario14DuplicateWebhookBurst(),
    runScenario15LeaseContentionAndRunawayLoop(),
    runScenario16LedgerInvariantBreach(),
  ];

  const summary = buildTailStressSummary(scenarios);
  const matrixSha256 = sha256HexSync(canonicalJson({ seed, scenarios, summary }));

  return {
    schemaVersion: 1,
    gate: 'G8',
    generatedAt: DETERMINISTIC_GENERATED_AT,
    seed,
    matrixSha256,
    scenarios,
    summary,
  };
}
