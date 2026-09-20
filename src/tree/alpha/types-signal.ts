// Alpha Lab — Signal and Feature Types
// Foundation types for alpha signal generation, feature vectors, and alpha configurations.

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
