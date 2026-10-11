export type GateCheckName =
  | 'min_trades'
  | 'min_net_expectancy'
  | 'min_profit_factor'
  | 'max_drawdown'
  | 'min_sharpe_sortino'
  | 'min_regime_coverage'
  | 'fee_stress'
  | 'slippage_stress'
  | 'parameter_robustness'
  | 'cross_period_robustness'
  | 'cross_asset_robustness'
  | 'leakage_invariance'
  | 'no_single_window_dependency'
  | 'baseline_comparison'
  | 'reproducible_hash';

export interface GateCheck {
  readonly name: GateCheckName;
  readonly passed: boolean;
  readonly actual: number | string | boolean | null;
  readonly threshold: number | string | boolean;
  readonly detail: string;
}
