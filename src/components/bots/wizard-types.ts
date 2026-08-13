export type Step = 'basic' | 'strategy' | 'config' | 'review';

export interface StrategyDef {
  value: 'grid' | 'mean_reversion';
  label: string;
  desc: string;
}

export interface FieldDef {
  key: string;
  label: string;
  step?: string;
}

export interface FormState {
  name: string;
  strategy: '' | 'grid' | 'mean_reversion';
  pair: string;
  exchange: string;
  capital: number;
  config: Record<string, number>;
}

export interface BasicStepProps {
  form: FormState;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onNext: () => void;
}

export interface StrategyStepProps {
  form: FormState;
  setStrategyDefaults: (strategy: 'grid' | 'mean_reversion') => void;
  onNext: () => void;
  onPrev: () => void;
}

export interface ConfigStepProps {
  form: FormState;
  updateConfig: (key: string, value: number) => void;
  strategy: 'grid' | 'mean_reversion';
  onNext: () => void;
  onPrev: () => void;
}

export interface ReviewStepProps {
  form: FormState;
  submitting: boolean;
  submitError: string | null;
  submitSuccess: boolean;
  onSubmit: () => void;
  onPrev: () => void;
}

export const STRATEGIES: StrategyDef[] = [
  { value: 'grid', label: 'Grid Trading', desc: 'Multi-level limit orders / Dat lenh nhieu muc gia' },
  { value: 'mean_reversion', label: 'Mean Reversion', desc: 'Bollinger Bands + RSI' },
];

export const EXCHANGES = [
  { value: 'binance', label: 'Binance' },
  { value: 'bybit', label: 'Bybit' },
  { value: 'okx', label: 'OKX' },
];

export const PAIRS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'DOGE/USDT'];

export const GRID_DEFAULTS: Record<string, number> = {
  spacing_pct: 0.5,
  levels: 10,
  capital_per_level_pct: 5,
  max_drawdown_pct: 20,
};

export const MEANREV_DEFAULTS: Record<string, number> = {
  bb_period: 20,
  bb_std: 2,
  rsi_period: 14,
  rsi_buy: 30,
  rsi_sell: 70,
  volume_multiplier: 1.5,
  position_size_pct: 10,
  max_drawdown_pct: 20,
};

export const GRID_FIELDS: FieldDef[] = [
  { key: 'spacing_pct', label: 'Spacing (%)', step: '0.1' },
  { key: 'levels', label: 'Levels' },
  { key: 'capital_per_level_pct', label: 'Capital per level (%)' },
  { key: 'max_drawdown_pct', label: 'Max Drawdown (%)', step: '1' },
];

export const MEANREV_FIELDS: FieldDef[] = [
  { key: 'bb_period', label: 'BB Period', step: '1' },
  { key: 'bb_std', label: 'BB Std Dev', step: '0.1' },
  { key: 'rsi_period', label: 'RSI Period', step: '1' },
  { key: 'rsi_buy', label: 'RSI Buy Level', step: '1' },
  { key: 'rsi_sell', label: 'RSI Sell Level', step: '1' },
  { key: 'volume_multiplier', label: 'Volume Multiplier', step: '0.1' },
  { key: 'position_size_pct', label: 'Position Size (%)', step: '1' },
  { key: 'max_drawdown_pct', label: 'Max Drawdown (%)', step: '1' },
];
