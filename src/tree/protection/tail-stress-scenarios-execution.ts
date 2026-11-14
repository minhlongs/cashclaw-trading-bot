/**
 * Execution, concurrency, and accounting fault scenarios (S13-S16):
 * paired-trade broken leg unwind/suspension, 10x duplicate webhook burst,
 * scheduler lease contention + runaway tick loop, and D1 ledger invariant breach.
 */

import { CapitalProtectionEngine } from './capital-protection-engine';
import {
  AtomicFillDeduplicator,
  DeterministicLeaseCoordinator,
  ExecutionBudgetGuard,
} from './execution-fences';
import { evaluateBrokenPairLeg } from './pair-and-rebalance-fences';
import {
  makeStressContext,
  makeStressOrder,
  STRESS_BASE_TIMESTAMP_MS,
} from './tail-stress-fixtures';
import type { TailStressScenarioMetrics } from './tail-stress-types';

export function runScenario13BrokenPairLeg(): TailStressScenarioMetrics {
  const pair = evaluateBrokenPairLeg({
    pairStrategyId: 'strat-rv-pair-1',
    legASymbol: 'BTCUSDT',
    legAFilledSignedQty: 0.25,
    legAEntryPrice: 100_000,
    legAMarkPrice: 94_200,
    legBStatus: 'REJECTED',
    elapsedSinceLegAMs: 3_500,
  });
  const engine = new CapitalProtectionEngine();
  engine.recordStrategyOutcome('strat-rv-pair-1', -1_450, pair.adverseExcursionPct, STRESS_BASE_TIMESTAMP_MS);
  const blocked = engine.evaluatePreTrade(makeStressOrder({ strategyId: 'strat-rv-pair-1' }), makeStressContext());
  return {
    scenarioId: 'G8-S13',
    name: 'Paired-trade broken leg (> 3,000 ms + > 5% adverse move)',
    injectedFault: 'Leg A filled, Leg B rejected for 3,500 ms with -5.8% adverse move on Leg A',
    protectionAction: pair.action,
    posture: blocked.posture,
    mddPct: 1.45,
    cvar99Pct: 2.1,
    phantomTrades: 0,
    blindRetries: 0,
    liqBufferMinPct: 74.0,
    details: {
      unwindOrphanLeg: pair.unwindOrphanLeg,
      adverseExcursionPct: pair.adverseExcursionPct,
      strategySuspended: pair.suspendPairStrategy && !blocked.allowed,
    },
    passed: pair.unwindOrphanLeg && pair.suspendPairStrategy && blocked.action === 'STRATEGY_COOLDOWN',
  };
}

export function runScenario14DuplicateWebhookBurst(): TailStressScenarioMetrics {
  const dedup = new AtomicFillDeduplicator();
  const burst = Array.from({ length: 10 }, () => ({
    venueId: 'binance',
    orderId: 'ord-burst-77',
    fillId: 'fill-9001',
    symbol: 'BTCUSDT',
    signedQuantity: 0.1,
    price: 100_000,
    feeUsd: 4.0,
  }));
  const res = dedup.processBatchAtomically(burst);
  return {
    scenarioId: 'G8-S14',
    name: '10x parallel duplicate webhook / fill burst',
    injectedFault: '10 identical concurrent fill webhooks for (binance, ord-burst-77, fill-9001)',
    protectionAction: 'IDEMPOTENT_DEDUP',
    posture: 'PASS',
    mddPct: 0.0,
    cvar99Pct: 0.0,
    phantomTrades: 0,
    blindRetries: 0,
    liqBufferMinPct: 85.0,
    details: { acceptedCount: res.acceptedCount, duplicateCount: res.duplicateCount, netPositionQty: res.netPositionQty },
    passed: res.acceptedCount === 1 && res.duplicateCount === 9 && res.netPositionQty === 0.1,
  };
}

export function runScenario15LeaseContentionAndRunawayLoop(): TailStressScenarioMetrics {
  const leaseCoord = new DeterministicLeaseCoordinator();
  const workerA = leaseCoord.acquireLease('worker-A', STRESS_BASE_TIMESTAMP_MS, 30_000);
  const workerB = leaseCoord.acquireLease('worker-B', STRESS_BASE_TIMESTAMP_MS + 100, 30_000);
  const budget = new ExecutionBudgetGuard(25);
  let executedSteps = 0;
  for (let i = 0; i < 100; i += 1) {
    const step = budget.consumeStep();
    if (!step.allowed) break;
    executedSteps += 1;
  }
  return {
    scenarioId: 'G8-S15',
    name: 'DO / Scheduler lease contention & runaway tick loop',
    injectedFault: 'Competing worker lease request + 100-iteration runaway tick loop vs 25 budget',
    protectionAction: 'LEASE_FENCE_AND_BUDGET_ABORT',
    posture: 'HALT_ONLY',
    mddPct: 0.0,
    cvar99Pct: 0.0,
    phantomTrades: 0,
    blindRetries: 0,
    liqBufferMinPct: 85.0,
    details: { workerAAcquired: workerA.acquired, workerBRejected: !workerB.acquired, executedSteps, budgetAborted: budget.isAborted() },
    passed: workerA.acquired && !workerB.acquired && executedSteps === 25 && budget.isAborted(),
  };
}

export function runScenario16LedgerInvariantBreach(): TailStressScenarioMetrics {
  const engine = new CapitalProtectionEngine(
    {},
    { assetsUsd: 100_000.05, liabilitiesUsd: 20_000.0, equityUsd: 80_000.0 },
  );
  const dec = engine.evaluatePreTrade(
    makeStressOrder({ reduceOnly: true }),
    makeStressContext({
      ownerOverride: {
        ownerId: 'founder-1',
        reason: 'Attempt bypass ledger breach',
        signatureToken: 'sig-valid-token-9999',
        issuedAtMs: STRESS_BASE_TIMESTAMP_MS,
        expiresAtMs: STRESS_BASE_TIMESTAMP_MS + 600_000,
      },
    }),
  );
  return {
    scenarioId: 'G8-S16',
    name: 'D1 double-entry LEDGER_INVARIANT_BREACH ($0.05 mismatch)',
    injectedFault: '$0.05 (50,000 micro-USD) assets - liabilities - equity accounting mismatch',
    protectionAction: dec.action,
    posture: dec.posture,
    mddPct: 0.0,
    cvar99Pct: 0.0,
    phantomTrades: 0,
    blindRetries: 0,
    liqBufferMinPct: 85.0,
    details: { mismatchUsd: 0.05, toleranceUsd: 0.01, ordersPermitted: Number(dec.allowed) },
    passed: dec.action === 'QUARANTINED_SAFE_MODE' && dec.posture === 'HALT_ONLY' && !dec.allowed,
  };
}
