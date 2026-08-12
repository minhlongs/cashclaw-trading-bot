// Shared auth utilities — session IDs, passcode hashing, cookie parsing.
// Uses Web Crypto API (available on Cloudflare Workers + Node 18+).

/**
 * Hash a passcode with SHA-256 using email as salt.
 * Returns "hash:salt" format for storage.
 */
export async function hashPasscode(email: string, passcode: string): Promise<string> {
  const salt = email.toLowerCase().trim();
  const data = new TextEncoder().encode(`${salt}:${passcode}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hashHex}:${salt}`;
}

/**
 * Verify a passcode against a stored hash.
 * Stored format: "hexhash:salt" where salt = email.
 */
export async function verifyPasscode(email: string, passcode: string, storedHash: string): Promise<boolean> {
  const expected = await hashPasscode(email, passcode);
  // Constant-time comparison to prevent timing attacks.
  if (expected.length !== storedHash.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Generate a cryptographically secure session ID.
 * Uses crypto.randomUUID() (128-bit entropy, available on CF Workers).
 */
export function generateSessionId(): string {
  return `sess_${crypto.randomUUID()}`;
}

/**
 * Parse session_id from request cookie header.
 * Consistent across all auth endpoints.
 */
export function parseSessionCookie(req: Request): string | null {
  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)session_id=([^;]+)/);
  return match?.[1] ?? null;
}
