// Alpha Lab — Core Types
// Foundation types for alpha signal generation, feature vectors, and combiner configuration.

// ── Alpha Source & Direction ─────────────────────────────────────────────────

/** Origin type for alpha signal generation. */
export type AlphaSource = 'indicator' | 'ml' | 'regime' | 'combiner';

/** Direction of the alpha signal. */
export type AlphaDirection = 'buy' | 'sell' | 'hold';

// ── Feature Vector ───────────────────────────────────────────────────────────

/** Single feature entry with optional causal flag for feature importance tracking. */
export interface Feature {
  /** Unique feature identifier (e.g. 'rsi_14', 'macd_signal'). */
  id: string;
  /** Numeric value of the feature. */
  value: number;
  /** When true, this feature was present at signal generation time (causal). */
  causal: boolean;
  /** Optional z-score normalized value. */
  normalized?: number;
}

/** Typed feature container for alpha signals. */
export interface FeatureVector {
  /** All features in this vector. */
  features: Feature[];
  /** Timestamp when the feature vector was computed. */
  computedAt: number;
  /** Symbol this feature vector applies to. */
  symbol: string;
  /** Number of lookback candles used to compute these features. */
  lookback: number;
}

// ── Alpha Signal ─────────────────────────────────────────────────────────────

/** Core signal emitted by any alpha module. */
export interface AlphaSignal {
  /** Alpha module name that produced this signal. */
  name: string;
  /** Source type of the alpha. */
  source: AlphaSource;
  /** Trading direction. */
  direction: AlphaDirection;
  /** Confidence level in the signal (0–1). */
  confidence: number;
  /** Unix timestamp of signal generation. */
  timestamp: number;
  /** Feature vector used to generate this signal. */
  features: FeatureVector;
  /** Arbitrary metadata (strategy params, model version, etc.). */
  metadata: Record<string, unknown>;
}

// ── Alpha Config ─────────────────────────────────────────────────────────────

/** Base configuration shared by all alpha modules. */
export interface AlphaConfig {
  /** Unique name for this alpha. */
  name: string;
  /** Source type of the alpha. */
  source: AlphaSource;
  /** Symbols this alpha runs against. */
  symbols: string[];
  /** Minimum confidence threshold to emit a signal. */
  minConfidence: number;
  /** Lookback window in candles for feature computation. */
  lookback: number;
  /** Enable/disable this alpha. */
  enabled: boolean;
  /** Module-specific configuration parameters. */
  params: Record<string, unknown>;
}

// ── Alpha Result ─────────────────────────────────────────────────────────────

/** Per-alpha backtest result summary. */
export interface AlphaResult {
  /** Alpha name. */
  name: string;
  /** Source type. */
  source: AlphaSource;
  /** Total number of signals generated. */
  signalCount: number;
  /** Number of signals that resulted in a trade. */
  tradeCount: number;
  /** Win rate across all signals (0–1). */
  winRate: number;
  /** Average confidence of winning signals. */
  avgConfidence: number;
  /** Profit factor (gross profit / gross loss). */
  profitFactor: number | null;
  /** Sharpe ratio from alpha-specific trades. */
  sharpeRatio: number | null;
  /** Maximum drawdown percentage. */
  maxDrawdownPct: number;
  /** Per-symbol breakdown if multi-symbol. */
  bySymbol: Record<string, AlphaSymbolResult>;
}

/** Alpha result broken down by symbol. */
export interface AlphaSymbolResult {
  symbol: string;
  signalCount: number;
  tradeCount: number;
  winRate: number;
  profitFactor: number | null;
}

// ── Alpha Combiner ───────────────────────────────────────────────────────────

/** Combination method for merging multiple alpha signals. */
export type CombinerMethod = 'weighted_sum' | 'mlp' | 'voting' | 'max_confidence';

/** Configuration for combining multiple alpha signals into a composite signal. */
export interface AlphaCombinerConfig {
  /** How to combine signals: weighted_sum (linear), mlp (neural net), or voting (majority). */
  method: CombinerMethod;
  /** Per-alpha weights (used by weighted_sum). Key is alpha name. */
  weights: Record<string, number>;
  /** Minimum number of alphas that must agree for a composite signal (used by voting). */
  minAgreement?: number;
  /** Confidence threshold for the combined signal. */
  minConfidence: number;
  /** Symbols to combine across. */
  symbols: string[];
}

/** Result of combining multiple alpha signals. */
export interface AlphaCompositeResult {
  /** Combined direction. */
  direction: AlphaDirection;
  /** Combined confidence score. */
  confidence: number;
  /** Individual signals that contributed to this composite result. */
  contributingSignals: AlphaSignal[];
  /** The combiner configuration used. */
  config: AlphaCombinerConfig;
  /** Unix timestamp of combination. */
  timestamp: number;
}
