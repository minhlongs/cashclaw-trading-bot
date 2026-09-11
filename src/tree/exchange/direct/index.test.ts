import { describe, expect, it } from 'vitest';
import * as directModule from './index';

describe('direct index barrel export', () => {
  it('exports all expected classes, functions, and symbols', () => {
    expect(directModule.BinanceRestClient).toBeDefined();
    expect(directModule.signHmacSha256Hex).toBeDefined();
    expect(directModule.buildBinanceHeaders).toBeDefined();
    expect(directModule.buildBinanceSignedQuery).toBeDefined();
  });
});
