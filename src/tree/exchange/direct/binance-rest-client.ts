// Edge-native Binance REST Client for CashClaw v2-Foundation
// Strictly adheres to ADR-001: Public market data & signed request helper only (no live order placement)

import type {
  Binance24hrTicker,
  BinanceQueryParams,
  BinanceServerTime,
  DirectRestConfig,
  SignedRequest,
} from './types';
import { buildBinanceHeaders, buildBinanceSignedQuery } from './webcrypto-signer';

export class BinanceRestClient {
  private readonly apiKey?: string;
  private readonly apiSecret?: string;
  private readonly baseUrl: string;
  private readonly recvWindow: number;
  private readonly fetchFn: typeof fetch;

  constructor(config: DirectRestConfig = {}) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    const rawBaseUrl = config.baseUrl ?? 'https://api.binance.com';
    // Validate protocol against SSRF - strictly require HTTPS or HTTP (local mock)
    if (!rawBaseUrl.startsWith('https://') && !rawBaseUrl.startsWith('http://')) {
      throw new Error(`Invalid baseUrl protocol: must start with https:// or http://`);
    }
    this.baseUrl = rawBaseUrl.replace(/\/+$/, '');
    this.recvWindow = config.recvWindow ?? 5000;
    this.fetchFn = config.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  private async handleResponse<T>(res: Response, endpoint: string): Promise<T> {
    if (!res.ok) {
      let errorDetail = '';
      try {
        const rawText = await res.text();
        if (rawText) {
          try {
            const errJson = JSON.parse(rawText) as { code?: number; msg?: string };
            if (errJson && typeof errJson === 'object') {
              if (errJson.msg) {
                errorDetail = ` [code: ${errJson.code ?? 'unknown'}]: ${errJson.msg}`;
              } else {
                errorDetail = `: ${JSON.stringify(errJson)}`;
              }
            }
          } catch {
            errorDetail = `: ${rawText}`;
          }
        }
      } catch {
        // ignore read errors
      }
      throw new Error(`Binance REST ${res.status} on ${endpoint}${errorDetail}`);
    }
    return (await res.json()) as T;
  }

  async ping(): Promise<boolean> {
    const endpoint = '/api/v3/ping';
    const url = `${this.baseUrl}${endpoint}`;
    const res = await this.fetchFn(url, { method: 'GET' });
    await this.handleResponse<Record<string, unknown>>(res, endpoint);
    return true;
  }

  async getServerTime(): Promise<number> {
    const endpoint = '/api/v3/time';
    const url = `${this.baseUrl}${endpoint}`;
    const res = await this.fetchFn(url, { method: 'GET' });
    const data = await this.handleResponse<BinanceServerTime>(res, endpoint);
    if (!data || typeof data.serverTime !== 'number' || !Number.isFinite(data.serverTime)) {
      throw new Error('Invalid serverTime format in Binance response');
    }
    return data.serverTime;
  }

  async fetchTicker(symbol: string): Promise<Binance24hrTicker> {
    if (!symbol || !symbol.trim()) {
      throw new Error('Symbol cannot be empty');
    }
    const cleanSymbol = symbol.trim().toUpperCase();
    const endpoint = `/api/v3/ticker/24hr?symbol=${encodeURIComponent(cleanSymbol)}`;
    const url = `${this.baseUrl}${endpoint}`;
    const res = await this.fetchFn(url, { method: 'GET' });
    return await this.handleResponse<Binance24hrTicker>(res, endpoint);
  }

  async createSignedRequest(
    endpoint: string,
    params: BinanceQueryParams = {},
    method: 'GET' | 'POST' = 'GET'
  ): Promise<SignedRequest> {
    if (!this.apiKey || !this.apiKey.trim()) {
      throw new Error('API key cannot be empty');
    }
    if (!this.apiSecret || !this.apiSecret.trim()) {
      throw new Error('HMAC secret cannot be empty');
    }

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const headers = buildBinanceHeaders(this.apiKey);
    const signResult = await buildBinanceSignedQuery(params, this.apiSecret, {
      recvWindow: this.recvWindow,
    });
    const url = `${this.baseUrl}${cleanEndpoint}?${signResult.fullQueryString}`;

    return {
      url,
      method,
      headers,
      queryString: signResult.fullQueryString,
      signature: signResult.signature,
    };
  }
}
