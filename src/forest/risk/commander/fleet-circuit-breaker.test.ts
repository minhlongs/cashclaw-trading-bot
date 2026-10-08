import { describe, it, expect } from 'vitest';
import { evaluateFleetCircuitBreaker } from './fleet-circuit-breaker';

describe('Fleet Circuit Breaker', () => {
  it('reports normal status under safe equity drawdowns', () => {
    const status = evaluateFleetCircuitBreaker(98000, 100000); // 2% DD
    expect(status.isTriggered).toBe(false);
    expect(status.actionRequired).toBe('none');
    expect(status.portfolioDrawdownPct).toBeCloseTo(0.02, 3);
  });

  it('reports warning and risk reduction on moderate drawdown', () => {
    const status = evaluateFleetCircuitBreaker(90000, 100000, 0.15, 0.08); // 10% DD
    expect(status.isTriggered).toBe(false);
    expect(status.actionRequired).toBe('reduce_risk');
  });

  it('triggers emergency pause on severe drawdown exceeding limit', () => {
    const status = evaluateFleetCircuitBreaker(80000, 100000, 0.15, 0.08); // 20% DD > 15%
    expect(status.isTriggered).toBe(true);
    expect(status.actionRequired).toBe('emergency_pause_all');
    expect(status.reason).toContain('exceeded emergency ceiling');
  });

  it('fails safely on zero equity', () => {
    const status = evaluateFleetCircuitBreaker(0, 100000);
    expect(status.isTriggered).toBe(true);
    expect(status.actionRequired).toBe('emergency_pause_all');
  });
});
