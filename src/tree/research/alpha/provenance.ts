// AlphaProvenance — provenance record for an alpha imported from an
// external zoo (Vibe-Trading). Pure module: the only async operation is
// WebCrypto crypto.subtle SHA-256 (Cloudflare Workers-compatible; no
// Node-only crypto import). Fail-closed validation.

import { canonicalize } from '@/lib/canonical-json';

/** Provenance of an imported alpha (spec §7). */
export interface AlphaProvenance {
  /** Zoo/system the alpha was imported from (e.g. 'vibe-trading-zoo'). */
  readonly sourceZoo: string;
  /** Alpha identifier inside the source zoo. */
  readonly sourceAlphaId: string;
  /** Repository URL or slug the alpha definition came from. */
  readonly sourceRepository: string;
  /** Version tag/commit in the source repo; null when unversioned. */
  readonly sourceVersion: string | null;
  /** SHA-256 hex of the canonical formula string. */
  readonly formulaHash: string;
  /** ISO-8601 timestamp of import. */
  readonly importTimestamp: string;
  /** Version identifier of the importer that produced this record. */
  readonly importerVersion: string;
  /** Canonical JSON representation of the normalized formula payload. */
  readonly normalizedRepresentation: string;
}

/** Outcome of provenance validation. */
export type ProvenanceValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reasons: readonly string[] };

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * Compute the SHA-256 hex hash of a formula string (UTF-8 encoded).
 * Deterministic: same input → same hash. Uses WebCrypto crypto.subtle,
 * which is available in Cloudflare Workers and Node ≥ 18.
 */
export async function computeFormulaHash(formula: string): Promise<string> {
  const bytes = new TextEncoder().encode(formula);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Build the canonical normalized representation for a formula payload:
 * deterministic JSON via @/lib/canonical-json (sorted keys, stable).
 */
export function buildNormalizedRepresentation(payload: unknown): string {
  return canonicalize(payload);
}

function isNonEmpty(value: string): boolean {
  return value.trim() !== '';
}

/**
 * Validate an AlphaProvenance. Fail-closed, collects ALL reasons:
 * - sourceZoo, sourceAlphaId, sourceRepository non-empty;
 * - sourceVersion, when present, non-empty;
 * - formulaHash matches ^[0-9a-f]{64}$;
 * - importTimestamp parses as ISO-8601;
 * - normalizedRepresentation is valid canonical JSON (re-stringifies to itself).
 */
export function validateProvenance(p: AlphaProvenance): ProvenanceValidationResult {
  const checks: ReadonlyArray<readonly [boolean, string]> = [
    [!isNonEmpty(p.sourceZoo), 'sourceZoo must be non-empty'],
    [!isNonEmpty(p.sourceAlphaId), 'sourceAlphaId must be non-empty'],
    [!isNonEmpty(p.sourceRepository), 'sourceRepository must be non-empty'],
    [
      p.sourceVersion !== null && !isNonEmpty(p.sourceVersion),
      'sourceVersion must be non-empty when present',
    ],
    [!HEX64.test(p.formulaHash), `formulaHash must match ^[0-9a-f]{64}$ (got '${p.formulaHash}')`],
    [Number.isNaN(Date.parse(p.importTimestamp)), 'importTimestamp must be an ISO-8601 timestamp'],
    [!isNonEmpty(p.importerVersion), 'importerVersion must be non-empty'],
    [!isValidCanonicalJson(p.normalizedRepresentation), 'normalizedRepresentation must be canonical JSON'],
  ];
  const reasons = checks.filter(([failed]) => failed).map(([, reason]) => reason);
  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true };
}

function isValidCanonicalJson(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value);
    return canonicalize(parsed) === value;
  } catch {
    return false;
  }
}
