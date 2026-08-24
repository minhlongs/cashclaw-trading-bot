// Inverse-beta tilt helper (optional — mission "low-beta → larger" style).
// Pure, deterministic — no I/O, no network, no Math.random/Date.now.
// Fail-closed: input weights unchanged when any held asset has a null/missing beta
// or β = 0 (1/|β| undefined). Never invents a beta.

import type { BetaTiltResult } from './types';

/**
 * Inverse-beta tilt: |w_i| ∝ 1/|β_i| with signs preserved, renormalized so
 * Σ|w| equals the input gross. Fail-closed (input unchanged) when any held
 * asset has a null/missing beta or β = 0 (1/|β| undefined).
 */
export function inverseBetaTilt(
  weights: Readonly<Record<string, number>>,
  betas: Readonly<Record<string, number | null>>,
): BetaTiltResult {
  const held = Object.entries(weights).filter(([, w]) => w !== 0);
  if (held.length === 0) {
    return { weights: { ...weights }, applied: false, fallbackReason: 'no held positions to tilt' };
  }

  const rows: Array<{ symbol: string; weight: number; inv: number }> = [];
  for (const [symbol, weight] of held) {
    const beta = betas[symbol];
    if (beta === null || beta === undefined) {
      return {
        weights: { ...weights },
        applied: false,
        fallbackReason: `missing beta estimate for held asset ${symbol}`,
      };
    }
    if (beta === 0) {
      return {
        weights: { ...weights },
        applied: false,
        fallbackReason: `zero beta for held asset ${symbol} — 1/|β| undefined`,
      };
    }
    rows.push({ symbol, weight, inv: 1 / Math.abs(beta) });
  }

  const gross = held.reduce((s, [, w]) => s + Math.abs(w), 0);
  const invSum = rows.reduce((s, r) => s + r.inv, 0);
  const tilted: Record<string, number> = { ...weights };
  for (const r of rows) {
    tilted[r.symbol] = Math.sign(r.weight) * (r.inv / invSum) * gross;
  }
  return { weights: tilted, applied: true };
}