import { describe, expect, it } from 'vitest';
import {
  evalMaxDrawdown,
  evalMinNetExpectancy,
  evalMinProfitFactor,
  evalMinRegimeCoverage,
  evalMinSharpeSortino,
  evalMinTrades,
} from './promotion-gate-fixtures';

export function registerTier1FinancialTests(): void {
  describe('Tier 1: Feature Coverage — Financial & Performance Checks (F1-F6)', () => {
    describe('F1: minTrades (Sample Sufficiency >= 30)', () => {
      it('passes when trade count is well above threshold', () => {
        const check = evalMinTrades(120, 30);
        expect(check.passed).toBe(true);
        expect(check.actual).toBe(120);
      });

      it('passes when trade count matches exact threshold', () => {
        const check = evalMinTrades(30, 30);
        expect(check.passed).toBe(true);
        expect(check.threshold).toBe(30);
      });

      it('fails when trade count is below threshold', () => {
        const check = evalMinTrades(25, 30);
        expect(check.passed).toBe(false);
        expect(check.detail).toContain('25 trades vs. minimum 30');
      });

      it('fails when trade count is zero', () => {
        const check = evalMinTrades(0, 30);
        expect(check.passed).toBe(false);
      });

      it('fails when trade count is negative or non-integer', () => {
        const checkNegative = evalMinTrades(-5, 30);
        const checkFloat = evalMinTrades(35.5, 30);
        expect(checkNegative.passed).toBe(false);
        expect(checkFloat.passed).toBe(false);
      });
    });

    describe('F2: minNetExpectancy (Cost-Adjusted Edge > 0)', () => {
      it('passes when net expectancy is strongly positive', () => {
        const check = evalMinNetExpectancy(0.015, 0.0);
        expect(check.passed).toBe(true);
        expect(check.actual).toBe(0.015);
      });

      it('passes when net expectancy is marginally positive', () => {
        const check = evalMinNetExpectancy(0.0001, 0.0);
        expect(check.passed).toBe(true);
      });

      it('fails when net expectancy is exactly zero', () => {
        const check = evalMinNetExpectancy(0.0, 0.0);
        expect(check.passed).toBe(false);
        expect(check.detail).toContain('vs. minimum > 0');
      });

      it('fails when net expectancy is negative', () => {
        const check = evalMinNetExpectancy(-0.0025, 0.0);
        expect(check.passed).toBe(false);
      });

      it('fails when net expectancy is NaN or non-finite', () => {
        const checkNan = evalMinNetExpectancy(NaN, 0.0);
        const checkInf = evalMinNetExpectancy(Infinity, 0.0);
        expect(checkNan.passed).toBe(false);
        expect(checkInf.passed).toBe(false);
      });
    });

    describe('F3: minProfitFactor (PnL Ratio Quality >= 1.2)', () => {
      it('passes when profit factor is well above threshold', () => {
        const check = evalMinProfitFactor(2.5, 1.2);
        expect(check.passed).toBe(true);
        expect(check.actual).toBe(2.5);
      });

      it('passes when profit factor matches threshold', () => {
        const check = evalMinProfitFactor(1.2, 1.2);
        expect(check.passed).toBe(true);
      });

      it('passes when profit factor is infinite due to zero losses', () => {
        const check = evalMinProfitFactor(Infinity, 1.2);
        expect(check.passed).toBe(true);
      });

      it('fails when profit factor is below threshold', () => {
        const check = evalMinProfitFactor(1.15, 1.2);
        expect(check.passed).toBe(false);
        expect(check.detail).toContain('1.15 vs. minimum 1.2');
      });

      it('fails when profit factor is zero or NaN', () => {
        const checkZero = evalMinProfitFactor(0, 1.2);
        const checkNan = evalMinProfitFactor(NaN, 1.2);
        expect(checkZero.passed).toBe(false);
        expect(checkNan.passed).toBe(false);
      });
    });

    describe('F4: maxDrawdown (Tail Risk <= 25%)', () => {
      it('passes when max drawdown is safely below threshold', () => {
        const check = evalMaxDrawdown(0.12, 0.25);
        expect(check.passed).toBe(true);
        expect(check.actual).toBe(0.12);
      });

      it('passes when max drawdown is exactly at threshold', () => {
        const check = evalMaxDrawdown(0.25, 0.25);
        expect(check.passed).toBe(true);
      });

      it('passes when max drawdown is zero', () => {
        const check = evalMaxDrawdown(0.0, 0.25);
        expect(check.passed).toBe(true);
      });

      it('fails when max drawdown exceeds threshold', () => {
        const check = evalMaxDrawdown(0.32, 0.25);
        expect(check.passed).toBe(false);
        expect(check.detail).toContain('32.00% vs. maximum 25.00%');
      });

      it('fails when max drawdown is negative or NaN', () => {
        const checkNeg = evalMaxDrawdown(-0.05, 0.25);
        const checkNan = evalMaxDrawdown(NaN, 0.25);
        expect(checkNeg.passed).toBe(false);
        expect(checkNan.passed).toBe(false);
      });
    });

    describe('F5: minSharpeSortino (Risk-Adjusted Efficiency)', () => {
      it('passes when both Sharpe and Sortino exceed thresholds', () => {
        const check = evalMinSharpeSortino(1.6, 2.1, 1.0, 1.2);
        expect(check.passed).toBe(true);
      });

      it('passes when both Sharpe and Sortino match exact thresholds', () => {
        const check = evalMinSharpeSortino(1.0, 1.2, 1.0, 1.2);
        expect(check.passed).toBe(true);
      });

      it('fails when Sharpe is below threshold even if Sortino is high', () => {
        const check = evalMinSharpeSortino(0.85, 2.5, 1.0, 1.2);
        expect(check.passed).toBe(false);
      });

      it('fails when Sortino is below threshold even if Sharpe is high', () => {
        const check = evalMinSharpeSortino(1.8, 1.15, 1.0, 1.2);
        expect(check.passed).toBe(false);
      });

      it('fails when either Sharpe or Sortino is null or non-finite', () => {
        const checkNullSharpe = evalMinSharpeSortino(null, 1.8, 1.0, 1.2);
        const checkNullSortino = evalMinSharpeSortino(1.8, null, 1.0, 1.2);
        expect(checkNullSharpe.passed).toBe(false);
        expect(checkNullSortino.passed).toBe(false);
      });
    });

    describe('F6: minRegimeCoverage (Regime Diversity >= 50%)', () => {
      it('passes when all experienced regimes are profitable', () => {
        const regimes = {
          TREND_UP: { numTrades: 50, netPnl: 1000 },
          RANGE: { numTrades: 40, netPnl: 500 },
        };
        const check = evalMinRegimeCoverage(regimes, 0.50);
        expect(check.passed).toBe(true);
        expect(check.actual).toBe(1.0);
      });

      it('passes when exactly 50% of experienced regimes are profitable', () => {
        const regimes = {
          R1: { numTrades: 20, netPnl: 200 },
          R2: { numTrades: 20, netPnl: 300 },
          R3: { numTrades: 20, netPnl: -100 },
          R4: { numTrades: 20, netPnl: -50 },
        };
        const check = evalMinRegimeCoverage(regimes, 0.50);
        expect(check.passed).toBe(true);
        expect(check.actual).toBe(0.50);
      });

      it('fails when less than 50% of experienced regimes are profitable', () => {
        const regimes = {
          R1: { numTrades: 20, netPnl: 200 },
          R2: { numTrades: 20, netPnl: -100 },
          R3: { numTrades: 20, netPnl: -50 },
        };
        const check = evalMinRegimeCoverage(regimes, 0.50);
        expect(check.passed).toBe(false);
      });

      it('fails when zero regimes are experienced', () => {
        const check = evalMinRegimeCoverage({}, 0.50);
        expect(check.passed).toBe(false);
        expect(check.actual).toBe(0);
      });

      it('counts regimes with trades but netPnl <= 0 in denominator only', () => {
        const regimes = {
          R1: { numTrades: 10, netPnl: 500 },
          R2: { numTrades: 10, netPnl: 0 },
          R3: { numTrades: 0, netPnl: 0 },
        };
        const check = evalMinRegimeCoverage(regimes, 0.50);
        expect(check.passed).toBe(true);
        expect(check.detail).toContain('1/2 regimes profitable');
      });
    });
  });
}
