// Mean Reversion Strategy — Facade
// Uses Bollinger Bands + RSI for entry signals. Logic split into mean-reversion-{orders,types}.ts.

import type { MeanRevBotConfig } from '../types';
import type { Ticker } from '../../exchange/types';
import { calculateBB, calculateRSI, checkVolume, type BollingerBands, type RSI } from './mean-reversion-indicators';
import { executeEnterLong, executeExitLong } from './mean-reversion-orders';
import type { MeanRevStrategyCallbacks } from './mean-reversion-types';

export type { MeanRevStrategyCallbacks };

export class MeanRevStrategy {
  private config: MeanRevBotConfig;
  private callbacks: MeanRevStrategyCallbacks;
  private prices: number[] = [];
  private highs: number[] = [];
  private lows: number[] = [];
  private volumes: number[] = [];
  private running: boolean = false;
  private lastTradeTime: number = 0;
  private position: 'long' | 'short' | 'none' = 'none';
  private entryPrice: number = 0;
  private _tradeCount: number = 0;

  constructor(config: MeanRevBotConfig, callbacks: MeanRevStrategyCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  start(initialPrice: number): void {
    this.running = true;
    this.prices = [initialPrice];
    this.callbacks.onLog(`Mean reversion started: BB(${this.config.bbPeriod}, ${this.config.bbStdDev}) + RSI(${this.config.rsiPeriod})`);
  }

  stop(): void {
    this.running = false;
  }

  onTicker(ticker: Ticker): void {
    if (!this.running) return;
    const price = ticker.last;
    if (price <= 0) return;
    this.prices.push(price);
    if (ticker.high24h > 0) this.highs.push(ticker.high24h);
    if (ticker.low24h > 0) this.lows.push(ticker.low24h);
    if (ticker.volume24h > 0) this.volumes.push(ticker.volume24h);
    const maxLen = Math.max(this.config.bbPeriod, this.config.rsiPeriod) + 50;
    if (this.prices.length > maxLen) {
      this.prices = this.prices.slice(-maxLen);
      this.highs = this.highs.slice(-maxLen);
      this.lows = this.lows.slice(-maxLen);
      this.volumes = this.volumes.slice(-maxLen);
    }
    if (this.prices.length < this.config.bbPeriod) return;
    const bb = calculateBB(this.prices, this.config.bbPeriod, this.config.bbStdDev);
    const rsi = calculateRSI(this.prices, this.config.rsiPeriod, this.config.rsiBuyThreshold, this.config.rsiSellThreshold);
    const volCheck = checkVolume(this.volumes, this.config.bbPeriod, this.config.volumeMultiplier);
    this.evaluateSignal(price, bb, rsi, volCheck);
  }

  getConfig(): MeanRevBotConfig { return { ...this.config }; }
  getPosition(): 'long' | 'short' | 'none' { return this.position; }
  get tradeCount(): number { return this._tradeCount; }

  private evaluateSignal(price: number, bb: BollingerBands, rsi: RSI, volCheck: boolean): void {
    const now = Date.now();
    const cooldownMs = this.config.cooldownMinutes * 60 * 1000;
    if (now - this.lastTradeTime < cooldownMs) return;

    if (this.position === 'none' && price <= bb.lower && rsi.trend === 'oversold' && volCheck) {
      this.enterLong(price, bb, rsi);
    } else if (this.position === 'long' && (price >= bb.upper || rsi.trend === 'overbought')) {
      this.exitLong(price, bb, rsi);
    }
  }

  private async enterLong(price: number, bb: BollingerBands, rsi: RSI): Promise<void> {
    const result = await executeEnterLong({ config: this.config, callbacks: this.callbacks, price, bb, rsi });
    if (result.success) {
      this.position = result.position;
      this.entryPrice = result.entryPrice;
      this.lastTradeTime = Date.now();
      this._tradeCount++;
    }
  }

  private async exitLong(price: number, bb: BollingerBands, rsi: RSI): Promise<void> {
    const result = await executeExitLong({
      config: this.config,
      callbacks: this.callbacks,
      entryPrice: this.entryPrice,
      price,
      bb,
      rsi,
    });
    if (result.success) {
      this.position = result.position;
      this.entryPrice = result.entryPrice;
      this.lastTradeTime = Date.now();
      this._tradeCount++;
    }
  }
}
