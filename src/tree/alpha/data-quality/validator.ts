import type {
  Candle,
  CheckResult,
  DataQualityConfig,
  ValidationResult,
} from './types';
import { RUNNERS } from './validator-runners';

export * from './validator-runners';

/**
 * Composite validator executing all 9 data quality dimensions.
 * Produces fail-closed result: any violation marks status as 'DATA_INVALID'.
 */
export function validateCandleSeries(
  candles: readonly Candle[],
  config?: DataQualityConfig,
  secondarySeries?: readonly Candle[],
): ValidationResult {
  const enabled = config?.enabledDimensions ? new Set(config.enabledDimensions) : null;
  const checkResults: CheckResult[] = [];

  for (const runner of RUNNERS) {
    if (enabled && !enabled.has(runner.dimension)) {
      continue;
    }
    try {
      checkResults.push(runner.run(candles, config, secondarySeries));
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      checkResults.push({
        dimension: runner.dimension,
        passed: false,
        violations: [
          {
            dimension: runner.dimension,
            message: `Unexpected error during ${runner.dimension} validation: ${errorMsg}`,
            details: { error: errorMsg },
          },
        ],
      });
    }
  }

  const violations = checkResults.flatMap((r) => r.violations);
  const passedAll = checkResults.every((r) => r.passed);
  const valid = passedAll && violations.length === 0;

  return {
    valid,
    status: valid ? 'VALID' : 'DATA_INVALID',
    checkResults,
    violations,
    totalCandles: candles.length,
  };
}
