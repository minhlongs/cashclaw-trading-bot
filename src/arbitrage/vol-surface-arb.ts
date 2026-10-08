import { SabrParams, computeSabrVol } from '../quant/sabr-engine';

export interface MarketOption {
  strike: number;
  maturity: number;
  marketIv: number;
  forward: number;
}

export interface ArbOpportunity {
  strike: number;
  maturity: number;
  marketIv: number;
  sabrIv: number;
  deltaIv: number;
  isMispriced: boolean;
  action: 'BUY_MARKET' | 'SELL_MARKET' | 'NONE';
}

/**
 * Scans a list of market options against a SABR model to find mispricings.
 * @param options Array of market options with observed implied volatilities
 * @param params SABR parameters
 * @param threshold Difference threshold to consider as an arbitrage opportunity (e.g. 0.05 for 5%)
 */
export function scanVolatilitySurface(
  options: MarketOption[],
  params: SabrParams,
  threshold: number
): ArbOpportunity[] {
  return options.map(option => {
    const { strike, maturity, marketIv, forward } = option;
    const sabrIv = computeSabrVol(forward, strike, maturity, params);
    const deltaIv = marketIv - sabrIv;
    
    let action: 'BUY_MARKET' | 'SELL_MARKET' | 'NONE' = 'NONE';
    let isMispriced = false;

    if (Math.abs(deltaIv) > threshold) {
      isMispriced = true;
      if (deltaIv > 0) {
        // Market IV is higher than SABR -> Market Option is too expensive -> SELL
        action = 'SELL_MARKET';
      } else {
        // Market IV is lower than SABR -> Market Option is too cheap -> BUY
        action = 'BUY_MARKET';
      }
    }

    return {
      strike,
      maturity,
      marketIv,
      sabrIv,
      deltaIv,
      isMispriced,
      action
    };
  });
}
