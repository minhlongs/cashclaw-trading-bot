import { describe, expect, it } from 'vitest';
import {
  evalMaxDrawdown,
  evalMinNetExpectancy,
  evalMinProfitFactor,
  evalMinRegimeCoverage,
  evalMinSharpeSortino,
  evalMinTrades,
} from './promotion-gate-fixtures';

export function registerTier2FinancialTests(): void {
  describe('Tier 2: Boundary & Corner Cases — Financial & Performance Checks (F1-F6)', () => {
    describe('F1: minTrades Boundary Values', () => {
      it('fails at trade count 29 (just below boundary 30)', () => {
        expect(evalMinTrades(29, 30).passed).toBe(false);
      });

      it('passes at exact threshold 30', () => {
        expect(evalMinTrades(30, 30).passed).toBe(true);
      });

      it('passes at trade count 31 (just above boundary 30)', () => {
        expect(evalMinTrades(31, 30).passed).toBe(true);
      });

      it('passes at very large trade count 1,000,000', () => {
        expect(evalMinTrades(1000000, 30).passed).toBe(true);
      });

      it('fails when trade count is fractional 29.999', () => {
        expect(evalMinTrades(29.999, 30).passed).toBe(false);
      });
    });

    describe('F2: minNetExpectancy Boundary Values', () => {
      it('fails at exact 0.0 (strict inequality requirement > 0)', () => {
        expect(evalMinNetExpectancy(0.0, 0.0).passed).toBe(false);
      });

      it('passes at microscopic positive epsilon 0.000001', () => {
        expect(evalMinNetExpectancy(0.000001, 0.0).passed).toBe(true);
      });

      it('fails at microscopic negative epsilon -0.000001', () => {
        expect(evalMinNetExpectancy(-0.000001, 0.0).passed).toBe(false);
      });

      it('fails at negative zero -0.0', () => {
        expect(evalMinNetExpectancy(-0.0, 0.0).passed).toBe(false);
      });

      it('passes at extreme high expectancy 1000.0', () => {
        expect(evalMinNetExpectancy(1000.0, 0.0).passed).toBe(true);
      });
    });

    describe('F3: minProfitFactor Boundary Values', () => {
      it('fails at 1.199 (just below threshold 1.20)', () => {
        expect(evalMinProfitFactor(1.199, 1.2).passed).toBe(false);
      });

      it('passes at exact threshold 1.200', () => {
        expect(evalMinProfitFactor(1.200, 1.2).passed).toBe(true);
      });

      it('passes at 1.201 (just above threshold 1.20)', () => {
        expect(evalMinProfitFactor(1.201, 1.2).passed).toBe(true);
      });

      it('passes at extreme high profit factor 999.99', () => {
        expect(evalMinProfitFactor(999.99, 1.2).passed).toBe(true);
      });

      it('fails at microscopic positive profit factor 0.00001', () => {
        expect(evalMinProfitFactor(0.00001, 1.2).passed).toBe(false);
      });
    });

    describe('F4: maxDrawdown Boundary Values', () => {
      it('passes at exact threshold 0.2500 (25.00%)', () => {
        expect(evalMaxDrawdown(0.2500, 0.25).passed).toBe(true);
      });

      it('fails at 0.2501 (just above threshold 25.01%)', () => {
        expect(evalMaxDrawdown(0.2501, 0.25).passed).toBe(false);
      });

      it('passes at 0.2499 (just below threshold 24.99%)', () => {
        expect(evalMaxDrawdown(0.2499, 0.25).passed).toBe(true);
      });

      it('passes at absolute zero drawdown 0.0', () => {
        expect(evalMaxDrawdown(0.0, 0.25).passed).toBe(true);
      });

      it('fails at total portfolio ruin 1.000 (100% drawdown)', () => {
        expect(evalMaxDrawdown(1.0, 0.25).passed).toBe(false);
      });
    });

    describe('F5: minSharpeSortino Boundary Values', () => {
      it('fails when Sharpe is 0.999 (below 1.0) with Sortino 1.200', () => {
        expect(evalMinSharpeSortino(0.999, 1.200, 1.0, 1.2).passed).toBe(false);
      });

      it('fails when Sortino is 1.199 (below 1.2) with Sharpe 1.000', () => {
        expect(evalMinSharpeSortino(1.000, 1.199, 1.0, 1.2).passed).toBe(false);
      });

      it('passes when both are at exact thresholds (Sharpe 1.000, Sortino 1.200)', () => {
        expect(evalMinSharpeSortino(1.000, 1.200, 1.0, 1.2).passed).toBe(true);
      });

      it('passes when both are just above thresholds (Sharpe 1.001, Sortino 1.201)', () => {
        expect(evalMinSharpeSortino(1.001, 1.201, 1.0, 1.2).passed).toBe(true);
      });

      it('passes when Sortino is infinite and Sharpe meets threshold', () => {
        expect(evalMinSharpeSortino(1.5, Infinity, 1.0, 1.2).passed).toBe(true);
      });
    });

    describe('F6: minRegimeCoverage Boundary Values', () => {
      it('fails at 49.0% regime coverage (49 of 100 regimes profitable)', () => {
        const regimes: Record<string, { numTrades: number; netPnl: number }> = {};
        for (let i = 0; i < 100; i++) {
          regimes[`R${i}`] = { numTrades: 10, netPnl: i < 49 ? 100 : -50 };
        }
        expect(evalMinRegimeCoverage(regimes, 0.50).passed).toBe(false);
      });

      it('passes at exact 50.0% regime coverage (50 of 100 regimes profitable)', () => {
        const regimes: Record<string, { numTrades: number; netPnl: number }> = {};
        for (let i = 0; i < 100; i++) {
          regimes[`R${i}`] = { numTrades: 10, netPnl: i < 50 ? 100 : -50 };
        }
        expect(evalMinRegimeCoverage(regimes, 0.50).passed).toBe(true);
      });

      it('passes at 51.0% regime coverage (51 of 100 regimes profitable)', () => {
        const regimes: Record<string, { numTrades: number; netPnl: number }> = {};
        for (let i = 0; i < 100; i++) {
          regimes[`R${i}`] = { numTrades: 10, netPnl: i < 51 ? 100 : -50 };
        }
        expect(evalMinRegimeCoverage(regimes, 0.50).passed).toBe(true);
      });

      it('passes when exactly 1 regime was experienced and it is profitable (100%)', () => {
        const regimes = { TREND_UP: { numTrades: 35, netPnl: 1200 } };
        expect(evalMinRegimeCoverage(regimes, 0.50).passed).toBe(true);
      });

      it('fails when 3 of 7 regimes are profitable (42.8% < 50%)', () => {
        const regimes: Record<string, { numTrades: number; netPnl: number }> = {};
        for (let i = 0; i < 7; i++) {
          regimes[`R${i}`] = { numTrades: 10, netPnl: i < 3 ? 100 : -50 };
        }
        expect(evalMinRegimeCoverage(regimes, 0.50).passed).toBe(false);
      });
    });
  });
}
