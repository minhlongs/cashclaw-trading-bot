/**
 * Double-entry accounting invariant check, audited manual owner override validator,
 * cross-venue price dislocation guard, and stablecoin collateral depeg haircut evaluator.
 */

import type {
  CollateralPriceSample,
  LedgerSnapshot,
  OwnerOverrideToken,
  VenuePriceSample,
} from './protection-types';

const MICRO_USD_PER_USD = 1_000_000;

export type LedgerCheckResult =
  | { readonly ok: true; readonly mismatchMicroUsd: number; readonly reason: null }
  | { readonly ok: false; readonly mismatchMicroUsd: number; readonly reason: string };

function resolveMicroUsd(microVal: number | undefined, usdVal: number | undefined): number | null {
  if (microVal !== undefined) {
    return Number.isFinite(microVal) ? Math.round(microVal) : null;
  }
  if (usdVal !== undefined && Number.isFinite(usdVal)) {
    return Math.round(usdVal * MICRO_USD_PER_USD);
  }
  return null;
}

export function evaluateLedgerAccounting(
  ledger: LedgerSnapshot,
  toleranceMicroUsd = 10_000,
): LedgerCheckResult {
  const assets = resolveMicroUsd(ledger.assetsMicroUsd, ledger.assetsUsd);
  const liabilities = resolveMicroUsd(ledger.liabilitiesMicroUsd, ledger.liabilitiesUsd);
  const equity = resolveMicroUsd(ledger.equityMicroUsd, ledger.equityUsd);

  if (assets === null || liabilities === null || equity === null) {
    return {
      ok: false,
      mismatchMicroUsd: Number.POSITIVE_INFINITY,
      reason: 'Double-entry ledger contains non-finite or missing accounting balances',
    };
  }

  const mismatchMicroUsd = Math.abs(assets - liabilities - equity);
  if (mismatchMicroUsd > toleranceMicroUsd) {
    const mismatchUsd = (mismatchMicroUsd / MICRO_USD_PER_USD).toFixed(6);
    return {
      ok: false,
      mismatchMicroUsd,
      reason: `LEDGER_INVARIANT_BREACH: |assets - liabilities - equity| = $${mismatchUsd} exceeds tolerance`,
    };
  }

  return { ok: true, mismatchMicroUsd, reason: null };
}

export type OwnerOverrideValidation =
  | { readonly valid: true; readonly ownerId: string; readonly reason: null }
  | { readonly valid: false; readonly ownerId: null; readonly reason: string };

function hasValidOverrideFields(override: OwnerOverrideToken): boolean {
  return (
    override.ownerId.trim().length > 0 &&
    override.reason.trim().length > 0 &&
    override.signatureToken.trim().length >= 8 &&
    Number.isFinite(override.issuedAtMs) &&
    Number.isFinite(override.expiresAtMs)
  );
}

export function validateOwnerOverride(
  override: OwnerOverrideToken,
  nowMs: number,
  maxTtlMs = 3_600_000,
): OwnerOverrideValidation {
  if (!Number.isFinite(nowMs) || !hasValidOverrideFields(override)) {
    return {
      valid: false,
      ownerId: null,
      reason: 'Owner override missing ownerId, reason, cryptographic signatureToken, or finite timestamps',
    };
  }

  const ttlMs = override.expiresAtMs - override.issuedAtMs;
  if (override.issuedAtMs > nowMs || ttlMs <= 0 || ttlMs > maxTtlMs) {
    return {
      valid: false,
      ownerId: null,
      reason: `Owner override TTL ${ttlMs}ms violates mandatory ceiling ${maxTtlMs}ms or future issuance`,
    };
  }

  if (nowMs >= override.expiresAtMs) {
    return {
      valid: false,
      ownerId: null,
      reason: `Owner override expired fail-closed at ${override.expiresAtMs} (now=${nowMs})`,
    };
  }

  return { valid: true, ownerId: override.ownerId.trim(), reason: null };
}

export type VenueDislocationResult =
  | { readonly breached: false; readonly worstDislocationBps: number; readonly reason: null }
  | { readonly breached: true; readonly worstDislocationBps: number; readonly reason: string };

export function evaluateVenueDislocation(
  samples: readonly VenuePriceSample[],
  maxDislocationBps = 200,
): VenueDislocationResult {
  let worstBps = 0;
  for (const s of samples) {
    if (!Number.isFinite(s.venueAPrice) || !Number.isFinite(s.venueBPrice) || s.venueAPrice <= 0 || s.venueBPrice <= 0) {
      return { breached: true, worstDislocationBps: Number.POSITIVE_INFINITY, reason: `Invalid venue price for ${s.symbol}` };
    }
    const mid = 0.5 * (s.venueAPrice + s.venueBPrice);
    const bps = (Math.abs(s.venueAPrice - s.venueBPrice) / mid) * 10_000;
    if (bps > worstBps) worstBps = bps;
    if (bps > maxDislocationBps) {
      return {
        breached: true,
        worstDislocationBps: Number(bps.toFixed(2)),
        reason: `SEV1_VENUE_DISLOCATION: ${s.symbol} ${s.venueA}/${s.venueB} spread ${bps.toFixed(1)} bps > ${maxDislocationBps} bps`,
      };
    }
  }
  return { breached: false, worstDislocationBps: Number(worstBps.toFixed(2)), reason: null };
}

export interface CollateralPegResult {
  readonly depegged: boolean;
  readonly nominalCollateralUsd: number;
  readonly effectiveCollateralUsd: number;
  readonly reason: string | null;
}

export function evaluateCollateralPeg(
  samples: readonly CollateralPriceSample[],
  lowerBand = 0.985,
  upperBand = 1.015,
  stressHaircut = 0.85,
): CollateralPegResult {
  let nominalUsd = 0;
  let effectiveUsd = 0;
  let depegReason: string | null = null;

  for (const c of samples) {
    if (!Number.isFinite(c.priceUsd) || !Number.isFinite(c.nominalAmount) || c.priceUsd <= 0 || c.nominalAmount < 0) {
      return { depegged: true, nominalCollateralUsd: 0, effectiveCollateralUsd: 0, reason: `Invalid collateral quote for ${c.asset}` };
    }
    nominalUsd += c.nominalAmount;
    const outsideBand = c.priceUsd < lowerBand || c.priceUsd > upperBand;
    if (outsideBand) {
      effectiveUsd += c.nominalAmount * Math.min(c.priceUsd, 1.0) * stressHaircut;
      depegReason = depegReason ?? `COLLATERAL_DEPEG: ${c.asset} mark $${c.priceUsd.toFixed(4)} outside [${lowerBand}, ${upperBand}]`;
    } else {
      effectiveUsd += c.nominalAmount * Math.min(c.priceUsd, 1.0);
    }
  }

  return {
    depegged: depegReason !== null,
    nominalCollateralUsd: Number(nominalUsd.toFixed(2)),
    effectiveCollateralUsd: Number(effectiveUsd.toFixed(2)),
    reason: depegReason,
  };
}
