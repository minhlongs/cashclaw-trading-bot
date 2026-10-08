import { describe, expect, it } from 'vitest';
import {
  evalCrossAssetRobustness,
  evalCrossPeriodRobustness,
  evalFeeStress,
  evalParameterRobustness,
  evalSlippageStress,
} from './promotion-gate-fixtures';

export function registerTier1StressTests(): void {
  describe('Tier 1: Feature Coverage — Stress & Robustness Checks (F7-F11)', () => {
    describe('F7: feeStress (Fee Friction Robustness)', () => {
      it('passes when net PnL is positive under both Normal and Conservative fees', () => {
        const check = evalFeeStress(1500, 800);
        expect(check.passed).toBe(true);
        expect(check.actual).toBe(800);
      });

      it('fails when Conservative fee net PnL is negative despite positive Normal fee PnL', () => {
        const check = evalFeeStress(500, -100);
        expect(check.passed).toBe(false);
      });

      it('fails when Conservative fee net PnL is exactly zero', () => {
        const check = evalFeeStress(1000, 0);
        expect(check.passed).toBe(false);
        expect(check.detail).toContain('vs. > 0');
      });

      it('fails when Normal fee net PnL is negative', () => {
        const check = evalFeeStress(-50, -200);
        expect(check.passed).toBe(false);
      });

      it('details string documents both Normal and Conservative net PnL', () => {
        const check = evalFeeStress(1200.5, 950.25);
        expect(check.detail).toContain('NORMAL: 1200.50');
        expect(check.detail).toContain('CONSERVATIVE: 950.25');
      });
    });

    describe('F8: slippageStress (Liquidity Shock Robustness)', () => {
      it('passes when net PnL is positive under both Adverse and Extreme stress', () => {
        const check = evalSlippageStress(800, 250);
        expect(check.passed).toBe(true);
        expect(check.actual).toBe(250);
      });

      it('fails when Extreme slippage net PnL is negative despite positive Adverse PnL', () => {
        const check = evalSlippageStress(300, -500);
        expect(check.passed).toBe(false);
      });

      it('fails when Extreme slippage net PnL is exactly zero', () => {
        const check = evalSlippageStress(500, 0);
        expect(check.passed).toBe(false);
      });

      it('fails when Adverse slippage net PnL is negative', () => {
        const check = evalSlippageStress(-100, -800);
        expect(check.passed).toBe(false);
      });

      it('details string documents both Adverse and Extreme net PnL', () => {
        const check = evalSlippageStress(1050.2, 340.5);
        expect(check.detail).toContain('ADVERSE: 1050.20');
        expect(check.detail).toContain('EXTREME: 340.50');
      });
    });

    describe('F9: parameterRobustness (Normalized Sensitivity Spread <= 0.50)', () => {
      it('passes when parameter sensitivity spread is low', () => {
        const check = evalParameterRobustness(0.22, 0.50);
        expect(check.passed).toBe(true);
        expect(check.actual).toBe(0.22);
      });

      it('passes when parameter spread is exactly at threshold', () => {
        const check = evalParameterRobustness(0.50, 0.50);
        expect(check.passed).toBe(true);
      });

      it('passes when parameter spread is zero (flat response across grid)', () => {
        const check = evalParameterRobustness(0.0, 0.50);
        expect(check.passed).toBe(true);
      });

      it('fails when parameter spread exceeds threshold (curve-fit cliff)', () => {
        const check = evalParameterRobustness(0.68, 0.50);
        expect(check.passed).toBe(false);
        expect(check.detail).toContain('0.6800 vs. maximum 0.5');
      });

      it('fails when spread is negative or NaN', () => {
        const checkNeg = evalParameterRobustness(-0.1, 0.50);
        const checkNan = evalParameterRobustness(NaN, 0.50);
        expect(checkNeg.passed).toBe(false);
        expect(checkNan.passed).toBe(false);
      });
    });

    describe('F10: crossPeriodRobustness (Walk-Forward OOS Consistency >= 60%)', () => {
      it('passes when walk-forward positive OOS fraction exceeds threshold', () => {
        const check = evalCrossPeriodRobustness(0.80, 0.60);
        expect(check.passed).toBe(true);
        expect(check.actual).toBe(0.80);
      });

      it('passes when walk-forward fraction matches exact 60% threshold', () => {
        const check = evalCrossPeriodRobustness(0.60, 0.60);
        expect(check.passed).toBe(true);
      });

      it('fails when walk-forward fraction is below threshold', () => {
        const check = evalCrossPeriodRobustness(0.40, 0.60);
        expect(check.passed).toBe(false);
        expect(check.detail).toContain('40.0% vs. minimum 60%');
      });

      it('fails when 0% of OOS windows are positive', () => {
        const check = evalCrossPeriodRobustness(0.0, 0.60);
        expect(check.passed).toBe(false);
      });

      it('fails when positive fraction is NaN or non-finite', () => {
        const check = evalCrossPeriodRobustness(NaN, 0.60);
        expect(check.passed).toBe(false);
      });
    });

    describe('F11: crossAssetRobustness (Multi-Symbol Consistency >= 50%)', () => {
      it('passes when positive asset fraction exceeds threshold', () => {
        const check = evalCrossAssetRobustness(0.75, true, 0.50);
        expect(check.passed).toBe(true);
        expect(check.actual).toBe(0.75);
      });

      it('passes when positive asset fraction matches exact threshold', () => {
        const check = evalCrossAssetRobustness(0.50, true, 0.50);
        expect(check.passed).toBe(true);
      });

      it('fails when positive asset fraction is below threshold', () => {
        const check = evalCrossAssetRobustness(0.25, true, 0.50);
        expect(check.passed).toBe(false);
        expect(check.detail).toContain('25.0% vs. minimum 50%');
      });

      it('passes with exemption when strategy is declared asset-specific', () => {
        const check = evalCrossAssetRobustness(0.0, false, 0.50);
        expect(check.passed).toBe(true);
        expect(check.actual).toBe('exempt');
        expect(check.detail).toContain('Exempted: asset-specific');
      });

      it('fails when fraction is NaN and applicable is true', () => {
        const check = evalCrossAssetRobustness(NaN, true, 0.50);
        expect(check.passed).toBe(false);
      });
    });
  });
}
