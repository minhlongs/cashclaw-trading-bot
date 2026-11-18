/**
 * Symmetric encryption for API credentials using AES-256-GCM.
 * Uses the Web Crypto API (built into Cloudflare Workers runtime).
 *
 * Format: base64(iv || ciphertext)
 * Key: base64-encoded 256-bit key from ENCRYPTION_KEY env var.
 *
 * Production invariant: missing or malformed ENCRYPTION_KEY fails closed.
 */

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12; // 96 bits for GCM

async function getEncryptionKey(): Promise<CryptoKey | null> {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || !raw.trim()) return null;

  let keyBytes: Uint8Array<ArrayBuffer>;
  try {
    const decoded = atob(raw.trim());
    keyBytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i += 1) {
      keyBytes[i] = decoded.charCodeAt(i);
    }
  } catch {
    return null;
  }
  if (keyBytes.length !== 32) return null;

  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: ALGORITHM, length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encrypt(plaintext: string): Promise<string> {
  if (!plaintext) return '';

  const key = await getEncryptionKey();
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CRYPTO_CONFIG_ERROR: Valid 32-byte base64 ENCRYPTION_KEY is required in production');
    }
    return plaintext; // Local dev/test fallback only
  }

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded,
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(ciphertext: string): Promise<string> {
  if (!ciphertext) return '';

  const key = await getEncryptionKey();
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CRYPTO_CONFIG_ERROR: Valid 32-byte base64 ENCRYPTION_KEY is required in production');
    }
    return ciphertext;
  }

  let combined: Uint8Array<ArrayBuffer>;
  try {
    const raw = atob(ciphertext);
    combined = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) {
      combined[i] = raw.charCodeAt(i);
    }
  } catch {
    return ciphertext;
  }

  if (combined.length < IV_LENGTH + 17) {
    return ciphertext;
  }

  const iv = combined.slice(0, IV_LENGTH);
  const encryptedData = combined.slice(IV_LENGTH);

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      encryptedData,
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error('CRYPTO_DECRYPT_ERROR: AES-GCM decryption failed — possible data corruption or key mismatch');
  }
}
