// Bybit REST API WebCrypto signer implementation

import { signHmacSha256Hex } from './webcrypto-signer-hmac';
import { checkNonEmpty, validateRecvWindow } from './webcrypto-signer-binance';

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