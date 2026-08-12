// Grid Trading Strategy
// Principle: Place buy/sell limit orders at regular price intervals around a base price.
// Profit from oscillations within a range — works best in sideways/volatile markets.

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

    this.buildGrid(currentPrice);
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

    this.updateTrailing(price);
    this.checkTrailingExits(price);

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

  private buildGrid(centerPrice: number): void {
    this.levels = [];
    const spacing = centerPrice * (this.config.gridSpacingPct / 100);
    const levelCapital = this.config.capital * (this.config.capitalPerLevelPct / 100);
    const halfLevels = Math.floor(this.config.gridLevels / 2);

    for (let i = -halfLevels; i <= halfLevels; i++) {
      if (i === 0) continue;

      const triggerPrice = centerPrice + i * spacing;
      const side: 'buy' | 'sell' = i < 0 ? 'buy' : 'sell';
      const takeProfitPrice = side === 'buy'
        ? triggerPrice * (1 + this.config.takeProfitPct / 100)
        : triggerPrice * (1 - this.config.takeProfitPct / 100);
      const stopLossPrice = side === 'buy'
        ? triggerPrice * (1 - this.config.stopLossPct / 100)
        : triggerPrice * (1 + this.config.stopLossPct / 100);

      const quantity = levelCapital / triggerPrice;

      this.levels.push({
        level: Math.abs(i),
        side,
        triggerPrice: Math.max(0.00000001, triggerPrice),
        takeProfitPrice: Math.max(0.00000001, takeProfitPrice),
        stopLossPrice: Math.max(0.00000001, stopLossPrice),
        quantity,
        status: 'pending',
        orderId: null,
      });
    }

    this.levels.sort((a, b) => b.triggerPrice - a.triggerPrice);
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

  // ── Trailing TP/SL ────────────────────────────────────────────────────
  // Each filled level tracks per-level TP/SL that ratchet as price moves.
  //
  // Seed (init tick):
  //   buy:  TP = fill + tpOffset,  SL = fill - 2*slOffset  (loose start, tightens on price rise)
  //   sell: TP = fill - tpOffset,  SL = fill + 2*slOffset  (loose start, tightens on price drop)
  //
  // Update rules:
  //   buy:  TP = clamp(price - tpOffset, seed, price*0.9999)
  //         SL = clamp(price - slOffset, seed, fill)  only when price > fill (tighten on rise)
  //   sell: TP = clamp(price + tpOffset, price*1.0001, seed)
  //         SL = clamp(price + slOffset, fill, seed)   only when price < fill (tighten on drop)
  //
  // skipExit: skip checkTrailingExits on the next tick after init to prevent
  //           same-tick close (fill happened on that tick).
  private updateTrailing(price: number): void {
    for (const level of this.levels) {
      if (level.status !== 'filled' || !level.filledPrice) continue;

      const tpOff = level.filledPrice * (this.config.takeProfitPct / 100);
      const slOff = level.filledPrice * (this.config.stopLossPct / 100);

      if (!level.trailingActive) {
        if (level.side === 'buy') {
          level.currentTpPrice = level.filledPrice + tpOff;
          level.currentSlPrice = level.filledPrice - slOff * 2;
        } else {
          level.currentTpPrice = level.filledPrice - tpOff;
          level.currentSlPrice = level.filledPrice + slOff * 2;
        }
        level.trailingActive = true;
        level.trailingSkipExit = true;
        continue;
      }

      if (level.side === 'buy') {
        // TP: ratchet UP toward price (price - tpOffset increases as price rises)
        const tpTarget = price - tpOff;
      if (tpTarget > (level.currentTpPrice ?? -Infinity)) {
          level.currentTpPrice = tpTarget;
        }
        // SL: tighten toward fill only when price is above fill
        if (price > level.filledPrice) {
          const raw = price - slOff;
          const clamped = Math.min(Math.max(raw, level.filledPrice - slOff * 2), level.filledPrice);
        if (clamped > (level.currentSlPrice ?? -Infinity)) {
            level.currentSlPrice = clamped;
          }
        }
        // On dips below fill: SL stays locked at current value (no widen)
      } else {
        // Sell: TP ratchet DOWN toward price
        const tpTarget = price + tpOff;
      if (tpTarget < (level.currentTpPrice ?? Infinity)) {
          level.currentTpPrice = tpTarget;
        }
        // Sell SL: tighten toward fill only when price below fill
        if (price < level.filledPrice) {
          const raw = price + slOff;
          const clamped = Math.max(Math.min(raw, level.filledPrice + slOff * 2), level.filledPrice);
        if (clamped < (level.currentSlPrice ?? Infinity)) {
            level.currentSlPrice = clamped;
          }
        }
        // On rallies above fill: SL stays locked (no tighten)
      }
    }
  }

  private checkTrailingExits(price: number): void {
    for (const level of this.levels) {
      if (!level.trailingActive || !level.currentTpPrice || !level.currentSlPrice || level.status !== 'filled') continue;

      // Skip exit check on init tick — prevent close on same tick as fill
      if (level.trailingSkipExit) {
        level.trailingSkipExit = false;
        continue;
      }

      if (level.side === 'buy') {
        if (price >= level.currentTpPrice) {
          this.closeLevel(level, price, 'take-profit');
        } else if (price <= level.currentSlPrice) {
          this.closeLevel(level, price, 'stop-loss');
        }
      } else {
        if (price <= level.currentTpPrice) {
          this.closeLevel(level, price, 'take-profit');
        } else if (price >= level.currentSlPrice) {
          this.closeLevel(level, price, 'stop-loss');
        }
      }
    }
  }

  private async closeLevel(level: GridLevel, closePrice: number, reason: 'take-profit' | 'stop-loss'): Promise<void> {
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

    this.buildGrid(currentPrice);
  }

  getDeployedCapital(): number {
    let deployed = 0;
    for (const level of this.levels) {
      if (level.status === 'open' || level.status === 'filled') {
        deployed += level.quantity * level.triggerPrice;
      }
    }
    return deployed;
  }

  getReinvestableProfit(): number {
    return this.totalReinvested;
  }
}
