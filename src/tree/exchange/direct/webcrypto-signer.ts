// WebCrypto-based HMAC-SHA256 Signer for Direct REST Engine
// Pure edge-native implementation: 0 Node.js standard library imports

import { signHmacSha256Hex, signHmacSha256Base64 } from './webcrypto-signer-hmac';
import { buildBinanceHeaders, buildBinanceSignedQuery } from './webcrypto-signer-binance';
import { buildOkxHeaders, buildOkxSignature } from './webcrypto-signer-okx';
import { buildBybitHeaders, buildBybitSignature } from './webcrypto-signer-bybit';

export { signHmacSha256Hex, signHmacSha256Base64 };
export { buildBinanceHeaders, buildBinanceSignedQuery };
export { buildOkxHeaders, buildOkxSignature };
export { buildBybitHeaders, buildBybitSignature };

export type { BinanceQueryParams, BinanceSignResult } from './types';