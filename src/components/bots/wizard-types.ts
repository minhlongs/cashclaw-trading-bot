export type Step = 'basic' | 'strategy' | 'config' | 'review';

export type WizardStrategyId = 'grid' | 'mean_reversion' | 'volatility_dca' | 'h3_maker';

export interface StrategyDef {
  value: WizardStrategyId;
  label: string;
  desc: string;
}

export interface FieldDef {
  key: string;
  label: string;
  step?: string;
  type?: 'number' | 'checkbox';
}

export interface FormState {
  name: string;
  strategy: '' | WizardStrategyId;
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
  setStrategyDefaults: (strategy: WizardStrategyId) => void;
  onNext: () => void;
  onPrev: () => void;
}

export interface ConfigStepProps {
  form: FormState;
  updateConfig: (key: string, value: number) => void;
  strategy: WizardStrategyId;
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

export {
  STRATEGIES,
  EXCHANGES,
  PAIRS,
  GRID_DEFAULTS,
  MEANREV_DEFAULTS,
  VOLATILITY_DCA_DEFAULTS,
  H3_MAKER_DEFAULTS,
  GRID_FIELDS,
  MEANREV_FIELDS,
  VOLATILITY_DCA_FIELDS,
  H3_MAKER_FIELDS,
  STRATEGY_KEY_MAP,
  FIELD_KEY_MAP,
} from './wizard-defaults';
