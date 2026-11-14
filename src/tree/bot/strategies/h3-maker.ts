// H3_MAKER Paper-Forward Basis & Maker Limit Strategy
// Pure Open-Core paper strategy: zero node:fs, fetch, LiveExchange, or @/ee imports.

import type { H3MakerBotConfig, BotTrade } from '../types';
import type { Ticker, OrderRequest, OrderResult, Side } from '../../exchange/types';

export interface H3MakerCallbacks {
  placeOrder?: (req: OrderRequest) => Promise<OrderResult>;
  cancelOrder?: (orderId: string, symbol?: string) => Promise<boolean>;
  getPositionSnapshot?: () => { qty: number; entryPrice: number } | null;
  onTrade?: (trade: BotTrade) => void;
  onLog: (msg: string) => void;
}

const SINGLE_PAIR_MAX_NAV_FRACTION = 0.2;

function clampSinglePairAllocation(rawGrossLeverage: number): number {
  const gross = !Number.isFinite(rawGrossLeverage) || rawGrossLeverage <= 0 ? 1.0 : Math.min(1.5, rawGrossLeverage);
  return Math.min(SINGLE_PAIR_MAX_NAV_FRACTION, gross * SINGLE_PAIR_MAX_NAV_FRACTION);
}

function computeAnnualizedCarryBps(windowPrices: readonly number[], latestPrice: number): number {
  const anchor = windowPrices[0];
  if (anchor === undefined || anchor <= 0 || windowPrices.length < 2) return 0;
  const spanDays = Math.max(1, windowPrices.length - 1);
  return ((latestPrice - anchor) / anchor) * (365 / spanDays) * 10_000;
}

export class H3MakerStrategy {
  private readonly config: H3MakerBotConfig;
  private readonly callbacks: H3MakerCallbacks;
  private readonly botId: string;
  private priceWindow: number[] = [];
  private running = false;
  private orderInFlight = false;
  private restingOpenSide: Side | null = null;
  private restingOrderId: string | null = null;
  private positionSide: 'flat' | 'long' = 'flat';
  private entryPrice = 0;
  private positionQty = 0;

  constructor(config: H3MakerBotConfig, callbacks: H3MakerCallbacks, botId?: string) {
    this.config = config;
    this.callbacks = callbacks;
    this.botId = botId ?? config.name ?? 'h3_maker';
  }

  start(initialPrice: number): void {
    if (this.config.mode !== 'paper') {
      throw new Error('H3MakerStrategy enforces PAPER_ONLY execution');
    }
    if (!Number.isFinite(initialPrice) || initialPrice <= 0) {
      throw new Error(`Invalid initial price for H3MakerStrategy: ${initialPrice}`);
    }
    this.running = true;
    this.orderInFlight = false;
    this.restingOpenSide = null;
    this.restingOrderId = null;
    const hydrated = this.callbacks.getPositionSnapshot?.();
    if (hydrated && hydrated.qty > 0) {
      this.positionSide = 'long';
      this.positionQty = hydrated.qty;
      this.entryPrice = hydrated.entryPrice > 0 ? hydrated.entryPrice : initialPrice;
    } else {
      this.positionSide = 'flat';
      this.entryPrice = 0;
      this.positionQty = 0;
    }
    this.priceWindow = [initialPrice];
    this.callbacks.onLog(
      `H3_MAKER started: ref=${initialPrice.toFixed(2)}, lookback=${this.config.lookbackDays}d, entry=${this.config.entryAnnualBps}bps`,
    );
  }

  stop(): void {
    this.running = false;
    this.callbacks.onLog('H3_MAKER stopped');
  }

  onTicker(ticker: Ticker): void {
    if (!this.running || this.orderInFlight || !Number.isFinite(ticker.last) || ticker.last <= 0) {
      return;
    }
    const price = ticker.last;
    const maxLen = Math.min(180, Math.max(2, Math.trunc(this.config.lookbackDays)));
    this.priceWindow.push(price);
    if (this.priceWindow.length > maxLen) {
      this.priceWindow = this.priceWindow.slice(-maxLen);
    }
    if (this.priceWindow.length < 2) return;

    const annualBps = computeAnnualizedCarryBps(this.priceWindow, price);
    if (this.positionSide === 'flat' && this.restingOpenSide !== 'buy' && annualBps >= this.config.entryAnnualBps) {
      const makerBuyPx = ticker.bid > 0 ? Math.min(ticker.bid, price) : price;
      void this.submitMakerLeg('buy', makerBuyPx, annualBps);
    } else if (this.positionSide === 'long' && this.restingOpenSide !== 'sell' && annualBps <= this.config.exitAnnualBps) {
      const makerSellPx = ticker.ask > 0 ? Math.max(ticker.ask, price) : price;
      void this.submitMakerLeg('sell', makerSellPx, annualBps);
    }
  }

  getConfig(): H3MakerBotConfig { return { ...this.config }; }
  isRunning(): boolean { return this.running; }
  getPositionSide(): 'flat' | 'long' { return this.positionSide; }
  getPositionQty(): number { return this.positionQty; }
  getEntryPrice(): number { return this.entryPrice; }

  private applyFilledLeg(side: Side, fillPrice: number, filledQty: number): void {
    if (side === 'buy') {
      const totalQty = this.positionQty + filledQty;
      this.entryPrice = totalQty > 0 ? (this.entryPrice * this.positionQty + fillPrice * filledQty) / totalQty : fillPrice;
      this.positionQty = totalQty;
      this.positionSide = 'long';
      return;
    }
    const rem = Math.max(0, this.positionQty - filledQty);
    this.positionQty = rem;
    this.positionSide = rem > 1e-12 ? 'long' : 'flat';
    if (this.positionSide === 'flat') this.entryPrice = 0;
  }

  private async dispatchMakerOrder(
    side: Side, limitPrice: number, quantity: number,
  ): Promise<{ fillPrice: number; filledQty: number; fee: number; orderId: string } | null> {
    if (!this.callbacks.placeOrder) {
      return { fillPrice: limitPrice, filledQty: quantity, fee: 0, orderId: `h3-${side}-${Date.now()}` };
    }
    if (this.restingOrderId && this.callbacks.cancelOrder) {
      await this.callbacks.cancelOrder(this.restingOrderId, this.config.symbol).catch(() => false);
      this.restingOrderId = null;
      this.restingOpenSide = null;
    }
    const res = await this.callbacks.placeOrder({
      symbol: this.config.symbol, exchange: this.config.exchange,
      side, type: 'limit', price: limitPrice, quantity, timeInForce: 'GTC',
      ...(side === 'sell' ? { reduceOnly: true } : {}),
    });
    if (res.status === 'open') {
      this.restingOpenSide = this.callbacks.cancelOrder ? null : side;
      this.restingOrderId = res.id;
      return null;
    }
    const hasFill = (res.status === 'filled' || res.status === 'partially_filled') && res.filled > 0;
    this.restingOpenSide = null;
    this.restingOrderId = hasFill && res.status === 'partially_filled' ? res.id : null;
    if (!hasFill) return null;
    return {
      fillPrice: res.price > 0 ? res.price : limitPrice,
      filledQty: res.filled,
      fee: res.fee ?? 0,
      orderId: res.id,
    };
  }

  private async submitMakerLeg(side: Side, limitPrice: number, annualBps: number): Promise<void> {
    const quantity = side === 'buy'
      ? (this.config.capital * clampSinglePairAllocation(this.config.maxGrossLeverage)) / limitPrice
      : this.positionQty;
    const priorEntry = this.entryPrice;
    this.orderInFlight = true;
    try {
      const exec = await this.dispatchMakerOrder(side, limitPrice, quantity);
      if (!exec) return;
      const pnl = side === 'sell' ? (exec.fillPrice - priorEntry) * exec.filledQty - exec.fee : 0;
      this.applyFilledLeg(side, exec.fillPrice, exec.filledQty);
      this.callbacks.onTrade?.({
        id: exec.orderId, botId: this.botId, exchangeId: this.config.exchange,
        symbol: this.config.symbol, side, type: 'limit', price: exec.fillPrice,
        quantity, filled: exec.filledQty, fee: exec.fee, pnl, status: 'filled', timestamp: Date.now(),
      });
      this.callbacks.onLog(`H3_MAKER ${side} @ ${exec.fillPrice.toFixed(2)} (${annualBps.toFixed(1)} bps)`);
    } catch (err) {
      this.callbacks.onLog(`H3_MAKER ${side} failed: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      this.orderInFlight = false;
    }
  }
}
