import { describe, expect, it } from 'vitest';
import { signHmacSha256Base64 } from './webcrypto-signer';

describe('webcrypto-signer Base64', () => {
  describe('RFC 4231 test vectors (Base64 encoded)', () => {
    it('passes RFC 4231 Case 1 (20-byte key, "Hi There")', async () => {
      const key = new Uint8Array(20).fill(0x0b);
      const data = 'Hi There';
      // Hex: b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7
      // Base64: sDRMYdjbOFNcqK/OrwvxK4gdwgDJgz2nJuk3bC4yz/c=
      const expected = 'sDRMYdjbOFNcqK/OrwvxK4gdwgDJgz2nJuk3bC4yz/c=';
      const signature = await signHmacSha256Base64(key, data);
      expect(signature).toBe(expected);
    });

    it('passes RFC 4231 Case 2 (key="Jefe", "what do ya want for nothing?")', async () => {
      const key = 'Jefe';
      const data = 'what do ya want for nothing?';
      // Hex: 5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843
      // Base64: W9zBRr9gdU5qBCQmCJV1x1oAPwidJzmDnexYuWTsOEM=
      const expected = 'W9zBRr9gdU5qBCQmCJV1x1oAPwidJzmDnexYuWTsOEM=';
      const signature = await signHmacSha256Base64(key, data);
      expect(signature).toBe(expected);
    });

    it('passes RFC 4231 Case 7 (131-byte key, Uint8Array payload)', async () => {
      const key = new Uint8Array(131).fill(0xaa);
      const dataStr =
        'This is a test using a larger than block-size key and a larger than block-size data. The key needs to be hashed before being used by the HMAC algorithm.';
      const dataBytes = new TextEncoder().encode(dataStr);
      // Hex: 9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2
      // Base64: mwn/pxuUL8snY1+81bDpRL/cY2RPBxOTin9RU1w6NeI=
      const expected = 'mwn/pxuUL8snY1+81bDpRL/cY2RPBxOTin9RU1w6NeI=';
      const signature = await signHmacSha256Base64(key, dataBytes);
      expect(signature).toBe(expected);
    });
  });

  describe('validation errors', () => {
    it('throws when secret is empty string or whitespace', async () => {
      await expect(signHmacSha256Base64('', 'payload')).rejects.toThrow('HMAC secret cannot be empty');
      await expect(signHmacSha256Base64('   ', 'payload')).rejects.toThrow('HMAC secret cannot be empty');
    });

    it('throws when secret is empty Uint8Array', async () => {
      await expect(signHmacSha256Base64(new Uint8Array(0), 'payload')).rejects.toThrow(
        'HMAC secret cannot be empty'
      );
    });

    it('throws when secret is not string or Uint8Array', async () => {
      // @ts-expect-error testing runtime validation
      await expect(signHmacSha256Base64(null, 'payload')).rejects.toThrow('HMAC secret cannot be empty');
      // @ts-expect-error testing runtime validation
      await expect(signHmacSha256Base64(12345, 'payload')).rejects.toThrow('HMAC secret cannot be empty');
    });
  });
});
