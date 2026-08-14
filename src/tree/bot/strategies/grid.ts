// Grid Trading Strategy
// Place buy/sell limit orders at regular price intervals around a base price.
// Profit from oscillations within a range — best in sideways/volatile markets.

import type {
  GridBotConfig,
  GridLevel,
  BotTrade,
} from '../types';
import type {
  Ticker,
  OrderRequest,
  OrderResult,
} from '../../exchange/types';
import {
  computeGridLevels,
  updateTrailingLevels,
  findTrailingExits,
  computeDeployedCapital,
} from './grid-levels';

export interface GridStrategyCallbacks {
  placeOrder: (req: OrderRequest) => Promise<OrderResult>;
  onTrade: (trade: BotTrade) => void;
  onLog: (msg: string) => void;
}

export class GridStrategy {
  private config: GridBotConfig;
  private callbacks: GridStrategyCallbacks;
  private levels: GridLevel[] = [];
  private basePrice: number = 0;
  private rangeHigh: number = 0;
  private rangeLow: number = 0;
  private running: boolean = false;
  private rebalanceCounter: number = 0;
  private totalReinvested: number = 0;

  constructor(config: GridBotConfig, callbacks: GridStrategyCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  start(currentPrice: number): void {
    this.running = true;
    this.basePrice = currentPrice;
    const halfRange = currentPrice * (this.config.gridSpacingPct / 100) * this.config.gridLevels / 2;
    this.rangeHigh = currentPrice + halfRange;
    this.rangeLow = currentPrice - halfRange;

    this.levels = computeGridLevels(currentPrice, this.config);
    this.callbacks.onLog(`Grid started: ${this.config.gridLevels} levels, range ${this.rangeLow.toFixed(2)}–${this.rangeHigh.toFixed(2)}`);
  }

  get levelCount(): number { return this.levels.length; }

  stop(): void {
    this.running = false;
  }

  onTicker(ticker: Ticker): void {
    if (!this.running) return;

    const price = ticker.last;
    if (price <= 0) return;

    updateTrailingLevels(this.levels, price, this.config.takeProfitPct, this.config.stopLossPct);

    for (const close of findTrailingExits(this.levels, price)) {
      this.closeLevel(close.level, close.closePrice, close.reason);
    }

    for (const level of this.levels) {
      if (level.status === 'pending') {
        if (level.side === 'buy' && price <= level.triggerPrice) {
          this.fillLevel(level, price);
        } else if (level.side === 'sell' && price >= level.triggerPrice) {
          this.fillLevel(level, price);
        }
      }
    }

    if (price > this.rangeHigh || price < this.rangeLow) {
      if (this.config.rebalanceOnFill) {
        this.rebalance(price);
      }
    }
  }

  onOrderFilled(orderId: string): void {
    for (const level of this.levels) {
      if (level.orderId === orderId) {
        level.status = 'filled';
        break;
      }
    }
  }

  getLevels(): GridLevel[] {
    return [...this.levels];
  }

  getConfig(): GridBotConfig {
    return { ...this.config };
  }

  private async fillLevel(level: GridLevel, fillPrice: number): Promise<void> {
    level.status = 'filled';
    level.price = fillPrice;
    level.filledPrice = fillPrice;

    try {
      const order = await this.callbacks.placeOrder({
        symbol: this.config.symbol,
        exchange: this.config.exchange,
        side: level.side,
        type: 'limit',
        price: fillPrice,
        quantity: level.quantity,
        timeInForce: 'GTC',
      });
      level.orderId = order.id;
      this.callbacks.onLog(`Level ${level.level} ${level.side} filled @ ${fillPrice.toFixed(2)}`);
    } catch (error) {
      level.status = 'pending';
      this.callbacks.onLog(`Level ${level.level} ${level.side} failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  private closeLevel(level: GridLevel, closePrice: number, reason: 'take-profit' | 'stop-loss'): void {
    level.status = 'cancelled';
    level.price = closePrice;
    this.callbacks.onLog(`Level ${level.level} ${level.side} closed @ ${closePrice.toFixed(2)} (${reason})`);
  }

  private rebalance(currentPrice: number): void {
    this.rebalanceCounter++;
    this.callbacks.onLog(`Rebalance #${this.rebalanceCounter}: price ${currentPrice.toFixed(2)} outside range`);
    this.basePrice = currentPrice;
    const halfRange = currentPrice * (this.config.gridSpacingPct / 100) * this.config.gridLevels / 2;
    this.rangeHigh = currentPrice + halfRange;
    this.rangeLow = currentPrice - halfRange;
    this.levels = computeGridLevels(currentPrice, this.config);
  }

  getDeployedCapital(): number {
    return computeDeployedCapital(this.levels);
  }

  getReinvestableProfit(): number {
    return this.totalReinvested;
  }
}
