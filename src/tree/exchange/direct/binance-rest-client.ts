import type { Binance24hrTicker, BinanceQueryParams, DirectRestConfig, SignedRequest } from './types';
import { buildBinanceHeaders, buildBinanceSignedQuery } from './webcrypto-signer';
import { pingBinance, getBinanceServerTime, fetchBinanceTicker } from './binance-market-endpoints';

export class BinanceRestClient {
  private readonly apiKey?: string;
  private readonly apiSecret?: string;
  private readonly baseUrl: string;
  private readonly recvWindow: number;
  private readonly fetchFn: typeof fetch;

  constructor(config: DirectRestConfig = {}) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    const raw = config.baseUrl ?? 'https://api.binance.com';
    if (!raw.startsWith('https://') && !raw.startsWith('http://')) throw new Error('Invalid baseUrl protocol: must start with https:// or http://');
    this.baseUrl = raw.replace(/\/+$/, '');
    this.recvWindow = config.recvWindow ?? 5000;
    this.fetchFn = config.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async ping(): Promise<boolean> { return pingBinance(this.baseUrl, this.fetchFn); }
  async getServerTime(): Promise<number> { return getBinanceServerTime(this.baseUrl, this.fetchFn); }
  async fetchTicker(symbol: string): Promise<Binance24hrTicker> { return fetchBinanceTicker(this.baseUrl, symbol, this.fetchFn); }

  async createSignedRequest(endpoint: string, params: BinanceQueryParams = {}, method: 'GET' | 'POST' = 'GET'): Promise<SignedRequest> {
    if (!this.apiKey || !this.apiKey.trim()) throw new Error('API key cannot be empty');
    if (!this.apiSecret || !this.apiSecret.trim()) throw new Error('HMAC secret cannot be empty');
    const ep = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const signResult = await buildBinanceSignedQuery(params, this.apiSecret, { recvWindow: this.recvWindow });
    return { url: `${this.baseUrl}${ep}?${signResult.fullQueryString}`, method, headers: buildBinanceHeaders(this.apiKey), queryString: signResult.fullQueryString, signature: signResult.signature };
  }
}
