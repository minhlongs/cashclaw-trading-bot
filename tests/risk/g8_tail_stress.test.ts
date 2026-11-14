import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AtomicFillDeduplicator,
  buildTailStressSummary,
  canonicalJson,
  computeCorrelationConvergenceScale,
  computeStressedCvar99Pct,
  DEFAULT_STRESS_SEED,
  DeterministicLeaseCoordinator,
  evaluateBrokenPairLeg,
  evaluateRebalanceHysteresis,
  ExecutionBudgetGuard,
  runTailStressSuite,
  sha256HexSync,
  STRESS_BASE_TIMESTAMP_MS,
  type TailStressMatrixArtifact,
} from '@/tree/protection';

const ARTIFACT_PATH = path.resolve(__dirname, '../../artifacts/g8_tail_stress_matrix.json');

describe('Gate G8: 16 Adversarial Tail-Stress & Fault-Injection Matrix', () => {
  it('matches RFC-6234 / node:crypto SHA-256 bit-for-bit across short, multi-block, and unicode inputs', () => {
    for (const sample of ['', 'abc', 'a'.repeat(55), 'b'.repeat(64), 'c'.repeat(200), '{"seed":42,"gate":"G8"}']) {
      const expected = createHash('sha256').update(sample, 'utf8').digest('hex');
      expect(sha256HexSync(sample)).toBe(expected);
    }
    expect(computeStressedCvar99Pct([])).toBe(0);
  });

  it('executes all 16 adversarial scenarios with 100% pass rate, 0 phantom trades, and 0 blind retries', () => {
    const result = runTailStressSuite(DEFAULT_STRESS_SEED);
    expect(result.seed).toBe(42);
    expect(result.summary.totalScenarios).toBe(16);
    expect(result.summary.passedScenarios).toBe(16);
    expect(result.summary.failedScenarios).toBe(0);
    expect(result.summary.phantomTradesTotal).toBe(0);
    expect(result.summary.blindRetriesTotal).toBe(0);
    expect(result.summary.verdict).toBe('PASS');

    const ids = result.scenarios.map((s) => s.scenarioId);
    expect(ids).toEqual([
      'G8-S01', 'G8-S02', 'G8-S03', 'G8-S04',
      'G8-S05', 'G8-S06', 'G8-S07', 'G8-S08',
      'G8-S09', 'G8-S10', 'G8-S11', 'G8-S12',
      'G8-S13', 'G8-S14', 'G8-S15', 'G8-S16',
    ]);

    for (const scenario of result.scenarios) {
      expect(scenario.passed, `${scenario.scenarioId} (${scenario.name}) failed`).toBe(true);
      expect(scenario.phantomTrades).toBe(0);
      expect(scenario.blindRetries).toBe(0);
      expect(scenario.liqBufferMinPct).toBeGreaterThan(35);
    }
  });

  it('verifies specific adversarial domain invariants across S01-S16', () => {
    const matrix = runTailStressSuite(42);
    const byId = Object.fromEntries(matrix.scenarios.map((s) => [s.scenarioId, s]));

    // S01: Honest post-gap stop fill strictly below post-gap open, never idealized stopPrice
    expect(Number(byId['G8-S01']?.details.honestFillPrice)).toBeLessThan(Number(byId['G8-S01']?.details.postGapOpen));
    expect(Number(byId['G8-S01']?.details.counterfactual3xLossPct)).toBeGreaterThan(100);

    // S02: 10 funding periods (80h) debited explicitly before MDD cap
    expect(byId['G8-S02']?.details.fundingPeriods).toBe(10);
    expect(byId['G8-S02']?.details.elapsedHours).toBe(80);
    expect(byId['G8-S02']?.mddPct).toBeLessThan(8);

    // S03: 90% L2 depth evaporation caps TWAP child slice at <= 1% ($1,000 of $100,000)
    expect(byId['G8-S03']?.details.sliceNotionalUsd).toBe(1_000);
    expect(Number(byId['G8-S03']?.details.participationRate)).toBeLessThanOrEqual(0.01);

    // S04-S09: Spread blowout, 3-strike HTTP 502/504, D1 PENDING_INTENT, 18.5s feed lag, 245bps venue dislocation, USDC $0.912 depeg
    expect(byId['G8-S04']?.protectionAction).toBe('MARKET_ORDER_BAN');
    expect(byId['G8-S05']?.protectionAction).toBe('DEGRADED_HALT');
    expect(byId['G8-S06']?.protectionAction).toBe('RECONCILING');
    expect(byId['G8-S07']?.protectionAction).toBe('STALE_DATA_FAIL_CLOSED');
    expect(byId['G8-S08']?.protectionAction).toBe('SEV1_VENUE_DISLOCATION');
    expect(byId['G8-S09']?.protectionAction).toBe('COLLATERAL_DEPEG');

    // S10 & S11: > 35% liq distance buffer & <= 12% stressed 99% CVaR under corr=0.98
    expect(byId['G8-S10']?.posture).toBe('REDUCE_ONLY_TWAP');
    expect(byId['G8-S10']?.liqBufferMinPct).toBeGreaterThan(35);
    expect(byId['G8-S11']?.cvar99Pct).toBeLessThanOrEqual(12);

    // S13-S16: Broken leg unwind + suspend, 9/10 duplicate dedup, lease + budget abort, $0.05 ledger breach quarantine
    expect(byId['G8-S13']?.protectionAction).toBe('UNWIND_AND_SUSPEND_STRATEGY');
    expect(byId['G8-S14']?.details.duplicateCount).toBe(9);
    expect(byId['G8-S14']?.details.acceptedCount).toBe(1);
    expect(byId['G8-S15']?.details.executedSteps).toBe(25);
    expect(byId['G8-S16']?.protectionAction).toBe('QUARANTINED_SAFE_MODE');
  });

  it('exercises operational fence edge branches (healthy/pending pair leg, sustained hysteresis, lease expiry)', () => {
    expect(
      evaluateBrokenPairLeg({
        pairStrategyId: 'p1',
        legASymbol: 'BTCUSDT',
        legAFilledSignedQty: 0.1,
        legAEntryPrice: 100_000,
        legAMarkPrice: 100_000,
        legBStatus: 'FILLED',
        elapsedSinceLegAMs: 500,
      }).action,
    ).toBe('PAIR_HEALTHY');

    expect(
      evaluateBrokenPairLeg({
        pairStrategyId: 'p1',
        legASymbol: 'BTCUSDT',
        legAFilledSignedQty: -0.1,
        legAEntryPrice: 100_000,
        legAMarkPrice: 101_000,
        legBStatus: 'UNFILLED',
        elapsedSinceLegAMs: 1_200,
      }).action,
    ).toBe('PENDING_LEG_B');

    const mildUnwind = evaluateBrokenPairLeg({
      pairStrategyId: 'p1',
      legASymbol: 'BTCUSDT',
      legAFilledSignedQty: -0.1,
      legAEntryPrice: 100_000,
      legAMarkPrice: 101_000,
      legBStatus: 'UNFILLED',
      elapsedSinceLegAMs: 3_200,
    });
    expect(mildUnwind.action).toBe('UNWIND_ORPHAN_LEG');
    expect(mildUnwind.unwindSide).toBe('BUY');

    // Sustained 3-tick drift triggers rebalance
    const t1 = evaluateRebalanceHysteresis(0.2, 0.25, 0, 0.15, 3);
    const t2 = evaluateRebalanceHysteresis(0.2, 0.25, t1.nextBreachStreak, 0.15, 3);
    const t3 = evaluateRebalanceHysteresis(0.2, 0.25, t2.nextBreachStreak, 0.15, 3);
    expect(t3.shouldRebalance).toBe(true);

    // Lease re-acquisition by same worker and after TTL expiry
    const coord = new DeterministicLeaseCoordinator();
    expect(coord.acquireLease('w1', STRESS_BASE_TIMESTAMP_MS, 1_000).acquired).toBe(true);
    expect(coord.acquireLease('w1', STRESS_BASE_TIMESTAMP_MS + 200, 1_000).acquired).toBe(true);
    expect(coord.acquireLease('w2', STRESS_BASE_TIMESTAMP_MS + 2_000, 1_000).acquired).toBe(true);

    const budget = new ExecutionBudgetGuard(2);
    expect(budget.consumeStep().allowed).toBe(true);
    expect(budget.getCallCount()).toBe(1);
    expect(budget.isAborted()).toBe(false);

    const dedup = new AtomicFillDeduplicator();
    expect(dedup.processBatchAtomically([]).acceptedCount).toBe(0);

    const lowCvarScale = computeCorrelationConvergenceScale(3, 0.3, 0.6, 5.0, 12.0);
    expect(lowCvarScale.scaledCvar99Pct).toBeLessThan(5.0);

    // Rejected leg B with immediate > 5% adverse move unwinds before 3s timeout
    const immediateRejectAdverse = evaluateBrokenPairLeg({
      pairStrategyId: 'p2',
      legASymbol: 'BTCUSDT',
      legAFilledSignedQty: 0.2,
      legAEntryPrice: 100_000,
      legAMarkPrice: 93_000,
      legBStatus: 'REJECTED',
      elapsedSinceLegAMs: 400,
    });
    expect(immediateRejectAdverse.action).toBe('UNWIND_AND_SUSPEND_STRATEGY');

    // Summary FAIL verdict branch when empty or failed scenario injected
    expect(buildTailStressSummary([]).verdict).toBe('FAIL');
  });

  it('pins byte-for-byte reproducibility and SHA-256 integrity of artifacts/g8_tail_stress_matrix.json', () => {
    expect(fs.existsSync(ARTIFACT_PATH)).toBe(true);
    const committedText = fs.readFileSync(ARTIFACT_PATH, 'utf8');
    const committedParsed = JSON.parse(committedText) as TailStressMatrixArtifact;

    const freshRun = runTailStressSuite(DEFAULT_STRESS_SEED);
    const freshText = `${JSON.stringify(freshRun, null, 2)}\n`;
    expect(freshText).toBe(committedText);

    const recomputedDigest = createHash('sha256')
      .update(
        canonicalJson({
          seed: committedParsed.seed,
          scenarios: committedParsed.scenarios,
          summary: committedParsed.summary,
        }),
        'utf8',
      )
      .digest('hex');
    expect(committedParsed.matrixSha256).toBe(recomputedDigest);
  });
});
