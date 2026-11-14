// Gate G10: Stateful Exact BigInt Micro-Unit Double-Entry Ledger Engine.

import { ok, err, type Result } from '@/lib/result';
import {
  ZERO_BIGINT,
  type ApplyLedgerFillInput,
  type ApplyLedgerFillResult,
  type JournalEntry,
  type JournalLeg,
  type LedgerAccountBalances,
  type LedgerBalanceSheet,
  type LedgerPositionRecord,
  type LedgerSnapshot,
} from './ledger-types';
import {
  applyLegsToBalances,
  buildFillTransitionPlan,
  computeBalanceSheet,
  createZeroAccountBalances,
  validateBalancedLegs,
} from './double-entry-math';

function buildPairLegs(
  debit: JournalLeg['account'],
  credit: JournalLeg['account'],
  amountMicroUsd: bigint,
): JournalLeg[] {
  return [
    { account: debit, direction: 'DEBIT', amountMicroUsd },
    { account: credit, direction: 'CREDIT', amountMicroUsd },
  ];
}

export class MicroDoubleEntryLedger {
  private readonly botId: string;
  private balances: LedgerAccountBalances = createZeroAccountBalances();
  private version = 0;
  private fencingToken: number;
  private readonly positions = new Map<string, LedgerPositionRecord>();
  private readonly journalEntries: JournalEntry[] = [];
  private readonly processedEventHashes = new Set<string>();

  public constructor(botId: string, initialFencingToken = 0) {
    this.botId = botId;
    this.fencingToken = initialFencingToken;
  }

  public getBotId(): string { return this.botId; }
  public getVersion(): number { return this.version; }
  public getFencingToken(): number { return this.fencingToken; }
  public hasProcessedEvent(eventHash: string): boolean { return this.processedEventHashes.has(eventHash); }
  public getAccountBalances(): LedgerAccountBalances { return { ...this.balances }; }
  public getBalanceSheet(): LedgerBalanceSheet { return computeBalanceSheet(this.balances); }
  public getJournalEntries(): readonly JournalEntry[] { return [...this.journalEntries]; }

  public updateFencingToken(nextToken: number): Result<number> {
    if (nextToken < this.fencingToken) {
      return err(`STALE_FENCING_TOKEN: token ${nextToken} < active ${this.fencingToken}`);
    }
    this.fencingToken = nextToken;
    return ok(this.fencingToken);
  }

  public getPosition(symbol: string): LedgerPositionRecord {
    return (
      this.positions.get(symbol) ?? {
        symbol,
        signedQtyBase: ZERO_BIGINT,
        openNotionalMicroUsd: ZERO_BIGINT,
        openMarginMicroUsd: ZERO_BIGINT,
      }
    );
  }

  public postJournalEntry(params: {
    readonly eventHash: string;
    readonly eventType: string;
    readonly legs: readonly JournalLeg[];
    readonly timestampMs: number;
  }): Result<JournalEntry> {
    if (!params.eventHash.trim()) return err('INVALID_EVENT_HASH: eventHash is required');
    if (this.processedEventHashes.has(params.eventHash)) return err(`DUPLICATE_EVENT_HASH: ${params.eventHash}`);
    const balanceCheck = validateBalancedLegs(params.legs);
    if (!balanceCheck.ok) return balanceCheck;

    const candidate = applyLegsToBalances(this.balances, params.legs);
    if (candidate.CASH_AVAILABLE < ZERO_BIGINT) {
      return err(`INSUFFICIENT_AVAILABLE_CASH: deficit ${(-candidate.CASH_AVAILABLE).toString()} micro-USD`);
    }
    if (candidate.MARGIN_RESERVED < ZERO_BIGINT) {
      return err(`INSUFFICIENT_RESERVED_MARGIN: deficit ${(-candidate.MARGIN_RESERVED).toString()} micro-USD`);
    }
    if (candidate.POSITION_MARGIN < ZERO_BIGINT) {
      return err(`INSUFFICIENT_POSITION_MARGIN: deficit ${(-candidate.POSITION_MARGIN).toString()} micro-USD`);
    }

    const nextVersion = this.version + 1;
    const entry: JournalEntry = {
      entryId: `${this.botId}_je_${nextVersion}`,
      botId: this.botId,
      eventHash: params.eventHash,
      eventType: params.eventType,
      version: nextVersion,
      timestampMs: params.timestampMs,
      legs: [...params.legs],
    };
    this.balances = candidate;
    this.version = nextVersion;
    this.processedEventHashes.add(params.eventHash);
    this.journalEntries.push(entry);
    return ok(entry);
  }

  public depositCapital(eventHash: string, amountMicroUsd: bigint, timestampMs: number): Result<JournalEntry> {
    if (amountMicroUsd <= ZERO_BIGINT) return err('INVALID_AMOUNT: deposit must be > 0');
    return this.postJournalEntry({
      eventHash, eventType: 'DEPOSIT_CAPITAL', timestampMs,
      legs: buildPairLegs('CASH_AVAILABLE', 'INITIAL_CAPITAL', amountMicroUsd),
    });
  }

  public reserveMargin(eventHash: string, amountMicroUsd: bigint, timestampMs: number): Result<JournalEntry> {
    if (amountMicroUsd <= ZERO_BIGINT) return err('INVALID_AMOUNT: reserveMargin must be > 0');
    return this.postJournalEntry({
      eventHash, eventType: 'RESERVE_MARGIN', timestampMs,
      legs: buildPairLegs('MARGIN_RESERVED', 'CASH_AVAILABLE', amountMicroUsd),
    });
  }

  public releaseMargin(eventHash: string, amountMicroUsd: bigint, timestampMs: number): Result<JournalEntry> {
    if (amountMicroUsd <= ZERO_BIGINT) return err('INVALID_AMOUNT: releaseMargin must be > 0');
    return this.postJournalEntry({
      eventHash, eventType: 'RELEASE_MARGIN', timestampMs,
      legs: buildPairLegs('CASH_AVAILABLE', 'MARGIN_RESERVED', amountMicroUsd),
    });
  }

  public applyFill(input: ApplyLedgerFillInput): Result<ApplyLedgerFillResult> {
    if (input.fillQtyBase <= ZERO_BIGINT || input.fillPriceMicroUsd <= ZERO_BIGINT) {
      return err('INVALID_FILL_INPUT: fillQtyBase and fillPriceMicroUsd must be > 0');
    }
    if (input.feeMicroUsd < ZERO_BIGINT || input.releasedOrderMarginMicroUsd < ZERO_BIGINT) {
      return err('INVALID_FILL_INPUT: fee and released margin must be >= 0');
    }
    const plan = buildFillTransitionPlan(this.getPosition(input.symbol), input);
    const posted = this.postJournalEntry({
      eventHash: input.eventHash, eventType: 'ORDER_FILL', timestampMs: input.timestampMs, legs: plan.legs,
    });
    if (!posted.ok) return posted;
    this.positions.set(input.symbol, plan.nextPosition);
    return ok({ entry: posted.data, position: plan.nextPosition, realizedPnlDeltaMicroUsd: plan.realizedPnlDeltaMicroUsd });
  }

  public applyFundingCashflow(eventHash: string, signedAmountMicroUsd: bigint, timestampMs: number): Result<JournalEntry> {
    if (signedAmountMicroUsd === ZERO_BIGINT) return err('INVALID_AMOUNT: funding cashflow must be non-zero');
    const legs = signedAmountMicroUsd > ZERO_BIGINT
      ? buildPairLegs('CASH_AVAILABLE', 'FUNDING_NET', signedAmountMicroUsd)
      : buildPairLegs('FUNDING_NET', 'CASH_AVAILABLE', -signedAmountMicroUsd);
    return this.postJournalEntry({ eventHash, eventType: 'FUNDING_CASHFLOW', timestampMs, legs });
  }

  public exportSnapshot(): LedgerSnapshot {
    return {
      botId: this.botId, version: this.version, fencingToken: this.fencingToken,
      balances: { ...this.balances },
      positions: Array.from(this.positions.values()),
      processedEventHashes: Array.from(this.processedEventHashes),
    };
  }

  public restoreSnapshot(snapshot: LedgerSnapshot): Result<true> {
    if (!computeBalanceSheet(snapshot.balances).balanced) return err('CORRUPT_LEDGER_SNAPSHOT: unbalanced');
    this.balances = { ...snapshot.balances };
    this.version = snapshot.version;
    this.fencingToken = snapshot.fencingToken;
    this.positions.clear();
    for (const pos of snapshot.positions) this.positions.set(pos.symbol, { ...pos });
    this.processedEventHashes.clear();
    for (const hash of snapshot.processedEventHashes) this.processedEventHashes.add(hash);
    return ok(true);
  }
}
