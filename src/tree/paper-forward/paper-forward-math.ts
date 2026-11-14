// Gate G13: Pure BigInt Accounting, Mark-to-Market Valuation & Funding Settlement for H3_MAKER.

import {
  BASE_UNITS_PER_ASSET,
  ZERO_BIGINT,
  absBigInt,
  computeNotionalMicroUsd,
  type MicroDoubleEntryLedger,
} from '../ledger';
import type { PositionExposure } from '../protection';
import type { H3MakerSymbolObservation } from './spec-types';

export const SPOT_MARGIN_RATE_BPS = BigInt(10_000);
export const PERP_MARGIN_RATE_BPS = BigInt(5_000);
const MICRO_SCALE_NUM = 1_000_000;
const BASE_SCALE_NUM = 100_000_000;
const HUNDREDTH_BPS_DIVISOR = BigInt(1_000_000);

export function spotLegSymbol(symbol: string): string {
  return `${symbol}:SPOT`;
}

export function perpLegSymbol(symbol: string): string {
  return `${symbol}:PERP`;
}

export function toMicroUsd(usd: number): bigint {
  return BigInt(Math.round(usd * MICRO_SCALE_NUM));
}

export function fromMicroUsd(microUsd: bigint): number {
  return Number(microUsd) / MICRO_SCALE_NUM;
}

export function toBaseUnits(qty: number): bigint {
  return BigInt(Math.max(1, Math.round(qty * BASE_SCALE_NUM)));
}

export function fromBaseUnits(qtyBase: bigint): number {
  return Number(qtyBase) / BASE_SCALE_NUM;
}

export function computeFeeMicroUsd(notionalMicroUsd: bigint, feeBps: number): bigint {
  if (feeBps <= 0) return ZERO_BIGINT;
  const scaledBps = BigInt(Math.round(feeBps * 100));
  return (notionalMicroUsd * scaledBps) / HUNDREDTH_BPS_DIVISOR;
}

export function applyAdversePriceUsd(
  midUsd: number,
  side: 'buy' | 'sell',
  adverseBps: number,
): number {
  const shift = Math.max(0, adverseBps) / 10_000;
  return side === 'buy' ? midUsd * (1 + shift) : midUsd * Math.max(0.0001, 1 - shift);
}

export interface PortfolioValuation {
  readonly navMicroUsd: bigint;
  readonly navUsd: number;
  readonly grossExposureMicroUsd: bigint;
  readonly grossExposureUsd: number;
  readonly positions: readonly PositionExposure[];
}

function evaluateLegMark(
  ledger: MicroDoubleEntryLedger,
  legSym: string,
  markUsd: number,
): { unrealizedMicroUsd: bigint; grossMicroUsd: bigint; exposure: PositionExposure | null } {
  const pos = ledger.getPosition(legSym);
  if (pos.signedQtyBase === ZERO_BIGINT) {
    return { unrealizedMicroUsd: ZERO_BIGINT, grossMicroUsd: ZERO_BIGINT, exposure: null };
  }
  const absQty = absBigInt(pos.signedQtyBase);
  const markNotional = computeNotionalMicroUsd(absQty, toMicroUsd(markUsd));
  const isLong = pos.signedQtyBase > ZERO_BIGINT;
  const unrealized = isLong
    ? markNotional - pos.openNotionalMicroUsd
    : pos.openNotionalMicroUsd - markNotional;
  const entryPrice = Number((pos.openNotionalMicroUsd * BASE_UNITS_PER_ASSET) / absQty) / MICRO_SCALE_NUM;
  return {
    unrealizedMicroUsd: unrealized,
    grossMicroUsd: markNotional,
    exposure: {
      symbol: legSym,
      signedNotionalUsd: (isLong ? 1 : -1) * fromMicroUsd(markNotional),
      entryPrice,
      markPrice: markUsd,
      betaToBtc: legSym.startsWith('BTC') ? 1.0 : 0.8,
    },
  };
}

export function valuePortfolioAtMarks(
  ledger: MicroDoubleEntryLedger,
  universe: readonly string[],
  latestMarks: ReadonlyMap<string, { spotMidUsd: number; perpMidUsd: number }>,
): PortfolioValuation {
  const sheet = ledger.getBalanceSheet();
  let unrealizedTotal = ZERO_BIGINT;
  let grossTotal = ZERO_BIGINT;
  const exposures: PositionExposure[] = [];

  for (const sym of universe) {
    const marks = latestMarks.get(sym);
    if (!marks) continue;
    for (const [legSym, mark] of [
      [spotLegSymbol(sym), marks.spotMidUsd],
      [perpLegSymbol(sym), marks.perpMidUsd],
    ] as const) {
      const leg = evaluateLegMark(ledger, legSym, mark);
      unrealizedTotal += leg.unrealizedMicroUsd;
      grossTotal += leg.grossMicroUsd;
      if (leg.exposure) exposures.push(leg.exposure);
    }
  }

  const navMicroUsd = sheet.equityMicroUsd + unrealizedTotal;
  return {
    navMicroUsd,
    navUsd: Number(fromMicroUsd(navMicroUsd).toFixed(6)),
    grossExposureMicroUsd: grossTotal,
    grossExposureUsd: Number(fromMicroUsd(grossTotal).toFixed(6)),
    positions: exposures,
  };
}

export function settlePerpFundingIntervals(
  ledger: MicroDoubleEntryLedger,
  dayIndex: number,
  timestampMs: number,
  obs: H3MakerSymbolObservation,
): bigint {
  const perpPos = ledger.getPosition(perpLegSymbol(obs.symbol));
  if (perpPos.signedQtyBase >= ZERO_BIGINT || obs.fundingIntervalsBps.length === 0) {
    return ZERO_BIGINT;
  }
  const shortNotionalMicroUsd = computeNotionalMicroUsd(
    absBigInt(perpPos.signedQtyBase),
    toMicroUsd(obs.perpMidUsd),
  );
  let netFundingMicroUsd = ZERO_BIGINT;
  obs.fundingIntervalsBps.forEach((rateBps, idx) => {
    const scaledRate = BigInt(Math.round(rateBps * 100));
    const cashflow = (shortNotionalMicroUsd * scaledRate) / HUNDREDTH_BPS_DIVISOR;
    if (cashflow !== ZERO_BIGINT) {
      const hash = `funding_d${dayIndex}_${obs.symbol}_${idx}`;
      const res = ledger.applyFundingCashflow(hash, cashflow, timestampMs + idx + 1);
      if (res.ok) netFundingMicroUsd += cashflow;
    }
  });
  return netFundingMicroUsd;
}
