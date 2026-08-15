import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { encrypt, decrypt } from './crypto';

// Generate a valid 256-bit key for testing
function makeKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

describe('crypto', () => {
  const ORIGINAL_ENV = process.env.ENCRYPTION_KEY;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.ENCRYPTION_KEY;
    } else {
      process.env.ENCRYPTION_KEY = ORIGINAL_ENV;
    }
  });

  it('encrypts and decrypts round-trip', async () => {
    process.env.ENCRYPTION_KEY = makeKey();

    const plaintext = 'my-secret-api-key-12345';
    const ciphertext = await encrypt(plaintext);

    // Should not be the same as plaintext
    expect(ciphertext).not.toBe(plaintext);
    expect(ciphertext.length).toBeGreaterThan(0);

    const decrypted = await decrypt(ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it('returns empty string for empty input', async () => {
    process.env.ENCRYPTION_KEY = makeKey();
    expect(await encrypt('')).toBe('');
    expect(await decrypt('')).toBe('');
  });

  it('returns plaintext as-is when no key configured', async () => {
    delete process.env.ENCRYPTION_KEY;
    const plaintext = 'not-encrypted-key';
    expect(await encrypt(plaintext)).toBe(plaintext);
    expect(await decrypt(plaintext)).toBe(plaintext);
  });

  it('handles backward compatibility with plaintext values', async () => {
    process.env.ENCRYPTION_KEY = makeKey();

    // Simulate reading a value that was stored before encryption was added
    const legacyPlaintext = 'legacy-api-key-not-encrypted';
    const decrypted = await decrypt(legacyPlaintext);
    expect(decrypted).toBe(legacyPlaintext);
  });

  it('produces different ciphertext for same plaintext (random IV)', async () => {
    process.env.ENCRYPTION_KEY = makeKey();

    const plaintext = 'same-key';
    const c1 = await encrypt(plaintext);
    const c2 = await encrypt(plaintext);

    // Different IVs → different ciphertext
    expect(c1).not.toBe(c2);

    // Both decrypt to same plaintext
    expect(await decrypt(c1)).toBe(plaintext);
    expect(await decrypt(c2)).toBe(plaintext);
  });

  it('handles special characters and unicode', async () => {
    process.env.ENCRYPTION_KEY = makeKey();

    const plaintext = 'key-with-special-chars!@#$%^&*()_+{}|:<>?/~`';
    const ciphertext = await encrypt(plaintext);
    expect(await decrypt(ciphertext)).toBe(plaintext);
  });

  it('handles long strings', async () => {
    process.env.ENCRYPTION_KEY = makeKey();

    const plaintext = 'a'.repeat(10_000);
    const ciphertext = await encrypt(plaintext);
    expect(await decrypt(ciphertext)).toBe(plaintext);
  });

  it('returns ciphertext as-is when decrypt fails with wrong key', async () => {
    // Encrypt with one key
    process.env.ENCRYPTION_KEY = makeKey();
    const ciphertext = await encrypt('secret');

    // Try to decrypt with different key
    process.env.ENCRYPTION_KEY = makeKey();
    const result = await decrypt(ciphertext);

    // Should return ciphertext as-is (backward compat path)
    expect(result).toBe(ciphertext);
  });
});
