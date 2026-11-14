// H3_MAKER Paper-Forward Basis & Maker Limit Strategy
// Pure Open-Core paper strategy: zero node:fs, fetch, LiveExchange, or @/ee imports.

import type { H3MakerBotConfig, BotTrade } from '../types';
import type { Ticker, OrderRequest, OrderResult, Side } from '../../exchange/types';

export interface H3MakerCallbacks {
  placeOrder?: (req: OrderRequest) => Promise<OrderResult>;
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
    this.positionSide = 'flat';
    this.entryPrice = 0;
    this.positionQty = 0;
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
    if (this.positionSide === 'flat' && annualBps >= this.config.entryAnnualBps) {
      const makerBuyPx = ticker.bid > 0 ? Math.min(ticker.bid, price) : price;
      void this.submitMakerLeg('buy', makerBuyPx, annualBps);
    } else if (this.positionSide === 'long' && annualBps <= this.config.exitAnnualBps) {
      const makerSellPx = ticker.ask > 0 ? Math.max(ticker.ask, price) : price;
      void this.submitMakerLeg('sell', makerSellPx, annualBps);
    }
  }

  getConfig(): H3MakerBotConfig { return { ...this.config }; }
  isRunning(): boolean { return this.running; }
  getPositionSide(): 'flat' | 'long' { return this.positionSide; }
  getPositionQty(): number { return this.positionQty; }
  getEntryPrice(): number { return this.entryPrice; }

  private async submitMakerLeg(side: Side, limitPrice: number, annualBps: number): Promise<void> {
    const quantity = side === 'buy'
      ? (this.config.capital * clampSinglePairAllocation(this.config.maxGrossLeverage)) / limitPrice
      : this.positionQty;
    const priorEntry = this.entryPrice;
    this.orderInFlight = true;
    try {
      let fillPrice = limitPrice;
      let filledQty = quantity;
      let fee = 0;
      let orderId = `h3-${side}-${Date.now()}`;
      if (this.callbacks.placeOrder) {
        const res = await this.callbacks.placeOrder({
          symbol: this.config.symbol, exchange: this.config.exchange,
          side, type: 'limit', price: limitPrice, quantity, timeInForce: 'GTC',
        });
        if (res.status !== 'filled' || res.filled <= 0) return;
        if (res.price > 0) fillPrice = res.price;
        filledQty = res.filled;
        fee = res.fee ?? 0;
        orderId = res.id;
      }
      const pnl = side === 'sell' ? (fillPrice - priorEntry) * filledQty - fee : 0;
      this.positionSide = side === 'buy' ? 'long' : 'flat';
      this.entryPrice = side === 'buy' ? fillPrice : 0;
      this.positionQty = side === 'buy' ? filledQty : 0;
      this.callbacks.onTrade?.({
        id: orderId, botId: this.botId, exchangeId: this.config.exchange,
        symbol: this.config.symbol, side, type: 'limit', price: fillPrice,
        quantity, filled: filledQty, fee, pnl, status: 'filled', timestamp: Date.now(),
      });
      this.callbacks.onLog(`H3_MAKER ${side} @ ${fillPrice.toFixed(2)} (${annualBps.toFixed(1)} bps)`);
    } catch (err) {
      this.callbacks.onLog(`H3_MAKER ${side} failed: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      this.orderInFlight = false;
    }
  }
}
