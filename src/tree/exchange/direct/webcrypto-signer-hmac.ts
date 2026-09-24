// WebCrypto HMAC-SHA256 core signing

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