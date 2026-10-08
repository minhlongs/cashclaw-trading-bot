import { evaluateDataQuality } from './evaluate';
import { SignalGenerationResultSchema } from './schemas';
import type {
  DataQualityAssessmentReport,
  DataQualityEvalConfig,
  DataQualityEvalInput,
  SignalGenerationResult,
  SignalGenerator,
} from './types';

/**
 * Custom error thrown when data quality assertions fail.
 */
export class DataQualityAssertionError extends Error {
  readonly report: DataQualityAssessmentReport;

  constructor(message: string, report: DataQualityAssessmentReport) {
    super(message);
    this.name = 'DataQualityAssertionError';
    this.report = report;
    Object.setPrototypeOf(this, DataQualityAssertionError.prototype);
  }
}

/**
 * Asserts that a data quality assessment report has status VALID.
 * Throws DataQualityAssertionError if status is DATA_INVALID.
 */
export function assertDataQualityValid(report: DataQualityAssessmentReport): void {
  if (report.status !== 'VALID') {
    const violationSummary = report.validationResult.violations
      .map((violation) => `[${violation.dimension}] ${violation.message}`)
      .join('; ');
    throw new DataQualityAssertionError(
      `Data quality assertion failed for ${report.symbol} (${report.timeframe}) with status ${report.status}. ` +
        `${report.summary.violationCount} violation(s) detected across ` +
        `${report.summary.failedChecks} failed check(s): ${violationSummary}`,
      report,
    );
  }
}

/**
 * Fail-closed signal generation fence.
 * Short-circuits immediately with signal: null if evaluation status is DATA_INVALID.
 * The generator callback is NEVER called when data quality checks fail.
 */
export function protectSignalGeneration<T>(
  input: DataQualityEvalInput,
  generator: SignalGenerator<T>,
  config?: DataQualityEvalConfig,
): SignalGenerationResult<T> {
  if (input.series.length === 0) {
    const report = evaluateDataQuality(input, config);
    const invalidResult: SignalGenerationResult<T> = {
      status: 'DATA_INVALID',
      signal: null,
      report,
    };
    return SignalGenerationResultSchema.parse(invalidResult) as SignalGenerationResult<T>;
  }

  const report = evaluateDataQuality(input, config);

  if (report.status === 'DATA_INVALID') {
    const invalidResult: SignalGenerationResult<T> = {
      status: 'DATA_INVALID',
      signal: null,
      report,
    };
    return SignalGenerationResultSchema.parse(invalidResult) as SignalGenerationResult<T>;
  }

  const signal = generator(input.series);

  const validResult: SignalGenerationResult<T> = {
    status: 'VALID',
    signal,
    report,
  };
  return SignalGenerationResultSchema.parse(validResult) as SignalGenerationResult<T>;
}
