// Gate G13: Pure Canonical Sorted-Key JSON & RFC-6234 SHA-256 Parity Engine.
// Matches Python json.dumps(obj, sort_keys=True, separators=(",", ":")) across JS & raw JSON.

import { sha256HexSync } from '../protection';
import { canonicalizeRawJsonPayload } from './raw-json-canonical';

const SPEC_FLOAT_LEAF_PATHS = new Set<string>([
  'parameters.fifoFillProbability',
  'parameters.adverseSelectionBps',
  'parameters.singleLegMissProbability',
  'parameters.maxGrossLeverage',
  'venueSchedule.spotMakerBps',
  'venueSchedule.perpMakerBps',
  'venueSchedule.spotTakerBps',
  'venueSchedule.perpTakerBps',
  'riskGates.maxDrawdownSoftPct',
  'riskGates.maxDrawdownHardPct',
  'riskGates.maxDailyLossPct',
  'riskGates.maxTrackingErrorBpsPerMonth',
]);

const REGISTRY_FLOAT_SUFFIXES = ['.dsr_at_n185', '.pbo', '.locked_oos_sharpe'] as const;

function isSchemaFloatPath(path: string): boolean {
  if (SPEC_FLOAT_LEAF_PATHS.has(path)) return true;
  return REGISTRY_FLOAT_SUFFIXES.some((suffix) => path.endsWith(suffix));
}

export function stripHashKey(
  record: Readonly<Record<string, unknown>>,
  hashKey: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (key !== hashKey && record[key] !== undefined) out[key] = record[key];
  }
  return out;
}

export function serializeCanonicalWithFloatSet(
  value: unknown,
  dotZeroPaths: ReadonlySet<string>,
  currentPath = '',
): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && Number.isInteger(value) && dotZeroPaths.has(currentPath)) {
      return `${value.toString()}.0`;
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((item, idx) =>
      serializeCanonicalWithFloatSet(item, dotZeroPaths, `${currentPath}[${idx}]`),
    );
    return `[${items.join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  const pairs = keys.map((k) => {
    const nextPath = currentPath ? `${currentPath}.${k}` : k;
    return `${JSON.stringify(k)}:${serializeCanonicalWithFloatSet(obj[k], dotZeroPaths, nextPath)}`;
  });
  return `{${pairs.join(',')}}`;
}

function collectIntegerFloatPaths(value: unknown, currentPath = '', acc: string[] = []): string[] {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && Number.isInteger(value) && isSchemaFloatPath(currentPath)) {
      acc.push(currentPath);
    }
    return acc;
  }
  if (Array.isArray(value)) {
    value.forEach((item, idx) => collectIntegerFloatPaths(item, `${currentPath}[${idx}]`, acc));
    return acc;
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (obj[key] !== undefined) {
      collectIntegerFloatPaths(obj[key], currentPath ? `${currentPath}.${key}` : key, acc);
    }
  }
  return acc;
}

export function computeCanonicalPayloadSha256(
  record: Readonly<Record<string, unknown>>,
  hashKey: string,
): string {
  const stripped = stripHashKey(record, hashKey);
  return sha256HexSync(serializeCanonicalWithFloatSet(stripped, new Set()));
}

export function verifyCanonicalPayloadSha256(
  record: Readonly<Record<string, unknown>>,
  hashKey: string,
  expectedSha256: string,
  rawJson?: string,
): boolean {
  const normalizedExpected = expectedSha256.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalizedExpected)) return false;

  if (rawJson !== undefined) {
    try {
      if (sha256HexSync(canonicalizeRawJsonPayload(rawJson, hashKey)) === normalizedExpected) {
        return true;
      }
    } catch {
      return false;
    }
  }

  const stripped = stripHashKey(record, hashKey);
  if (sha256HexSync(serializeCanonicalWithFloatSet(stripped, new Set())) === normalizedExpected) {
    return true;
  }

  const floatPaths = collectIntegerFloatPaths(stripped);
  if (floatPaths.length === 0) return false;
  if (sha256HexSync(serializeCanonicalWithFloatSet(stripped, new Set(floatPaths))) === normalizedExpected) {
    return true;
  }

  const capped = floatPaths.slice(0, 10);
  const totalMasks = 1 << capped.length;
  for (let mask = 1; mask < totalMasks - 1; mask += 1) {
    const subset = new Set<string>();
    for (let bit = 0; bit < capped.length; bit += 1) {
      if ((mask & (1 << bit)) !== 0) subset.add(capped[bit] as string);
    }
    if (sha256HexSync(serializeCanonicalWithFloatSet(stripped, subset)) === normalizedExpected) {
      return true;
    }
  }
  return false;
}
