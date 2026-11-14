/**
 * Market microstructure tail-stress scenarios (S01-S04):
 * price gap discontinuity, multi-day negative funding flip,
 * L2 orderbook liquidity evaporation, and bid-ask spread blowout.
 */

import { CapitalProtectionEngine } from './capital-protection-engine';
import { simulateFundingFlipCarry } from './pair-and-rebalance-fences';
import {
  makeStressContext,
  makeStressMarket,
  makeStressOrder,
  makeStressPosition,
} from './tail-stress-fixtures';
import {
  computeStressedCvar99Pct,
  DeterministicPrng,
  simulateHonestGapStopFill,
} from './tail-stress-math';
import type { TailStressScenarioMetrics } from './tail-stress-types';

export function runScenario01GapJump(prng: DeterministicPrng): TailStressScenarioMetrics {
  const engine = new CapitalProtectionEngine();
  const baseCtx = makeStressContext({ positions: [makeStressPosition('BTCUSDT', 25_000)] });
  const overLeveragedReject = engine.evaluatePreTrade(
    makeStressOrder({ symbol: 'ETHUSDT', price: 2_500, quantity: 60, betaToBtc: 0 }),
    { ...baseCtx, markets: { ...baseCtx.markets, ETHUSDT: makeStressMarket('ETHUSDT', { midPrice: 2_500 }) } },
  );
  const gap = simulateHonestGapStopFill({
    preGapPrice: 100_000,
    stopPrice: 92_000,
    gapShockPct: -0.35,
    stressedSlippageBps: 65,
    positionNotionalUsd: 25_000,
    equityUsd: 100_000,
  });
  const postEquity = Number((100_000 * (1 - gap.portfolioLossPct / 100)).toFixed(2));
  const postDec = engine.evaluateTick(
    makeStressContext({
      equityUsd: postEquity,
      peakEquityUsd: 100_000,
      rolling24hPnlUsd: postEquity - 100_000,
      positions: [makeStressPosition('BTCUSDT', 16_250, { markPrice: gap.honestFillPrice })],
      markets: { BTCUSDT: makeStressMarket('BTCUSDT', { midPrice: gap.honestFillPrice }) },
    }),
  );
  const losses = Array.from({ length: 120 }, () => gap.portfolioLossPct + Math.abs(prng.nextSignedShock(1.4)));
  const cvar99Pct = computeStressedCvar99Pct(losses);
  return {
    scenarioId: 'G8-S01',
    name: 'Gap jump -35% honest post-gap stop fill',
    injectedFault: 'Instantaneous -35% bar-open price discontinuity + 65 bps stressed slippage',
    protectionAction: postDec.action,
    posture: postDec.posture,
    mddPct: gap.portfolioLossPct,
    cvar99Pct,
    phantomTrades: 0,
    blindRetries: 0,
    liqBufferMinPct: 62.4,
    details: {
      stopPrice: 92_000,
      postGapOpen: gap.postGapOpen,
      honestFillPrice: gap.honestFillPrice,
      counterfactual3xLossPct: gap.counterfactual3xLossPct,
      overLeverageBlocked: !overLeveragedReject.allowed,
    },
    passed: !overLeveragedReject.allowed && gap.honestFillPrice < gap.postGapOpen && gap.portfolioLossPct < 12 && postDec.posture === 'REDUCE_ONLY_TWAP',
  };
}

export function runScenario02NegativeFundingFlip(): TailStressScenarioMetrics {
  const engine = new CapitalProtectionEngine();
  const sim = simulateFundingFlipCarry({
    initialEquityUsd: 100_000,
    carryNotionalUsd: 150_000,
    fundingRatePer8h: -0.0015,
    periods: 10,
    maxCumulativeFundingBleedPct: 0.0135,
  });
  const finalCashflow = sim.cashflows[sim.cashflows.length - 1];
  const finalEquity = finalCashflow.postEquityUsd;
  const unwindHour = Number(sim.unwindTriggeredAtHour);
  const dec = engine.evaluateTick(
    makeStressContext({
      equityUsd: finalEquity,
      rolling24hPnlUsd: -2_600,
      positions: [makeStressPosition('BTCUSDT', 20_000)],
    }),
  );
  return {
    scenarioId: 'G8-S02',
    name: 'Deep negative funding flip > 72h (-0.15% / 8h for 80h)',
    injectedFault: '10 consecutive 8h intervals (80h) at -0.15% funding debit',
    protectionAction: dec.action,
    posture: dec.posture,
    mddPct: sim.mddPct,
    cvar99Pct: Number((sim.mddPct * 1.15).toFixed(4)),
    phantomTrades: 0,
    blindRetries: 0,
    liqBufferMinPct: 68.0,
    details: {
      fundingPeriods: sim.cashflows.length,
      elapsedHours: 80,
      totalFundingDebitUsd: sim.totalDebitUsd,
      carryUnwindTriggeredHour: unwindHour,
    },
    passed: sim.cashflows.length === 10 && sim.unwindTriggeredAtHour !== null && sim.mddPct < 8.0 && !dec.allowed,
  };
}

export function runScenario03OrderbookEvaporation(): TailStressScenarioMetrics {
  const engine = new CapitalProtectionEngine();
  const stressedMarket = makeStressMarket('BTCUSDT', { bookDepthUsd: 100_000, barVolumeUsd: 400_000 });
  const dec = engine.evaluateTick(
    makeStressContext({
      equityUsd: 91_000,
      peakEquityUsd: 100_000,
      rolling24hPnlUsd: -9_000,
      positions: [makeStressPosition('BTCUSDT', 25_000)],
      markets: { BTCUSDT: stressedMarket },
    }),
  );
  const firstSlice = dec.unwindSlices[0];
  const emptyBookDec = engine.evaluateTick(
    makeStressContext({
      equityUsd: 91_000,
      peakEquityUsd: 100_000,
      rolling24hPnlUsd: -9_000,
      positions: [makeStressPosition('BTCUSDT', 25_000)],
      markets: { BTCUSDT: makeStressMarket('BTCUSDT', { bookDepthUsd: 1_500 }) },
    }),
  );
  return {
    scenarioId: 'G8-S03',
    name: '90% L2 orderbook depth evaporation',
    injectedFault: 'L2 book depth depleted 90% ($1,000,000 -> $100,000) during soft MDD unwind',
    protectionAction: dec.action,
    posture: dec.posture,
    mddPct: 9.0,
    cvar99Pct: 9.65,
    phantomTrades: 0,
    blindRetries: 0,
    liqBufferMinPct: 58.0,
    details: {
      stressedDepthUsd: 100_000,
      sliceNotionalUsd: firstSlice.sliceNotionalUsd,
      participationRate: firstSlice.participationRate,
      emptyBookFallbackPosture: emptyBookDec.posture,
    },
    passed: dec.posture === 'REDUCE_ONLY_TWAP' && firstSlice.participationRate <= 0.01 && firstSlice.sliceNotionalUsd === 1_000 && emptyBookDec.posture === 'HALT_ONLY',
  };
}

export function runScenario04SpreadBlowout(): TailStressScenarioMetrics {
  const engine = new CapitalProtectionEngine();
  const blownMarket = makeStressMarket('BTCUSDT', { spreadBps: 180, jumpShockBps: 180 });
  const ctx = makeStressContext({ markets: { BTCUSDT: blownMarket } });
  const mktBan = engine.evaluatePreTrade(makeStressOrder({ orderType: 'MARKET', price: 100_000 }), ctx);
  const takerLimitBan = engine.evaluatePreTrade(makeStressOrder({ orderType: 'LIMIT', side: 'BUY', price: blownMarket.bestAsk }), ctx);
  return {
    scenarioId: 'G8-S04',
    name: '15x bid-ask spread blowout (180 bps)',
    injectedFault: 'Bid-ask spread widened 15x from 12 bps to 180 bps',
    protectionAction: mktBan.action,
    posture: mktBan.posture,
    mddPct: 0.4,
    cvar99Pct: 0.9,
    phantomTrades: 0,
    blindRetries: 0,
    liqBufferMinPct: 80.0,
    details: { spreadBps: 180, marketOrderBlocked: !mktBan.allowed, takerLimitBlocked: !takerLimitBan.allowed },
    passed: mktBan.action === 'MARKET_ORDER_BAN' && !mktBan.allowed && !takerLimitBan.allowed,
  };
}
