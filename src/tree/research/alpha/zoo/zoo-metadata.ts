// Alpha Zoo metadata schemas — Zod contracts for Vibe-Trading zoo
// manifests (transcribed __alpha_meta__ dicts). Keys are snake_case
// VERBATIM from the source (byte-faithful copy, never code). Pure module:
// no I/O. Fail-closed parse helpers mirror Phase 1 {ok, reasons} style.

import { z } from 'zod';

/** Market tags observed across the zoo (verified closed set). */
export const ZOO_MARKET_TAGS = [
  'equity_us',
  'equity_cn',
  'equity_hk',
  'equity_in',
  'equity_kr',
  'crypto',
] as const;
export type ZooMarketTag = (typeof ZOO_MARKET_TAGS)[number];

/** Research themes observed across the zoo (verified closed set). */
export const ZOO_THEMES = [
  'volume',
  'momentum',
  'reversal',
  'volatility',
  'microstructure',
  'quality',
  'liquidity',
  'value',
  'growth',
  'sentiment',
] as const;
export type ZooTheme = (typeof ZOO_THEMES)[number];

/**
 * Data fields the adapter supports (OHLCV-derived, point-in-time-safe by
 * construction). Anything else (amount, fund:*, ...) is unsupported.
 */
export const SUPPORTED_DATA_FIELDS = ['close', 'open', 'high', 'low', 'volume', 'vwap'] as const;
export type SupportedDataField = (typeof SUPPORTED_DATA_FIELDS)[number];

export const supportedDataFieldSchema = z.enum(SUPPORTED_DATA_FIELDS);

const isoDateTime = z.string().datetime({ offset: true });
const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();

/**
 * One zoo entry — snake_case keys verbatim from `__alpha_meta__`.
 * NOTE: `formula_latex` may be a placeholder string ('see body'); that is
 * a valid STRING here — placeholder rejection belongs to the normalizer.
 */
export const alphaZooEntrySchema = z.object({
  id: z.string().min(1),
  nickname: z.string().min(1).optional(),
  theme: z.array(z.enum(ZOO_THEMES)).min(1),
  formula_latex: z.string().min(1),
  columns_required: z.array(supportedDataFieldSchema).min(1),
  extras_required: z.array(z.string()).default([]),
  requires_sector: z.boolean().default(false),
  universe: z.array(z.enum(ZOO_MARKET_TAGS)).min(1),
  frequency: z.array(z.enum(['1d', '1D'])).min(1),
  decay_horizon: positiveInt,
  min_warmup_bars: nonNegativeInt,
  notes: z.string().default(''),
});
export type AlphaZooEntry = z.infer<typeof alphaZooEntrySchema>;

/** Manifest envelope wrapping a batch of zoo entries with provenance. */
export const alphaZooManifestSchema = z.object({
  schemaVersion: z.literal(1),
  sourceRepository: z.string().min(1),
  sourceVersion: z.string().min(1).nullable(),
  extractedAt: isoDateTime,
  entries: z.array(alphaZooEntrySchema),
});
export type AlphaZooManifest = z.infer<typeof alphaZooManifestSchema>;

/** Parse outcome: fail-closed with ALL collected reasons. */
export type ParseAlphaZooResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reasons: readonly string[] };

function collectZodReasons(error: z.ZodError): readonly string[] {
  return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
}

/** Parse one unknown zoo entry. Fail-closed; reasons name field paths. */
export function parseAlphaZooEntry(input: unknown): ParseAlphaZooResult<AlphaZooEntry> {
  const parsed = alphaZooEntrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, reasons: collectZodReasons(parsed.error) };
  return { ok: true, value: parsed.data };
}

/** Parse one unknown manifest envelope. Fail-closed; reasons name paths. */
export function parseAlphaZooManifest(input: unknown): ParseAlphaZooResult<AlphaZooManifest> {
  const parsed = alphaZooManifestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reasons: collectZodReasons(parsed.error) };
  return { ok: true, value: parsed.data };
}
