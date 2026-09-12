// Unified Direct Ticker Provider for CashClaw v2-Foundation
// Strictly adheres to ADR-001: Market data acquisition only (no order placement)

import type { ExchangeId, Ticker } from '../types';
import type { TickerProvider } from '../provider/provider';
import { CircuitBreaker } from '../provider/circuit-breaker';
import { BinanceRestClient } from './binance-rest-client';
import { OkxRestClient } from './okx-rest-client';
import { BybitRestClient } from './bybit-rest-client';
import type { DirectRestConfig, OkxRestConfig, BybitRestConfig } from './types';
import { toExchangeSymbol } from './symbol-normalizer';
import { normalizeTicker } from './ticker-normalizer';

export interface DirectTickerProviderConfig {
  exchangeId: ExchangeId;
  restConfig?: DirectRestConfig | OkxRestConfig | BybitRestConfig;
  circuitBreaker?: CircuitBreaker;
  client?: BinanceRestClient | OkxRestClient | BybitRestClient;
}

export class DirectTickerProvider implements TickerProvider {
  readonly name: string;
  readonly exchangeId: ExchangeId;
  readonly circuitBreaker: CircuitBreaker;
  private readonly client: BinanceRestClient | OkxRestClient | BybitRestClient;

  constructor(config: DirectTickerProviderConfig) {
    if (
      config.exchangeId !== 'binance' &&
      config.exchangeId !== 'okx' &&
      config.exchangeId !== 'bybit'
    ) {
      throw new Error(`Unsupported exchange ID: ${String(config.exchangeId)}`);
    }

    this.exchangeId = config.exchangeId;
    this.name = `direct:${this.exchangeId}`;

    this.circuitBreaker =
      config.circuitBreaker ??
      new CircuitBreaker({
        cooldownMs: 60_000,
        halfOpenAfterMs: 30_000,
      });

    if (config.client) {
      this.client = config.client;
    } else {
      switch (this.exchangeId) {
        case 'binance':
          this.client = new BinanceRestClient(config.restConfig);
          break;
        case 'okx':
          this.client = new OkxRestClient(config.restConfig as OkxRestConfig);
          break;
        case 'bybit':
          this.client = new BybitRestClient(config.restConfig as BybitRestConfig);
          break;
      }
    }
  }

  getClient(): BinanceRestClient | OkxRestClient | BybitRestClient {
    return this.client;
  }

  async healthCheck(): Promise<boolean> {
    if (this.circuitBreaker.getState() === 'open') {
      return false;
    }
    try {
      return await this.client.ping();
    } catch {
      return false;
    }
  }

  async fetchTicker(symbol: string): Promise<Ticker> {
    const exchangeSymbol = toExchangeSymbol(symbol, this.exchangeId);

    const raw = await this.circuitBreaker.execute(async () => {
      switch (this.exchangeId) {
        case 'binance':
          return await (this.client as BinanceRestClient).fetchTicker(exchangeSymbol);
        case 'okx':
          return await (this.client as OkxRestClient).fetchTicker(exchangeSymbol);
        case 'bybit':
          return await (this.client as BybitRestClient).fetchTicker(exchangeSymbol);
      }
    });

    return normalizeTicker(this.exchangeId, raw, symbol);
  }
}
