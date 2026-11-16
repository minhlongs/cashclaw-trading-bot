import { generateKeyPairSync } from 'node:crypto';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decrypt, encrypt } from '@/lib/crypto';
import { restoreEngineFromDurableState } from '@/tree/bot/bot-ledger-hydration';
import { PaperOrderLifecycleEngine } from '@/tree/execution/lifecycle';
import {
  BASE_UNITS_PER_ASSET,
  D1AtomicLedgerBatcher,
  MICRO_USD_PER_USD,
  MicroDoubleEntryLedger,
  ZERO_BIGINT,
  applyLegsToBalances,
  createZeroAccountBalances,
  type D1DatabaseLike,
  type D1PreparedStatementLike,
} from '@/tree/ledger';
import {
  signStrategySpecPayload,
  validateSignedStrategySpec,
} from '@/tree/paper-forward';
import {
  bytesToBase64,
  canonicalizeSpecSignatureMessage,
  signEd25519MessageSync,
  signOwnerOverrideToken,
  validateOwnerOverride,
} from '@/tree/protection';

const requireNode = createRequire(import.meta.url);

function createSqliteD1(): D1DatabaseLike {
  const { DatabaseSync } = requireNode('node:sqlite') as {
    DatabaseSync: new (p: string) => {
      exec: (sql: string) => void;
      prepare: (sql: string) => {
        run: (...args: unknown[]) => { changes: number | bigint };
        all: (...args: unknown[]) => Array<Record<string, number | string>>;
        get: (...args: unknown[]) => Record<string, number | string> | undefined;
      };
    };
  };
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.resolve(process.cwd(), 'migrations/0017_paper_ledger_and_leases.sql'), 'utf8'));
  db.exec(fs.readFileSync(path.resolve(process.cwd(), 'migrations/0019_paper_ledger_positions.sql'), 'utf8'));

  const makeStmt = (sql: string, params: readonly unknown[] = []): D1PreparedStatementLike => ({
    bind: (...values: unknown[]) => makeStmt(sql, values),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...params).changes) } }),
    all: async <T = Record<string, unknown>>() => ({
      results: db.prepare(sql).all(...params) as unknown as T[],
    }),
    first: async <T = Record<string, unknown>>() =>
      ((db.prepare(sql).get(...params) as unknown as T | undefined) ?? null),
  });

  return {
    prepare: (sql: string) => makeStmt(sql),
    batch: async <T = { meta?: { changes: number } }>(stmts: D1PreparedStatementLike[]) => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const out: T[] = [];
        for (const s of stmts) out.push((await s.run()) as unknown as T);
        db.exec('COMMIT');
        return out;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}

async function flushLedgerToD1(batcher: D1AtomicLedgerBatcher, ledger: MicroDoubleEntryLedger): Promise<void> {
  let version = 0;
  let balances = createZeroAccountBalances();
  const entries = ledger.getJournalEntries();
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]!;
    const nextBalances = applyLegsToBalances(balances, entry.legs);
    const outflow = balances.CASH_AVAILABLE - nextBalances.CASH_AVAILABLE;
    const isLast = i === entries.length - 1;
    const res = await batcher.commitAtomicBatch({
      botId: ledger.getBotId(),
      expectedVersion: version,
      fencingToken: ledger.getFencingToken(),
      requiredCashMicroUsd: outflow > ZERO_BIGINT ? outflow : ZERO_BIGINT,
      nextBalances,
      entry,
      ...(isLast ? { positions: ledger.getAllPositions() } : {}),
    });
    expect(res.ok).toBe(true);
    version += 1;
    balances = nextBalances;
  }
}

describe('Ed25519 Governance Signatures & Durable Paper Positions (0019)', () => {
  it('verifies Ed25519 signatures on SignedStrategySpec and OwnerOverrideToken fail-closed', async () => {
    const kp = generateKeyPairSync('ed25519');
    const pubDer = kp.publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
    const pubB64 = bytesToBase64(pubDer.subarray(pubDer.length - 32));
    const privPem = kp.privateKey.export({ format: 'pem', type: 'pkcs8' }) as string;

    const signedSpec = signStrategySpecPayload({
      specVersion: '1.0.0',
      strategyId: 'H3_MAKER',
      executionMode: 'PAPER_ONLY',
      liveOrderAuthority: false,
      aiOrderAuthority: false,
      universe: ['BTCUSDT'],
      parameters: {
        lookbackDays: 30,
        entryAnnualBps: 800,
        exitAnnualBps: 150,
        fifoFillProbability: 0.75,
        adverseSelectionBps: 1.2,
        singleLegMissProbability: 0.05,
        maxGrossLeverage: 1.0,
      },
      venueSchedule: {
        primaryVenue: 'hyperliquid',
        benchmarkVenue: 'binance',
        spotMakerBps: 1.5,
        perpMakerBps: 1.0,
        spotTakerBps: 10.0,
        perpTakerBps: 4.5,
      },
      riskGates: {
        maxDrawdownSoftPct: 8,
        maxDrawdownHardPct: 12,
        maxDailyLossPct: 2.5,
        staleDataCutoffMs: 15_000,
        maxTrackingErrorBpsPerMonth: 15,
      },
      observationWindow: { minRequiredDays: 60, targetDays: 90 },
    });

    expect(
      validateSignedStrategySpec(signedSpec, { requireEd25519Signature: true, trustedPublicKeyB64: pubB64 }).ok,
    ).toBe(false);

    const msg = canonicalizeSpecSignatureMessage(signedSpec.strategyId, signedSpec.payloadSha256);
    const sigB64 = signEd25519MessageSync(msg, privPem);
    expect(
      validateSignedStrategySpec(signedSpec, {
        requireEd25519Signature: true,
        ed25519Signature: sigB64,
        trustedPublicKeyB64: pubB64,
      }).ok,
    ).toBe(true);

    const wrongKp = generateKeyPairSync('ed25519');
    const wrongPriv = wrongKp.privateKey.export({ format: 'pem', type: 'pkcs8' }) as string;
    expect(
      validateSignedStrategySpec(signedSpec, {
        requireEd25519Signature: true,
        ed25519Signature: signEd25519MessageSync(msg, wrongPriv),
        trustedPublicKeyB64: pubB64,
      }).ok,
    ).toBe(false);

    const nowMs = 1_794_614_500_000;
    const signedOverride = signOwnerOverrideToken(
      { ownerId: 'founder', reason: 'Emergency review', issuedAtMs: nowMs - 1_000, expiresAtMs: nowMs + 60_000 },
      privPem,
    );
    expect(validateOwnerOverride(signedOverride, nowMs, 3_600_000, pubB64).valid).toBe(true);
    expect(
      validateOwnerOverride({ ...signedOverride, reason: 'Tampered' }, nowMs, 3_600_000, pubB64).valid,
    ).toBe(false);

    const origKey = process.env.ENCRYPTION_KEY;
    try {
      process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
      const ct = await encrypt('live-secret');
      process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
      await expect(decrypt(ct)).rejects.toThrow('CRYPTO_DECRYPT_ERROR');
    } finally {
      if (origKey === undefined) delete process.env.ENCRYPTION_KEY;
      else process.env.ENCRYPTION_KEY = origKey;
    }
  });

  it('persists exact 5x leveraged and multi-asset positions across cold restart via paper_ledger_positions', async () => {
    const d1 = createSqliteD1();
    const batcher = new D1AtomicLedgerBatcher(d1);
    const botId = 'bot_lev_5x';
    const marginRateBps = BigInt(2_000); // 5x leverage (20% initial margin)
    const initialCash = BigInt(10_000) * MICRO_USD_PER_USD;

    await batcher.initializeBotAccount(botId, 1_000, 0);
    const ledger1 = new MicroDoubleEntryLedger(botId, 0);
    expect(ledger1.depositCapital('dep_init', initialCash, 1_000).ok).toBe(true);
    const engine1 = new PaperOrderLifecycleEngine({ botId, ledger: ledger1, defaultMarginRateBps: marginRateBps });

    const pEth = BigInt(2_000) * MICRO_USD_PER_USD;
    const pBtc = BigInt(50_000) * MICRO_USD_PER_USD;
    const btcQty = BASE_UNITS_PER_ASSET / BigInt(10);
    const btcHalfQty = btcQty / BigInt(2);

    expect(
      engine1.submitOrder({
        idempotencyKey: 'ord_bot_lev_5x_1',
        symbol: 'ETH/USDT',
        side: 'buy',
        type: 'limit',
        quantityBase: BASE_UNITS_PER_ASSET,
        priceMicroUsd: pEth,
        nowMs: 1_010,
      }).ok,
    ).toBe(true);
    expect(
      engine1.applyFillEvent({
        fillEventId: 'f1',
        clientOrderId: 'ord_bot_lev_5x_1',
        seq: 1,
        fillQtyBase: BASE_UNITS_PER_ASSET,
        fillPriceMicroUsd: pEth,
        timestampMs: 1_020,
      }).ok,
    ).toBe(true);

    expect(
      engine1.submitOrder({
        idempotencyKey: 'ord_bot_lev_5x_2',
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        quantityBase: btcQty,
        priceMicroUsd: pBtc,
        nowMs: 1_030,
      }).ok,
    ).toBe(true);
    expect(
      engine1.applyFillEvent({
        fillEventId: 'f2',
        clientOrderId: 'ord_bot_lev_5x_2',
        seq: 1,
        fillQtyBase: btcHalfQty,
        fillPriceMicroUsd: pBtc,
        timestampMs: 1_040,
      }).ok,
    ).toBe(true);
    expect(engine1.cancelOrder('ord_bot_lev_5x_2', 2_000, 0).ok).toBe(true);

    await flushLedgerToD1(batcher, ledger1);

    const loaded = await batcher.loadDurableBotState(botId);
    expect(loaded).not.toBeNull();
    if (!loaded) throw new Error('Expected durable state');
    expect(loaded.hasDurablePositionsTable).toBe(true);
    expect(loaded.positions).toHaveLength(2);

    const ledger2 = new MicroDoubleEntryLedger(botId, 0);
    const engine2 = new PaperOrderLifecycleEngine({ botId, ledger: ledger2, defaultMarginRateBps: marginRateBps });
    restoreEngineFromDurableState(engine2, loaded);

    expect(
      engine2.submitOrder({
        idempotencyKey: 'ord_bot_lev_5x_3',
        symbol: 'ETH/USDT',
        side: 'sell',
        type: 'limit',
        quantityBase: BASE_UNITS_PER_ASSET,
        priceMicroUsd: pEth,
        reduceOnly: true,
        nowMs: 3_000,
      }).ok,
    ).toBe(true);
    expect(
      engine2.applyFillEvent({
        fillEventId: 'f3',
        clientOrderId: 'ord_bot_lev_5x_3',
        seq: 1,
        fillQtyBase: BASE_UNITS_PER_ASSET,
        fillPriceMicroUsd: pEth,
        timestampMs: 3_010,
      }).ok,
    ).toBe(true);

    expect(
      engine2.submitOrder({
        idempotencyKey: 'ord_bot_lev_5x_4',
        symbol: 'BTC/USDT',
        side: 'sell',
        type: 'limit',
        quantityBase: btcHalfQty,
        priceMicroUsd: pBtc,
        reduceOnly: true,
        nowMs: 3_020,
      }).ok,
    ).toBe(true);
    expect(
      engine2.applyFillEvent({
        fillEventId: 'f4',
        clientOrderId: 'ord_bot_lev_5x_4',
        seq: 1,
        fillQtyBase: btcHalfQty,
        fillPriceMicroUsd: pBtc,
        timestampMs: 3_030,
      }).ok,
    ).toBe(true);

    const snap2 = ledger2.exportSnapshot();
    expect(snap2.balances.POSITION_MARGIN).toBe(ZERO_BIGINT);
    expect(snap2.balances.MARGIN_RESERVED).toBe(ZERO_BIGINT);
    expect(snap2.balances.REALIZED_PNL).toBe(ZERO_BIGINT);
    expect(snap2.balances.CASH_AVAILABLE).toBe(initialCash);
  });
});
