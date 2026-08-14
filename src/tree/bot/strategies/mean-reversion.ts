// Mean Reversion Strategy
// Principle: Price tends to revert to its mean after extreme moves.
// Uses Bollinger Bands (oversold/overbought) + RSI for entry signals.
// Indicator calculations are in mean-reversion-indicators.ts (extracted for size compliance).

import type {
  MeanRevBotConfig,
  BotTrade,
} from '../types';
import type {
  Ticker,
  OrderRequest,
  OrderResult,
} from '../../exchange/types';
import { calculateBB, calculateRSI, checkVolume, type BollingerBands, type RSI } from './mean-reversion-indicators';

export interface MeanRevStrategyCallbacks {
  placeOrder: (req: OrderRequest) => Promise<OrderResult>;
  onTrade: (trade: BotTrade) => void;
  onLog: (msg: string) => void;
}

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

    // Keep rolling window
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

  getConfig(): MeanRevBotConfig {
    return { ...this.config };
  }

  getPosition(): 'long' | 'short' | 'none' {
    return this.position;
  }

  get tradeCount(): number {
    return this._tradeCount;
  }

  private evaluateSignal(price: number, bb: BollingerBands, rsi: RSI, volCheck: boolean): void {
    const now = Date.now();
    const cooldownMs = this.config.cooldownMinutes * 60 * 1000;

    if (now - this.lastTradeTime < cooldownMs) return;

    // Oversold → Buy signal
    if (this.position === 'none' && price <= bb.lower && rsi.trend === 'oversold' && volCheck) {
      this.enterLong(price, bb, rsi);
    }
    // Overbought → Sell/exit signal
    else if (this.position === 'long' && (price >= bb.upper || rsi.trend === 'overbought')) {
      this.exitLong(price, bb, rsi);
    }
  }

  private async enterLong(price: number, bb: BollingerBands, rsi: RSI): Promise<void> {
    const size = this.config.capital * (this.config.positionSizePct / 100);
    const quantity = size / price;

    try {
      await this.callbacks.placeOrder({
        symbol: this.config.symbol,
        exchange: this.config.exchange,
        side: 'buy',
        type: 'limit',
        price,
        quantity,
        timeInForce: 'GTC',
      });

      this.position = 'long';
      this.entryPrice = price;
      this.lastTradeTime = Date.now();
      this._tradeCount++;

      this.callbacks.onLog(`LONG entry @ ${price.toFixed(2)} | BB lower=${bb.lower.toFixed(2)} RSI=${rsi.value.toFixed(1)}`);
    } catch (error) {
      this.callbacks.onLog(`LONG entry failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  private async exitLong(price: number, bb: BollingerBands, rsi: RSI): Promise<void> {
    const quantity = this.config.capital * (this.config.positionSizePct / 100) / this.entryPrice;

    try {
      await this.callbacks.placeOrder({
        symbol: this.config.symbol,
        exchange: this.config.exchange,
        side: 'sell',
        type: 'limit',
        price,
        quantity,
        timeInForce: 'GTC',
      });

      const pnl = ((price - this.entryPrice) / this.entryPrice) * 100;
      this.callbacks.onLog(`LONG exit @ ${price.toFixed(2)} | PnL: ${pnl.toFixed(2)}% | BB upper=${bb.upper.toFixed(2)} RSI=${rsi.value.toFixed(1)}`);

      this.position = 'none';
      this.entryPrice = 0;
      this.lastTradeTime = Date.now();
      this._tradeCount++;
    } catch (error) {
      this.callbacks.onLog(`LONG exit failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }
}
