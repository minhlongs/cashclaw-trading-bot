// Volatility-Adjusted DCA Bot Strategy
// Wraps the pure QuantLib volatilityDca kernel into a stateful bot strategy.

import type { VolatilityDcaBotConfig } from '../types';
import type { Ticker } from '../../exchange/types';
import { volatilityDca } from '../../quantlib/volatility-dca';

export interface VolatilityDcaCallbacks {
  onLog: (msg: string) => void;
}

/** Realized annualized volatility from a price window (std dev of log returns × √252 × 100). */
function computeAnnualizedVol(prices: number[]): number {
  if (prices.length < 2) return 0;
  const logReturns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    logReturns.push(Math.log(prices[i] / prices[i - 1]));
  }
  const mean = logReturns.reduce((s, r) => s + r, 0) / logReturns.length;
  const variance = logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / logReturns.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

export class VolatilityDcaStrategy {
  private config: VolatilityDcaBotConfig;
  private callbacks: VolatilityDcaCallbacks;
  private running: boolean = false;
  private referencePrice: number = 0;
  private stepIndex: number = 0;
  private priceWindow: number[] = [];

  constructor(config: VolatilityDcaBotConfig, callbacks: VolatilityDcaCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  start(initialPrice: number): void {
    this.running = true;
    this.referencePrice = initialPrice;
    this.stepIndex = 0;
    this.priceWindow = [initialPrice];
    this.callbacks.onLog(`VolatilityDCA started: ref=${initialPrice}, window=${this.config.volatilityWindow}`);
  }

  stop(): void {
    this.running = false;
    this.callbacks.onLog('VolatilityDCA stopped');
  }

  onTicker(ticker: Ticker): void {
    if (!this.running) return;
    const price = ticker.last;
    if (price <= 0) return;

    // Maintain rolling price window.
    this.priceWindow.push(price);
    if (this.priceWindow.length > this.config.volatilityWindow) {
      this.priceWindow.shift();
    }

    // Need full window before signalling.
    if (this.priceWindow.length < this.config.volatilityWindow) {
      this.callbacks.onLog(`VolatilityDCA accumulating: ${this.priceWindow.length}/${this.config.volatilityWindow}`);
      return;
    }

    const volatility = computeAnnualizedVol(this.priceWindow);
    const result = volatilityDca(
      { symbol: this.config.symbol, balance: this.config.capital, lastPrice: price },
      {
        referencePrice: this.referencePrice,
        volatility,
        volBaseline: this.config.volBaseline,
        priceDropStep: this.config.priceDropStep / 100,
        stepIndex: this.stepIndex,
        maxSteps: this.config.maxSteps,
        reboundTarget: this.config.reboundTarget / 100,
      },
    );

    if (result.signal === 'buy') {
      this.stepIndex += 1;
      this.callbacks.onLog(
        `VolatilityDCA buy step=${this.stepIndex} price=${price} vol=${volatility.toFixed(2)}%`,
      );
    } else if (result.signal === 'sell') {
      this.callbacks.onLog(
        `VolatilityDCA sell: price=${price} ref=${this.referencePrice} resetting`,
      );
      this.stepIndex = 0;
      this.referencePrice = price;
    }
  }

  getConfig(): VolatilityDcaBotConfig {
    return { ...this.config };
  }

  getStepIndex(): number {
    return this.stepIndex;
  }

  getReferencePrice(): number {
    return this.referencePrice;
  }
}
