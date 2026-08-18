// Backtest Engine — Paper Exchange adapter
// Simulates order fills for deterministic backtesting over OHLCV candles.

import type { BotTrade } from '@/tree/bot/types';
import type { OrderRequest, OrderResult } from '@/tree/exchange/types';
import type { GridStrategyCallbacks } from '@/tree/bot/strategies/grid';
import type { MeanRevStrategyCallbacks } from '@/tree/bot/strategies/mean-reversion';

// ──────────────────────────────────────────────
// Paper Exchange Adapter
// Every fill is recorded in a log (sequence of buys/sells with price/qty/ts).
// Post-run, consecutive buy+sell pairs become BacktestTrade entries.
// ──────────────────────────────────────────────

/** @internal Fill record kept by the paper exchange. */
export interface Fill {
  candleIndex: number;
  timestamp: number;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  fee: number;
}

/**
 * Minimal exchange adapter that records fills for later metric computation.
 * Implements both strategy callback interfaces so grid and mean-reversion
 * strategies can place orders without any real API calls.
 */
export class PaperExchange implements GridStrategyCallbacks, MeanRevStrategyCallbacks {
  fills: Fill[] = [];
  private capital: number;
  private feePct: number;
  private slipPct: number;
  private _candleTs = 0;
  private _candleIdx = 0;

  constructor(capital: number, feePct: number, slipPct: number) {
    this.capital = capital;
    this.feePct = feePct;
    this.slipPct = slipPct;
  }

  setTimestamp(ts: number): void {
    this._candleTs = ts;
  }

  setCandleIndex(idx: number): void {
    this._candleIdx = idx;
  }

  getCapital(): number {
    return this.capital;
  }

  // Both strategy classes ultimately call placeOrder for fills.
  // Grid: placeOrder({ side: 'buy'|'sell', price, quantity })
  // MeanRev: placeOrder({ side: 'buy'|'sell', price, quantity })
  async placeOrder(req: OrderRequest): Promise<OrderResult> {
    const slip = req.side === 'buy' ? 1 + this.slipPct / 100 : 1 - this.slipPct / 100;
    const price = (req.price ?? 0) * slip;
    const qty = req.quantity;
    const fee = price * qty * (this.feePct / 100);

    if (req.side === 'buy') {
      const cost = price * qty + fee;
      if (cost > this.capital) {
        return { id: '', exchangeId: '', symbol: '', side: req.side, type: req.type, price: 0, quantity: 0, filled: 0, status: 'rejected', fee: 0, feeCurrency: '', timestamp: this._candleTs, pnl: 0 };
      }
      this.capital -= cost;
    } else {
      this.capital += price * qty - fee;
    }

    this.fills.push({ candleIndex: this._candleIdx, timestamp: this._candleTs, side: req.side, price, quantity: qty, fee });
    return { id: `paper_${req.side}_${this.fills.length}`, exchangeId: '', symbol: req.symbol, side: req.side, type: req.type, price, quantity: qty, filled: qty, status: 'filled', fee, feeCurrency: '', timestamp: this._candleTs, pnl: 0 };
  }

  async placeMarketOrder(side: 'buy' | 'sell', quantity: number, price: number): Promise<OrderResult> {
    const slip = side === 'buy' ? 1 + this.slipPct / 100 : 1 - this.slipPct / 100;
    const fillPrice = price * slip;
    const fee = fillPrice * quantity * (this.feePct / 100);

    if (side === 'buy') {
      const cost = fillPrice * quantity + fee;
      if (cost > this.capital) {
        return { id: '', exchangeId: '', symbol: '', side, type: 'market', price: 0, quantity: 0, filled: 0, status: 'rejected', fee: 0, feeCurrency: '', timestamp: this._candleTs, pnl: 0 };
      }
      this.capital -= cost;
    } else {
      this.capital += fillPrice * quantity - fee;
    }

    this.fills.push({ candleIndex: this._candleIdx, timestamp: this._candleTs, side, price: fillPrice, quantity, fee });
    return { id: `paper_${side}_${this.fills.length}`, exchangeId: '', symbol: '', side, type: 'market', price: fillPrice, quantity, filled: quantity, status: 'filled', fee, feeCurrency: '', timestamp: this._candleTs, pnl: 0 };
  }

  onTrade(_trade: BotTrade): void {}
  onLog(_msg: string): void {}
  hasOpenPosition(): boolean { return false; }
}