// OKX REST API WebCrypto signer implementation

import { signHmacSha256Base64 } from './webcrypto-signer-hmac';
import { checkNonEmpty } from './webcrypto-signer-binance';

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