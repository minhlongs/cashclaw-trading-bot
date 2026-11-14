// Gate G10: Exact BigInt Micro-Unit Double-Entry Ledger Contracts (Pure Open-Core).
// Zero IEEE-754 floating-point drift; zero @cloudflare/workers-types or @/ee coupling.

export const MICRO_USD_PER_USD = BigInt(1_000_000);
export const BASE_UNITS_PER_ASSET = BigInt(100_000_000);
export const BPS_SCALE = BigInt(10_000);
export const ZERO_BIGINT = BigInt(0);

export type LedgerAccountCode =
  | 'CASH_AVAILABLE'
  | 'MARGIN_RESERVED'
  | 'POSITION_MARGIN'
  | 'REALIZED_PNL'
  | 'FEES_EXPENSE'
  | 'FUNDING_NET'
  | 'INITIAL_CAPITAL';

export type JournalDirection = 'DEBIT' | 'CREDIT';

export interface JournalLeg {
  readonly account: LedgerAccountCode;
  readonly direction: JournalDirection;
  readonly amountMicroUsd: bigint;
}

export interface JournalEntry {
  readonly entryId: string;
  readonly botId: string;
  readonly eventHash: string;
  readonly eventType: string;
  readonly version: number;
  readonly timestampMs: number;
  readonly legs: readonly JournalLeg[];
}

export interface LedgerAccountBalances {
  readonly CASH_AVAILABLE: bigint;
  readonly MARGIN_RESERVED: bigint;
  readonly POSITION_MARGIN: bigint;
  readonly REALIZED_PNL: bigint;
  readonly FEES_EXPENSE: bigint;
  readonly FUNDING_NET: bigint;
  readonly INITIAL_CAPITAL: bigint;
}

export interface LedgerBalanceSheet {
  readonly assetsMicroUsd: bigint;
  readonly liabilitiesMicroUsd: bigint;
  readonly equityMicroUsd: bigint;
  readonly discrepancyMicroUsd: bigint;
  readonly balanced: boolean;
}

export interface LedgerPositionRecord {
  readonly symbol: string;
  readonly signedQtyBase: bigint;
  readonly openNotionalMicroUsd: bigint;
  readonly openMarginMicroUsd: bigint;
}

export interface ApplyLedgerFillInput {
  readonly eventHash: string;
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
  readonly fillQtyBase: bigint;
  readonly fillPriceMicroUsd: bigint;
  readonly feeMicroUsd: bigint;
  readonly releasedOrderMarginMicroUsd: bigint;
  readonly marginRateBps?: bigint;
  readonly timestampMs: number;
}

export interface ApplyLedgerFillResult {
  readonly entry: JournalEntry;
  readonly position: LedgerPositionRecord;
  readonly realizedPnlDeltaMicroUsd: bigint;
}

export interface LedgerSnapshot {
  readonly botId: string;
  readonly version: number;
  readonly fencingToken: number;
  readonly balances: LedgerAccountBalances;
  readonly positions: readonly LedgerPositionRecord[];
  readonly processedEventHashes: readonly string[];
}

export interface D1RunMetaLike {
  readonly changes: number;
  readonly last_row_id?: number;
  readonly duration?: number;
}

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: D1RunMetaLike }>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
  batch<T = { meta?: D1RunMetaLike }>(statements: D1PreparedStatementLike[]): Promise<T[]>;
}

export type DurableOrderLifecycleState =
  | 'PENDING_INTENT'
  | 'PENDING_ACK'
  | 'RECONCILING'
  | 'OPEN'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'EXPIRED';

export interface AtomicOrderStateUpsert {
  readonly clientOrderId: string;
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
  readonly orderType: 'market' | 'limit';
  readonly quantityBase: bigint;
  readonly filledQtyBase: bigint;
  readonly limitPriceMicroUsd: bigint;
  readonly reservedMarginMicroUsd: bigint;
  readonly reduceOnly: boolean;
  readonly lifecycleState: DurableOrderLifecycleState;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

export interface AtomicLedgerCommitInput {
  readonly botId: string;
  readonly expectedVersion: number;
  readonly fencingToken: number;
  readonly requiredCashMicroUsd: bigint;
  readonly nextBalances: LedgerAccountBalances;
  readonly entry: JournalEntry;
  readonly orderUpsert?: AtomicOrderStateUpsert;
}
