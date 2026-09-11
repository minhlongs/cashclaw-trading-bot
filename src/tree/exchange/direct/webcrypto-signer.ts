// WebCrypto-based HMAC-SHA256 Signer for Direct REST Engine
// Pure edge-native implementation: 0 Node.js standard library imports

import type { BinanceQueryParams, BinanceSignResult } from './types';

async function signHmacSha256Buffer(
  secret: string | Uint8Array,
  payload: string | Uint8Array
): Promise<ArrayBuffer> {
  if (typeof secret === 'string' ? !secret.trim() : !(secret instanceof Uint8Array) || secret.byteLength === 0) {
    throw new Error('HMAC secret cannot be empty');
  }
  const encoder = new TextEncoder();
  const keyBytes: BufferSource = typeof secret === 'string' ? encoder.encode(secret) : (secret as BufferSource);
  const payloadBytes: BufferSource = typeof payload === 'string' ? encoder.encode(payload) : (payload as BufferSource);

  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return await crypto.subtle.sign('HMAC', cryptoKey, payloadBytes);
}

export async function signHmacSha256Hex(secret: string | Uint8Array, payload: string | Uint8Array): Promise<string> {
  const bytes = new Uint8Array(await signHmacSha256Buffer(secret, payload));
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

export async function signHmacSha256Base64(secret: string | Uint8Array, payload: string | Uint8Array): Promise<string> {
  const bytes = new Uint8Array(await signHmacSha256Buffer(secret, payload));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function checkNonEmpty(val: string | undefined | null, name: string): string {
  if (!val || !val.trim()) throw new Error(`${name} cannot be empty`);
  return val.trim();
}

function validateRecvWindow(recvWindow: number): number {
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

export function buildOkxHeaders(
  apiKey: string,
  passphrase: string,
  timestamp: string,
  signature: string,
  simulated = false
): Record<string, string> {
  const headers: Record<string, string> = {
    'OK-ACCESS-KEY': checkNonEmpty(apiKey, 'API key'),
    'OK-ACCESS-SIGN': checkNonEmpty(signature, 'Signature'),
    'OK-ACCESS-TIMESTAMP': checkNonEmpty(timestamp, 'Timestamp'),
    'OK-ACCESS-PASSPHRASE': checkNonEmpty(passphrase, 'Passphrase'),
    'Content-Type': 'application/json',
  };
  if (simulated) headers['x-simulated-trading'] = '1';
  return headers;
}

export async function buildOkxSignature(
  secret: string,
  timestamp: string,
  method: string,
  requestPath: string,
  body?: string
): Promise<string> {
  const ts = checkNonEmpty(timestamp, 'Timestamp');
  const m = checkNonEmpty(method, 'HTTP method').toUpperCase();
  const path = checkNonEmpty(requestPath, 'Request path');
  return await signHmacSha256Base64(secret, `${ts}${m}${path}${body ?? ''}`);
}

export function buildBybitHeaders(
  apiKey: string,
  timestamp: string | number,
  signature: string,
  recvWindow: string | number = 5000
): Record<string, string> {
  const rw = validateRecvWindow(Number(recvWindow));
  return {
    'X-BAPI-API-KEY': checkNonEmpty(apiKey, 'API key'),
    'X-BAPI-TIMESTAMP': checkNonEmpty(String(timestamp), 'Timestamp'),
    'X-BAPI-RECV-WINDOW': String(rw),
    'X-BAPI-SIGN': checkNonEmpty(signature, 'Signature'),
    'Content-Type': 'application/json',
  };
}

export async function buildBybitSignature(
  secret: string,
  timestamp: string | number,
  apiKey: string,
  recvWindow: string | number,
  payload?: string
): Promise<string> {
  const k = checkNonEmpty(apiKey, 'API key');
  const ts = checkNonEmpty(String(timestamp), 'Timestamp');
  const rw = validateRecvWindow(Number(recvWindow));
  return await signHmacSha256Hex(secret, `${ts}${k}${rw}${payload ?? ''}`);
}
