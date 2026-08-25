// Input validation for the relative-value evaluation seam.
// Fail-closed: every structural violation throws before simulation.

import type { PairPanel } from '@/tree/alpha/relative-value';
import type { RelativeValueEvalConfig } from './types';

function requireFinitePositive(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`evaluateRelativeValue: ${field} must be a positive finite number`);
  }
}

function requireFiniteNonNegative(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`evaluateRelativeValue: ${field} must be a non-negative finite number`);
  }
}

function requireStringNonEmpty(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`evaluateRelativeValue: ${field} must be a non-empty string`);
  }
}

function requirePositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`evaluateRelativeValue: ${field} must be a positive integer`);
  }
}

function requirePanel(p: PairPanel): void {
  if (p.timestamps.length === 0) {
    throw new Error('evaluateRelativeValue: panel must be non-empty');
  }
  if (p.timestamps.length !== p.closesA.length || p.timestamps.length !== p.closesB.length) {
    throw new Error('evaluateRelativeValue: panel array lengths differ');
  }
}

function requireConfig(c: RelativeValueEvalConfig): void {
  requireStringNonEmpty(c.experimentId, 'experimentId');
  requireStringNonEmpty(c.timeframe, 'timeframe');
  requireFinitePositive(c.periodsPerYear, 'periodsPerYear');
  if (!Number.isFinite(c.entryZ) || c.entryZ <= 0) {
    throw new Error('evaluateRelativeValue: entryZ must be a positive finite number');
  }
  if (!Number.isFinite(c.exitZ) || c.exitZ < 0) {
    throw new Error('evaluateRelativeValue: exitZ must be a non-negative finite number');
  }
  if (c.entryZ <= c.exitZ) {
    throw new Error('evaluateRelativeValue: entryZ must be strictly greater than exitZ');
  }
  requireFinitePositive(c.maxHalfLife, 'maxHalfLife');
  requireFiniteNonNegative(c.minCorrelation, 'minCorrelation');
  requireFinitePositive(c.zWindow, 'zWindow');
  requirePositiveInteger(c.revalidateEvery, 'revalidateEvery');
  requirePositiveInteger(c.minObservations, 'minObservations');
}

function requireBenchmark(r: RelativeValueEvalConfig): void {
  if (r.benchmarkReturns !== undefined) {
    if (r.benchmarkReturns.timestamps.length === 0) {
      throw new Error('evaluateRelativeValue: benchmarkReturns must be non-empty');
    }
    if (
      r.benchmarkReturns.timestamps.length !== r.benchmarkReturns.returns.length
    ) {
      throw new Error(
        `evaluateRelativeValue: benchmarkReturns timestamps/returns length mismatch`,
      );
    }
  }
}

export function validateEvalInputs(
  panel: PairPanel,
  config: RelativeValueEvalConfig,
): void {
  requirePanel(panel);
  requireConfig(config);
  requireBenchmark(config);
}
