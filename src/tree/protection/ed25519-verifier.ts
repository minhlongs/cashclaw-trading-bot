/**
 * Pure Synchronous Ed25519 Asymmetric Signature Verifier & Signer (RFC 8032 / SPKI).
 * Replaces plain string-length checks on OwnerOverrideToken and self-hashed SHA-256
 * trust on SignedStrategySpec with real asymmetric Ed25519 verification.
 */

import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import type { OwnerOverrideToken } from './protection-types';

/** Default CashClaw founder Ed25519 public key (raw 32-byte base64). */
export const FOUNDER_ED25519_PUBLIC_KEY_B64 = 'KhczCfV0nwx37Q9IHLFc6nvl9QqUKBqgZPFklY6xWas=';

/** RFC 8410 ASN.1 SubjectPublicKeyInfo prefix for raw 32-byte Ed25519 public keys. */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const BASE64_STRICT_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function decodeStrictBase64(b64: string, expectedBytes: number): Buffer | null {
  const trimmed = b64.trim();
  if (!trimmed || trimmed.length % 4 !== 0 || !BASE64_STRICT_RE.test(trimmed)) return null;
  const buf = Buffer.from(trimmed, 'base64');
  return buf.length === expectedBytes ? buf : null;
}

export function resolveTrustedEd25519PublicKeyB64(explicitPublicKeyB64?: string): string | null {
  if (explicitPublicKeyB64 !== undefined) {
    return decodeStrictBase64(explicitPublicKeyB64, 32) ? explicitPublicKeyB64.trim() : null;
  }
  const envVal = typeof process !== 'undefined' ? process.env?.CASHCLAW_OWNER_PUBLIC_KEY_B64 : undefined;
  if (envVal !== undefined) {
    return decodeStrictBase64(envVal, 32) ? envVal.trim() : null;
  }
  return FOUNDER_ED25519_PUBLIC_KEY_B64;
}

export function canonicalizeOwnerOverrideMessage(
  override: Pick<OwnerOverrideToken, 'ownerId' | 'reason' | 'issuedAtMs' | 'expiresAtMs'>,
): string {
  return [
    'cashclaw:owner-override:v1',
    override.ownerId.trim(),
    String(override.issuedAtMs),
    String(override.expiresAtMs),
    override.reason.trim(),
  ].join('|');
}

export function canonicalizeSpecSignatureMessage(strategyId: string, payloadSha256: string): string {
  return `cashclaw:strategy-spec:v1|${strategyId.trim()}|${payloadSha256.trim().toLowerCase()}`;
}

export function verifyEd25519SignatureSync(
  message: string,
  signatureB64: string,
  explicitPublicKeyB64?: string,
): boolean {
  const pubB64 = resolveTrustedEd25519PublicKeyB64(explicitPublicKeyB64);
  if (!pubB64) return false;
  const rawPub = decodeStrictBase64(pubB64, 32);
  const rawSig = decodeStrictBase64(signatureB64, 64);
  if (!rawPub || !rawSig) return false;
  try {
    const pubKey = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, rawPub]),
      format: 'der',
      type: 'spki',
    });
    return verify(null, Buffer.from(message, 'utf8'), pubKey, rawSig);
  } catch {
    return false;
  }
}

export function signEd25519MessageSync(message: string, privateKeyPem: string): string {
  const privKey = createPrivateKey(privateKeyPem);
  return sign(null, Buffer.from(message, 'utf8'), privKey).toString('base64');
}

export function signOwnerOverrideToken(
  unsignedToken: Omit<OwnerOverrideToken, 'signatureToken'>,
  privateKeyPem: string,
): OwnerOverrideToken {
  const msg = canonicalizeOwnerOverrideMessage(unsignedToken);
  return {
    ...unsignedToken,
    signatureToken: signEd25519MessageSync(msg, privateKeyPem),
  };
}
