/**
 * Strict Zod validation schemas for Alpha Research OS Phase 9 Promotion Gate.
 * Enforces fail-closed boundaries against malformed or injected data payloads.
 */

import { z } from 'zod';

export const GateCheckNameSchema = z.enum([
  'min_trades',
  'min_net_expectancy',
  'min_profit_factor',
  'max_drawdown',
  'min_sharpe_sortino',
  'min_regime_coverage',
  'fee_stress',
  'slippage_stress',
  'parameter_robustness',
  'cross_period_robustness',
  'cross_asset_robustness',
  'leakage_invariance',
  'no_single_window_dependency',
  'baseline_comparison',
  'reproducible_hash',
]);

export const GateCheckSchema = z
  .object({
    name: GateCheckNameSchema,
    passed: z.boolean(),
    actual: z.union([z.number(), z.string(), z.boolean()]).nullable(),
    threshold: z.union([z.number(), z.string(), z.boolean()]),
    detail: z.string(),
  })
  .strict();

export const PromotionGateConfigSchema = z
  .object({
    minTrades: z.number().int().min(1).default(30),
    minNetExpectancy: z.number().default(0.0),
    minProfitFactor: z.number().min(0).default(1.2),
    maxDrawdown: z.number().min(0).max(1).default(0.25),
    minSharpe: z.number().default(1.0),
    minSortino: z.number().default(1.2),
    minRegimeCoverage: z.number().min(0).max(1).default(0.50),
    maxParameterSpread: z.number().min(0).max(1).default(0.50),
    minCrossPeriodConsistency: z.number().min(0).max(1).default(0.60),
    minCrossAssetConsistency: z.number().min(0).max(1).default(0.50),
    maxSingleWindowContribution: z.number().min(0).max(1).default(0.50),
  })
  .strict();

export const RegimePerformanceSchema = z
  .object({
    numTrades: z.number().int().optional(),
    netPnl: z.number().optional(),
  })
  .passthrough();

export const FinancialMetricsInputSchema = z
  .object({
    numTrades: z.number().int(),
    expectancy: z.number(),
    profitFactor: z.number(),
    maxDrawdown: z.number(),
    sharpe: z.number().nullable(),
    sortino: z.number().nullable(),
    byRegime: z.record(
      z.string(),
      z.union([RegimePerformanceSchema, z.null(), z.undefined()]),
    ),
  })
  .strict();

export const StressMetricsInputSchema = z
  .object({
    netPnlNormal: z.number(),
    netPnlConservative: z.number(),
    netPnlAdverse: z.number(),
    netPnlExtreme: z.number(),
  })
  .strict();

export const CandidateBaselineMetricsSchema = z
  .object({
    sharpe: z.number(),
    netPnl: z.number(),
  })
  .strict();

export const BenchmarkMetricsSchema = z
  .object({
    sharpe: z.number().nullable(),
    netPnl: z.number(),
  })
  .strict();

export const ReproducibleHashDetailsSchema = z
  .object({
    recordedHash: z.string().optional(),
    expectedHash: z.string().optional(),
  })
  .strict();

export const RobustnessMetricsInputSchema = z
  .object({
    parameterSpread: z.number(),
    crossPeriodPositiveFraction: z.number(),
    crossAssetPositiveFraction: z.number().nullable().optional(),
    crossAssetApplicable: z.boolean().optional(),
    leakageViolations: z.number().int(),
    windowPnls: z.array(z.number()),
    baselineCandidate: CandidateBaselineMetricsSchema,
    baselineBuyHold: BenchmarkMetricsSchema,
    baselineRandomEntry: BenchmarkMetricsSchema,
    hashMatches: z.boolean(),
    hashDetails: z.union([ReproducibleHashDetailsSchema, z.string()]).optional(),
  })
  .strict();

export const PromotionGateInputSchema = z
  .object({
    financial: FinancialMetricsInputSchema,
    stress: StressMetricsInputSchema,
    robustness: RobustnessMetricsInputSchema,
  })
  .strict();

export const PromotionGateResultSchema = z
  .object({
    passed: z.boolean(),
    verdict: z.enum(['PASSED', 'KILLED']),
    checks: z.array(GateCheckSchema),
    failedChecks: z.array(GateCheckSchema),
    diagnosticReasons: z.array(z.string()),
    timestamp: z.number(),
  })
  .strict();
