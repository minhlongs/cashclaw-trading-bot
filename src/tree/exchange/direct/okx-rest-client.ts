// Edge-native OKX REST Client for CashClaw v2-Foundation
// Strictly adheres to ADR-001: Public market data & signed request helper only (no live order placement)

import type { OkxResponse, OkxRestConfig, OkxServerTime, OkxSystemStatus, OkxTicker, SignedRequest } from './types';
import { buildOkxHeaders, buildOkxSignature } from './webcrypto-signer';

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
    const rawBaseUrl = config.baseUrl ?? 'https://www.okx.com';
    if (!rawBaseUrl.startsWith('https://') && !rawBaseUrl.startsWith('http://')) {
      throw new Error('Invalid baseUrl protocol: must start with https:// or http://');
    }
    this.baseUrl = rawBaseUrl.replace(/\/+$/, '');
    this.simulated = config.simulated ?? false;
    this.fetchFn = config.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  private async handleResponse<T>(res: Response, endpoint: string): Promise<OkxResponse<T>> {
    if (!res.ok) {
      let errorDetail = '';
      try {
        const rawText = await res.text();
        if (rawText) {
          try {
            const errJson = JSON.parse(rawText) as { code?: string; msg?: string };
            errorDetail = errJson?.msg ? ` [code: ${errJson.code ?? 'unknown'}]: ${errJson.msg}` : `: ${rawText}`;
          } catch {
            errorDetail = `: ${rawText}`;
          }
        }
      } catch {
        // ignore stream read failures
      }
      throw new Error(`OKX REST ${res.status} on ${endpoint}${errorDetail}`);
    }
    const data = (await res.json()) as OkxResponse<T>;
    if (data.code !== '0') {
      throw new Error(`OKX REST error [code: ${data.code}]: ${data.msg}`);
    }
    return data;
  }

  async ping(): Promise<boolean> {
    const endpoint = '/api/v5/system/status';
    const res = await this.fetchFn(`${this.baseUrl}${endpoint}`, { method: 'GET' });
    await this.handleResponse<OkxSystemStatus>(res, endpoint);
    return true;
  }

  async getServerTime(): Promise<number> {
    const endpoint = '/api/v5/public/time';
    const res = await this.fetchFn(`${this.baseUrl}${endpoint}`, { method: 'GET' });
    const data = await this.handleResponse<OkxServerTime>(res, endpoint);
    const ts = parseInt(data.data?.[0]?.ts ?? '', 10);
    if (!Number.isFinite(ts)) {
      throw new Error('Invalid serverTime format in OKX response');
    }
    return ts;
  }

  async fetchTicker(instId: string): Promise<OkxTicker> {
    if (!instId || !instId.trim()) throw new Error('Instrument ID cannot be empty');
    const cleanId = instId.trim().toUpperCase();
    const endpoint = `/api/v5/market/ticker?instId=${encodeURIComponent(cleanId)}`;
    const res = await this.fetchFn(`${this.baseUrl}${endpoint}`, { method: 'GET' });
    const data = await this.handleResponse<OkxTicker>(res, endpoint);
    const ticker = data.data?.[0];
    if (!ticker) throw new Error(`No ticker data returned for ${cleanId}`);
    return ticker;
  }

  async createSignedRequest(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    params: Record<string, string | number | boolean> = {},
    body?: Record<string, unknown>
  ): Promise<SignedRequest> {
    if (!this.apiKey || !this.apiKey.trim()) throw new Error('API key cannot be empty');
    if (!this.apiSecret || !this.apiSecret.trim()) throw new Error('HMAC secret cannot be empty');
    if (!this.passphrase || !this.passphrase.trim()) throw new Error('Passphrase cannot be empty');

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    let requestPath = cleanEndpoint;
    let queryString = '';

    if (method === 'GET') {
      const keys = Object.keys(params).sort();
      if (keys.length > 0) {
        queryString = keys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`).join('&');
        requestPath = `${cleanEndpoint}?${queryString}`;
      }
    }

    const bodyStr = method === 'POST' && body ? JSON.stringify(body) : '';
    const timestamp = new Date().toISOString();
    const signature = await buildOkxSignature(this.apiSecret, timestamp, method, requestPath, bodyStr);
    const headers = buildOkxHeaders(this.apiKey, this.passphrase, timestamp, signature, this.simulated);

    return {
      url: `${this.baseUrl}${requestPath}`,
      method,
      headers,
      queryString,
      signature,
    };
  }
}
