// Reusable JSON serializer for D1 columns.
// Delegates to canonicalize for deterministic output (sorted keys, BigInt/Date/circular handling).
// D1 stores returned rows with BigInt IDs and Date objects that JSON.stringify rejects.

import { canonicalize } from '@/lib/canonical-json';

export function serializeDetail(value: unknown): string {
  return canonicalize(value);
}