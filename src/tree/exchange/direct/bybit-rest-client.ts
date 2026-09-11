// Edge-native Bybit REST Client for CashClaw v2-Foundation
// Strictly adheres to ADR-001: Public market data & signed request helper only (no live order placement)

import type {
  BybitCategory,
  BybitQueryParams,
  BybitResponse,
  BybitRestConfig,
  BybitServerTimeResult,
  BybitTicker,
  BybitTickerResult,
  SignedRequest,
} from './types';
import { buildBybitHeaders, buildBybitSignature } from './webcrypto-signer';

export class BybitRestClient {
  private readonly apiKey?: string;
  private readonly apiSecret?: string;
  private readonly baseUrl: string;
  private readonly recvWindow: number;
  private readonly fetchFn: typeof fetch;

  constructor(config: BybitRestConfig = {}) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    const rawBaseUrl = config.baseUrl ?? 'https://api.bybit.com';
    if (!rawBaseUrl.startsWith('https://') && !rawBaseUrl.startsWith('http://')) {
      throw new Error('Invalid baseUrl protocol: must start with https:// or http://');
    }
    this.baseUrl = rawBaseUrl.replace(/\/+$/, '');
    const rw = config.recvWindow ?? 5000;
    if (!Number.isFinite(rw) || rw < 1 || rw > 60000) {
      throw new Error('recvWindow must be between 1 and 60000');
    }
    this.recvWindow = rw;
    this.fetchFn = config.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  private async handleResponse<T>(res: Response, endpoint: string): Promise<BybitResponse<T>> {
    if (!res.ok) {
      let errorDetail = '';
      try {
        const rawText = await res.text();
        if (rawText) {
          try {
            const errJson = JSON.parse(rawText) as { retCode?: number; retMsg?: string };
            errorDetail = errJson?.retMsg ? ` [code: ${errJson.retCode ?? 'unknown'}]: ${errJson.retMsg}` : `: ${rawText}`;
          } catch {
            errorDetail = `: ${rawText}`;
          }
        }
      } catch {
        // ignore stream read failures
      }
      throw new Error(`Bybit REST ${res.status} on ${endpoint}${errorDetail}`);
    }
    const data = (await res.json()) as BybitResponse<T>;
    if (data.retCode !== 0) {
      throw new Error(`Bybit REST error [code: ${data.retCode}]: ${data.retMsg}`);
    }
    return data;
  }

  async ping(): Promise<boolean> {
    const endpoint = '/v5/market/time';
    const res = await this.fetchFn(`${this.baseUrl}${endpoint}`, { method: 'GET' });
    await this.handleResponse<BybitServerTimeResult>(res, endpoint);
    return true;
  }

  async getServerTime(): Promise<number> {
    const endpoint = '/v5/market/time';
    const res = await this.fetchFn(`${this.baseUrl}${endpoint}`, { method: 'GET' });
    const data = await this.handleResponse<BybitServerTimeResult>(res, endpoint);
    const fromTime = typeof data.time === 'number' ? data.time : parseInt(String(data.time ?? ''), 10);
    if (Number.isFinite(fromTime) && fromTime > 0) return fromTime;
    const fromSec = parseInt(data.result?.timeSecond ?? '', 10) * 1000;
    if (Number.isFinite(fromSec) && fromSec > 0) return fromSec;
    throw new Error('Invalid serverTime format in Bybit response');
  }

  async fetchTicker(category: BybitCategory, symbol: string): Promise<BybitTicker>;
  async fetchTicker(symbol: string, category?: BybitCategory): Promise<BybitTicker>;
  async fetchTicker(arg1: string, arg2?: string): Promise<BybitTicker> {
    const isFirstArgCategory = arg1 === 'spot' || arg1 === 'linear' || arg1 === 'inverse';
    const category: BybitCategory = isFirstArgCategory ? (arg1 as BybitCategory) : ((arg2 as BybitCategory) ?? 'spot');
    const symbol = isFirstArgCategory ? (arg2 ?? '') : arg1;

    if (!symbol || !symbol.trim()) throw new Error('Symbol cannot be empty');
    const cleanSymbol = symbol.trim().toUpperCase();
    const endpoint = `/v5/market/tickers?category=${category}&symbol=${encodeURIComponent(cleanSymbol)}`;
    const res = await this.fetchFn(`${this.baseUrl}${endpoint}`, { method: 'GET' });
    const data = await this.handleResponse<BybitTickerResult>(res, endpoint);
    const ticker = data.result?.list?.[0];
    if (!ticker) throw new Error(`No ticker data returned for ${cleanSymbol}`);
    return ticker;
  }

  async createSignedRequest(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    params: BybitQueryParams = {},
    body?: Record<string, unknown>
  ): Promise<SignedRequest> {
    if (!this.apiKey || !this.apiKey.trim()) throw new Error('API key cannot be empty');
    if (!this.apiSecret || !this.apiSecret.trim()) throw new Error('HMAC secret cannot be empty');

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    let queryString = '';
    let payload = '';

    if (method === 'GET') {
      const keys = Object.keys(params).filter(k => params[k] !== undefined).sort();
      if (keys.length > 0) {
        queryString = keys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`).join('&');
        payload = queryString;
      }
    } else if (method === 'POST' && body) {
      payload = JSON.stringify(body);
    }

    const timestamp = Date.now().toString();
    const signature = await buildBybitSignature(this.apiSecret, timestamp, this.apiKey, this.recvWindow, payload);
    const headers = buildBybitHeaders(this.apiKey, timestamp, signature, this.recvWindow);
    const url = queryString ? `${this.baseUrl}${cleanEndpoint}?${queryString}` : `${this.baseUrl}${cleanEndpoint}`;

    return { url, method, headers, queryString, signature };
  }
}
