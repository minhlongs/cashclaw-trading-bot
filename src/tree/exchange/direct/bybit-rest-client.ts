import type { BybitCategory, BybitQueryParams, BybitResponse, BybitRestConfig, BybitServerTimeResult, BybitTicker, BybitTickerResult, SignedRequest } from './types';
import { handleBybitResponse, parseBybitServerTime } from './bybit-rest-response';
import { createBybitSignedRequest } from './bybit-rest-request';

export class BybitRestClient {
  private readonly apiKey?: string; private readonly apiSecret?: string;
  private readonly baseUrl: string; private readonly recvWindow: number; private readonly fetchFn: typeof fetch;

  constructor(config: BybitRestConfig = {}) {
    this.apiKey = config.apiKey; this.apiSecret = config.apiSecret;
    const raw = config.baseUrl ?? 'https://api.bybit.com';
    if (!raw.startsWith('https://') && !raw.startsWith('http://')) throw new Error('Invalid baseUrl protocol: must start with https:// or http://');
    this.baseUrl = raw.replace(/\/+$/, '');
    const rw = config.recvWindow ?? 5000;
    if (!Number.isFinite(rw) || rw < 1 || rw > 60000) throw new Error('recvWindow must be between 1 and 60000');
    this.recvWindow = rw; this.fetchFn = config.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  private handleResponse<T>(res: Response, ep: string): Promise<BybitResponse<T>> { return handleBybitResponse<T>(res, ep); }
  async ping(): Promise<boolean> {
    const res = await this.fetchFn(`${this.baseUrl}/v5/market/time`, { method: 'GET' });
    await this.handleResponse<BybitServerTimeResult>(res, '/v5/market/time'); return true;
  }
  async getServerTime(): Promise<number> {
    const res = await this.fetchFn(`${this.baseUrl}/v5/market/time`, { method: 'GET' });
    const data = await this.handleResponse<BybitServerTimeResult>(res, '/v5/market/time');
    return parseBybitServerTime(data.time, data.result?.timeSecond);
  }
  async fetchTicker(category: BybitCategory, symbol: string): Promise<BybitTicker>;
  async fetchTicker(symbol: string, category?: BybitCategory): Promise<BybitTicker>;
  async fetchTicker(arg1: string, arg2?: string): Promise<BybitTicker> {
    const isCat = arg1 === 'spot' || arg1 === 'linear' || arg1 === 'inverse';
    const cat = isCat ? (arg1 as BybitCategory) : ((arg2 as BybitCategory) ?? 'spot');
    const sym = isCat ? (arg2 ?? '') : arg1;
    if (!sym || !sym.trim()) throw new Error('Symbol cannot be empty');
    const cleanSym = sym.trim().toUpperCase(), ep = `/v5/market/tickers?category=${cat}&symbol=${encodeURIComponent(cleanSym)}`;
    const res = await this.fetchFn(`${this.baseUrl}${ep}`, { method: 'GET' });
    const data = await this.handleResponse<BybitTickerResult>(res, ep);
    const ticker = data.result?.list?.[0];
    if (!ticker) throw new Error(`No ticker data returned for ${cleanSym}`);
    return ticker;
  }
  createSignedRequest(ep: string, method: 'GET' | 'POST' = 'GET', params: BybitQueryParams = {}, body?: Record<string, unknown>): Promise<SignedRequest> {
    return createBybitSignedRequest({ apiKey: this.apiKey, apiSecret: this.apiSecret, baseUrl: this.baseUrl, recvWindow: this.recvWindow }, ep, method, params, body);
  }
}
