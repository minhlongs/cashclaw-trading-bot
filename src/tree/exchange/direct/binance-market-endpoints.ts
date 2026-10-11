import type { Binance24hrTicker, BinanceServerTime } from './types';
import { handleBinanceResponse } from './binance-response-parser';

export async function pingBinance(baseUrl: string, fetchFn: typeof fetch): Promise<boolean> {
  const endpoint = '/api/v3/ping';
  const res = await fetchFn(`${baseUrl}${endpoint}`, { method: 'GET' });
  await handleBinanceResponse<Record<string, unknown>>(res, endpoint);
  return true;
}

export async function getBinanceServerTime(baseUrl: string, fetchFn: typeof fetch): Promise<number> {
  const endpoint = '/api/v3/time';
  const res = await fetchFn(`${baseUrl}${endpoint}`, { method: 'GET' });
  const data = await handleBinanceResponse<BinanceServerTime>(res, endpoint);
  if (!data || typeof data.serverTime !== 'number' || !Number.isFinite(data.serverTime)) {
    throw new Error('Invalid serverTime format in Binance response');
  }
  return data.serverTime;
}

export async function fetchBinanceTicker(baseUrl: string, symbol: string, fetchFn: typeof fetch): Promise<Binance24hrTicker> {
  if (!symbol || !symbol.trim()) throw new Error('Symbol cannot be empty');
  const cleanSymbol = symbol.trim().toUpperCase();
  const endpoint = `/api/v3/ticker/24hr?symbol=${encodeURIComponent(cleanSymbol)}`;
  const res = await fetchFn(`${baseUrl}${endpoint}`, { method: 'GET' });
  return await handleBinanceResponse<Binance24hrTicker>(res, endpoint);
}
