/**
 * Symmetric encryption for API credentials using AES-256-GCM.
 * Uses the Web Crypto API (built into Cloudflare Workers runtime).
 *
 * Format: base64(iv || ciphertext)
 * Key: base64-encoded 256-bit key from ENCRYPTION_KEY env var.
 *
 * Backward compatibility: values that don't decode as valid
 * base64(iv || ciphertext) are treated as plaintext and returned as-is.
 */

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12; // 96 bits for GCM

async function getEncryptionKey(): Promise<CryptoKey | null> {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) return null;

  const keyBytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
  if (keyBytes.length !== 32) return null;

  return await crypto.subtle.importKey(
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
  if (!key) return plaintext; // No key configured — store as-is (dev mode)

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded,
  );

  // Prepend IV to ciphertext, then base64-encode
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(ciphertext: string): Promise<string> {
  if (!ciphertext) return '';

  const key = await getEncryptionKey();
  if (!key) return ciphertext; // No key configured — return as-is (dev mode)

  // Try to decode as base64(iv || ciphertext)
  let combined: Uint8Array;
  try {
    const raw = atob(ciphertext);
    combined = Uint8Array.from(raw, c => c.charCodeAt(0));
  } catch {
    // Not valid base64 — treat as plaintext (backward compat)
    return ciphertext;
  }

  // Must have at least IV + 1 byte of ciphertext (GCM tag is 16 bytes)
  if (combined.length < IV_LENGTH + 17) {
    // Too short to be encrypted — treat as plaintext
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
    // Decryption failed — treat as plaintext (backward compat)
    return ciphertext;
  }
}
