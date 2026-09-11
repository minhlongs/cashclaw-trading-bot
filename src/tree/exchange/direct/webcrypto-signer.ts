// WebCrypto-based HMAC-SHA256 Signer for Direct REST Engine
// Pure edge-native implementation: 0 Node.js standard library imports

import type { BinanceQueryParams, BinanceSignResult } from './types';

export async function signHmacSha256Hex(
  secret: string | Uint8Array,
  payload: string | Uint8Array
): Promise<string> {
  if (typeof secret === 'string') {
    if (!secret || !secret.trim()) {
      throw new Error('HMAC secret cannot be empty');
    }
  } else if (secret instanceof Uint8Array) {
    if (secret.byteLength === 0) {
      throw new Error('HMAC secret cannot be empty');
    }
  } else {
    throw new Error('HMAC secret cannot be empty');
  }

  const encoder = new TextEncoder();
  const keyBytes: BufferSource = typeof secret === 'string' ? encoder.encode(secret) : (secret as BufferSource);
  const payloadBytes: BufferSource = typeof payload === 'string' ? encoder.encode(payload) : (payload as BufferSource);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    payloadBytes
  );

  const bytes = new Uint8Array(signatureBuffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export function buildBinanceHeaders(apiKey: string): Record<string, string> {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('API key cannot be empty');
  }
  return {
    'X-MBX-APIKEY': apiKey.trim(),
    'Content-Type': 'application/json',
  };
}

export async function buildBinanceSignedQuery(
  params: BinanceQueryParams,
  secret: string,
  options?: { timestamp?: number; recvWindow?: number }
): Promise<BinanceSignResult> {
  if (!secret || !secret.trim()) {
    throw new Error('HMAC secret cannot be empty');
  }

  const recvWindow = options?.recvWindow ?? (params.recvWindow !== undefined ? Number(params.recvWindow) : 5000);
  if (typeof recvWindow !== 'number' || !Number.isFinite(recvWindow) || recvWindow <= 0 || recvWindow > 60000) {
    throw new Error('recvWindow must be between 1 and 60000');
  }

  const timestamp = options?.timestamp ?? (typeof params.timestamp === 'number' ? params.timestamp : Date.now());

  const merged: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && k !== 'recvWindow' && k !== 'timestamp') {
      merged[k] = v;
    }
  }
  merged.recvWindow = recvWindow;
  merged.timestamp = timestamp;

  const sortedKeys = Object.keys(merged).sort();
  const sortedQueryString = sortedKeys
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(merged[key]))}`)
    .join('&');

  const signature = await signHmacSha256Hex(secret, sortedQueryString);
  const fullQueryString = `${sortedQueryString}&signature=${signature}`;

  return {
    sortedQueryString,
    signature,
    fullQueryString,
  };
}
