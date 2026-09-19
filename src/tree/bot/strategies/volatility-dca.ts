// Volatility-Adjusted DCA Bot Strategy
// Wraps the pure QuantLib volatilityDca kernel into a stateful bot strategy.

import type { VolatilityDcaBotConfig } from '../types';
import type { Ticker } from '../../exchange/types';
import { volatilityDca } from '../../quantlib/volatility-dca';
import { computeAnnualizedVol, type VolatilityDcaCallbacks } from './volatility-dca-math';
import { executeDcaOrder } from './volatility-dca-execution';

export { type VolatilityDcaCallbacks } from './volatility-dca-math';

export class VolatilityDcaStrategy {
  private config: VolatilityDcaBotConfig;
  private callbacks: VolatilityDcaCallbacks;
  private running: boolean = false;
  private referencePrice: number = 0;
  private stepIndex: number = 0;
  private positionQty: number = 0;
  private positionCost: number = 0;
  private priceWindow: number[] = [];

  constructor(config: VolatilityDcaBotConfig, callbacks: VolatilityDcaCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  start(initialPrice: number): void {
    this.running = true;
    this.referencePrice = initialPrice;
    this.stepIndex = 0;
    this.positionQty = 0;
    this.positionCost = 0;
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
      const orderCapital = this.config.capital * (this.config.baseOrderSizePct / 100);
      const quantity = orderCapital / price;
      this.stepIndex += 1;
      this.positionQty += quantity;
      this.positionCost += orderCapital;
      this.callbacks.onLog(
        `VolatilityDCA buy step=${this.stepIndex} price=${price} vol=${volatility.toFixed(2)}%`,
      );
      void executeDcaOrder(this.callbacks, this.config.symbol, this.config.exchange, 'buy', price, quantity);
    } else if (result.signal === 'sell') {
      if (this.positionQty > 0) {
        const sellQty = this.positionQty;
        this.positionQty = 0;
        this.positionCost = 0;
        this.stepIndex = 0;
        this.referencePrice = price;
        this.callbacks.onLog(
          `VolatilityDCA sell: price=${price} ref=${this.referencePrice} resetting`,
        );
        void executeDcaOrder(this.callbacks, this.config.symbol, this.config.exchange, 'sell', price, sellQty);
      } else {
        this.stepIndex = 0;
        this.referencePrice = price;
        this.callbacks.onLog(
          `VolatilityDCA sell: price=${price} ref=${this.referencePrice} resetting (no position)`,
        );
      }
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

  getPositionQty(): number {
    return this.positionQty;
  }

  getPositionCost(): number {
    return this.positionCost;
  }
}
