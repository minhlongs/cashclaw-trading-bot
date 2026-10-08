import { test, expect, describe } from 'vitest';
import { black76, normCdf } from '../../src/quant/black-76';

describe('Black-76 Pricer', () => {
  test('normCdf calculates correct standard normal cumulative distributions', () => {
    // Normal cases
    expect(normCdf(0)).toBeCloseTo(0.5, 5);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3); // 95% confidence bounds
    expect(normCdf(-1.96)).toBeCloseTo(0.025, 3);
    
    // Asymptotic bounds
    expect(normCdf(5)).toBeGreaterThan(0.9999);
    expect(normCdf(-5)).toBeLessThan(0.0001);
  });

  test('black76 calculates call prices correctly', () => {
    // At the money
    const callPrice = black76('C', 100, 100, 1.0, 0.05, 0.2);
    expect(callPrice).toBeCloseTo(7.58, 1);
    
    // In the money
    const itmCallPrice = black76('C', 110, 100, 1.0, 0.05, 0.2);
    expect(itmCallPrice).toBeGreaterThan(callPrice);
    
    // Out of the money
    const otmCallPrice = black76('C', 90, 100, 1.0, 0.05, 0.2);
    expect(otmCallPrice).toBeLessThan(callPrice);
  });

  test('black76 calculates put prices correctly', () => {
    // At the money
    const putPrice = black76('P', 100, 100, 1.0, 0.05, 0.2);
    expect(putPrice).toBeCloseTo(7.58, 1);
    
    // Out of the money
    const otmPutPrice = black76('P', 110, 100, 1.0, 0.05, 0.2);
    expect(otmPutPrice).toBeLessThan(putPrice);
    
    // In the money
    const itmPutPrice = black76('P', 90, 100, 1.0, 0.05, 0.2);
    expect(itmPutPrice).toBeGreaterThan(putPrice);
  });
  
  test('black76 handles edge cases, zero time or vol', () => {
    // t <= 0
    expect(black76('C', 100, 100, 0, 0.05, 0.2)).toBe(0);
    expect(black76('C', 120, 100, 0, 0.05, 0.2)).toBe(20);
    expect(black76('P', 100, 100, -1, 0.05, 0.2)).toBe(0);
    expect(black76('P', 80, 100, 0, 0.05, 0.2)).toBe(20);
    
    // v <= 0
    expect(black76('C', 110, 100, 1, 0.05, 0)).toBe(10);
    expect(black76('P', 90, 100, 1, 0.05, 0)).toBe(10);
  });
});
