// Binance REST API WebCrypto signer implementation

import type { BinanceQueryParams, BinanceSignResult } from './types';
import { signHmacSha256Hex } from './webcrypto-signer-hmac';

export function checkNonEmpty(val: string | undefined | null, name: string): string {
  if (!val || !val.trim()) throw new Error(`${name} cannot be empty`);
  return val.trim();
}

export function validateRecvWindow(recvWindow: number): number {
  if (!Number.isFinite(recvWindow) || recvWindow <= 0 || recvWindow > 60000) {
    throw new Error('recvWindow must be between 1 and 60000');
  }
  return recvWindow;
}

export function buildBinanceHeaders(apiKey: string): Record<string, string> {
  return { 'X-MBX-APIKEY': checkNonEmpty(apiKey, 'API key'), 'Content-Type': 'application/json' };
}

export async function buildBinanceSignedQuery(
  params: BinanceQueryParams,
  secret: string,
  options?: { timestamp?: number; recvWindow?: number }
): Promise<BinanceSignResult> {
  checkNonEmpty(secret, 'HMAC secret');
  const recvWindow = validateRecvWindow(
    options?.recvWindow ?? (params.recvWindow !== undefined ? Number(params.recvWindow) : 5000)
  );
  const timestamp = options?.timestamp ?? (typeof params.timestamp === 'number' ? params.timestamp : Date.now());

  const merged: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && k !== 'recvWindow' && k !== 'timestamp') merged[k] = v;
  }
  merged.recvWindow = recvWindow;
  merged.timestamp = timestamp;

  const sortedQueryString = Object.keys(merged)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(merged[key]))}`)
    .join('&');

  const signature = await signHmacSha256Hex(secret, sortedQueryString);
  return { sortedQueryString, signature, fullQueryString: `${sortedQueryString}&signature=${signature}` };
}