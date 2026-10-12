import type { SignedRequest } from './types';
import { buildOkxHeaders, buildOkxSignature } from './webcrypto-signer';

export class OkxRequestSigner {
  public static async createSignedRequest(
    baseUrl: string,
    apiKey: string | undefined,
    apiSecret: string | undefined,
    passphrase: string | undefined,
    simulated: boolean,
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    params: Record<string, string | number | boolean> = {},
    body?: Record<string, unknown>
  ): Promise<SignedRequest> {
    if (!apiKey || !apiKey.trim()) throw new Error('API key cannot be empty');
    if (!apiSecret || !apiSecret.trim()) throw new Error('HMAC secret cannot be empty');
    if (!passphrase || !passphrase.trim()) throw new Error('Passphrase cannot be empty');
    const cleanEp = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    let reqPath = cleanEp;
    let query = '';
    if (method === 'GET') {
      const keys = Object.keys(params).sort();
      if (keys.length > 0) {
        query = keys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`).join('&');
        reqPath = `${cleanEp}?${query}`;
      }
    }
    const bodyStr = method === 'POST' && body ? JSON.stringify(body) : '';
    const timestamp = new Date().toISOString();
    const signature = await buildOkxSignature(apiSecret, timestamp, method, reqPath, bodyStr);
    const headers = buildOkxHeaders(apiKey, passphrase, timestamp, signature, simulated);
    return { url: `${baseUrl}${reqPath}`, method, headers, queryString: query, signature };
  }
}
