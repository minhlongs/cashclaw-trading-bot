import { describe, expect, it } from 'vitest';
import {
  evaluateOperationalTelemetry,
  evaluateOperationalTelemetryBatch,
} from '../attribution';
import type { OperationalTelemetry } from '../types';

const makeTelem = (overrides: Partial<OperationalTelemetry> = {}): OperationalTelemetry => ({
  decisionLatencyMs: 40, dataFreshnessMs: 200,
  providerProvenance: {
    primaryProvider: 'binance', activeProvider: 'binance', usedFallback: false, fallbackAttempts: 0,
  },
  ...overrides,
});

describe('Adversarial Operational Telemetry Alarms & Math Accuracy', () => {
  describe('Staleness Alarm Exact Boundary Tests (5000ms vs 5001ms)', () => {
    it('does NOT trigger STALE_DATA alarm at exact boundary dataFreshnessMs = 5000', () => {
      const summary = evaluateOperationalTelemetry(makeTelem({ dataFreshnessMs: 5000 }));
      expect(summary.alarmTypes).not.toContain('STALE_DATA');
      expect(summary.alarms.some((a) => a.type === 'STALE_DATA')).toBe(false);
      expect(summary.freshness.staleCount).toBe(0);
    });

    it('triggers STALE_DATA alarm when dataFreshnessMs = 5001 (exceeds threshold by 1ms)', () => {
      const summary = evaluateOperationalTelemetry(makeTelem({ dataFreshnessMs: 5001, timestamp: 1727250005001 }));
      expect(summary.alarmTypes).toContain('STALE_DATA');
      const staleAlarm = summary.alarms.find((a) => a.type === 'STALE_DATA');
      expect(staleAlarm).toBeDefined();
      expect(staleAlarm?.metricValue).toBe(5001);
      expect(staleAlarm?.thresholdValue).toBe(5000);
      expect(staleAlarm?.timestamp).toBe(1727250005001);
      expect(summary.freshness.staleCount).toBe(1);
    });

    it('handles custom staleness threshold boundaries (3000ms vs 3001ms)', () => {
      const config = { stalenessThresholdMs: 3000 };
      const nonStale = evaluateOperationalTelemetry(makeTelem({ dataFreshnessMs: 3000 }), config);
      expect(nonStale.alarmTypes).not.toContain('STALE_DATA');
      expect(nonStale.freshness.staleCount).toBe(0);

      const stale = evaluateOperationalTelemetry(makeTelem({ dataFreshnessMs: 3001 }), config);
      expect(stale.alarmTypes).toContain('STALE_DATA');
      expect(stale.freshness.staleCount).toBe(1);
      expect(stale.alarms.find((a) => a.type === 'STALE_DATA')?.thresholdValue).toBe(3000);
    });

    it('handles dataFreshnessMs = 0ms without alarm', () => {
      const summary = evaluateOperationalTelemetry(makeTelem({ dataFreshnessMs: 0 }));
      expect(summary.alarmTypes).not.toContain('STALE_DATA');
      expect(summary.freshness.staleCount).toBe(0);
      expect(summary.freshness.meanDriftMs).toBe(0);
    });
  });

  describe('Latency Alarm Exact Boundary Tests (100ms vs 101ms)', () => {
    it('does NOT trigger HIGH_LATENCY alarm at exact boundary decisionLatencyMs = 100', () => {
      const summary = evaluateOperationalTelemetry(makeTelem({ decisionLatencyMs: 100 }));
      expect(summary.alarmTypes).not.toContain('HIGH_LATENCY');
      expect(summary.alarms.some((a) => a.type === 'HIGH_LATENCY')).toBe(false);
    });

    it('triggers HIGH_LATENCY alarm when decisionLatencyMs = 101 (exceeds threshold by 1ms)', () => {
      const summary = evaluateOperationalTelemetry(makeTelem({ decisionLatencyMs: 101, timestamp: 1727250000101 }));
      expect(summary.alarmTypes).toContain('HIGH_LATENCY');
      const latAlarm = summary.alarms.find((a) => a.type === 'HIGH_LATENCY');
      expect(latAlarm).toBeDefined();
      expect(latAlarm?.metricValue).toBe(101);
      expect(latAlarm?.thresholdValue).toBe(100);
      expect(latAlarm?.timestamp).toBe(1727250000101);
    });

    it('handles custom latency threshold boundaries (50ms vs 51ms)', () => {
      const config = { latencyThresholdMs: 50 };
      const nonHigh = evaluateOperationalTelemetry(makeTelem({ decisionLatencyMs: 50 }), config);
      expect(nonHigh.alarmTypes).not.toContain('HIGH_LATENCY');

      const high = evaluateOperationalTelemetry(makeTelem({ decisionLatencyMs: 51 }), config);
      expect(high.alarmTypes).toContain('HIGH_LATENCY');
      expect(high.alarms.find((a) => a.type === 'HIGH_LATENCY')?.thresholdValue).toBe(50);
    });
  });

  describe('Percentile and Distribution Accuracy on Skewed Distributions', () => {
    it('computes accurate p95, median, mean, and max on skewed 95% zero distribution (N=100)', () => {
      const latencies = [...Array(95).fill(0), ...Array(5).fill(1000)];
      const telemetry = latencies.map((lat) => makeTelem({ decisionLatencyMs: lat }));
      const summary = evaluateOperationalTelemetryBatch(telemetry);

      expect(summary.latency.count).toBe(100);
      expect(summary.latency.mean).toBe(50);
      expect(summary.latency.median).toBe(0);
      expect(summary.latency.p95).toBe(0); // 95th element in 0-indexed is index 94 which is 0
      expect(summary.latency.max).toBe(1000);
    });

    it('computes accurate p95 when top 6% exceeds baseline (N=100, 94 zeroes, 6 high values)', () => {
      const latencies = [...Array(94).fill(0), ...Array(6).fill(1000)];
      const telemetry = latencies.map((lat) => makeTelem({ decisionLatencyMs: lat }));
      const summary = evaluateOperationalTelemetryBatch(telemetry);

      expect(summary.latency.count).toBe(100);
      expect(summary.latency.mean).toBe(60);
      expect(summary.latency.median).toBe(0);
      expect(summary.latency.p95).toBe(1000);
      expect(summary.latency.max).toBe(1000);
    });

    it('computes accurate statistics on single-element and small distributions', () => {
      const single = evaluateOperationalTelemetryBatch([makeTelem({ decisionLatencyMs: 42, dataFreshnessMs: 84 })]);
      expect(single.latency.count).toBe(1);
      expect(single.latency.mean).toBe(42);
      expect(single.latency.median).toBe(42);
      expect(single.latency.p95).toBe(42);
      expect(single.latency.max).toBe(42);

      const even = evaluateOperationalTelemetryBatch([10, 20, 30, 40].map((l) => makeTelem({ decisionLatencyMs: l })));
      expect(even.latency.median).toBe(25);
      expect(even.latency.p95).toBe(40);
    });

    it('computes accurate statistics on empty and zero-filled arrays', () => {
      const empty = evaluateOperationalTelemetryBatch([]);
      expect(empty.count).toBe(0);
      expect(empty.latency.mean).toBe(0);
      expect(empty.latency.p95).toBe(0);

      const zeros = evaluateOperationalTelemetryBatch([0, 0, 0].map((l) => makeTelem({ decisionLatencyMs: l })));
      expect(zeros.latency.mean).toBe(0);
      expect(zeros.latency.median).toBe(0);
      expect(zeros.latency.p95).toBe(0);
    });
  });

  describe('Provider Provenance Fallback Rate & Multi-Provider Grouping', () => {
    it('computes accurate rates for 3 primary vs 1 fallback item (75% vs 25%)', () => {
      const telemetry = [
        makeTelem({ providerProvenance: { primaryProvider: 'p1', activeProvider: 'p1', usedFallback: false, fallbackAttempts: 0 } }),
        makeTelem({ providerProvenance: { primaryProvider: 'p1', activeProvider: 'p1', usedFallback: false, fallbackAttempts: 0 } }),
        makeTelem({ providerProvenance: { primaryProvider: 'p1', activeProvider: 'p1', usedFallback: false, fallbackAttempts: 0 } }),
        makeTelem({ providerProvenance: { primaryProvider: 'p1', activeProvider: 'p2', usedFallback: true, fallbackAttempts: 1 } }),
      ];
      const summary = evaluateOperationalTelemetryBatch(telemetry);
      expect(summary.provenance.totalAttempts).toBe(4);
      expect(summary.provenance.primarySuccessCount).toBe(3);
      expect(summary.provenance.primarySuccessRate).toBe(0.75);
      expect(summary.provenance.fallbackCount).toBe(1);
      expect(summary.provenance.fallbackRate).toBe(0.25);
    });

    it('aggregates multiple distinct providers and calculates average latencies accurately', () => {
      const telemetry = [
        makeTelem({ providerProvenance: { primaryProvider: 'binance', activeProvider: 'binance', usedFallback: false, fallbackAttempts: 0, providerLatencyMs: 20 } }),
        makeTelem({ providerProvenance: { primaryProvider: 'binance', activeProvider: 'binance', usedFallback: false, fallbackAttempts: 0, providerLatencyMs: 30 } }),
        makeTelem({ providerProvenance: { primaryProvider: 'binance', activeProvider: 'bybit', usedFallback: true, fallbackAttempts: 2, providerLatencyMs: 60 } }),
        makeTelem({ providerProvenance: { primaryProvider: 'binance', activeProvider: 'kraken', usedFallback: true, fallbackAttempts: 3, providerLatencyMs: 90 } }),
      ];
      const summary = evaluateOperationalTelemetryBatch(telemetry);
      const byProv = summary.provenance.byProvider;

      expect(byProv.binance.attempts).toBe(2);
      expect(byProv.binance.successCount).toBe(2);
      expect(byProv.binance.avgLatencyMs).toBe(25);

      expect(byProv.bybit.attempts).toBe(2);
      expect(byProv.bybit.successCount).toBe(1);
      expect(byProv.bybit.avgLatencyMs).toBe(60);

      expect(byProv.kraken.attempts).toBe(3);
      expect(byProv.kraken.successCount).toBe(1);
      expect(byProv.kraken.avgLatencyMs).toBe(90);
    });

    it('triggers PROVIDER_FALLBACK if fallbackAttempts > 0 even if usedFallback is false', () => {
      const summary = evaluateOperationalTelemetry(makeTelem({
        providerProvenance: { primaryProvider: 'p1', activeProvider: 'p1', usedFallback: false, fallbackAttempts: 2 },
      }));
      expect(summary.alarmTypes).toContain('PROVIDER_FALLBACK');
      expect(summary.provenance.fallbackCount).toBe(1);
    });

    it('triggers PROVIDER_FALLBACK if usedFallback is true even if fallbackAttempts is 0', () => {
      const summary = evaluateOperationalTelemetry(makeTelem({
        providerProvenance: { primaryProvider: 'p1', activeProvider: 'p2', usedFallback: true, fallbackAttempts: 0 },
      }));
      expect(summary.alarmTypes).toContain('PROVIDER_FALLBACK');
      expect(summary.provenance.fallbackCount).toBe(1);
      expect(summary.provenance.byProvider.p2.attempts).toBe(1);
    });
  });
});
