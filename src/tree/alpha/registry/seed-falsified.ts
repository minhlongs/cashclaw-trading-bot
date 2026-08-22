// Research Registry — seed entries for the 24 falsified hypothesis classes.
// Source of truth: docs/falsification-report.md (campaign final, 2026-08-18).
// These are CLASS-LEVEL seeds: per-config granularity is not reconstructable
// from the markdown report, so gitCommit/seed are null and reproducibility is
// 'class-level'. Campaign-wide facts: SOLUSDT/ETHUSDT/BTCUSDT, walk-forward
// 6 windows (548d train / 182d test / 182d step, 2020-2024), conservative
// cost model = 10 bps fee + 7 bps slippage + 10 bps impact (27 bps round-trip).

import type { ResearchEntry } from './types';

interface SeedSpec {
  readonly id: string;
  readonly hypothesis: string;
  readonly featureSet: readonly string[];
  readonly reason: string;
  readonly oosPassCount: number;
  readonly oosTotalCount: number;
  readonly aggregatePnlUsd: number;
  readonly summary: string;
  readonly extraSources?: readonly string[];
}

const BASE_SOURCES: readonly string[] = ['binance-ohlcv'];
const DERIV_SOURCES: readonly string[] = ['binance-ohlcv', 'binance-funding-rate'];

const CAMPAIGN_DEFAULTS = {
  dataSources: BASE_SOURCES,
  regime: 'all',
  trainPeriod: { start: '2020-08-11', end: '2024-08-11' },
  validationPeriod: { start: '2020-08-11', end: '2024-08-11' },
  oosPeriod: { start: '2022-04-01', end: '2025-04-01' },
  costs: { feeBps: 10, impactBps: 10 },
  slippage: { slippageBps: 7 },
  seed: null,
  gitCommit: null,
  status: 'FALSIFIED',
  reproducibility: 'class-level',
} as const;

const SPECS: readonly SeedSpec[] = [
  // TA trend / momentum / breakout (12 classes, 14/15 OOS negative)
  { id: 'sma-crossover', hypothesis: 'SMA crossover trend-following yields net positive expectancy', featureSet: ['sma-fast', 'sma-slow'], reason: '14/15 OOS configs negative; in-sample edge was overfit', oosPassCount: 0, oosTotalCount: 15, aggregatePnlUsd: 0, summary: '14/15 negative' },
  { id: 'donchian-breakout', hypothesis: 'Donchian channel breakout yields net positive expectancy', featureSet: ['donchian-high', 'donchian-low'], reason: 'OOS negative across channel widths; breakout edge overfit', oosPassCount: 0, oosTotalCount: 15, aggregatePnlUsd: 0, summary: '14/15 negative' },
  { id: 'volume-confirmed-momentum', hypothesis: 'Volume-confirmed momentum (SMA + 1.5x volume filter) yields net edge', featureSet: ['sma', 'volume-ratio'], reason: 'Volume confirmation added no OOS edge', oosPassCount: 0, oosTotalCount: 15, aggregatePnlUsd: 0, summary: '14/15 negative' },
  { id: 'macd-momentum', hypothesis: 'MACD signal/cross momentum yields net positive expectancy', featureSet: ['macd', 'macd-signal'], reason: 'OOS negative; MACD edge not persistent after costs', oosPassCount: 0, oosTotalCount: 15, aggregatePnlUsd: 0, summary: '14/15 negative' },
  { id: 'ema-ribbon-trend', hypothesis: 'EMA ribbon alignment trend-following yields net edge', featureSet: ['ema-ribbon'], reason: 'OOS negative; ribbon trend edge overfit', oosPassCount: 0, oosTotalCount: 15, aggregatePnlUsd: 0, summary: '14/15 negative' },
  { id: 'stochastic-reversal', hypothesis: 'Stochastic overbought/oversold reversal yields net edge', featureSet: ['stochastic-k', 'stochastic-d'], reason: 'OOS negative; reversal signals below noise floor', oosPassCount: 0, oosTotalCount: 15, aggregatePnlUsd: 0, summary: '14/15 negative' },
  { id: 'atr-breakout', hypothesis: 'ATR-based volatility breakout yields net positive expectancy', featureSet: ['atr', 'breakout-range'], reason: 'OOS negative; breakout gains consumed by 27 bps costs', oosPassCount: 0, oosTotalCount: 15, aggregatePnlUsd: 0, summary: '14/15 negative' },
  { id: 'price-channel-momentum', hypothesis: 'Price-channel momentum yields net positive expectancy', featureSet: ['price-channel'], reason: 'OOS negative; channel momentum not persistent', oosPassCount: 0, oosTotalCount: 15, aggregatePnlUsd: 0, summary: '14/15 negative' },
  { id: 'vwap-reversion', hypothesis: 'VWAP reversion yields net positive expectancy', featureSet: ['vwap', 'vwap-deviation'], reason: 'OOS negative; reversion edge below cost floor', oosPassCount: 0, oosTotalCount: 15, aggregatePnlUsd: 0, summary: '14/15 negative' },
  { id: 'higher-high-momentum', hypothesis: 'Higher-high/lower-low structure momentum yields net edge', featureSet: ['swing-high', 'swing-low'], reason: 'OOS negative; structure signals not persistent', oosPassCount: 0, oosTotalCount: 15, aggregatePnlUsd: 0, summary: '14/15 negative' },
  { id: 'roc-momentum', hypothesis: 'Rate-of-change momentum yields net positive expectancy', featureSet: ['roc'], reason: 'OOS negative; ROC edge overfit to train windows', oosPassCount: 0, oosTotalCount: 15, aggregatePnlUsd: 0, summary: '14/15 negative' },
  { id: 'adx-trend-filter', hypothesis: 'ADX-filtered trend-following yields net positive expectancy', featureSet: ['adx', 'di-plus', 'di-minus'], reason: 'OOS negative; ADX filter did not rescue trend edge', oosPassCount: 0, oosTotalCount: 15, aggregatePnlUsd: 0, summary: '14/15 negative' },
  // TA mean reversion (4 classes, 0/24 to 4/48 noise)
  { id: 'rsi-mean-reversion', hypothesis: 'RSI extremes mean-reversion yields net positive expectancy', featureSet: ['rsi'], reason: '0/24 OOS pass; 844 RSI combos swept, no robust edge', oosPassCount: 0, oosTotalCount: 24, aggregatePnlUsd: 0, summary: '0/24 pass' },
  { id: 'bollinger-mean-reversion', hypothesis: 'Bollinger band touch reversion yields net edge', featureSet: ['bollinger-upper', 'bollinger-lower'], reason: 'OOS passes at noise level only', oosPassCount: 0, oosTotalCount: 24, aggregatePnlUsd: 0, summary: '0/24 pass' },
  { id: 'zscore-mean-reversion', hypothesis: 'Rolling z-score reversion yields net positive expectancy', featureSet: ['zscore'], reason: '4/48 OOS pass ≈ 5% false-positive noise floor', oosPassCount: 4, oosTotalCount: 48, aggregatePnlUsd: 0, summary: '4/48 noise' },
  { id: 'deviation-band-reversion', hypothesis: 'Price deviation from rolling mean reversion yields net edge', featureSet: ['mean-deviation'], reason: 'OOS passes indistinguishable from noise', oosPassCount: 0, oosTotalCount: 24, aggregatePnlUsd: 0, summary: '0/24 pass' },
  // Funding rate (4 classes, 0/7 OOS pass)
  { id: 'funding-rate-fade', hypothesis: 'Fading extreme funding rates yields net positive expectancy', featureSet: ['funding-rate'], reason: '0/7 configs pass OOS; most promising lead failed validation', oosPassCount: 0, oosTotalCount: 7, aggregatePnlUsd: 0, summary: '0/7 pass', extraSources: DERIV_SOURCES },
  { id: 'funding-rate-follow', hypothesis: 'Following funding momentum yields net positive expectancy', featureSet: ['funding-rate', 'funding-roc'], reason: '0/7 OOS pass; full-period Sharpe 1.12 was overfit', oosPassCount: 0, oosTotalCount: 7, aggregatePnlUsd: 0, summary: '0/7 pass', extraSources: DERIV_SOURCES },
  { id: 'funding-arbitrage', hypothesis: 'Spot-perp funding arbitrage yields net edge at retail scale', featureSet: ['funding-rate', 'basis'], reason: '0/7 OOS pass; costs consume the funding capture', oosPassCount: 0, oosTotalCount: 7, aggregatePnlUsd: 0, summary: '0/7 pass', extraSources: DERIV_SOURCES },
  { id: 'funding-basis', hypothesis: 'Funding-basis spread signals yield net positive expectancy', featureSet: ['funding-rate', 'basis-spread'], reason: '0/7 OOS pass; basis signal below noise floor', oosPassCount: 0, oosTotalCount: 7, aggregatePnlUsd: 0, summary: '0/7 pass', extraSources: DERIV_SOURCES },
  // ML regime detection (1 class)
  { id: 'ml-regime-detection', hypothesis: 'ML regime classification improves strategy selection', featureSet: ['regime-features'], reason: 'Majority-class collapse; model predicts the dominant regime only', oosPassCount: 0, oosTotalCount: 1, aggregatePnlUsd: 0, summary: 'majority-class collapse' },
  // Cross-asset correlation / pairs (2 classes, 108/108 negative)
  { id: 'cross-asset-correlation-pairs', hypothesis: 'Cross-asset correlation pairs trading yields net edge', featureSet: ['rolling-correlation', 'z-spread'], reason: '108/108 configs negative; no positive expectancy after costs', oosPassCount: 0, oosTotalCount: 54, aggregatePnlUsd: 0, summary: '108/108 negative (combined with cointegration class)' },
  { id: 'pairs-cointegration', hypothesis: 'Cointegrated pair spread trading yields net positive expectancy', featureSet: ['spread', 'half-life', 'adf-stat'], reason: '108/108 configs negative; strongest negative Sharpe across pairs', oosPassCount: 0, oosTotalCount: 54, aggregatePnlUsd: 0, summary: '108/108 negative (combined with correlation class)' },
  // Sentiment (1 class, 0/27 OOS pass)
  { id: 'sentiment-fear-greed', hypothesis: 'Fear & Greed Index extremes predict reversals with net edge', featureSet: ['fear-greed-index'], reason: '0/27 OOS pass; sentiment adds no tradable information', oosPassCount: 0, oosTotalCount: 27, aggregatePnlUsd: 0, summary: '0/27 pass', extraSources: [...BASE_SOURCES, 'fear-greed-index'] },
  // Composites (2 classes)
  { id: 'sentiment-funding-composite', hypothesis: 'Sentiment + funding composite signal yields net edge', featureSet: ['fear-greed-index', 'funding-rate'], reason: '0/27 OOS pass; composite did not beat its components', oosPassCount: 0, oosTotalCount: 27, aggregatePnlUsd: 0, summary: '0/27 pass', extraSources: [...DERIV_SOURCES, 'fear-greed-index'] },
  { id: 'vol-of-vol-composite', hypothesis: 'Volatility-of-volatility regime composite yields net edge', featureSet: ['realized-vol', 'vol-of-vol'], reason: '2/48 OOS pass ≈ expected false-positive rate at 5% significance', oosPassCount: 2, oosTotalCount: 48, aggregatePnlUsd: 0, summary: '2/48 noise' },
  // Session / volume / wick geometry (3 classes, 0/24 to 4/48 noise)
  { id: 'session-volume-geometry', hypothesis: 'Session volume patterns predict next-session direction', featureSet: ['session-volume'], reason: '0/24 OOS pass; session structure not predictive', oosPassCount: 0, oosTotalCount: 24, aggregatePnlUsd: 0, summary: '0/24 pass' },
  { id: 'wick-exhaustion-reversal', hypothesis: 'Wick exhaustion geometry predicts reversal with net edge', featureSet: ['wick-ratio'], reason: '0/24 OOS pass; wick signals below noise floor', oosPassCount: 0, oosTotalCount: 24, aggregatePnlUsd: 0, summary: '0/24 pass' },
  { id: 'volume-anomaly-geometry', hypothesis: 'Volume anomaly + candle geometry yields net edge', featureSet: ['volume-anomaly', 'candle-geometry'], reason: '4/48 OOS pass ≈ noise floor; not significant', oosPassCount: 4, oosTotalCount: 48, aggregatePnlUsd: 0, summary: '4/48 noise' },
  // Funding × price extreme interaction (1 class — the near-miss)
  { id: 'funding-price-extreme-interaction', hypothesis: 'Funding × price-extreme interaction yields net positive expectancy', featureSet: ['funding-rate', 'price-extreme'], reason: '10/162 OOS pass (6%), -$455,090 aggregate; regime-locked to mid-2022 bear market, no config passed in more than 1 of 6 walk-forward windows', oosPassCount: 10, oosTotalCount: 162, aggregatePnlUsd: -455090, summary: '10/162 pass, -$455,090', extraSources: DERIV_SOURCES },
];

function toEntry(spec: SeedSpec): ResearchEntry {
  return {
    ...CAMPAIGN_DEFAULTS,
    id: spec.id,
    hypothesis: spec.hypothesis,
    featureSet: spec.featureSet,
    dataSources: spec.extraSources ?? BASE_SOURCES,
    result: {
      oosPassCount: spec.oosPassCount,
      oosTotalCount: spec.oosTotalCount,
      aggregatePnlUsd: spec.aggregatePnlUsd,
      summary: spec.summary,
    },
    falsificationReason: spec.reason,
  };
}

/** The 24 falsified hypothesis classes as machine-readable seed entries. */
export const SEED_FALSIFIED: readonly ResearchEntry[] = SPECS.map(toEntry);
