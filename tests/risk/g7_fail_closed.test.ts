import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buildReduceOnlyTwapPlan,
  CapitalProtectionEngine,
  DEFAULT_PROTECTION_CONFIG,
  evaluateCollateralPeg,
  evaluateLedgerAccounting,
  evaluateMarketDataFreshness,
  evaluateVenueDislocation,
  isBookSafeForTwap,
  makeStressContext,
  makeStressMarket,
  makeStressOrder,
  makeStressPosition,
  resolveProtectionConfig,
  STRESS_BASE_TIMESTAMP_MS,
  validateOwnerOverride,
} from '@/tree/protection';

describe('Gate G7: CapitalProtectionEngine — 14 Fail-Closed Controls & HALT_ONLY vs REDUCE_ONLY_TWAP', () => {
  it('enforces pure src/tree/protection architectural isolation (0 banned imports, 0 I/O, <= 200 LOC)', () => {
    const dir = path.resolve(__dirname, '../../src/tree/protection');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThanOrEqual(10);

    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), 'utf8');
      const lineCount = content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
      expect(lineCount, `${file} exceeded 200 lines`).toBeLessThanOrEqual(200);
      expect(content).not.toMatch(/@\/(ee|forest|land)\//);
      expect(content).not.toContain('research-agent');
      expect(content).not.toContain('node:fs');
      expect(content).not.toMatch(/\bfetch\s*\(/);
      expect(content).not.toMatch(/\bconsole\./);
      expect(content).not.toContain('eslint-disable');
    }
  });

  it('clamps hard configuration ceilings against unsafe caller overrides', () => {
    const cfg = resolveProtectionConfig({
      maxGrossLeverage: 10.0,
      maxSingleAssetWeightPct: 0.9,
      maxNeutralBtcBeta: 2.0,
      maxDirectionalBtcBeta: 5.0,
      maxOwnerOverrideTtlMs: 99_999_999,
      ledgerToleranceMicroUsd: 500_000,
      maxTwapParticipationRate: 0.5,
    });
    expect(cfg.maxGrossLeverage).toBe(1.5);
    expect(cfg.maxSingleAssetWeightPct).toBe(0.25);
    expect(cfg.maxNeutralBtcBeta).toBe(0.5);
    expect(cfg.maxDirectionalBtcBeta).toBe(1.0);
    expect(cfg.maxOwnerOverrideTtlMs).toBe(3_600_000);
    expect(cfg.ledgerToleranceMicroUsd).toBe(10_000);
    expect(cfg.maxTwapParticipationRate).toBe(0.01);
  });

  it('Control 1: rejects NaN, Infinity, <= 0 numeric inputs, > 5,000ms clock skew, and > 10% NAV single-order notional', () => {
    const engine = new CapitalProtectionEngine();
    const ctx = makeStressContext();

    for (const badVal of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -10]) {
      expect(engine.evaluatePreTrade(makeStressOrder({ price: badVal }), ctx).action).toBe('REJECT_PRETRADE');
      expect(engine.evaluatePreTrade(makeStressOrder({ quantity: badVal }), ctx).action).toBe('REJECT_PRETRADE');
      expect(engine.evaluatePreTrade(makeStressOrder(), makeStressContext({ equityUsd: badVal })).action).toBe('REJECT_PRETRADE');
    }

    const skewed = engine.evaluatePreTrade(
      makeStressOrder({ timestampMs: ctx.nowMs - 5_001 }),
      ctx,
    );
    expect(skewed.allowed).toBe(false);
    expect(skewed.action).toBe('REJECT_PRETRADE');
    expect(skewed.controlId).toBe(1);

    const fatFinger = engine.evaluatePreTrade(
      makeStressOrder({ price: 100_000, quantity: 0.11 }), // $11,000 > 10% of $100k NAV
      ctx,
    );
    expect(fatFinger.allowed).toBe(false);
    expect(fatFinger.action).toBe('REJECT_PRETRADE');

    const clean = engine.evaluatePreTrade(makeStressOrder({ price: 99_950, quantity: 0.08 }), ctx);
    expect(clean.allowed).toBe(true);
    expect(clean.action).toBe('ALLOW');
  });

  it('Control 2: quarantines losing/drawdown strategy for cooldownMs without affecting healthy strategies', () => {
    const engine = new CapitalProtectionEngine();
    const ctx = makeStressContext();

    engine.recordStrategyOutcome('strat-bleeding', -300, 0.01, STRESS_BASE_TIMESTAMP_MS);
    engine.recordStrategyOutcome('strat-bleeding', -300, 0.02, STRESS_BASE_TIMESTAMP_MS + 10);
    engine.recordStrategyOutcome('strat-bleeding', -300, 0.03, STRESS_BASE_TIMESTAMP_MS + 20);

    const blocked = engine.evaluatePreTrade(makeStressOrder({ strategyId: 'strat-bleeding' }), ctx);
    expect(blocked.allowed).toBe(false);
    expect(blocked.action).toBe('STRATEGY_COOLDOWN');
    expect(blocked.controlId).toBe(2);

    const healthy = engine.evaluatePreTrade(makeStressOrder({ strategyId: 'strat-healthy' }), ctx);
    expect(healthy.allowed).toBe(true);

    const reduceAllowed = engine.evaluatePreTrade(
      makeStressOrder({ strategyId: 'strat-bleeding', side: 'SELL', reduceOnly: true }),
      makeStressContext({ positions: [makeStressPosition('BTCUSDT', 10_000)] }),
    );
    expect(reduceAllowed.allowed).toBe(true);

    const afterCooldown = engine.evaluatePreTrade(
      makeStressOrder({
        strategyId: 'strat-bleeding',
        timestampMs: STRESS_BASE_TIMESTAMP_MS + 1_900_000,
      }),
      makeStressContext({
        nowMs: STRESS_BASE_TIMESTAMP_MS + 1_900_100,
        markets: { BTCUSDT: makeStressMarket('BTCUSDT', { timestampMs: STRESS_BASE_TIMESTAMP_MS + 1_900_000 }) },
      }),
    );
    expect(afterCooldown.allowed).toBe(true);
  });

  it('Control 3: blocks single-asset concentration > 25% NAV and net BTC-beta outside [-0.50, +0.50] / directional cap', () => {
    const engine = new CapitalProtectionEngine();
    const concCtx = makeStressContext({
      positions: [makeStressPosition('BTCUSDT', 20_000)],
    });
    const overConc = engine.evaluatePreTrade(
      makeStressOrder({ symbol: 'BTCUSDT', side: 'BUY', price: 99_950, quantity: 0.06 }), // +$5,997 -> 25.997% > 25%
      concCtx,
    );
    expect(overConc.allowed).toBe(false);
    expect(overConc.action).toBe('REJECT_PRETRADE');
    expect(overConc.controlId).toBe(3);

    const betaCtx = makeStressContext({
      positions: [
        makeStressPosition('BTCUSDT', 24_000, { betaToBtc: 1.0 }),
        makeStressPosition('ETHUSDT', 24_000, { betaToBtc: 1.0, markPrice: 2_500 }),
      ],
      markets: {
        BTCUSDT: makeStressMarket('BTCUSDT'),
        ETHUSDT: makeStressMarket('ETHUSDT', { midPrice: 2_500 }),
        SOLUSDT: makeStressMarket('SOLUSDT', { midPrice: 150 }),
      },
    });
    const overBeta = engine.evaluatePreTrade(
      makeStressOrder({ symbol: 'SOLUSDT', side: 'BUY', price: 149.9, quantity: 30, betaToBtc: 1.2 }),
      betaCtx,
    );
    expect(overBeta.allowed).toBe(false);
    expect(overBeta.controlId).toBe(3);

    const dirEngine = new CapitalProtectionEngine({ marketNeutralMode: false, maxDirectionalBtcBeta: 0.9 });
    const allowedInDirectional = dirEngine.evaluatePreTrade(
      makeStressOrder({ symbol: 'SOLUSDT', side: 'BUY', price: 149.9, quantity: 30, betaToBtc: 1.2 }),
      betaCtx,
    );
    expect(allowedInDirectional.allowed).toBe(true);
  });

  it('Control 4: enforces 1.5x gross portfolio leverage ceiling while permitting reduceOnly de-leveraging', () => {
    const engine = new CapitalProtectionEngine({ marketNeutralMode: false });
    const markets = {
      BTCUSDT: makeStressMarket('BTCUSDT'),
      ETHUSDT: makeStressMarket('ETHUSDT', { midPrice: 2_500 }),
      SOLUSDT: makeStressMarket('SOLUSDT', { midPrice: 150 }),
      BNBUSDT: makeStressMarket('BNBUSDT', { midPrice: 600 }),
      XRPUSDT: makeStressMarket('XRPUSDT', { midPrice: 1 }),
      ADAUSDT: makeStressMarket('ADAUSDT', { midPrice: 1 }),
      AVAXUSDT: makeStressMarket('AVAXUSDT', { midPrice: 30 }),
    };
    const positions = [
      makeStressPosition('BTCUSDT', 24_000, { betaToBtc: 0.5 }),
      makeStressPosition('ETHUSDT', -24_000, { betaToBtc: 0.5, markPrice: 2_500 }),
      makeStressPosition('SOLUSDT', 24_000, { betaToBtc: 0.5, markPrice: 150 }),
      makeStressPosition('BNBUSDT', -24_000, { betaToBtc: 0.5, markPrice: 600 }),
      makeStressPosition('XRPUSDT', 24_000, { betaToBtc: 0.5, markPrice: 1 }),
      makeStressPosition('ADAUSDT', -24_000, { betaToBtc: 0.5, markPrice: 1 }),
    ]; // Gross = $144,000 = 1.44x

    const ctx = makeStressContext({ positions, markets });
    const pushOver15x = engine.evaluatePreTrade(
      makeStressOrder({ symbol: 'AVAXUSDT', side: 'BUY', price: 29.98, quantity: 300, betaToBtc: 0.1 }), // +$8,994 -> 1.5299x
      ctx,
    );
    expect(pushOver15x.allowed).toBe(false);
    expect(pushOver15x.action).toBe('REJECT_PRETRADE');
    expect(pushOver15x.controlId).toBe(4);

    const reduceLeverage = engine.evaluatePreTrade(
      makeStressOrder({ symbol: 'BTCUSDT', side: 'SELL', price: 100_010, quantity: 0.08, reduceOnly: true }),
      ctx,
    );
    expect(reduceLeverage.allowed).toBe(true);
  });

  it('Control 5: latches EMERGENCY_HALT on -2.5% 24h rolling loss and never auto-resumes on timer alone', () => {
    const engine = new CapitalProtectionEngine();
    const haltDec = engine.evaluateTick(
      makeStressContext({
        equityUsd: 97_400,
        peakEquityUsd: 100_000,
        rolling24hPnlUsd: -2_600,
        rolling24hRefEquityUsd: 100_000,
      }),
    );
    expect(haltDec.allowed).toBe(false);
    expect(haltDec.action).toBe('EMERGENCY_HALT');
    expect(haltDec.posture).toBe('HALT_ONLY');
    expect(haltDec.unwindSlices).toHaveLength(0);
    expect(haltDec.blindMarketLiquidationOrders).toBe(0);

    // Advance clock 48 hours and restore 24h rolling PnL to 0: must STILL remain latched!
    const futureTs = STRESS_BASE_TIMESTAMP_MS + 48 * 3_600_000;
    const stillHalted = engine.evaluatePreTrade(
      makeStressOrder({ timestampMs: futureTs }),
      makeStressContext({
        nowMs: futureTs + 100,
        rolling24hPnlUsd: 0,
        markets: { BTCUSDT: makeStressMarket('BTCUSDT', { timestampMs: futureTs }) },
      }),
    );
    expect(stillHalted.allowed).toBe(false);
    expect(stillHalted.action).toBe('EMERGENCY_HALT');

    expect(engine.acknowledgeEmergencyRecovery('', 'short')).toBe(false);
    expect(engine.acknowledgeEmergencyRecovery('risk-officer', 'ack-token-valid-01')).toBe(true);

    const resumed = engine.evaluatePreTrade(
      makeStressOrder({ timestampMs: futureTs }),
      makeStressContext({
        nowMs: futureTs + 100,
        rolling24hPnlUsd: 0,
        markets: { BTCUSDT: makeStressMarket('BTCUSDT', { timestampMs: futureTs }) },
      }),
    );
    expect(resumed.allowed).toBe(true);
  });

  it('Control 6: two-stage MDD (-8% soft 50%, -12% hard 100%) emits <= 1% participation TWAP slices and falls back to HALT_ONLY on stale/empty book', () => {
    const engine = new CapitalProtectionEngine();
    const softCtx = makeStressContext({
      equityUsd: 91_500, // -8.5% MDD
      peakEquityUsd: 100_000,
      rolling24hPnlUsd: -8_500,
      positions: [makeStressPosition('BTCUSDT', 20_000)],
      markets: { BTCUSDT: makeStressMarket('BTCUSDT', { bookDepthUsd: 500_000, barVolumeUsd: 1_000_000 }) },
    });
    const softDec = engine.evaluateTick(softCtx);
    expect(softDec.action).toBe('CONTROLLED_LIQUIDATION');
    expect(softDec.posture).toBe('REDUCE_ONLY_TWAP');
    expect(softDec.unwindStage).toBe('SOFT_50_PCT');
    expect(softDec.unwindSlices).toHaveLength(1);
    expect(softDec.unwindSlices[0]?.reduceOnly).toBe(true);
    expect(softDec.unwindSlices[0]?.orderType).toBe('LIMIT');
    expect(softDec.unwindSlices[0]?.participationRate).toBeLessThanOrEqual(0.01);
    expect(softDec.unwindSlices[0]?.sliceNotionalUsd).toBe(5_000); // min(10_000 target, 1% * 500_000)

    // Matching reduceOnly passive slice order is permitted; risk-increasing order is blocked
    const sliceOrderAllowed = engine.evaluatePreTrade(
      makeStressOrder({ side: 'SELL', orderType: 'LIMIT', price: 100_000, quantity: 0.04, reduceOnly: true }),
      softCtx,
    );
    expect(sliceOrderAllowed.allowed).toBe(true);
    const riskEntryBlocked = engine.evaluatePreTrade(makeStressOrder({ side: 'BUY', reduceOnly: false }), softCtx);
    expect(riskEntryBlocked.allowed).toBe(false);

    // Hard -12.5% MDD unwinds toward flat (100% target)
    const hardDec = engine.evaluateTick({
      ...softCtx,
      equityUsd: 87_500,
      positions: [makeStressPosition('BTCUSDT', -8_000)],
    });
    expect(hardDec.unwindStage).toBe('HARD_100_PCT');
    expect(hardDec.unwindSlices[0]?.side).toBe('BUY');

    // Evaporated book depth forces HALT_ONLY fallback with 0 slices
    const evaporatedFallback = engine.evaluateTick({
      ...softCtx,
      markets: { BTCUSDT: makeStressMarket('BTCUSDT', { bookDepthUsd: 2_000 }) },
    });
    expect(evaporatedFallback.posture).toBe('HALT_ONLY');
    expect(evaporatedFallback.unwindSlices).toHaveLength(0);
  });

  it('Control 7: bans market & aggressive/out-of-collar limit orders on >= 4 sigma or >= 150 bps shock while allowing passive/reduceOnly limit within collar', () => {
    const engine = new CapitalProtectionEngine();
    const shockMarket = makeStressMarket('BTCUSDT', { barReturnSigma: 4.5, spreadBps: 20 });
    const ctx = makeStressContext({
      positions: [makeStressPosition('BTCUSDT', 10_000)],
      markets: { BTCUSDT: shockMarket },
    });

    const mktRejected = engine.evaluatePreTrade(makeStressOrder({ orderType: 'MARKET', price: 100_000 }), ctx);
    expect(mktRejected.allowed).toBe(false);
    expect(mktRejected.action).toBe('MARKET_ORDER_BAN');
    expect(mktRejected.controlId).toBe(7);

    const crossingLimit = engine.evaluatePreTrade(
      makeStressOrder({ orderType: 'LIMIT', side: 'BUY', price: shockMarket.bestAsk + 10 }),
      ctx,
    );
    expect(crossingLimit.allowed).toBe(false);
    expect(crossingLimit.action).toBe('MARKET_ORDER_BAN');

    const outOfCollarReduce = engine.evaluatePreTrade(
      makeStressOrder({ orderType: 'LIMIT', side: 'SELL', price: 102_000, quantity: 0.02, reduceOnly: true }),
      ctx,
    );
    expect(outOfCollarReduce.allowed).toBe(false);

    const passiveMakerAllowed = engine.evaluatePreTrade(
      makeStressOrder({ orderType: 'LIMIT', side: 'BUY', price: shockMarket.bestBid - 10, quantity: 0.02 }),
      ctx,
    );
    expect(passiveMakerAllowed.allowed).toBe(true);

    const reduceWithinCollarAllowed = engine.evaluatePreTrade(
      makeStressOrder({ orderType: 'LIMIT', side: 'SELL', price: shockMarket.bestBid, quantity: 0.02, reduceOnly: true }),
      ctx,
    );
    expect(reduceWithinCollarAllowed.allowed).toBe(true);
  });

  it('Control 8: enters DEGRADED_HALT on >= 3 consecutive HTTP 429/502/504/timeout strikes and resets on gateway recovery', () => {
    const engine = new CapitalProtectionEngine();
    expect(engine.recordExchangeError(429)).toBe(1);
    expect(engine.recordExchangeError('TIMEOUT')).toBe(2);
    expect(engine.evaluateTick(makeStressContext()).allowed).toBe(true);

    expect(engine.recordExchangeError(504)).toBe(3);
    const halted = engine.evaluatePreTrade(makeStressOrder(), makeStressContext());
    expect(halted.allowed).toBe(false);
    expect(halted.action).toBe('DEGRADED_HALT');
    expect(halted.posture).toBe('HALT_ONLY');
    expect(halted.controlId).toBe(8);

    engine.recordExchangeSuccess();
    expect(engine.getStateSnapshot().consecutiveExchangeErrors).toBe(0);
    expect(engine.evaluatePreTrade(makeStressOrder(), makeStressContext()).allowed).toBe(true);
  });

  it('Control 9: fails closed on market data ageMs > 15,000ms, missing feed, future skew, or out-of-order timestamps', () => {
    const engine = new CapitalProtectionEngine();
    expect(engine.evaluateTick(makeStressContext({ markets: {} })).action).toBe('STALE_DATA_FAIL_CLOSED');

    // Establish monotonic timestamp at T + 1,000
    const t1 = STRESS_BASE_TIMESTAMP_MS + 1_000;
    expect(
      engine.evaluateTick(
        makeStressContext({
          nowMs: t1 + 200,
          markets: { BTCUSDT: makeStressMarket('BTCUSDT', { timestampMs: t1 }) },
        }),
      ).allowed,
    ).toBe(true);

    // Out-of-order timestamp < t1 fails closed
    const outOfOrder = engine.evaluatePreTrade(
      makeStressOrder({ timestampMs: t1 }),
      makeStressContext({
        nowMs: t1 + 300,
        markets: { BTCUSDT: makeStressMarket('BTCUSDT', { timestampMs: t1 - 50 }) },
      }),
    );
    expect(outOfOrder.allowed).toBe(false);
    expect(outOfOrder.action).toBe('STALE_DATA_FAIL_CLOSED');
    expect(outOfOrder.controlId).toBe(9);

    // Stale > 15,000ms & missing snapshot fail closed
    expect(
      evaluateMarketDataFreshness(undefined, t1, undefined, DEFAULT_PROTECTION_CONFIG)?.action,
    ).toBe('STALE_DATA_FAIL_CLOSED');
    const stale = evaluateMarketDataFreshness(
      makeStressMarket('BTCUSDT', { timestampMs: t1 }),
      t1 + 15_001,
      t1,
      DEFAULT_PROTECTION_CONFIG,
    );
    expect(stale?.action).toBe('STALE_DATA_FAIL_CLOSED');
  });

  it('Control 10: quarantines symbol after 3 consecutive > 2.5x slippage anomaly fills', () => {
    const engine = new CapitalProtectionEngine();
    const ctx = makeStressContext({
      markets: {
        BTCUSDT: makeStressMarket('BTCUSDT'),
        ETHUSDT: makeStressMarket('ETHUSDT', { midPrice: 2_500 }),
      },
    });

    engine.recordFillSlippage('BTCUSDT', 5, 14, STRESS_BASE_TIMESTAMP_MS); // > 12.5
    engine.recordFillSlippage('BTCUSDT', 5, 8, STRESS_BASE_TIMESTAMP_MS + 10); // normal -> resets streak!
    engine.recordFillSlippage('BTCUSDT', 5, 15, STRESS_BASE_TIMESTAMP_MS + 20);
    engine.recordFillSlippage('BTCUSDT', 5, 16, STRESS_BASE_TIMESTAMP_MS + 30);
    expect(engine.evaluatePreTrade(makeStressOrder({ symbol: 'BTCUSDT' }), ctx).allowed).toBe(true);

    engine.recordFillSlippage('BTCUSDT', 5, 20, STRESS_BASE_TIMESTAMP_MS + 40); // 3rd consecutive!
    const quarantined = engine.evaluatePreTrade(makeStressOrder({ symbol: 'BTCUSDT' }), ctx);
    expect(quarantined.allowed).toBe(false);
    expect(quarantined.action).toBe('ILLIQUID_QUARANTINE');
    expect(quarantined.controlId).toBe(10);

    // ETHUSDT remains healthy
    const ethAllowed = engine.evaluatePreTrade(
      makeStressOrder({ symbol: 'ETHUSDT', price: 2_498, quantity: 1.0 }),
      ctx,
    );
    expect(ethAllowed.allowed).toBe(true);
  });

  it('Control 11: blocks duplicate and new orders on unreconciled > 5,000ms in-flight or PENDING_INTENT orders', () => {
    const engine = new CapitalProtectionEngine();
    engine.registerPendingIntent({
      intentId: 'ord-inflight-1',
      botId: 'bot-alpha-1',
      symbol: 'BTCUSDT',
      dispatchedAtMs: STRESS_BASE_TIMESTAMP_MS - 5_500,
      status: 'IN_FLIGHT',
    });

    const tickBlocked = engine.evaluateTick(makeStressContext());
    expect(tickBlocked.action).toBe('RECONCILING');
    expect(tickBlocked.controlId).toBe(11);

    const newBlocked = engine.evaluatePreTrade(makeStressOrder({ orderId: 'ord-new-2' }), makeStressContext());
    expect(newBlocked.allowed).toBe(false);
    expect(newBlocked.action).toBe('RECONCILING');

    const dupIdBlocked = engine.evaluatePreTrade(
      makeStressOrder({ orderId: 'ord-inflight-1', botId: 'other-bot' }),
      makeStressContext(),
    );
    expect(dupIdBlocked.action).toBe('RECONCILING');

    expect(engine.reconcilePendingIntent('ord-inflight-1')).toBe(true);
    expect(engine.evaluatePreTrade(makeStressOrder({ orderId: 'ord-new-2' }), makeStressContext()).allowed).toBe(true);
  });

  it('Control 12: checks independent globalKillSwitchActive on line 1, defaulting to HALT_ONLY and falling back from REDUCE_ONLY_TWAP if book/feed unsafe', () => {
    const engine = new CapitalProtectionEngine();
    engine.setGlobalKillSwitch(true);

    const halted = engine.evaluatePreTrade(makeStressOrder(), makeStressContext());
    expect(halted.allowed).toBe(false);
    expect(halted.action).toBe('GLOBAL_KILL_SWITCH');
    expect(halted.posture).toBe('HALT_ONLY');
    expect(halted.controlId).toBe(12);
    expect(halted.unwindSlices).toHaveLength(0);

    // Explicit REDUCE_ONLY_TWAP mode with healthy book emits slices
    engine.setGlobalKillSwitch(true, 'REDUCE_ONLY_TWAP');
    const unwindDec = engine.evaluateTick(
      makeStressContext({ positions: [makeStressPosition('BTCUSDT', 20_000)] }),
    );
    expect(unwindDec.action).toBe('GLOBAL_KILL_SWITCH');
    expect(unwindDec.posture).toBe('REDUCE_ONLY_TWAP');
    expect(unwindDec.unwindSlices.length).toBe(1);

    // Explicit REDUCE_ONLY_TWAP falls back to HALT_ONLY when feed is stale
    const staleFallback = engine.evaluateTick(
      makeStressContext({
        nowMs: STRESS_BASE_TIMESTAMP_MS + 20_000,
        positions: [makeStressPosition('BTCUSDT', 20_000)],
      }),
    );
    expect(staleFallback.posture).toBe('HALT_ONLY');
    expect(staleFallback.unwindSlices).toHaveLength(0);
  });

  it('Control 13: enforces ownerOverride mandatory fields & <= 1h TTL, expires fail-closed, and NEVER bypasses kill-switch, ledger breach, or NaN', () => {
    const nowMs = STRESS_BASE_TIMESTAMP_MS + 500;
    expect(
      validateOwnerOverride(
        { ownerId: '', reason: 'ok', signatureToken: 'sig-12345678', issuedAtMs: nowMs, expiresAtMs: nowMs + 10_000 },
        nowMs,
      ).valid,
    ).toBe(false);
    expect(
      validateOwnerOverride(
        { ownerId: 'ceo', reason: 'test', signatureToken: 'sig-12345678', issuedAtMs: nowMs, expiresAtMs: nowMs + 3_600_001 },
        nowMs,
      ).valid,
    ).toBe(false);

    const engine = new CapitalProtectionEngine();
    // Trigger strategy cooldown operational gate
    engine.recordStrategyOutcome('strat-neutral-1', -5_000, 0.05, STRESS_BASE_TIMESTAMP_MS);

    const validOverride = {
      ownerId: 'founder-op',
      reason: 'Approved manual hedge adjustment',
      signatureToken: 'hmac-sha256-987654321',
      issuedAtMs: nowMs - 100,
      expiresAtMs: nowMs + 60_000,
    };

    const overridden = engine.evaluatePreTrade(
      makeStressOrder(),
      makeStressContext({ nowMs, ownerOverride: validOverride }),
    );
    expect(overridden.allowed).toBe(true);
    expect(overridden.auditOverrideApplied).toBe(true);
    expect(overridden.overrideOwnerId).toBe('founder-op');

    // Tick override test via stored activeOwnerOverride + automatic fail-closed expiration
    engine.setOwnerOverride(validOverride);
    const tickOverridden = engine.evaluateTick(makeStressContext({ nowMs, rolling24hPnlUsd: -3_000 }));
    expect(tickOverridden.allowed).toBe(true);
    expect(tickOverridden.auditOverrideApplied).toBe(true);

    const expiredMs = validOverride.expiresAtMs;
    const expiredDec = engine.evaluatePreTrade(
      makeStressOrder({ timestampMs: expiredMs }),
      makeStressContext({
        nowMs: expiredMs,
        markets: { BTCUSDT: makeStressMarket('BTCUSDT', { timestampMs: expiredMs }) },
        ownerOverride: validOverride,
      }),
    );
    expect(expiredDec.allowed).toBe(false);
    expect(expiredDec.controlId).toBe(13);

    // Stored expired override fails closed against latched emergency halt
    const storedExpired = engine.evaluatePreTrade(
      makeStressOrder({ timestampMs: expiredMs }),
      makeStressContext({
        nowMs: expiredMs,
        markets: { BTCUSDT: makeStressMarket('BTCUSDT', { timestampMs: expiredMs }) },
      }),
    );
    expect(storedExpired.allowed).toBe(false);

    // NEVER bypasses NaN, globalKillSwitchActive, or LEDGER_INVARIANT_BREACH
    expect(
      engine.evaluatePreTrade(
        makeStressOrder({ price: Number.NaN }),
        makeStressContext({ nowMs, ownerOverride: validOverride }),
      ).allowed,
    ).toBe(false);

    engine.setGlobalKillSwitch(true);
    expect(
      engine.evaluatePreTrade(makeStressOrder(), makeStressContext({ nowMs, ownerOverride: validOverride })).action,
    ).toBe('GLOBAL_KILL_SWITCH');

    engine.setGlobalKillSwitch(false);
    const breachedCtx = makeStressContext({
      nowMs,
      ledger: { assetsUsd: 100_000.05, liabilitiesUsd: 20_000, equityUsd: 80_000 },
      ownerOverride: validOverride,
    });
    expect(engine.evaluatePreTrade(makeStressOrder(), breachedCtx).action).toBe('QUARANTINED_SAFE_MODE');
  });

  it('Control 14: boot-time & tick-level double-entry accounting check halts irrevocably on > $0.01 (10,000 micro-USD) mismatch until reconciled', () => {
    // Exact $0.01 boundary passes without IEEE-754 float false positives
    expect(
      evaluateLedgerAccounting({ assetsUsd: 100_000.01, liabilitiesUsd: 20_000, equityUsd: 80_000 }).ok,
    ).toBe(true);
    expect(
      evaluateLedgerAccounting({ assetsMicroUsd: 100_010_001, liabilitiesMicroUsd: 0, equityMicroUsd: 100_000_000 }).ok,
    ).toBe(false);
    expect(evaluateLedgerAccounting({ assetsUsd: Number.NaN, liabilitiesUsd: 0, equityUsd: 0 }).ok).toBe(false);

    const bootBreached = new CapitalProtectionEngine(
      {},
      { assetsUsd: 50_000.02, liabilitiesUsd: 10_000, equityUsd: 40_000 },
    );
    expect(bootBreached.getStateSnapshot().quarantinedSafeMode).toBe(true);
    expect(bootBreached.evaluateTick(makeStressContext()).action).toBe('QUARANTINED_SAFE_MODE');
    expect(
      bootBreached.evaluatePreTrade(makeStressOrder({ reduceOnly: true }), makeStressContext()).allowed,
    ).toBe(false);

    // Failed reconciliation keeps engine quarantined
    expect(bootBreached.reconcileLedger({ assetsUsd: 50_000.05, liabilitiesUsd: 10_000, equityUsd: 40_000 })).toBe(false);
    expect(bootBreached.getStateSnapshot().quarantinedSafeMode).toBe(true);

    // Clean reconciliation restores operations
    expect(bootBreached.reconcileLedger({ assetsUsd: 50_000, liabilitiesUsd: 10_000, equityUsd: 40_000 })).toBe(true);
    expect(bootBreached.evaluatePreTrade(makeStressOrder(), makeStressContext()).allowed).toBe(true);
  });

  it('covers TWAP edge guards, venue dislocation, and collateral peg helper branches', () => {
    expect(isBookSafeForTwap(undefined, STRESS_BASE_TIMESTAMP_MS, undefined, DEFAULT_PROTECTION_CONFIG).ok).toBe(false);
    expect(
      isBookSafeForTwap(
        makeStressMarket('BTCUSDT', { spreadBps: 400 }),
        STRESS_BASE_TIMESTAMP_MS + 100,
        undefined,
        DEFAULT_PROTECTION_CONFIG,
      ).ok,
    ).toBe(false);

    const noPosPlan = buildReduceOnlyTwapPlan([], {}, {}, 0.5, 'SOFT_50_PCT', STRESS_BASE_TIMESTAMP_MS, DEFAULT_PROTECTION_CONFIG);
    expect(noPosPlan.posture).toBe('HALT_ONLY');

    const tinyBarPlan = buildReduceOnlyTwapPlan(
      [makeStressPosition('BTCUSDT', 5_000)],
      { BTCUSDT: makeStressMarket('BTCUSDT', { bookDepthUsd: 20_000, barVolumeUsd: 500 }) }, // 1% of 500 = $5 < $25 minSliceNotionalUsd
      {},
      0.5,
      'SOFT_50_PCT',
      STRESS_BASE_TIMESTAMP_MS + 100,
      DEFAULT_PROTECTION_CONFIG,
    );
    expect(tinyBarPlan.safeToUnwind).toBe(false);
    expect(tinyBarPlan.posture).toBe('HALT_ONLY');

    expect(
      evaluateVenueDislocation([{ symbol: 'BTCUSDT', venueA: 'a', venueAPrice: -1, venueB: 'b', venueBPrice: 100 }]).breached,
    ).toBe(true);
    expect(
      evaluateVenueDislocation([{ symbol: 'BTCUSDT', venueA: 'a', venueAPrice: 100_000, venueB: 'b', venueBPrice: 100_050 }]).breached,
    ).toBe(false);

    expect(evaluateCollateralPeg([{ asset: 'USDC', priceUsd: 0, nominalAmount: 100 }]).depegged).toBe(true);
    expect(evaluateCollateralPeg([{ asset: 'USDC', priceUsd: 1.001, nominalAmount: 1_000 }]).depegged).toBe(false);

    // Non-finite micro-USD ledger branch & tick-level invalid ownerOverride rejection
    expect(evaluateLedgerAccounting({ assetsMicroUsd: Number.NaN, liabilitiesMicroUsd: 0, equityMicroUsd: 0 }).ok).toBe(false);
    const engine = new CapitalProtectionEngine();
    expect(
      engine.evaluateTick(
        makeStressContext({
          ownerOverride: {
            ownerId: '',
            reason: 'invalid',
            signatureToken: 'short',
            issuedAtMs: STRESS_BASE_TIMESTAMP_MS,
            expiresAtMs: STRESS_BASE_TIMESTAMP_MS + 1_000,
          },
        }),
      ).controlId,
    ).toBe(13);

    // Strategy win after prior cooldown preserves cooldown window; fresh IN_FLIGHT < 5s does not block tick
    engine.recordStrategyOutcome('s-win', -500, 0.05, STRESS_BASE_TIMESTAMP_MS);
    engine.recordStrategyOutcome('s-win', 200, 0.01, STRESS_BASE_TIMESTAMP_MS + 100);
    engine.registerPendingIntent({
      intentId: 'fresh-inflight',
      botId: 'bot-fresh',
      symbol: 'ETHUSDT',
      dispatchedAtMs: STRESS_BASE_TIMESTAMP_MS + 200,
      status: 'IN_FLIGHT',
    });
    expect(
      engine.evaluateTick(
        makeStressContext({
          positions: [
            makeStressPosition('BTCUSDT', 0),
            makeStressPosition('ETHUSDT', 15_000, { markPrice: 2_500 }),
          ],
          markets: {
            BTCUSDT: makeStressMarket('BTCUSDT'),
            ETHUSDT: makeStressMarket('ETHUSDT', { midPrice: 2_500 }),
          },
        }),
      ).allowed,
    ).toBe(true);

    // Default beta fallback on BTC & non-BTC orders + zero bestBid fallback on short TWAP slice
    expect(
      engine.evaluatePreTrade(
        makeStressOrder({ symbol: 'BTCUSDT', price: 99_950, quantity: 0.02, betaToBtc: undefined }),
        makeStressContext(),
      ).allowed,
    ).toBe(true);
    expect(
      engine.evaluatePreTrade(
        makeStressOrder({ symbol: 'ETHUSDT', price: 2_499, quantity: 0.5, betaToBtc: undefined }),
        makeStressContext({ markets: { BTCUSDT: makeStressMarket('BTCUSDT'), ETHUSDT: makeStressMarket('ETHUSDT', { midPrice: 2_500 }) } }),
      ).allowed,
    ).toBe(true);
    const zeroBidShortPlan = buildReduceOnlyTwapPlan(
      [makeStressPosition('BTCUSDT', -5_000)],
      { BTCUSDT: makeStressMarket('BTCUSDT', { bestBid: 0 }) },
      {},
      0.5,
      'SOFT_50_PCT',
      STRESS_BASE_TIMESTAMP_MS + 100,
      DEFAULT_PROTECTION_CONFIG,
    );
    expect(zeroBidShortPlan.safeToUnwind).toBe(true);
    expect(zeroBidShortPlan.slices[0]?.limitPrice).toBe(100_000);
    const subMinSlice = buildReduceOnlyTwapPlan(
      [makeStressPosition('BTCUSDT', 40)],
      { BTCUSDT: makeStressMarket('BTCUSDT') },
      {},
      0.5, // $20 < $25 minSliceNotionalUsd
      'SOFT_50_PCT',
      STRESS_BASE_TIMESTAMP_MS + 100,
      DEFAULT_PROTECTION_CONFIG,
    );
    expect(subMinSlice.safeToUnwind).toBe(false);
  });
});
