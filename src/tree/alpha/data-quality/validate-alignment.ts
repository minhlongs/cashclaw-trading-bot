import type { AlignmentConfig, Candle, CheckResult, QualityViolation } from './types';
import { ALIGNMENT_DIMENSION, validateConfig, checkEmptySeries } from './validate-alignment-helpers';
import { checkSecondaryTimestamps, checkPrimaryAlignment } from './validate-alignment-checks';

const DEFAULT_TOLERANCE_MS = 0;

export function validateAlignment(primary: readonly Candle[], secondary?: readonly Candle[], config?: AlignmentConfig): CheckResult {
  if (secondary === undefined) return { dimension: ALIGNMENT_DIMENSION, passed: true, violations: [] };
  const configViolation = validateConfig(config);
  if (configViolation) return { dimension: ALIGNMENT_DIMENSION, passed: false, violations: [configViolation] };
  const emptySeriesResult = checkEmptySeries(primary, secondary);
  if (emptySeriesResult) return emptySeriesResult;

  const toleranceMs = config?.toleranceMs ?? DEFAULT_TOLERANCE_MS;
  const maxUnmatched = config?.maxUnmatchedCandles ?? 0;
  const secondaryViolations = checkSecondaryTimestamps(secondary);
  const recordedViolations: QualityViolation[] = [...secondaryViolations];
  if (secondaryViolations.length === 0) recordedViolations.push(...checkPrimaryAlignment(primary, secondary, toleranceMs));

  const lengthDiff = Math.abs(primary.length - secondary.length);
  const lengthViolation = lengthDiff > maxUnmatched;
  if (lengthViolation) {
    recordedViolations.push({
      dimension: ALIGNMENT_DIMENSION,
      message: `Series length discrepancy: primary (${primary.length}) vs secondary (${secondary.length}) exceeds tolerance`,
      details: { primaryLength: primary.length, secondaryLength: secondary.length, maxUnmatched },
    });
  }

  const passed = !lengthViolation && secondaryViolations.length === 0 && recordedViolations.length <= maxUnmatched;
  return { dimension: ALIGNMENT_DIMENSION, passed, violations: passed ? [] : recordedViolations };
}
