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

export const RegimePerformanceSchema = z
  .object({
    numTrades: z.number().int().optional(),
    netPnl: z.number().optional(),
  })
  .passthrough();

export const ReproducibleHashDetailsSchema = z
  .object({
    recordedHash: z.string().optional(),
    expectedHash: z.string().optional(),
  })
  .strict();
