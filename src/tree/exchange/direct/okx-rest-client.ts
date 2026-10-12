import type { OkxRestConfig, OkxTicker, SignedRequest } from './types';
import { OkxMarketEndpoints } from './okx-market-endpoints';
import { OkxRequestSigner } from './okx-request-signer';

export class OkxRestClient {
  private readonly apiKey?: string;
  private readonly apiSecret?: string;
  private readonly passphrase?: string;
  private readonly baseUrl: string;
  private readonly simulated: boolean;
  private readonly fetchFn: typeof fetch;

  constructor(config: OkxRestConfig = {}) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.passphrase = config.passphrase;
    const rawUrl = config.baseUrl ?? 'https://www.okx.com';
    if (!rawUrl.startsWith('https://') && !rawUrl.startsWith('http://')) {
      throw new Error('Invalid baseUrl protocol: must start with https:// or http://');
    }
    this.baseUrl = rawUrl.replace(/\/+$/, '');
    this.simulated = config.simulated ?? false;
    this.fetchFn = config.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  ping(): Promise<boolean> { return OkxMarketEndpoints.ping(this.baseUrl, this.fetchFn); }
  getServerTime(): Promise<number> { return OkxMarketEndpoints.getServerTime(this.baseUrl, this.fetchFn); }
  fetchTicker(instId: string): Promise<OkxTicker> { return OkxMarketEndpoints.fetchTicker(this.baseUrl, this.fetchFn, instId); }
  createSignedRequest(ep: string, method: 'GET' | 'POST' = 'GET', params: Record<string, string | number | boolean> = {}, body?: Record<string, unknown>): Promise<SignedRequest> {
    return OkxRequestSigner.createSignedRequest(this.baseUrl, this.apiKey, this.apiSecret, this.passphrase, this.simulated, ep, method, params, body);
  }
}
