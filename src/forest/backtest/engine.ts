// Backtest Engine — deterministic simulation over OHLCV candles
// Strategy classes emit fills via their callbacks; we record them and compute metrics.

import type { BotConfig, GridBotConfig, MeanRevBotConfig, BotTrade } from '@/tree/bot/types';
import type { Ticker, OrderRequest, OrderResult } from '@/tree/exchange/types';
import { GridStrategy, type GridStrategyCallbacks } from '@/tree/bot/strategies/grid';
import { MeanRevStrategy, type MeanRevStrategyCallbacks } from '@/tree/bot/strategies/mean-reversion';
import type { Candle } from './ohlcv';

// ──────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────

export interface BacktestTrade {
  entryTimestamp: number;
  exitTimestamp: number;
  side: 'buy' | 'sell';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  fee: number;
  pnlPct: number;
  holdingMinutes: number;
}

export interface BacktestEquityPoint {
  timestamp: number;
  equity: number;
  drawdownPct: number;
}

export interface BacktestResult {
  id: string;
  bot_id: string;
  strategy: string;
  pair: string;
  exchange: string;
  start_date: number;
  end_date: number;
  total_trades: number;
  win_count: number;
  loss_count: number;
  win_rate: number;
  total_pnl: number;
  max_drawdown: number;
  sharpe_ratio: number | null;
  params_json: string;
  equity_curve_json: BacktestEquityPoint[];
  trades_json: BacktestTrade[];
  created_at: number;
}

export interface RunBacktestOptions {
  config: BotConfig;
  candles: Candle[];
  feePct?: number;
  slippagePct?: number;
  initialCapital?: number;
  botId: string;
}

// ──────────────────────────────────────────────
// Paper Exchange Adapter
// Every fill is recorded in a log (sequence of buys/sells with price/qty/ts).
// Post-run, consecutive buy+sell pairs become BacktestTrade entries.
// ──────────────────────────────────────────────

interface Fill {
  candleIndex: number;
  timestamp: number;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  fee: number;
}

class PaperExchange implements GridStrategyCallbacks, MeanRevStrategyCallbacks {
  fills: Fill[] = [];
  private capital: number;
  private feePct: number;
  private slipPct: number;
  private _candleTs = 0;

  constructor(capital: number, feePct: number, slipPct: number) {
    this.capital = capital;
    this.feePct = feePct;
    this.slipPct = slipPct;
  }

  setTimestamp(ts: number): void {
    this._candleTs = ts;
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

    this.fills.push({ candleIndex: 0, timestamp: this._candleTs, side: req.side, price, quantity: qty, fee });
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

    this.fills.push({ candleIndex: 0, timestamp: this._candleTs, side, price: fillPrice, quantity, fee });
    return { id: `paper_${side}_${this.fills.length}`, exchangeId: '', symbol: '', side, type: 'market', price: fillPrice, quantity, filled: quantity, status: 'filled', fee, feeCurrency: '', timestamp: this._candleTs, pnl: 0 };
  }

  onTrade(_trade: BotTrade): void {}
  onLog(_msg: string): void {}
  hasOpenPosition(): boolean { return false; }
}

// ──────────────────────────────────────────────
// Post-processing: fill pairs → BacktestTrade
// Also computes buy-and-hold for reference
// Capital goes up on sell, down on buy — realized PnL = cumulative capital delta from sells minus buys
// ──────────────────────────────────────────────

function buildTradesFromFills(fills: Fill[], feePct: number, capitalStart: number): BacktestTrade[] {
  // Track capital after each fill to identify realized P&L from sells
  // We'll use a "trade pot" approach: track capital committed to open positions,
  // realized when sold.
  const trades: BacktestTrade[] = [];
  // Each "round trip" = one buy followed by a sell of the same or smaller qty
  // Stack pending buys, match sells FIFO
  const pendingBuys: Fill[] = [];

  for (const f of fills) {
    if (f.side === 'buy') {
      pendingBuys.push(f);
    } else if (pendingBuys.length > 0) {
      const buy = pendingBuys.shift()!;
      const totalFee = buy.fee + f.fee;
      const pnl = (f.price - buy.price) * buy.quantity - totalFee;
      const pnlPct = buy.price > 0 ? ((f.price - buy.price) / buy.price) * 100 : 0;
      trades.push({
        entryTimestamp: buy.timestamp,
        exitTimestamp: f.timestamp,
        side: 'buy',
        entryPrice: buy.price,
        exitPrice: f.price,
        quantity: buy.quantity,
        pnl: Number(pnl.toFixed(2)),
        fee: Number(totalFee.toFixed(2)),
        pnlPct: Number(pnlPct.toFixed(4)),
        holdingMinutes: Math.max(0, Math.round((f.timestamp - buy.timestamp) / 60000)),
      });
    }
    // Sells with no matching buy are ignored (could be closing pre-existing positions)
  }

  return trades;
}

// ──────────────────────────────────────────────
// Equity Curve from candle-close prices + realized trades
// ──────────────────────────────────────────────

function buildEquity(
  capitalStart: number,
  candles: Candle[],
  trades: BacktestTrade[],
): BacktestEquityPoint[] {
  const curve: BacktestEquityPoint[] = [];
  let cumPnl = 0;
  let ti = 0;
  let maxEq = capitalStart;

  for (let i = 0; i < candles.length; i++) {
    const ts = candles[i].timestamp;
    // Credit trades that closed before/at this candle
    while (ti < trades.length && trades[ti].exitTimestamp <= ts) {
      cumPnl += trades[ti].pnl;
      ti++;
    }
    const eq = capitalStart + cumPnl;
    const dd = maxEq > 0 ? ((maxEq - eq) / maxEq) * 100 : 0;
    curve.push({ timestamp: ts, equity: eq, drawdownPct: dd });
    if (eq > maxEq) maxEq = eq;
  }

  return curve;
}

function computeSharpe(curve: BacktestEquityPoint[]): number {
  if (curve.length < 2) return 0;
  const rets: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1].equity;
    const curr = curve[i].equity;
    if (prev > 0) rets.push((curr - prev) / prev);
  }
  if (rets.length === 0) return 0;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return (mean / std) * Math.sqrt(8760); // 1h candles → 8760/year
}

// ──────────────────────────────────────────────
// Main entry
// ──────────────────────────────────────────────

export function runBacktest(opts: RunBacktestOptions): BacktestResult {
  const { config, candles, feePct = 0.1, slippagePct = 0.05, initialCapital, botId } = opts;
  const capital = initialCapital ?? config.capital;

  if (candles.length < 2) throw new Error(`Not enough candles: ${candles.length}`);

  const paper = new PaperExchange(capital, feePct, slippagePct);

  // Run strategy over each candle
  let strategy: GridStrategy | MeanRevStrategy;
  if (config.strategy === 'grid') {
    strategy = new GridStrategy(config as GridBotConfig, paper);
    strategy.start(candles[0].close);
  } else {
    strategy = new MeanRevStrategy(config as MeanRevBotConfig, paper);
  }

  for (let i = 0; i < candles.length; i++) {
    paper.setTimestamp(candles[i].timestamp);
    const t: Ticker = {
      symbol: config.symbol,
      last: candles[i].close,
      bid: candles[i].close,
      ask: candles[i].close,
      high24h: candles[i].high,
      low24h: candles[i].low,
      volume24h: candles[i].volume,
      timestamp: candles[i].timestamp,
    };
    strategy!.onTicker(t);
  }

  // Build trades from fills
  const trades = buildTradesFromFills(paper.fills, feePct, capital);
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const winRate = trades.length ? wins.length / trades.length : 0;
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);

  const equityCurve = buildEquity(capital, candles, trades);
  const maxDrawdown = equityCurve.length ? Math.max(...equityCurve.map((e) => e.drawdownPct)) : 0;
  const sharpe = computeSharpe(equityCurve);

  const id = `bt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  return {
    id,
    bot_id: botId,
    strategy: config.strategy,
    pair: config.symbol,
    exchange: config.exchange,
    start_date: candles[0].timestamp,
    end_date: candles[candles.length - 1].timestamp,
    total_trades: trades.length,
    win_count: wins.length,
    loss_count: losses.length,
    win_rate: Number(winRate.toFixed(4)),
    total_pnl: Number(totalPnl.toFixed(2)),
    max_drawdown: Number(maxDrawdown.toFixed(2)),
    sharpe_ratio: Number(sharpe.toFixed(4)) || null,
    params_json: JSON.stringify(config),
    equity_curve_json: equityCurve,
    trades_json: trades,
    created_at: Date.now(),
  };
}
