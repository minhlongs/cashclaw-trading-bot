// Pure, testable, causal indicator functions for alpha signal generation.
// Thin facade aggregating technical and statistical indicator modules.

import type { IndicatorRegistry } from './indicator-types';
import {
  atrIndicator,
  bollingerIndicator,
  emaIndicator,
  macdIndicator,
  rsiIndicator,
  smaIndicator,
} from './indicators-technical';
import {
  distanceFromMAIndicator,
  logReturnsIndicator,
  momentumIndicator,
  realizedVolatilityIndicator,
  returnsIndicator,
  volumeZScoreIndicator,
} from './indicators-statistical';

export { bollingerBands, computeRSI, sma } from './indicator-math';

export const indicators: IndicatorRegistry = {
  sma: smaIndicator,
  ema: emaIndicator,
  rsi: rsiIndicator,
  atr: atrIndicator,
  bollinger: bollingerIndicator,
  macd: macdIndicator,
  volume_zscore: volumeZScoreIndicator,
  returns: returnsIndicator,
  log_returns: logReturnsIndicator,
  momentum: momentumIndicator,
  realized_volatility: realizedVolatilityIndicator,
  distance_from_ma: distanceFromMAIndicator,
};
