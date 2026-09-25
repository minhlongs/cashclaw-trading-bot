import { describe, expect, it } from 'vitest';
import {
  evaluateOperationalTelemetry,
  evaluateOperationalTelemetryBatch,
} from '../attribution';
import type { OperationalTelemetry } from '../types';

describe('Tier 5 Adversarial Hardening — Telemetry Analytics', () => {
  it('evaluates single telemetry entry via convenience function', () => {
    const telem: OperationalTelemetry = {
      decisionLatencyMs: 12,
      dataFreshnessMs: 50,
      providerProvenance: {
        primaryProvider: 'binance',
        activeProvider: 'binance',
        usedFallback: false,
        fallbackAttempts: 0,
      },
    };
    const summary = evaluateOperationalTelemetry(telem);
    expect(summary.count).toBe(1);
    expect(summary.latency.meanMs).toBe(12);
    expect(summary.alarms).toHaveLength(0);
  });

  it('handles empty telemetry stream gracefully with zero counts and distributions', () => {
    const empty = evaluateOperationalTelemetryBatch([]);
    expect(empty.count).toBe(0);
    expect(empty.latency.mean).toBe(0);
    expect(empty.latency.median).toBe(0);
    expect(empty.provenance.primarySuccessRate).toBe(1);
    expect(empty.provenance.fallbackRate).toBe(0);
  });

  it('correctly calculates even-length median and triggers alarms on thresholds', () => {
    const stream: OperationalTelemetry[] = [
      {
        decisionLatencyMs: 10,
        dataFreshnessMs: 100,
        providerProvenance: {
          primaryProvider: 'p1',
          activeProvider: 'p1',
          usedFallback: false,
          fallbackAttempts: 0,
          providerLatencyMs: 5,
        },
      },
      {
        decisionLatencyMs: 200,
        dataFreshnessMs: 10_000,
        providerProvenance: {
          primaryProvider: 'p1',
          activeProvider: 'p2',
          usedFallback: true,
          fallbackAttempts: 0,
        },
      },
    ];

    const res = evaluateOperationalTelemetryBatch(stream, {
      latencyThresholdMs: 50,
      stalenessThresholdMs: 1000,
    });

    expect(res.count).toBe(2);
    expect(res.latency.median).toBe(105);
    expect(res.freshness.median).toBe(5050);
    expect(res.alarmTypes).toContain('HIGH_LATENCY');
    expect(res.alarmTypes).toContain('STALE_DATA');
    expect(res.alarmTypes).toContain('PROVIDER_FALLBACK');
    expect(res.provenance.byProvider['p2']?.attempts).toBe(1);
  });
});
