import type { OkxServerTime, OkxSystemStatus, OkxTicker } from './types';
import { OkxResponseParser } from './okx-response-parser';

export class OkxMarketEndpoints {
  public static async ping(baseUrl: string, fetchFn: typeof fetch): Promise<boolean> {
    const ep = '/api/v5/system/status';
    const res = await fetchFn(`${baseUrl}${ep}`, { method: 'GET' });
    await OkxResponseParser.handleResponse<OkxSystemStatus>(res, ep);
    return true;
  }

  public static async getServerTime(baseUrl: string, fetchFn: typeof fetch): Promise<number> {
    const ep = '/api/v5/public/time';
    const res = await fetchFn(`${baseUrl}${ep}`, { method: 'GET' });
    const data = await OkxResponseParser.handleResponse<OkxServerTime>(res, ep);
    const ts = parseInt(data.data?.[0]?.ts ?? '', 10);
    if (!Number.isFinite(ts)) throw new Error('Invalid serverTime format in OKX response');
    return ts;
  }

  public static async fetchTicker(baseUrl: string, fetchFn: typeof fetch, instId: string): Promise<OkxTicker> {
    if (!instId || !instId.trim()) throw new Error('Instrument ID cannot be empty');
    const cleanId = instId.trim().toUpperCase();
    const ep = `/api/v5/market/ticker?instId=${encodeURIComponent(cleanId)}`;
    const res = await fetchFn(`${baseUrl}${ep}`, { method: 'GET' });
    const data = await OkxResponseParser.handleResponse<OkxTicker>(res, ep);
    const ticker = data.data?.[0];
    if (!ticker) throw new Error(`No ticker data returned for ${cleanId}`);
    return ticker;
  }
}
