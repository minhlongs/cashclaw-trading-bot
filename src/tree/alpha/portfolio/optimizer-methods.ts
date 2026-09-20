// Portfolio Optimizer — Allocation Methods
// Each method returns raw relative weights (budget-agnostic).

import type { AlphaSignal } from '../types';
import type { RegimeLabel } from '../../regime/types';
import type { Allocation } from './types';

export function equalWeight(qualified: AlphaSignal[]): Allocation[] {
  const w = qualified.length > 0 ? 1 / qualified.length : 0;
  return qualified.map((s) => ({
    symbol: s.features.symbol,
    weight: w,
    size: 0,
    confidence: s.confidence,
    regime: 'RANGE' as RegimeLabel,
  }));
}

export function confidenceWeighted(qualified: AlphaSignal[]): Allocation[] {
  const total = qualified.reduce((sum, s) => sum + s.confidence, 0);
  if (total === 0) return [];
  return qualified.map((s) => ({
    symbol: s.features.symbol,
    weight: s.confidence / total,
    size: 0,
    confidence: s.confidence,
    regime: 'RANGE' as RegimeLabel,
  }));
}

export function riskParity(qualified: AlphaSignal[]): Allocation[] {
  if (qualified.length === 0) return [];
  // ATR proxy = 1 - confidence; higher confidence = lower risk = higher weight.
  const atrProxies = qualified.map((s) => Math.max(0.01, 1 - s.confidence));
  const totalInvRisk = atrProxies.reduce((sum, r) => sum + 1 / r, 0);
  return qualified.map((s, i) => ({
    symbol: s.features.symbol,
    weight: (1 / atrProxies[i]) / totalInvRisk,
    size: 0,
    confidence: s.confidence,
    regime: 'RANGE' as RegimeLabel,
  }));
}

export function regimeSized(qualified: AlphaSignal[]): Allocation[] {
  // Pure confidence-weighted distribution; regime multiplier is applied to the
  // budget externally so it affects total exposure, not just distribution.
  const total = qualified.reduce((sum, s) => sum + s.confidence, 0);
  return qualified.map((s) => {
    const share = total > 0 ? s.confidence / total : (1 / qualified.length);
    return {
      symbol: s.features.symbol,
      weight: share,
      size: 0,
      confidence: s.confidence,
      regime: 'RANGE' as RegimeLabel,
    };
  });
}
