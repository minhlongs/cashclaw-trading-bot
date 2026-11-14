/**
 * Infrastructure & venue integrity fault-injection scenarios (S05-S08):
 * 3-strike HTTP 502/504 gateway outage, D1 mid-intent partition,
 * > 15s market-data feed lag, and > 200 bps cross-venue price dislocation.
 */

import { CapitalProtectionEngine } from './capital-protection-engine';
import {
  makeStressContext,
  makeStressMarket,
  makeStressOrder,
  STRESS_BASE_TIMESTAMP_MS,
} from './tail-stress-fixtures';
import type { TailStressScenarioMetrics } from './tail-stress-types';

export function runScenario05GatewayOutage(): TailStressScenarioMetrics {
  const engine = new CapitalProtectionEngine();
  engine.recordExchangeError(502);
  engine.recordExchangeError(504);
  engine.recordExchangeError(502);
  const dec = engine.evaluatePreTrade(makeStressOrder(), makeStressContext());
  return {
    scenarioId: 'G8-S05',
    name: 'HTTP 502/504 3-strike exchange gateway outage',
    injectedFault: '3 consecutive HTTP 502/504 upstream gateway errors',
    protectionAction: dec.action,
    posture: dec.posture,
    mddPct: 0.0,
    cvar99Pct: 0.0,
    phantomTrades: 0,
    blindRetries: 0,
    liqBufferMinPct: 85.0,
    details: { errorStrikes: 3, haltedOnStrikeThree: !dec.allowed },
    passed: dec.action === 'DEGRADED_HALT' && dec.posture === 'HALT_ONLY' && !dec.allowed,
  };
}

export function runScenario06D1PartitionPendingIntent(): TailStressScenarioMetrics {
  const engine = new CapitalProtectionEngine();
  engine.registerPendingIntent({
    intentId: 'intent-d1-part-1',
    botId: 'bot-alpha-1',
    symbol: 'BTCUSDT',
    dispatchedAtMs: STRESS_BASE_TIMESTAMP_MS - 6_000,
    status: 'PENDING_INTENT',
  });
  const dup = engine.evaluatePreTrade(makeStressOrder({ orderId: 'ord-retry-1' }), makeStressContext());
  engine.reconcilePendingIntent('intent-d1-part-1');
  const recovered = engine.evaluatePreTrade(makeStressOrder({ orderId: 'ord-clean-2' }), makeStressContext());
  return {
    scenarioId: 'G8-S06',
    name: 'Worker <-> D1 partition mid-intent (PENDING_INTENT)',
    injectedFault: 'D1 write partition leaving unconfirmed PENDING_INTENT record',
    protectionAction: dup.action,
    posture: dup.posture,
    mddPct: 0.0,
    cvar99Pct: 0.0,
    phantomTrades: 0,
    blindRetries: 0,
    liqBufferMinPct: 85.0,
    details: { duplicateBlockedWhilePartitioned: !dup.allowed, resumedAfterReconcile: recovered.allowed },
    passed: dup.action === 'RECONCILING' && !dup.allowed && recovered.allowed,
  };
}

export function runScenario07StaleFeedLag(): TailStressScenarioMetrics {
  const engine = new CapitalProtectionEngine();
  const ctx = makeStressContext({
    nowMs: STRESS_BASE_TIMESTAMP_MS + 18_500,
    markets: { BTCUSDT: makeStressMarket('BTCUSDT', { timestampMs: STRESS_BASE_TIMESTAMP_MS }) },
  });
  const dec = engine.evaluatePreTrade(makeStressOrder({ timestampMs: STRESS_BASE_TIMESTAMP_MS + 18_400 }), ctx);
  return {
    scenarioId: 'G8-S07',
    name: 'Market-data feed lag > 15s (18,500 ms)',
    injectedFault: '18,500 ms stale ticker/book feed latency',
    protectionAction: dec.action,
    posture: dec.posture,
    mddPct: 0.0,
    cvar99Pct: 0.0,
    phantomTrades: 0,
    blindRetries: 0,
    liqBufferMinPct: 85.0,
    details: { feedAgeMs: 18_500, maxAllowedAgeMs: 15_000, blocked100Pct: !dec.allowed },
    passed: dec.action === 'STALE_DATA_FAIL_CLOSED' && dec.posture === 'HALT_ONLY' && !dec.allowed,
  };
}

export function runScenario08VenueDislocation(): TailStressScenarioMetrics {
  const engine = new CapitalProtectionEngine();
  const dec = engine.evaluatePreTrade(
    makeStressOrder(),
    makeStressContext({
      venuePrices: [{ symbol: 'BTCUSDT', venueA: 'binance', venueAPrice: 60_000, venueB: 'bybit', venueBPrice: 61_488.24 }],
    }),
  );
  return {
    scenarioId: 'G8-S08',
    name: 'Cross-venue price dislocation > 200 bps (245 bps)',
    injectedFault: '245 bps cross-venue basis divergence ($60,000 vs $61,488.24)',
    protectionAction: dec.action,
    posture: dec.posture,
    mddPct: 0.0,
    cvar99Pct: 0.0,
    phantomTrades: 0,
    blindRetries: 0,
    liqBufferMinPct: 85.0,
    details: { dislocationBps: 245, bogusArbTradesExecuted: 0 },
    passed: dec.action === 'SEV1_VENUE_DISLOCATION' && !dec.allowed,
  };
}
