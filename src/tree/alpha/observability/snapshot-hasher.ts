import { createHash } from 'node:crypto';
import { canonicalize } from '../../../lib/canonical-json';
import type { FeatureSnapshotHash } from './types';
import { FeatureSnapshotHashSchema } from './schemas';

/**
 * Computes a deterministic canonical SHA-256 hash asynchronously via Web Crypto API.
 */
export async function computeFeatureSnapshotHash(features: unknown): Promise<FeatureSnapshotHash> {
  const canonical = canonicalize(features);
  const data = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return FeatureSnapshotHashSchema.parse(hex);
}

/**
 * Computes a deterministic canonical SHA-256 hash synchronously via node:crypto.
 */
export function computeFeatureSnapshotHashSync(features: unknown): FeatureSnapshotHash {
  const canonical = canonicalize(features);
  const hex = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return FeatureSnapshotHashSchema.parse(hex);
}

/**
 * Verifies that a given feature set matches an expected SHA-256 hash synchronously.
 */
export function verifyFeatureSnapshotHashSync(features: unknown, expectedHash: string): boolean {
  try {
    const parsedExpected = FeatureSnapshotHashSchema.parse(expectedHash.trim().toLowerCase());
    const computed = computeFeatureSnapshotHashSync(features);
    return computed === parsedExpected;
  } catch {
    return false;
  }
}

/**
 * Verifies that a given feature set matches an expected SHA-256 hash asynchronously.
 */
export async function verifyFeatureSnapshotHash(
  features: unknown,
  expectedHash: string,
): Promise<boolean> {
  try {
    const parsedExpected = FeatureSnapshotHashSchema.parse(expectedHash.trim().toLowerCase());
    const computed = await computeFeatureSnapshotHash(features);
    return computed === parsedExpected;
  } catch {
    return false;
  }
}
