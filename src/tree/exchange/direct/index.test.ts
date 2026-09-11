import { describe, expect, it } from 'vitest';
import * as directModule from './index';

describe('direct index barrel export', () => {
  it('exports all expected classes, functions, and symbols', () => {
    expect(directModule.BinanceRestClient).toBeDefined();
    expect(directModule.OkxRestClient).toBeDefined();
    expect(directModule.BybitRestClient).toBeDefined();
    expect(directModule.signHmacSha256Hex).toBeDefined();
    expect(directModule.signHmacSha256Base64).toBeDefined();
    expect(directModule.buildBinanceHeaders).toBeDefined();
    expect(directModule.buildBinanceSignedQuery).toBeDefined();
    expect(directModule.buildOkxHeaders).toBeDefined();
    expect(directModule.buildOkxSignature).toBeDefined();
    expect(directModule.buildBybitHeaders).toBeDefined();
    expect(directModule.buildBybitSignature).toBeDefined();
  });
});
