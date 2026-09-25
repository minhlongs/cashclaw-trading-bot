import { describe, expect, it } from 'vitest';
import type { CostStressTier, ShadowFill, ShadowOrder } from '../../../../tree/alpha/observability/types';
import { evaluateObservability } from '../evaluate';
import { ObservabilityAlarmSchema, ObservabilityReportSchema } from '../schemas';

function makeOrder(orderId: string, side: 'buy' | 'sell' = 'buy', ts = 1700000000000, symbol = 'BTC/USDT'): ShadowOrder {
  return { orderId, symbol, side, size: 1000, price: 50000, targetWeightDelta: 0.05, decisionTimestamp: ts };
}

function makeFill(fillId: string, orderId: string, side: 'buy' | 'sell' = 'buy', ts = 1700000000050, tier: CostStressTier = 'normal'): ShadowFill {
  return {
    fillId, orderId, symbol: 'BTC/USDT', side, fillPrice: 50010, fillQuantity: 0.02,
    fillTimestamp: ts, feeAmount: 1.0, slippageBps: 2.0, stressTier: tier,
  };
}

describe('Adversarial Stream Joining: Telemetry & Alarms', () => {
  it('triggers WARN alarm for order without fill and degrades health to DEGRADED', () => {
    const orders = [makeOrder('ord-1', 'buy', 1000), makeOrder('ord-2-missing-fill', 'sell', 2000, 'ETH/USDT')];
    const fills = [makeFill('fill-1', 'ord-1', 'buy', 1050)];

    const report = evaluateObservability({
      alphaDecisions: [], portfolioDecisions: [], shadowOrders: orders, shadowFills: fills, operationalTelemetry: [],
    });

    expect(ObservabilityReportSchema.parse(report)).toBeDefined();
    expect(report.systemHealth.overallStatus).toBe('DEGRADED');
    expect(report.systemHealth.alarmCounts.unmatchedOrder).toBe(1);

    const warnAlarm = report.systemHealth.alarms.find((a) => a.severity === 'WARN' && a.type === 'UNMATCHED_ORDER');
    expect(warnAlarm).toBeDefined();
    expect(warnAlarm?.message).toContain('ord-2-missing-fill');
    expect(warnAlarm?.message).toContain('ETH/USDT');
    expect(warnAlarm?.timestamp).toBe(2000);
    expect(warnAlarm?.context).toEqual({ orderId: 'ord-2-missing-fill', symbol: 'ETH/USDT' });
    expect(ObservabilityAlarmSchema.parse(warnAlarm)).toBeDefined();
  });

  it('triggers CRITICAL alarm for fill without order and escalates to CRITICAL', () => {
    const orders = [makeOrder('ord-1', 'buy', 1000)];
    const fills = [
      makeFill('fill-1', 'ord-1', 'buy', 1050),
      makeFill('fill-ghost', 'non-existent-order', 'sell', 3050),
    ];

    const report = evaluateObservability({
      alphaDecisions: [], portfolioDecisions: [], shadowOrders: orders, shadowFills: fills, operationalTelemetry: [],
    });

    expect(ObservabilityReportSchema.parse(report)).toBeDefined();
    expect(report.systemHealth.overallStatus).toBe('CRITICAL');
    expect(report.systemHealth.alarmCounts.unmatchedOrder).toBe(1);

    const critAlarm = report.systemHealth.alarms.find((a) => a.severity === 'CRITICAL' && a.type === 'UNMATCHED_ORDER');
    expect(critAlarm).toBeDefined();
    expect(critAlarm?.message).toContain('fill-ghost');
    expect(critAlarm?.message).toContain('non-existent-order');
    expect(critAlarm?.timestamp).toBe(3050);
    expect(critAlarm?.context).toEqual({ fillId: 'fill-ghost', orderId: 'non-existent-order' });
    expect(ObservabilityAlarmSchema.parse(critAlarm)).toBeDefined();
  });

  it('handles simultaneous missing orders and missing fills with correct alarm counts', () => {
    const orders = [makeOrder('ord-A', 'buy', 1000), makeOrder('ord-B-unfilled', 'buy', 2000)];
    const fills = [makeFill('fill-A', 'ord-A', 'buy', 1050), makeFill('fill-orphan', 'ord-C-ghost', 'sell', 3000)];

    const report = evaluateObservability({
      alphaDecisions: [], portfolioDecisions: [], shadowOrders: orders, shadowFills: fills, operationalTelemetry: [],
    });

    expect(report.systemHealth.overallStatus).toBe('CRITICAL');
    expect(report.systemHealth.alarmCounts.unmatchedOrder).toBe(2);

    const warnAlarm = report.systemHealth.alarms.find((a) => a.severity === 'WARN' && a.type === 'UNMATCHED_ORDER');
    const critAlarm = report.systemHealth.alarms.find((a) => a.severity === 'CRITICAL' && a.type === 'UNMATCHED_ORDER');
    expect(warnAlarm).toBeDefined();
    expect(critAlarm).toBeDefined();
  });

  it('handles 1-to-many partial fills without false alarms', () => {
    const orders = [makeOrder('ord-large', 'buy', 1000)];
    const fills = [
      makeFill('fill-1', 'ord-large', 'buy', 1020),
      makeFill('fill-2', 'ord-large', 'buy', 1040),
      makeFill('fill-3', 'ord-large', 'buy', 1060),
    ];

    const report = evaluateObservability({
      alphaDecisions: [], portfolioDecisions: [], shadowOrders: orders, shadowFills: fills, operationalTelemetry: [],
    });

    expect(report.systemHealth.overallStatus).toBe('HEALTHY');
    expect(report.systemHealth.alarmCounts.unmatchedOrder).toBe(0);
    expect(report.sampleCounts.shadowOrders).toBe(1);
    expect(report.sampleCounts.shadowFills).toBe(3);
  });

  it('survives multi-stream bursts with 50 unmatched orders and 50 orphan fills', () => {
    const orders: ShadowOrder[] = [];
    const fills: ShadowFill[] = [];

    for (let i = 0; i < 50; i++) {
      orders.push(makeOrder(`unfilled-ord-${i}`, 'buy', 1000 + i));
      fills.push(makeFill(`orphan-fill-${i}`, `ghost-ord-${i}`, 'sell', 2000 + i));
    }

    const report = evaluateObservability({
      alphaDecisions: [], portfolioDecisions: [], shadowOrders: orders, shadowFills: fills, operationalTelemetry: [],
    });

    expect(report.systemHealth.overallStatus).toBe('CRITICAL');
    expect(report.systemHealth.alarmCounts.unmatchedOrder).toBe(100);
    expect(report.systemHealth.alarms).toHaveLength(100);
    const warns = report.systemHealth.alarms.filter((a) => a.severity === 'WARN');
    const crits = report.systemHealth.alarms.filter((a) => a.severity === 'CRITICAL');
    expect(warns).toHaveLength(50);
    expect(crits).toHaveLength(50);
    expect(ObservabilityReportSchema.parse(report)).toBeDefined();
  });
});
