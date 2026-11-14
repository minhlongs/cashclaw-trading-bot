import { describe, it, expect } from 'vitest';
import {
  BASE_UNITS_PER_ASSET,
  MICRO_USD_PER_USD,
  MicroDoubleEntryLedger,
  ZERO_BIGINT,
} from '@/tree/ledger';
import {
  PaperOrderLifecycleEngine,
  computeProportionalMarginRelease,
  isAdversePriceMoveExceeded,
} from '@/tree/execution/lifecycle';

const ONE_BTC = BASE_UNITS_PER_ASSET;
const HALF_BTC = BASE_UNITS_PER_ASSET / BigInt(2);
const USD = (n: number): bigint => BigInt(n) * MICRO_USD_PER_USD;

function createFundedEngine(capitalUsd = 200_000, defaultMarginRateBps = BigInt(10_000)) {
  const engine = new PaperOrderLifecycleEngine({
    botId: 'g9-bot',
    defaultMarginRateBps,
    defaultReconcileWindowMs: 5_000,
    defaultCancelUncertaintyMs: 2_000,
  });
  const dep = engine.getLedger().depositCapital('init_cap', USD(capitalUsd), 1_000);
  expect(dep.ok).toBe(true);
  return engine;
}

describe('Gate G9 — Paper Order Lifecycle Integrity & State Machine Invariants', () => {
  it('enforces mandatory idempotencyKey: deduplicates identical retries and rejects mutated payloads', () => {
    const engine = createFundedEngine(100_000);

    const invalid = engine.submitOrder({
      idempotencyKey: '   ',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      quantityBase: ONE_BTC,
      priceMicroUsd: USD(50_000),
      nowMs: 1_100,
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error).toContain('INVALID_ORDER_PARAMS');

    const first = engine.submitOrder({
      idempotencyKey: 'cid-alpha-1',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      quantityBase: ONE_BTC,
      priceMicroUsd: USD(50_000),
      nowMs: 1_200,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.deduplicated).toBe(false);
    expect(engine.getLedger().getAccountBalances().MARGIN_RESERVED).toBe(USD(50_000));

    // Exact duplicate retry: returns existing order without second order or double reservation
    const retryIdentical = engine.submitOrder({
      idempotencyKey: 'cid-alpha-1',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      quantityBase: ONE_BTC,
      priceMicroUsd: USD(50_000),
      nowMs: 1_250,
    });
    expect(retryIdentical.ok).toBe(true);
    if (retryIdentical.ok) {
      expect(retryIdentical.data.deduplicated).toBe(true);
      expect(retryIdentical.data.order.clientOrderId).toBe('cid-alpha-1');
    }
    expect(engine.getAllOrders()).toHaveLength(1);
    expect(engine.getLedger().getAccountBalances().MARGIN_RESERVED).toBe(USD(50_000));

    // Mutated payload (quantity, price, side, or symbol) fails closed with IDEMPOTENCY_PAYLOAD_MISMATCH
    for (const mutated of [
      { priceMicroUsd: USD(49_500) },
      { quantityBase: ONE_BTC * BigInt(2) },
      { side: 'sell' as const },
      { symbol: 'ETH/USDT' },
    ]) {
      const mismatch = engine.submitOrder({
        idempotencyKey: 'cid-alpha-1',
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        quantityBase: ONE_BTC,
        priceMicroUsd: USD(50_000),
        nowMs: 1_300,
        ...mutated,
      });
      expect(mismatch.ok).toBe(false);
      if (!mismatch.ok) expect(mismatch.error).toContain('IDEMPOTENCY_PAYLOAD_MISMATCH');
    }
    expect(engine.getLedger().getBalanceSheet().discrepancyMicroUsd).toBe(ZERO_BIGINT);
  });

  it('preserves exact margin reservation across partial fills and cancel/expire/reject (never subtracting full quantity on cancel)', () => {
    // 10% initial margin (10x leverage -> 1_000 bps)
    const engine = createFundedEngine(100_000, BigInt(1_000));

    //Insufficient margin fails closed
    const tooLarge = engine.submitOrder({
      idempotencyKey: 'cid-huge',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      quantityBase: ONE_BTC * BigInt(30), // $1.5M notional -> $150k margin > $100k cash
      priceMicroUsd: USD(50_000),
      nowMs: 1_100,
    });
    expect(tooLarge.ok).toBe(false);
    if (!tooLarge.ok) expect(tooLarge.error).toContain('INSUFFICIENT_FREE_MARGIN');

    // Place 10 BTC limit buy @ $50,000 -> reserves $50,000 margin ($5,000 per BTC)
    const placed = engine.submitOrder({
      idempotencyKey: 'cid-partial-cancel',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      quantityBase: ONE_BTC * BigInt(10),
      priceMicroUsd: USD(50_000),
      nowMs: 1_200,
    });
    expect(placed.ok).toBe(true);
    expect(engine.getLedger().getAccountBalances().MARGIN_RESERVED).toBe(USD(50_000));
    expect(engine.getLedger().getAccountBalances().CASH_AVAILABLE).toBe(USD(50_000));

    // Partial fill 1: 4 BTC @ $50,000 -> releases $20,000 from reservation into POSITION_MARGIN
    const fill1 = engine.applyFillEvent({
      fillEventId: 'f-1',
      clientOrderId: 'cid-partial-cancel',
      seq: 1,
      fillQtyBase: ONE_BTC * BigInt(4),
      fillPriceMicroUsd: USD(50_000),
      feeMicroUsd: USD(20),
      timestampMs: 1_300,
    });
    expect(fill1.ok).toBe(true);

    // Partial fill 2: 2 BTC @ $50,000 -> total 6/10 filled; remaining 4/10 ($20,000) still reserved
    const fill2 = engine.applyFillEvent({
      fillEventId: 'f-2',
      clientOrderId: 'cid-partial-cancel',
      seq: 2,
      fillQtyBase: ONE_BTC * BigInt(2),
      fillPriceMicroUsd: USD(50_000),
      feeMicroUsd: USD(10),
      timestampMs: 1_400,
    });
    expect(fill2.ok).toBe(true);
    expect(engine.getLedger().getAccountBalances().MARGIN_RESERVED).toBe(USD(20_000));
    expect(engine.getLedger().getAccountBalances().POSITION_MARGIN).toBe(USD(30_000));

    // Cancel remaining 4/10 -> MUST release ONLY $20,000 (NOT $50,000!)
    const cancelled = engine.cancelOrder('cid-partial-cancel', 1_500);
    expect(cancelled.ok).toBe(true);
    if (cancelled.ok) {
      expect(cancelled.data.state).toBe('cancelled');
      expect(cancelled.data.filledQtyBase).toBe(ONE_BTC * BigInt(6));
      expect(cancelled.data.remainingQtyBase).toBe(ONE_BTC * BigInt(4));
      expect(cancelled.data.reservedMicroUsd).toBe(ZERO_BIGINT);
    }

    // Second cancel is idempotent (0 extra release)
    const cancelAgain = engine.cancelOrder('cid-partial-cancel', 1_550);
    expect(cancelAgain.ok).toBe(true);

    const bals = engine.getLedger().getAccountBalances();
    expect(bals.MARGIN_RESERVED).toBe(ZERO_BIGINT);
    expect(bals.POSITION_MARGIN).toBe(USD(30_000));
    expect(bals.CASH_AVAILABLE).toBe(USD(70_000) - USD(30)); // $100k - $30k pos margin - $30 fees
    expect(engine.getLedger().getBalanceSheet().discrepancyMicroUsd).toBe(ZERO_BIGINT);

    // Also verify expireOrder and rejectOrder release exact remaining margin on prime-split 3-satoshi order
    const oddOrder = engine.submitOrder({
      idempotencyKey: 'cid-prime-3',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      quantityBase: BigInt(3),
      priceMicroUsd: BigInt(100_000_000) * BigInt(1000), // 100 micro-USD margin per satoshi at 10%
      nowMs: 1_600,
    });
    expect(oddOrder.ok).toBe(true);
    const oddFill = engine.applyFillEvent({
      fillEventId: 'f-odd-1',
      clientOrderId: 'cid-prime-3',
      seq: 1,
      fillQtyBase: BigInt(1),
      fillPriceMicroUsd: BigInt(100_000_000) * BigInt(1000),
      timestampMs: 1_650,
    });
    expect(oddFill.ok).toBe(true);
    const expired = engine.expireOrder('cid-prime-3', 1_700);
    expect(expired.ok).toBe(true);
    expect(engine.getLedger().getAccountBalances().MARGIN_RESERVED).toBe(ZERO_BIGINT);

    const toReject = engine.submitOrder({
      idempotencyKey: 'cid-reject',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      quantityBase: ONE_BTC,
      priceMicroUsd: USD(10_000),
      nowMs: 1_750,
    });
    expect(toReject.ok).toBe(true);
    const rejected = engine.rejectOrder('cid-reject', 1_800);
    expect(rejected.ok).toBe(true);
    expect(engine.getLedger().getAccountBalances().MARGIN_RESERVED).toBe(ZERO_BIGINT);
    expect(engine.getLedger().getBalanceSheet().discrepancyMicroUsd).toBe(ZERO_BIGINT);
  });

  it('enforces reduceOnly strictly: rejects flat or same-side, clips oversized opposite-side without sign flip', () => {
    const engine = createFundedEngine(200_000, BigInt(2_000));

    // 1. Flat position -> REDUCE_ONLY_REJECTED
    const flatRo = engine.submitOrder({
      idempotencyKey: 'ro-flat',
      symbol: 'BTC/USDT',
      side: 'sell',
      type: 'market',
      quantityBase: ONE_BTC,
      priceMicroUsd: USD(50_000),
      reduceOnly: true,
      nowMs: 2_000,
    });
    expect(flatRo.ok).toBe(false);
    if (!flatRo.ok) expect(flatRo.error).toContain('REDUCE_ONLY_REJECTED');

    // Open 2 BTC LONG
    const openLong = engine.submitOrder({
      idempotencyKey: 'open-long-2',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'market',
      quantityBase: ONE_BTC * BigInt(2),
      priceMicroUsd: USD(50_000),
      nowMs: 2_100,
    });
    expect(openLong.ok).toBe(true);
    expect(
      engine.applyFillEvent({
        fillEventId: 'fill-long-2',
        clientOrderId: 'open-long-2',
        seq: 1,
        fillQtyBase: ONE_BTC * BigInt(2),
        fillPriceMicroUsd: USD(50_000),
        timestampMs: 2_110,
      }).ok,
    ).toBe(true);
    expect(engine.getLedger().getPosition('BTC/USDT').signedQtyBase).toBe(ONE_BTC * BigInt(2));

    // 2. Same-side BUY reduceOnly while LONG -> REDUCE_ONLY_REJECTED
    const sameSideRo = engine.submitOrder({
      idempotencyKey: 'ro-sameside',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      quantityBase: HALF_BTC,
      priceMicroUsd: USD(49_000),
      reduceOnly: true,
      nowMs: 2_200,
    });
    expect(sameSideRo.ok).toBe(false);
    if (!sameSideRo.ok) expect(sameSideRo.error).toContain('REDUCE_ONLY_REJECTED');

    // 3. Oversized SELL reduceOnly for 5 BTC against 2 BTC LONG -> clips deterministically to 2 BTC!
    const oversizedRo = engine.submitOrder({
      idempotencyKey: 'ro-clip-5-to-2',
      symbol: 'BTC/USDT',
      side: 'sell',
      type: 'limit',
      quantityBase: ONE_BTC * BigInt(5),
      priceMicroUsd: USD(51_000),
      reduceOnly: true,
      nowMs: 2_300,
    });
    expect(oversizedRo.ok).toBe(true);
    if (!oversizedRo.ok) return;
    expect(oversizedRo.data.order.clippedByReduceOnly).toBe(true);
    expect(oversizedRo.data.order.effectiveQtyBase).toBe(ONE_BTC * BigInt(2));

    // Additional reduceOnly while open reduceOnly already covers 2 BTC -> REDUCE_ONLY_REJECTED
    const exhaustedRo = engine.submitOrder({
      idempotencyKey: 'ro-exhausted',
      symbol: 'BTC/USDT',
      side: 'sell',
      type: 'limit',
      quantityBase: HALF_BTC,
      priceMicroUsd: USD(52_000),
      reduceOnly: true,
      nowMs: 2_350,
    });
    expect(exhaustedRo.ok).toBe(false);
    if (!exhaustedRo.ok) expect(exhaustedRo.error).toContain('REDUCE_ONLY_REJECTED');

    // Fill the clipped 2 BTC reduceOnly -> closes LONG to exact 0 (never flipping SHORT!)
    const closeFill = engine.applyFillEvent({
      fillEventId: 'fill-ro-close',
      clientOrderId: 'ro-clip-5-to-2',
      seq: 1,
      fillQtyBase: ONE_BTC * BigInt(2),
      fillPriceMicroUsd: USD(51_000),
      timestampMs: 2_400,
    });
    expect(closeFill.ok).toBe(true);
    expect(engine.getLedger().getPosition('BTC/USDT').signedQtyBase).toBe(ZERO_BIGINT);
    expect(engine.getLedger().getAccountBalances().POSITION_MARGIN).toBe(ZERO_BIGINT);
    expect(engine.getLedger().getAccountBalances().REALIZED_PNL).toBe(USD(2_000));
    expect(engine.getLedger().getBalanceSheet().discrepancyMicroUsd).toBe(ZERO_BIGINT);
  });

  it('reconciles duplicate fillEventIds, out-of-order seq deliveries, overfill guard, terminal non-regression, and uncertainty-window cancel late fills', () => {
    const engine = createFundedEngine(200_000, BigInt(2_000));

    engine.submitOrder({
      idempotencyKey: 'cid-ooo',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      quantityBase: ONE_BTC,
      priceMicroUsd: USD(50_000),
      nowMs: 3_000,
    });

    // Out-of-order: seq=2 (0.4 BTC) arrives BEFORE seq=1 (0.6 BTC)
    const seq2 = engine.applyFillEvent({
      fillEventId: 'ev-seq-2',
      clientOrderId: 'cid-ooo',
      seq: 2,
      fillQtyBase: BigInt(40_000_000),
      fillPriceMicroUsd: USD(50_000),
      feeMicroUsd: USD(4),
      timestampMs: 3_100,
    });
    expect(seq2.ok).toBe(true);
    expect(engine.getOrder('cid-ooo')?.state).toBe('partially_filled');

    // Duplicate delivery of ev-seq-2 -> ignored idempotently (0 double-fill, 0 extra fee)
    const dupSeq2 = engine.applyFillEvent({
      fillEventId: 'ev-seq-2',
      clientOrderId: 'cid-ooo',
      seq: 2,
      fillQtyBase: BigInt(40_000_000),
      fillPriceMicroUsd: USD(50_000),
      feeMicroUsd: USD(4),
      timestampMs: 3_120,
    });
    expect(dupSeq2.ok).toBe(true);
    if (dupSeq2.ok) expect(dupSeq2.data.duplicateIgnored).toBe(true);
    expect(engine.getOrder('cid-ooo')?.filledQtyBase).toBe(BigInt(40_000_000));
    expect(engine.getLedger().getAccountBalances().FEES_EXPENSE).toBe(USD(4));

    // Overfill attempt (0.7 BTC when only 0.6 BTC remains) -> OVERFILL_GUARD
    const overfill = engine.applyFillEvent({
      fillEventId: 'ev-overfill',
      clientOrderId: 'cid-ooo',
      seq: 3,
      fillQtyBase: BigInt(70_000_000),
      fillPriceMicroUsd: USD(50_000),
      timestampMs: 3_150,
    });
    expect(overfill.ok).toBe(false);
    if (!overfill.ok) expect(overfill.error).toContain('OVERFILL_GUARD');

    // Out-of-order status notification: 'open' arriving after partial fill must NOT regress state
    const staleOpen = engine.applyOrderStatusEvent({
      clientOrderId: 'cid-ooo',
      status: 'open',
      seq: 1,
      timestampMs: 3_160,
    });
    expect(staleOpen.ok).toBe(true);
    if (staleOpen.ok) expect(staleOpen.data.state).toBe('partially_filled');

    // Now seq=1 (0.6 BTC) arrives late -> completes 1.0 BTC -> transitions to 'filled'
    const seq1 = engine.applyFillEvent({
      fillEventId: 'ev-seq-1',
      clientOrderId: 'cid-ooo',
      seq: 1,
      fillQtyBase: BigInt(60_000_000),
      fillPriceMicroUsd: USD(50_000),
      feeMicroUsd: USD(6),
      timestampMs: 3_200,
    });
    expect(seq1.ok).toBe(true);
    expect(engine.getOrder('cid-ooo')?.state).toBe('filled');
    expect(engine.getOrder('cid-ooo')?.reservedMicroUsd).toBe(ZERO_BIGINT);

    // Late 'partially_filled' status event arriving AFTER terminal 'filled' NEVER regresses
    const latePartialStatus = engine.applyOrderStatusEvent({
      clientOrderId: 'cid-ooo',
      status: 'partially_filled',
      seq: 5,
      timestampMs: 3_300,
    });
    expect(latePartialStatus.ok).toBe(true);
    if (latePartialStatus.ok) expect(latePartialStatus.data.state).toBe('filled');

    // Uncertainty-window cancel + late fill reconciliation:
    engine.submitOrder({
      idempotencyKey: 'cid-cancel-race',
      symbol: 'ETH/USDT',
      side: 'buy',
      type: 'limit',
      quantityBase: ONE_BTC,
      priceMicroUsd: USD(3_000),
      nowMs: 4_000,
    });
    const cancelRace = engine.cancelOrder('cid-cancel-race', 4_100, 1_000);
    expect(cancelRace.ok).toBe(true);

    // Venue matched 0.25 ETH during network flight at t=4_250 (inside 1_000ms uncertainty window)
    const lateFillInWindow = engine.applyFillEvent({
      fillEventId: 'ev-late-cancel-fill',
      clientOrderId: 'cid-cancel-race',
      seq: 1,
      fillQtyBase: BigInt(25_000_000),
      fillPriceMicroUsd: USD(3_000),
      feeMicroUsd: USD(1),
      timestampMs: 4_250,
    });
    expect(lateFillInWindow.ok).toBe(true);
    if (lateFillInWindow.ok) {
      expect(lateFillInWindow.data.lateCancelReconciled).toBe(true);
      // Terminal 'cancelled' never regresses to 'partially_filled'
      expect(lateFillInWindow.data.order.state).toBe('cancelled');
      expect(lateFillInWindow.data.order.filledQtyBase).toBe(BigInt(25_000_000));
    }

    // Fill outside uncertainty window (t=6_000 > 5_100) is rejected
    const outsideWindow = engine.applyFillEvent({
      fillEventId: 'ev-too-late',
      clientOrderId: 'cid-cancel-race',
      seq: 2,
      fillQtyBase: BigInt(25_000_000),
      fillPriceMicroUsd: USD(3_000),
      timestampMs: 6_000,
    });
    expect(outsideWindow.ok).toBe(false);
    if (!outsideWindow.ok) expect(outsideWindow.error).toContain('TERMINAL_ORDER_IMMUTABLE');
    expect(engine.getLedger().getBalanceSheet().discrepancyMicroUsd).toBe(ZERO_BIGINT);
  });

  it('handles network drop / gateway timeout (PENDING_ACK -> RECONCILING), blocks blind retries, and reconciles against venue snapshot', () => {
    const engine = createFundedEngine(100_000, BigInt(2_000));

    // Order A: enters PENDING_ACK then markGatewayTimeout -> RECONCILING
    const subA = engine.submitOrder({
      idempotencyKey: 'cid-net-seen',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      quantityBase: ONE_BTC,
      priceMicroUsd: USD(50_000),
      enterPendingAckOnly: true,
      reconcileSafetyWindowMs: 5_000,
      nowMs: 10_000,
    });
    expect(subA.ok).toBe(true);
    expect(engine.getOrder('cid-net-seen')?.state).toBe('PENDING_ACK');
    const timeoutA = engine.markGatewayTimeout('cid-net-seen', 10_200, 5_000);
    expect(timeoutA.ok).toBe(true);
    expect(engine.getOrder('cid-net-seen')?.state).toBe('RECONCILING');

    // Order B: hits gateway timeout immediately -> RECONCILING (venue never received it)
    const subB = engine.submitOrder({
      idempotencyKey: 'cid-net-lost',
      symbol: 'ETH/USDT',
      side: 'buy',
      type: 'limit',
      quantityBase: ONE_BTC,
      priceMicroUsd: USD(4_000),
      simulateGatewayTimeout: true,
      reconcileSafetyWindowMs: 5_000,
      nowMs: 10_200,
    });
    expect(subB.ok).toBe(true);
    expect(engine.getOrder('cid-net-lost')?.state).toBe('RECONCILING');

    // Blind retry with same idempotencyKey OR replacement order while RECONCILING -> RECONCILIATION_REQUIRED
    const blindRetrySameKey = engine.submitOrder({
      idempotencyKey: 'cid-net-seen',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      quantityBase: ONE_BTC,
      priceMicroUsd: USD(50_000),
      nowMs: 11_000,
    });
    expect(blindRetrySameKey.ok).toBe(false);
    if (!blindRetrySameKey.ok) expect(blindRetrySameKey.error).toContain('RECONCILIATION_REQUIRED');

    const blindRetryReplacement = engine.submitOrder({
      idempotencyKey: 'cid-net-seen-retry-2',
      replacesClientOrderId: 'cid-net-seen',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      quantityBase: ONE_BTC,
      priceMicroUsd: USD(50_000),
      nowMs: 11_000,
    });
    expect(blindRetryReplacement.ok).toBe(false);
    if (!blindRetryReplacement.ok) expect(blindRetryReplacement.error).toContain('RECONCILIATION_REQUIRED');

    // Snapshot 1 at t=12_000 (before safety window 15_200): venue saw cid-net-seen (0.5 BTC filled), cid-net-lost absent
    const snap1 = engine.reconcileWithVenueSnapshot(
      [
        {
          clientOrderId: 'cid-net-seen',
          status: 'partially_filled',
          filledQtyBase: HALF_BTC,
          avgFillPriceMicroUsd: USD(50_000),
          feeMicroUsd: USD(5),
        },
      ],
      12_000,
    );
    expect(snap1.ok).toBe(true);
    if (snap1.ok) {
      expect(snap1.data.stillReconcilingOrderIds).toEqual(['cid-net-lost']);
      expect(snap1.data.expiredAbsentOrderIds).toEqual([]);
    }
    expect(engine.getOrder('cid-net-seen')?.state).toBe('partially_filled');
    expect(engine.getOrder('cid-net-lost')?.state).toBe('RECONCILING');

    // Snapshot 2 at t=16_000 (after safety window): cid-net-lost still absent -> marked 'expired' & margin released!
    const snap2 = engine.reconcileWithVenueSnapshot([], 16_000);
    expect(snap2.ok).toBe(true);
    if (snap2.ok) {
      expect(snap2.data.expiredAbsentOrderIds).toEqual(['cid-net-lost']);
    }
    expect(engine.getOrder('cid-net-lost')?.state).toBe('expired');
    expect(engine.getOrder('cid-net-lost')?.reservedMicroUsd).toBe(ZERO_BIGINT);
    expect(engine.getLedger().getAccountBalances().MARGIN_RESERVED).toBe(USD(5_000)); // only remaining 0.5 BTC of cid-net-seen
    expect(engine.getLedger().getBalanceSheet().discrepancyMicroUsd).toBe(ZERO_BIGINT);
  });

  it('guards paired-leg execution (Spot-Perp / Basis): emits reduceOnly unwind on legB reject or >3000ms timeout and suspends on >5% adverse move', () => {
    const engine = createFundedEngine(200_000, BigInt(2_000));

    // Pair 1: legA fills, legB stays open -> active at 2_500ms, unwind at 3_001ms, suspended on >5% drop
    engine.submitOrder({
      idempotencyKey: 'basis-1-legA',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'market',
      quantityBase: ONE_BTC,
      priceMicroUsd: USD(50_000),
      nowMs: 20_000,
    });
    engine.submitOrder({
      idempotencyKey: 'basis-1-legB',
      symbol: 'BTC-PERP/USDT',
      side: 'sell',
      type: 'limit',
      quantityBase: ONE_BTC,
      priceMicroUsd: USD(50_200),
      nowMs: 20_000,
    });
    engine.registerPairedLegs({
      pairId: 'pair-basis-1',
      symbol: 'BTC/USDT',
      legAClientOrderId: 'basis-1-legA',
      legBClientOrderId: 'basis-1-legB',
    });

    engine.applyFillEvent({
      fillEventId: 'fill-b1-legA',
      clientOrderId: 'basis-1-legA',
      seq: 1,
      fillQtyBase: ONE_BTC,
      fillPriceMicroUsd: USD(50_000),
      timestampMs: 20_100,
    });

    // Within 3_000ms window (elapsed = 2_500ms) and small price move (-1%) -> stays ACTIVE
    const checkEarly = engine.evaluatePairedLegs('pair-basis-1', USD(49_500), 22_600);
    expect(checkEarly.ok).toBe(true);
    if (checkEarly.ok) {
      expect(checkEarly.data.state).toBe('ACTIVE');
      expect(checkEarly.data.unwindIntent).toBeUndefined();
    }

    // At elapsed = 3_001ms (> 3_000ms) with -2% move -> emits deterministic reduceOnly unwind intent
    const checkTimeout = engine.evaluatePairedLegs('pair-basis-1', USD(49_000), 23_101);
    expect(checkTimeout.ok).toBe(true);
    if (checkTimeout.ok) {
      expect(checkTimeout.data.state).toBe('UNWINDING_BROKEN_LEG');
      expect(checkTimeout.data.unwindIntent).toEqual({
        unwindClientOrderId: 'unwind_pair-basis-1_basis-1-legA',
        pairId: 'pair-basis-1',
        brokenLegOrderId: 'basis-1-legA',
        symbol: 'BTC/USDT',
        side: 'sell',
        type: 'market',
        quantityBase: ONE_BTC,
        reduceOnly: true,
        reason: 'legB_unfilled_exceeded_3000ms',
      });
    }

    // Adverse price move > 5% ($50,000 -> $47,000 = -6%) -> SUSPENDED_BROKEN_LEG
    const checkAdverse = engine.evaluatePairedLegs('pair-basis-1', USD(47_000), 23_200);
    expect(checkAdverse.ok).toBe(true);
    if (checkAdverse.ok) {
      expect(checkAdverse.data.state).toBe('SUSPENDED_BROKEN_LEG');
      expect(checkAdverse.data.adverseMoveExceeded).toBe(true);
      expect(checkAdverse.data.unwindIntent?.reduceOnly).toBe(true);
    }

    // Pair 2: legA fills, legB rejects immediately -> immediate unwind intent even at elapsed = 50ms!
    engine.submitOrder({
      idempotencyKey: 'basis-2-legA',
      symbol: 'ETH/USDT',
      side: 'sell',
      type: 'market',
      quantityBase: ONE_BTC,
      priceMicroUsd: USD(3_000),
      nowMs: 30_000,
    });
    engine.submitOrder({
      idempotencyKey: 'basis-2-legB',
      symbol: 'ETH-PERP/USDT',
      side: 'buy',
      type: 'limit',
      quantityBase: ONE_BTC,
      priceMicroUsd: USD(2_990),
      nowMs: 30_000,
    });
    engine.registerPairedLegs({
      pairId: 'pair-basis-2',
      symbol: 'ETH/USDT',
      legAClientOrderId: 'basis-2-legA',
      legBClientOrderId: 'basis-2-legB',
    });
    engine.applyFillEvent({
      fillEventId: 'fill-b2-legA',
      clientOrderId: 'basis-2-legA',
      seq: 1,
      fillQtyBase: ONE_BTC,
      fillPriceMicroUsd: USD(3_000),
      timestampMs: 30_010,
    });
    engine.rejectOrder('basis-2-legB', 30_020);

    const checkRejected = engine.evaluatePairedLegs('pair-basis-2', USD(3_200), 30_050); // +6.67% adverse against short
    expect(checkRejected.ok).toBe(true);
    if (checkRejected.ok) {
      expect(checkRejected.data.state).toBe('SUSPENDED_BROKEN_LEG');
      expect(checkRejected.data.unwindIntent?.side).toBe('buy');
      expect(checkRejected.data.unwindIntent?.reduceOnly).toBe(true);
      expect(checkRejected.data.unwindIntent?.reason).toBe('legB_rejected');
    }

    // Pair 3: both legs fill cleanly -> HEDGED
    engine.submitOrder({
      idempotencyKey: 'basis-3-legA',
      symbol: 'SOL/USDT',
      side: 'buy',
      type: 'market',
      quantityBase: ONE_BTC,
      priceMicroUsd: USD(150),
      nowMs: 40_000,
    });
    engine.submitOrder({
      idempotencyKey: 'basis-3-legB',
      symbol: 'SOL-PERP/USDT',
      side: 'sell',
      type: 'market',
      quantityBase: ONE_BTC,
      priceMicroUsd: USD(151),
      nowMs: 40_000,
    });
    engine.registerPairedLegs({
      pairId: 'pair-basis-3',
      symbol: 'SOL/USDT',
      legAClientOrderId: 'basis-3-legA',
      legBClientOrderId: 'basis-3-legB',
    });
    engine.applyFillEvent({
      fillEventId: 'fill-b3-a', clientOrderId: 'basis-3-legA', seq: 1, fillQtyBase: ONE_BTC, fillPriceMicroUsd: USD(150), timestampMs: 40_010,
    });
    engine.applyFillEvent({
      fillEventId: 'fill-b3-b', clientOrderId: 'basis-3-legB', seq: 1, fillQtyBase: ONE_BTC, fillPriceMicroUsd: USD(151), timestampMs: 40_020,
    });
    const hedged = engine.evaluatePairedLegs('pair-basis-3', USD(150), 40_100);
    expect(hedged.ok).toBe(true);
    if (hedged.ok) expect(hedged.data.state).toBe('HEDGED');
  });

  it('validates defensive lifecycle boundaries, explicit venue snapshot fills/statuses, and status event transitions', () => {
    const customLedger = new MicroDoubleEntryLedger('custom-bot');
    customLedger.depositCapital('cap', USD(500_000), 100);
    const defaultEngine = new PaperOrderLifecycleEngine();
    expect(defaultEngine.getAllOrders()).toEqual([]);

    const engine = new PaperOrderLifecycleEngine({ ledger: customLedger, defaultMarginRateBps: BigInt(1_000) });
    expect(computeProportionalMarginRelease(USD(100), ONE_BTC, ZERO_BIGINT)).toBe(ZERO_BIGINT);
    expect(isAdversePriceMoveExceeded('buy', ZERO_BIGINT, USD(50_000), BigInt(500))).toBe(false);
    expect(isAdversePriceMoveExceeded('buy', USD(50_000), USD(51_000), BigInt(500))).toBe(false);

    // Invalid fill parameters & missing orders
    expect(engine.applyFillEvent({ fillEventId: '', clientOrderId: 'x', seq: 1, fillQtyBase: ONE_BTC, fillPriceMicroUsd: USD(10), timestampMs: 1 }).ok).toBe(false);
    expect(engine.applyFillEvent({ fillEventId: 'f1', clientOrderId: 'missing', seq: 1, fillQtyBase: ONE_BTC, fillPriceMicroUsd: USD(10), timestampMs: 1 }).ok).toBe(false);
    expect(engine.markGatewayTimeout('missing', 100).ok).toBe(false);
    expect(engine.applyOrderStatusEvent({ clientOrderId: 'missing', status: 'open', seq: 1, timestampMs: 100 }).ok).toBe(false);
    expect(engine.cancelOrder('missing', 100).ok).toBe(false);
    expect(engine.registerPairedLegs({ pairId: '  ', symbol: 'BTC/USDT', legAClientOrderId: 'a', legBClientOrderId: 'b' }).ok).toBe(false);
    expect(engine.evaluatePairedLegs('unknown-pair', USD(100), 100).ok).toBe(false);

    // Venue snapshot with explicit fills array -> full fill, open, and cancelled snapshot branches
    engine.submitOrder({ idempotencyKey: 'snap-fills', symbol: 'BTC/USDT', side: 'buy', type: 'limit', quantityBase: ONE_BTC, priceMicroUsd: USD(50_000), simulateGatewayTimeout: true, nowMs: 500 });
    engine.submitOrder({ idempotencyKey: 'snap-open', symbol: 'BTC/USDT', side: 'buy', type: 'limit', quantityBase: ONE_BTC, priceMicroUsd: USD(50_000), simulateGatewayTimeout: true, nowMs: 500 });
    engine.submitOrder({ idempotencyKey: 'snap-cancel', symbol: 'BTC/USDT', side: 'buy', type: 'limit', quantityBase: ONE_BTC, priceMicroUsd: USD(50_000), simulateGatewayTimeout: true, nowMs: 500 });

    const rec = engine.reconcileWithVenueSnapshot(
      [
        {
          clientOrderId: 'snap-fills',
          status: 'filled',
          filledQtyBase: ONE_BTC,
          fills: [{ fillEventId: 'vf-1', clientOrderId: 'snap-fills', seq: 1, fillQtyBase: ONE_BTC, fillPriceMicroUsd: USD(50_000), timestampMs: 600 }],
        },
        { clientOrderId: 'snap-open', status: 'open', filledQtyBase: ZERO_BIGINT },
        { clientOrderId: 'snap-cancel', status: 'cancelled', filledQtyBase: ZERO_BIGINT },
      ],
      600,
    );
    expect(rec.ok).toBe(true);
    expect(engine.getOrder('snap-fills')?.state).toBe('filled');
    expect(engine.getOrder('snap-open')?.state).toBe('open');
    expect(engine.getOrder('snap-cancel')?.state).toBe('cancelled');
    expect(engine.markGatewayTimeout('snap-fills', 700).ok).toBe(false);

    // Order status notification forward transition & cancel status notification
    expect(engine.applyOrderStatusEvent({ clientOrderId: 'snap-open', status: 'partially_filled', seq: 2, timestampMs: 700 }).ok).toBe(true);
    expect(engine.applyOrderStatusEvent({ clientOrderId: 'snap-open', status: 'partially_filled', seq: 1, timestampMs: 710 }).ok).toBe(true);
    expect(engine.applyOrderStatusEvent({ clientOrderId: 'snap-open', status: 'cancelled', seq: 3, timestampMs: 720 }).ok).toBe(true);
    expect(engine.getOrder('snap-open')?.state).toBe('cancelled');

    // Fill-time reduceOnly rejection when underlying position was already flattened by another order
    engine.submitOrder({ idempotencyKey: 'ro-race-close-1', symbol: 'BTC/USDT', side: 'sell', type: 'limit', quantityBase: ONE_BTC, priceMicroUsd: USD(51_000), reduceOnly: true, nowMs: 800 });
    engine.submitOrder({ idempotencyKey: 'manual-flatten', symbol: 'BTC/USDT', side: 'sell', type: 'market', quantityBase: ONE_BTC, priceMicroUsd: USD(51_000), nowMs: 810 });
    expect(engine.applyFillEvent({ fillEventId: 'mf-1', clientOrderId: 'manual-flatten', seq: 1, fillQtyBase: ONE_BTC, fillPriceMicroUsd: USD(51_000), timestampMs: 820 }).ok).toBe(true);
    const racedRo = engine.applyFillEvent({ fillEventId: 'ro-f1', clientOrderId: 'ro-race-close-1', seq: 1, fillQtyBase: ONE_BTC, fillPriceMicroUsd: USD(51_000), timestampMs: 830 });
    expect(racedRo.ok).toBe(false);

    // Paired-leg missing order & immediate adverse move trigger before 3_000ms timeout
    engine.registerPairedLegs({ pairId: 'missing-legs', symbol: 'BTC/USDT', legAClientOrderId: 'none-a', legBClientOrderId: 'none-b' });
    expect(engine.evaluatePairedLegs('missing-legs', USD(50_000), 900).ok).toBe(false);

    engine.submitOrder({ idempotencyKey: 'adv-a', symbol: 'BTC/USDT', side: 'buy', type: 'market', quantityBase: ONE_BTC, priceMicroUsd: USD(50_000), nowMs: 1_000 });
    engine.submitOrder({ idempotencyKey: 'adv-b', symbol: 'BTC-PERP/USDT', side: 'sell', type: 'limit', quantityBase: ONE_BTC, priceMicroUsd: USD(50_100), nowMs: 1_000 });
    engine.registerPairedLegs({ pairId: 'pair-fast-adverse', symbol: 'BTC/USDT', legAClientOrderId: 'adv-a', legBClientOrderId: 'adv-b' });
    engine.applyFillEvent({ fillEventId: 'adv-fa', clientOrderId: 'adv-a', seq: 1, fillQtyBase: ONE_BTC, fillPriceMicroUsd: USD(50_000), timestampMs: 1_010 });
    const fastAdv = engine.evaluatePairedLegs('pair-fast-adverse', USD(46_000), 1_100); // 90ms < 3000ms, but -8% > 5%
    expect(fastAdv.ok).toBe(true);
    if (fastAdv.ok) expect(fastAdv.data.unwindIntent?.reason).toBe('adverse_price_move_exceeded');
    // Re-evaluating when price recovers slightly (<5% adverse) while still <3000ms keeps SUSPENDED_BROKEN_LEG
    const recoverCheck = engine.evaluatePairedLegs('pair-fast-adverse', USD(49_900), 1_200);
    expect(recoverCheck.ok).toBe(true);
    if (recoverCheck.ok) expect(recoverCheck.data.unwindIntent?.reason).toBe('pair_already_unwinding');

    // Snapshot reconciliation with default avgFillPrice/fee fallback & invalid overfill snapshot propagation
    engine.submitOrder({ idempotencyKey: 'snap-defaults', symbol: 'BTC/USDT', side: 'buy', type: 'limit', quantityBase: ONE_BTC, priceMicroUsd: USD(50_000), simulateGatewayTimeout: true, nowMs: 2_000 });
    expect(engine.reconcileWithVenueSnapshot([{ clientOrderId: 'snap-defaults', status: 'cancelled', filledQtyBase: ONE_BTC }], 2_100).ok).toBe(true);
    expect(engine.getOrder('snap-defaults')?.state).toBe('filled');

    engine.submitOrder({ idempotencyKey: 'snap-bad-overfill', symbol: 'BTC/USDT', side: 'buy', type: 'limit', quantityBase: ONE_BTC, priceMicroUsd: USD(50_000), simulateGatewayTimeout: true, nowMs: 2_200 });
    expect(engine.reconcileWithVenueSnapshot([{ clientOrderId: 'snap-bad-overfill', status: 'filled', filledQtyBase: ONE_BTC * BigInt(2) }], 2_300).ok).toBe(false);
    expect(
      engine.reconcileWithVenueSnapshot(
        [{ clientOrderId: 'snap-bad-overfill', status: 'filled', filledQtyBase: ONE_BTC, fills: [{ fillEventId: 'bad', clientOrderId: 'snap-bad-overfill', seq: 1, fillQtyBase: ONE_BTC * BigInt(2), fillPriceMicroUsd: USD(50_000), timestampMs: 2_300 }] }],
        2_300,
      ).ok,
    ).toBe(false);
    // ReduceOnly BUY closing a SHORT position + late-cancel fill failing ledger cash check
    engine.submitOrder({ idempotencyKey: 'open-short-eth', symbol: 'ETH/USDT', side: 'sell', type: 'market', quantityBase: ONE_BTC, priceMicroUsd: USD(3_000), nowMs: 2_400 });
    expect(engine.applyFillEvent({ fillEventId: 'f-short-eth', clientOrderId: 'open-short-eth', seq: 1, fillQtyBase: ONE_BTC, fillPriceMicroUsd: USD(3_000), timestampMs: 2_410 }).ok).toBe(true);
    engine.submitOrder({ idempotencyKey: 'ro-buy-short', symbol: 'ETH/USDT', side: 'buy', type: 'market', quantityBase: ONE_BTC, priceMicroUsd: USD(2_950), reduceOnly: true, nowMs: 2_420 });
    expect(engine.applyFillEvent({ fillEventId: 'f-ro-buy-short', clientOrderId: 'ro-buy-short', seq: 1, fillQtyBase: ONE_BTC, fillPriceMicroUsd: USD(2_950), timestampMs: 2_430 }).ok).toBe(true);

    const tinyLedger = new MicroDoubleEntryLedger('tiny');
    tinyLedger.depositCapital('tiny-cap', USD(1_000), 1);
    const tinyEngine = new PaperOrderLifecycleEngine({ ledger: tinyLedger });
    tinyEngine.submitOrder({ idempotencyKey: 'tiny-ord', symbol: 'ETH/USDT', side: 'buy', type: 'limit', quantityBase: ONE_BTC, priceMicroUsd: USD(1_000), nowMs: 10 });
    tinyEngine.cancelOrder('tiny-ord', 20, 1_000);
    // Spend free cash via another order reservation, then late-cancel fill fails ledger cash guard
    tinyEngine.submitOrder({ idempotencyKey: 'tiny-lock', symbol: 'ETH/USDT', side: 'buy', type: 'limit', quantityBase: ONE_BTC, priceMicroUsd: USD(1_000), nowMs: 30 });
    expect(tinyEngine.applyFillEvent({ fillEventId: 'tiny-late', clientOrderId: 'tiny-ord', seq: 1, fillQtyBase: ONE_BTC, fillPriceMicroUsd: USD(1_000), timestampMs: 40 }).ok).toBe(false);
  });
});
