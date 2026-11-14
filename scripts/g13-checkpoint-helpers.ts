// Gate G13 TS <-> Python Checkpoint Bridge Helpers (PAPER_ONLY, Fail-Closed).

import { z } from 'zod';
import { ZERO_BIGINT, type MicroDoubleEntryLedger } from '@/tree/ledger';
import {
  PaperForwardRunner, perpLegSymbol, spotLegSymbol, valuePortfolioAtMarks,
  type H3MakerSymbolObservation, type SignedStrategySpec, type StrategyLifecycleRegistry,
} from '@/tree/paper-forward';

export const BRIDGE_INITIAL_CAPITAL_USD = 1_000_000;
export const BRIDGE_SEED = 63_013;
const DAY_MS = 86_400_000;

export const PublicSymbolQuoteSchema = z.object({
  binance_spot_mid: z.number().nonnegative(),
  binance_perp_mark: z.number().nonnegative(),
  binance_funding_8h_rate: z.number().finite(),
  binance_instantaneous_annual_basis_bps: z.number().finite(),
  exceeds_800bps_entry_hurdle_now: z.boolean(),
  causal_target_pair_weight: z.number().finite(),
}).passthrough();

export const PublicMarketSnapshotSchema = z.object({
  observed_at_utc: z.string().min(10),
  mode: z.literal('READ_ONLY_PUBLIC_ZERO_AUTH'),
  orders_submitted: z.literal(0),
  universe_count: z.number().int().positive(),
  active_causal_positions_count: z.number().int().nonnegative(),
  gross_target_pair_weight: z.number().nonnegative(),
  causal_target_weights: z.record(z.number()),
  symbols: z.record(PublicSymbolQuoteSchema),
  snapshot_sha256: z.string().regex(/^[0-9a-f]{64}$/),
}).passthrough();

export type PublicMarketSnapshot = z.infer<typeof PublicMarketSnapshotSchema>;

export interface DayMarkRecord {
  readonly spotMidUsd: number;
  readonly perpMidUsd: number;
  readonly spreadBps: number;
}

export interface PersistedBridgeDay {
  readonly dayIndex: number;
  readonly timestampMs: number;
  readonly observedAtUtc: string;
  readonly snapshotSha256: string;
  readonly observations: readonly H3MakerSymbolObservation[];
  readonly marks: Readonly<Record<string, DayMarkRecord>>;
  readonly fundingIntervalsBpsBySymbol: Readonly<Record<string, readonly number[]>>;
}

export interface SerializedPosition {
  readonly symbol: string;
  readonly signedQtyBase: string;
  readonly openNotionalMicroUsd: string;
  readonly openMarginMicroUsd: string;
}

export interface PersistedRunnerState {
  readonly schemaVersion: '1.0.0';
  readonly specSha256: string;
  readonly genesisUtc: string;
  readonly genesisTimestampMs: number;
  readonly initialCapitalUsd: number;
  readonly seed: number;
  readonly days: readonly PersistedBridgeDay[];
  readonly ledgerVersion: number;
  readonly equityMicroUsd: string;
  readonly positions: readonly SerializedPosition[];
}

export interface SerializedFillRecord {
  readonly dayIndex: number;
  readonly clientOrderId: string;
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
  readonly filledQtyBase: string;
  readonly referenceMidUsd: number;
  readonly slipBps: number;
  readonly feeBps: number;
  readonly fillPriceMicroUsd: string;
  readonly timestampMs: number;
}

export function computeUtcCalendarDayOffset(genesisUtc: string, observedAtUtc: string): number {
  const genDayMs = Date.parse(`${genesisUtc.slice(0, 10)}T00:00:00Z`);
  const obsDayMs = Date.parse(`${observedAtUtc.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(genDayMs) || !Number.isFinite(obsDayMs) || obsDayMs < genDayMs) {
    throw new Error(`Observation date ${observedAtUtc} precedes genesis ${genesisUtc}`);
  }
  return Math.round((obsDayMs - genDayMs) / DAY_MS);
}

export function buildDayStepFromSnapshot(
  spec: SignedStrategySpec, snapshot: PublicMarketSnapshot, dayIndex: number, timestampMs: number, heldSymbols?: ReadonlySet<string>,
): PersistedBridgeDay {
  const observations: H3MakerSymbolObservation[] = [];
  const marks: Record<string, DayMarkRecord> = {};
  const fundingBySym: Record<string, readonly number[]> = {};
  for (const symbol of spec.universe) {
    const q = snapshot.symbols[symbol];
    if (!q || q.binance_spot_mid <= 0 || q.binance_perp_mark <= 0) continue;
    const rate8hBps = Number((q.binance_funding_8h_rate * 10_000).toFixed(6));
    const intervals = rate8hBps === 0 ? [0, 0, 0] : [rate8hBps, rate8hBps, rate8hBps];
    const inHoldBand = (heldSymbols?.has(symbol) ?? false) && q.binance_instantaneous_annual_basis_bps > spec.parameters.exitAnnualBps;
    const carryBps = q.causal_target_pair_weight > 0
      ? Math.max(spec.parameters.entryAnnualBps + 25, q.binance_instantaneous_annual_basis_bps)
      : inHoldBand || q.exceeds_800bps_entry_hurdle_now
        ? q.binance_instantaneous_annual_basis_bps
        : Math.min(spec.parameters.exitAnnualBps - 1, q.binance_instantaneous_annual_basis_bps);
    const spreadBps = 4.0;
    observations.push({
      symbol, spotMidUsd: q.binance_spot_mid, perpMidUsd: q.binance_perp_mark,
      impliedCarryAnnualBps: carryBps, fundingIntervalsBps: intervals,
      spreadBps, bookDepthUsd: 1_000_000, dataTimestampMs: timestampMs,
    });
    marks[symbol] = { spotMidUsd: q.binance_spot_mid, perpMidUsd: q.binance_perp_mark, spreadBps };
    fundingBySym[symbol] = intervals;
  }
  return {
    dayIndex, timestampMs, observedAtUtc: snapshot.observed_at_utc,
    snapshotSha256: snapshot.snapshot_sha256, observations, marks,
    fundingIntervalsBpsBySymbol: fundingBySym,
  };
}

export function serializeOpenPositions(
  ledger: MicroDoubleEntryLedger, universe: readonly string[],
): SerializedPosition[] {
  const out: SerializedPosition[] = [];
  for (const sym of universe) {
    for (const legSym of [spotLegSymbol(sym), perpLegSymbol(sym)]) {
      const pos = ledger.getPosition(legSym);
      if (pos.signedQtyBase !== ZERO_BIGINT) {
        out.push({
          symbol: pos.symbol, signedQtyBase: pos.signedQtyBase.toString(),
          openNotionalMicroUsd: pos.openNotionalMicroUsd.toString(),
          openMarginMicroUsd: pos.openMarginMicroUsd.toString(),
        });
      }
    }
  }
  return out;
}

export function extractSerializedFills(
  runner: PaperForwardRunner, spec: SignedStrategySpec, daysByIndex: ReadonlyMap<number, PersistedBridgeDay>,
): SerializedFillRecord[] {
  const halfAdv = spec.parameters.adverseSelectionBps / 2;
  const fills: SerializedFillRecord[] = [];
  for (const ord of runner.getLifecycleEngine().getAllOrders()) {
    if (ord.filledQtyBase <= ZERO_BIGINT) continue;
    const match = /^h3m_d(\d+)_([A-Z0-9]+)_(spot|perp)_/.exec(ord.clientOrderId);
    if (!match) throw new Error(`Unrecognized order ID format: ${ord.clientOrderId}`);
    const dayIndex = Number(match[1]);
    const baseSym = match[2] as string;
    const mark = daysByIndex.get(dayIndex)?.marks[baseSym];
    if (!mark) throw new Error(`Missing day=${dayIndex} marks for ${baseSym}`);
    const isSpot = ord.symbol.endsWith(':SPOT');
    const emergTaker = ord.clientOrderId.endsWith('_emerg_taker');
    const emergUnwind = ord.clientOrderId.endsWith('_emerg_unwind');
    const feeBps = isSpot
      ? (emergUnwind ? spec.venueSchedule.spotTakerBps : spec.venueSchedule.spotMakerBps)
      : (emergTaker ? spec.venueSchedule.perpTakerBps : spec.venueSchedule.perpMakerBps);
    const slipBps = (emergTaker || emergUnwind) ? (mark.spreadBps / 2) + halfAdv : halfAdv;
    fills.push({
      dayIndex, clientOrderId: ord.clientOrderId, symbol: ord.symbol, side: ord.side,
      filledQtyBase: ord.filledQtyBase.toString(),
      referenceMidUsd: isSpot ? mark.spotMidUsd : mark.perpMidUsd,
      slipBps, feeBps, fillPriceMicroUsd: ord.avgFillPriceMicroUsd.toString(),
      timestampMs: ord.updatedAtMs,
    });
  }
  return fills;
}

export function verifyDay0ShadowTick(
  spec: SignedStrategySpec, registry: StrategyLifecycleRegistry, snapshot: PublicMarketSnapshot, genesisTsMs: number,
): void {
  const probe = new PaperForwardRunner({
    spec, registry, initialCapitalUsd: BRIDGE_INITIAL_CAPITAL_USD, genesisTimestampMs: genesisTsMs, seed: BRIDGE_SEED,
  });
  probe.recordGenesisCheckpoint(genesisTsMs);
  const step = buildDayStepFromSnapshot(spec, snapshot, 1, genesisTsMs + DAY_MS);
  probe.stepDay({ dayIndex: step.dayIndex, timestampMs: step.timestampMs, observations: step.observations });
  const sheet = probe.getLedger().getBalanceSheet();
  const viol = probe.getViolationSummary();
  if (!sheet.balanced || sheet.discrepancyMicroUsd !== ZERO_BIGINT || viol.ledgerBreachCount > 0 || viol.protectionViolationCount > 0) {
    throw new Error('Day-0 shadow tick failed ledger balance or capital protection check');
  }
  const latestMarks = new Map(Object.entries(step.marks).map(([k, v]) => [k, { spotMidUsd: v.spotMidUsd, perpMidUsd: v.perpMidUsd }]));
  if (valuePortfolioAtMarks(probe.getLedger(), spec.universe, latestMarks).navMicroUsd <= ZERO_BIGINT) {
    throw new Error('Day-0 shadow tick produced non-positive NAV');
  }
}
