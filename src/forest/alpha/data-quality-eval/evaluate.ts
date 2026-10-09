import {
  validateCandleSeries,
  type ValidationResult,
} from '@/tree/alpha/data-quality';
import { DataQualityAssessmentReportSchema } from './schemas';
import type {
  DataQualityAssessmentReport,
  DataQualityEvalConfig,
  DataQualityEvalInput,
  DataQualitySummary,
} from './types';
import {
  buildRecommendations,
  guardEmptySeries,
} from './evaluate-guards';

/**
 * Orchestrates comprehensive data quality evaluation across all 9 dimensions.
 * Validates output against strict Zod schema before returning.
 */
export function evaluateDataQuality(
  input: DataQualityEvalInput,
  config?: DataQualityEvalConfig,
): DataQualityAssessmentReport {
  if (!input || !Array.isArray(input.series)) {
    throw new TypeError('Invalid input: series array is required.');
  }

  const effectiveConfig: DataQualityEvalConfig = {
    ...config,
    asOf: config?.asOf ?? input.asOf,
    timeframe: config?.timeframe ?? input.timeframe,
  };

  let validationResult: ValidationResult = validateCandleSeries(
    input.series,
    effectiveConfig,
    input.secondarySeries,
  );

  if (input.series.length === 0) {
    validationResult = guardEmptySeries(validationResult);
  }

  const totalChecks = validationResult.checkResults.length;
  const passedChecks = validationResult.checkResults.filter((result) => result.passed).length;
  const failedChecks = totalChecks - passedChecks;
  const violationCount = validationResult.violations.length;

  const summary: DataQualitySummary = {
    totalChecks,
    passedChecks,
    failedChecks,
    violationCount,
  };

  const evaluatedAt =
    config?.generatedAt ?? effectiveConfig.asOf ?? Date.now();

  const report: DataQualityAssessmentReport = {
    status: validationResult.status,
    symbol: input.symbol,
    timeframe: input.timeframe,
    evaluatedAt,
    validationResult,
    summary,
    recommendations: buildRecommendations(validationResult.checkResults),
  };

  return DataQualityAssessmentReportSchema.parse(report);
}
