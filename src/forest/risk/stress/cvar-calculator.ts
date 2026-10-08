// Conditional Value-at-Risk (Expected Shortfall) Calculator for Stressed Portfolios
import type { CvarRiskMetrics } from './stress-types';

export function calculatePortfolioCvar(
  simulatedReturnsOrLossesUsd: readonly number[], // Positive values = losses in USD
  portfolioEquityUsd: number,
  confidenceLevel = 0.99,
): CvarRiskMetrics {
  if (simulatedReturnsOrLossesUsd.length === 0 || portfolioEquityUsd <= 0) {
    return {
      confidenceLevel,
      parametricVarUsd: 0,
      expectedShortfallCvarUsd: 0,
      worstSimulatedLossUsd: 0,
    };
  }

  // Sort losses in ascending order (worst losses at the end)
  const sortedLosses = [...simulatedReturnsOrLossesUsd].sort((a, b) => a - b);
  const cutoffIndex = Math.floor(sortedLosses.length * confidenceLevel);
  // The VaR index is the rank corresponding to the (1 - alpha) threshold
  const varIndex = Math.min(sortedLosses.length - 1, Math.max(0, cutoffIndex - 1));

  const parametricVarUsd = sortedLosses[varIndex];
  const tailLosses = sortedLosses.slice(varIndex);

  const expectedShortfallCvarUsd =
    tailLosses.length > 0
      ? tailLosses.reduce((acc, val) => acc + val, 0) / tailLosses.length
      : parametricVarUsd;

  const worstSimulatedLossUsd = sortedLosses[sortedLosses.length - 1];

  return {
    confidenceLevel,
    parametricVarUsd: Number(parametricVarUsd.toFixed(2)),
    expectedShortfallCvarUsd: Number(expectedShortfallCvarUsd.toFixed(2)),
    worstSimulatedLossUsd: Number(worstSimulatedLossUsd.toFixed(2)),
  };
}
