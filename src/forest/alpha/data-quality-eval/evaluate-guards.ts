import type {
  CheckResult,
  QualityDimension,
  QualityViolation,
  ValidationResult,
} from '@/tree/alpha/data-quality';

export const RECOMMENDATION_MAP: Readonly<Record<QualityDimension, string>> = {
  timestamp_monotonicity: 'Sort candle series by timestamp in strictly increasing order.',
  duplicate_candles: 'Deduplicate candles by timestamp prior to ingestion.',
  missing_intervals:
    'Fill or interpolate missing time gaps in feed, or inspect upstream candle provider continuity.',
  stale_data: 'Data feed is stale; check real-time feed connectivity or websocket latency.',
  impossible_ohlc:
    'Cleanse corrupted OHLC ticks; ensure High >= max(Open, Close) and Low <= min(Open, Close).',
  volume_anomalies:
    'Sanitize volume figures; ensure non-negative volume and investigate zero-volume periods.',
  cross_source_alignment:
    'Re-align secondary feed timestamps or calibrate cross-exchange clock skew tolerance.',
  future_data:
    'Purge future-dated candles; ensure ingestion timestamps do not exceed evaluation reference asOf time.',
  exchange_outage:
    'Detect potential exchange freeze/halt; verify trading status during identical consecutive bar intervals.',
};

export function buildRecommendations(checkResults: readonly CheckResult[]): readonly string[] {
  const failedDimensions = new Set(
    checkResults.filter((result) => !result.passed).map((result) => result.dimension),
  );

  if (failedDimensions.size === 0) {
    return ['Data quality is valid. Series is suitable for alpha signal generation.'];
  }

  const recommendations: string[] = [];
  for (const [dimension, recommendation] of Object.entries(RECOMMENDATION_MAP)) {
    if (failedDimensions.has(dimension as QualityDimension)) {
      recommendations.push(recommendation);
    }
  }

  return recommendations;
}

export function guardEmptySeries(validationResult: ValidationResult): ValidationResult {
  const hasStaleViolation = validationResult.violations.some((v) => v.dimension === 'stale_data');
  if (hasStaleViolation) {
    return validationResult;
  }

  const emptyViolation: QualityViolation = {
    dimension: 'stale_data',
    message: 'Candle series is empty: cannot generate signals from empty data',
    details: { candleCount: 0 },
  };

  const checkResults = validationResult.checkResults.map((cr) => {
    if (cr.dimension === 'stale_data') {
      return {
        dimension: 'stale_data' as const,
        passed: false,
        violations: [...cr.violations, emptyViolation],
      };
    }
    return cr;
  });

  if (!checkResults.some((cr) => cr.dimension === 'stale_data')) {
    checkResults.push({
      dimension: 'stale_data',
      passed: false,
      violations: [emptyViolation],
    });
  }

  return {
    ...validationResult,
    valid: false,
    status: 'DATA_INVALID',
    checkResults,
    violations: [...validationResult.violations, emptyViolation],
  };
}
