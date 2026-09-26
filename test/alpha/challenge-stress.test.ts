import { describe, it, expect } from 'vitest';
import { checkFeeStress, checkSlippageStress } from '../../src/forest/alpha/gate/stress-checks';
import { GateCheckSchema } from '../../src/forest/alpha/gate/schemas';

describe('Adversarial Challenge: Stress Checks 7-8', () => {
  it('Check 7 (feeStress): normal > 0 & conservative <= 0, and non-finites', () => {
    // normal > 0 & conservative <= 0 fails
    expect(checkFeeStress(100, 0).passed).toBe(false);
    expect(checkFeeStress(100, -0.0001).passed).toBe(false);

    // normal <= 0 & conservative > 0 fails
    expect(checkFeeStress(0, 50).passed).toBe(false);
    expect(checkFeeStress(-5, 50).passed).toBe(false);

    // both positive passes
    const res = checkFeeStress(100, 50);
    expect(res.passed).toBe(true);
    expect(GateCheckSchema.parse(res).passed).toBe(true);

    // non-finites fail-closed
    expect(checkFeeStress(Number.NaN, 50).passed).toBe(false);
    expect(checkFeeStress(100, Number.NaN).actual).toBeNull();
    expect(checkFeeStress(Number.POSITIVE_INFINITY, 50).passed).toBe(false);
    expect(checkFeeStress(100, Number.POSITIVE_INFINITY).passed).toBe(false);
  });

  it('Check 8 (slippageStress): adverse > 0 & extreme (100 bps) <= 0, and non-finites', () => {
    // adverse > 0 & extreme <= 0 fails
    expect(checkSlippageStress(50, 0).passed).toBe(false);
    expect(checkSlippageStress(50, -0.0001).passed).toBe(false);

    // adverse <= 0 & extreme > 0 fails
    expect(checkSlippageStress(0, 10).passed).toBe(false);
    expect(checkSlippageStress(-1, 10).passed).toBe(false);

    // both positive passes
    const res = checkSlippageStress(50, 10);
    expect(res.passed).toBe(true);
    expect(GateCheckSchema.parse(res).passed).toBe(true);

    // non-finites fail-closed
    expect(checkSlippageStress(50, Number.NaN).passed).toBe(false);
    expect(checkSlippageStress(Number.NaN, 10).actual).toBeNull();
    expect(checkSlippageStress(Number.POSITIVE_INFINITY, 10).passed).toBe(false);
    expect(checkSlippageStress(50, Number.POSITIVE_INFINITY).passed).toBe(false);
  });
});
