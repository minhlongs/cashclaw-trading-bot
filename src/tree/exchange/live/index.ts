import { createCCXTClient } from '../ccxt/client';
import { rateLimiter } from '../rate-limiter';
import type { ExchangeId, Ticker, OrderBook, Balance, OrderRequest, OrderResult, ExchangeAdapter, ExchangeConfig } from '../types';
import type { KillswitchCallbacks, LiveExchangeOptions } from './live-exchange-types';
import { executeLiveOrder, cancelLiveOrder, checkKillswitchLoss, pingExchange } from './live-exchange-orders';
import { fetchLiveTicker, fetchLiveOrderBook, fetchLiveBalances, fetchLiveOrder, fetchLiveOpenOrders } from './live-market-data';

export type { KillswitchCallbacks, LiveExchangeOptions } from './live-exchange-types';
export { executeLiveOrder, cancelLiveOrder, checkKillswitchLoss, pingExchange } from './live-exchange-orders';
export { fetchLiveTicker, fetchLiveOrderBook, fetchLiveBalances, fetchLiveOrder, fetchLiveOpenOrders } from './live-market-data';

export class LiveExchange implements ExchangeAdapter {
  id: ExchangeId; name: string;
  private client: ReturnType<typeof createCCXTClient>;
  private ks: KillswitchCallbacks;
  private pnl = 0; private maxLoss: number; private count = 0; private maxRate: number;
  private liveExecutionEnabled: boolean;
  private riskConfigurationValid: boolean;
  private preTradeAuthorizeAndAudit?: LiveExchangeOptions['preTradeAuthorizeAndAudit'];
  constructor(id: ExchangeId, cfg: ExchangeConfig, ks: KillswitchCallbacks, o: LiveExchangeOptions = {}) {
    this.id = id; this.name = id; this.ks = ks;
    this.client = createCCXTClient(id, { apiKey: cfg.apiKey, apiSecret: cfg.apiSecret, sandbox: cfg.sandbox });
    this.maxLoss = (o.maxDailyLossPct ?? 10) / 100; this.maxRate = o.maxOrdersPerMinute ?? 50;
    this.liveExecutionEnabled = o.liveExecutionEnabled ?? false;
    this.riskConfigurationValid = Number.isFinite(o.maxDailyLossPct) && (o.maxDailyLossPct ?? 0) > 0 && (o.maxDailyLossPct ?? 0) <= 100
      && Number.isInteger(o.maxOrdersPerMinute) && (o.maxOrdersPerMinute ?? 0) > 0;
    this.preTradeAuthorizeAndAudit = o.preTradeAuthorizeAndAudit;
  }
  fetchTicker(s: string): Promise<Ticker> { return fetchLiveTicker(this.id, this.client, s); }
  fetchOrderBook(s: string, d = 20): Promise<OrderBook> { return fetchLiveOrderBook(this.id, this.client, s, d); }
  fetchBalances(): Promise<Balance[]> { return fetchLiveBalances(this.id, this.client); }
  async placeOrder(req: OrderRequest): Promise<OrderResult> {
    const { result, newOrderCount } = await executeLiveOrder({ id: this.id, client: this.client, killswitch: this.ks, dailyPnl: this.pnl, maxDailyLoss: this.maxLoss, orderCount: this.count, maxOrdersPerMinute: this.maxRate, liveExecutionEnabled: this.liveExecutionEnabled, riskConfigurationValid: this.riskConfigurationValid, preTradeAuthorizeAndAudit: this.preTradeAuthorizeAndAudit }, req);
    this.count = newOrderCount; return result;
  }
  cancelOrder(oid: string, s: string): Promise<boolean> { return cancelLiveOrder({ id: this.id, client: this.client, killswitch: this.ks }, oid, s); }
  fetchOrder(oid: string, s: string): Promise<OrderResult> { return fetchLiveOrder(this.id, this.client, oid, s); }
  fetchOpenOrders(s?: string): Promise<OrderResult[]> { return fetchLiveOpenOrders(this.id, this.client, s); }
  ping(): Promise<boolean> { return pingExchange(this.id, this.client); }
  async getServerTime(): Promise<number> { await rateLimiter.acquire(this.id, 'api'); return Date.now(); }
  updateDailyPnl(pnl: number): void { this.pnl += pnl; checkKillswitchLoss(this.pnl, this.maxLoss, this.ks); }
  tick(): void { this.count = 0; }
}
