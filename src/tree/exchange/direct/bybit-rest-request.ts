import type { BybitQueryParams, SignedRequest } from './types';
import { buildBybitHeaders, buildBybitSignature } from './webcrypto-signer';

export interface BuildSignedRequestDeps {
  apiKey?: string; apiSecret?: string; baseUrl: string; recvWindow: number;
}

export async function createBybitSignedRequest(
  deps: BuildSignedRequestDeps,
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  params: BybitQueryParams = {},
  body?: Record<string, unknown>
): Promise<SignedRequest> {
  if (!deps.apiKey || !deps.apiKey.trim()) throw new Error('API key cannot be empty');
  if (!deps.apiSecret || !deps.apiSecret.trim()) throw new Error('HMAC secret cannot be empty');

  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  let queryString = '', payload = '';
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
  const signature = await buildBybitSignature(deps.apiSecret, timestamp, deps.apiKey, deps.recvWindow, payload);
  const headers = buildBybitHeaders(deps.apiKey, timestamp, signature, deps.recvWindow);
  const url = queryString ? `${deps.baseUrl}${cleanEndpoint}?${queryString}` : `${deps.baseUrl}${cleanEndpoint}`;
  return { url, method, headers, queryString, signature };
}
