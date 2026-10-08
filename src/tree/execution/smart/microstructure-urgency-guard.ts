// Microstructure Urgency Guard — adjusts execution aggressiveness from L2 OFI / VPIN toxicity
import type { UrgencyMode } from './smart-execution-types';

export const HIGH_TOXICITY_VPIN_THRESHOLD = 0.70;
export const ADVERSE_OFI_THRESHOLD = 0.50;

export interface UrgencyEvaluationInput {
  readonly vpinToxicity: number;
  readonly ofiSignal: number;
  readonly intendedSide: 'buy' | 'sell';
}

export function evaluateExecutionUrgency(
  input: UrgencyEvaluationInput,
  vpinLimit = HIGH_TOXICITY_VPIN_THRESHOLD,
  ofiLimit = ADVERSE_OFI_THRESHOLD,
): { mode: UrgencyMode; reason: string } {
  // If VPIN indicates severe informed flow, halt or cooldown to prevent adverse selection
  if (input.vpinToxicity >= vpinLimit) {
    return {
      mode: 'PAUSED_COOLDOWN',
      reason: `High VPIN toxicity (${input.vpinToxicity.toFixed(2)} >= ${vpinLimit.toFixed(2)}) detected`,
    };
  }

  // If OFI opposes the intended order direction strongly:
  // e.g. buying when OFI is strongly negative (heavy sell pressure in orderbook)
  const isAdverseOfi =
    (input.intendedSide === 'buy' && input.ofiSignal <= -ofiLimit) ||
    (input.intendedSide === 'sell' && input.ofiSignal >= ofiLimit);

  if (isAdverseOfi) {
    return {
      mode: 'PASSIVE_POST_ONLY',
      reason: `Adverse OFI pressure (${input.ofiSignal.toFixed(2)}) opposes ${input.intendedSide} direction`,
    };
  }

  return {
    mode: 'AGGRESSIVE_TAKER',
    reason: 'Flow metrics within benign parameters',
  };
}
