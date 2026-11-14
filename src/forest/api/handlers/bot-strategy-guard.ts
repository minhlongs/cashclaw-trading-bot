// Forest API Guard: Archived-Strategy Kill Fence & Signed H3_MAKER Spec Verification.
// Uses static bundled JSON imports so Cloudflare Workers edge runtime works with zero disk I/O,
// while supporting explicit StrategyArtifactPaths overrides for tamper/missing unit tests.

import * as fs from 'node:fs';
import bundledSpecArtifact from '../../../../artifacts/signed_strategy_spec_h3_maker.json';
import bundledRegistryArtifact from '../../../../artifacts/strategy_lifecycle_registry.json';
import {
  isArchivedFalsifiedFamily,
  validateSignedStrategySpec,
  validateStrategyLifecycleRegistry,
} from '@/tree/paper-forward';
import {
  getStrategyVerificationTier,
  type StrategyType,
  type StrategyVerificationTier,
} from '@/tree/bot/config-types';

export const RETAIL_SANDBOX_WARNING =
  'UNVERIFIED_RETAIL_SANDBOX: Negative VIP-0 expected value after fees/slippage; educational paper simulation only.';

export type BotStrategyGuardErrorCode =
  | 'STRATEGY_ARCHIVED_FALSIFIED'
  | 'SPEC_VERIFICATION_FAILED';

export interface VerifiedH3Defaults {
  readonly lookbackDays: number;
  readonly entryAnnualBps: number;
  readonly exitAnnualBps: number;
  readonly maxGrossLeverage: number;
  readonly maxDrawdownHardPct: number;
  readonly universe: readonly string[];
}

export type BotStrategyGuardResult =
  | { readonly ok: true; readonly strategy: StrategyType; readonly verificationTier: StrategyVerificationTier; readonly warning?: string; readonly specSha256?: string; readonly verifiedDefaults?: VerifiedH3Defaults }
  | { readonly ok: false; readonly status: 403; readonly code: BotStrategyGuardErrorCode; readonly error: string };

export interface StrategyArtifactPaths { readonly specPath?: string; readonly registryPath?: string; }

const RETAIL_STRATEGIES = new Set<StrategyType>(['grid', 'mean_reversion', 'volatility_dca']);

function loadArtifactSource(overridePath: string | undefined, bundled: unknown): { readonly parsed: unknown; readonly rawJson?: string } {
  if (!overridePath) return { parsed: bundled };
  const rawJson = fs.readFileSync(overridePath, 'utf8');
  return { parsed: JSON.parse(rawJson) as unknown, rawJson };
}

export function getVerifiedH3SpecInfo(paths?: StrategyArtifactPaths): Extract<BotStrategyGuardResult, { ok: true }> | Extract<BotStrategyGuardResult, { ok: false }> {
  let specSrc: { readonly parsed: unknown; readonly rawJson?: string };
  let regSrc: { readonly parsed: unknown; readonly rawJson?: string };

  try {
    specSrc = loadArtifactSource(paths?.specPath, bundledSpecArtifact);
    regSrc = loadArtifactSource(paths?.registryPath, bundledRegistryArtifact);
  } catch (err) {
    return {
      ok: false,
      status: 403,
      code: 'SPEC_VERIFICATION_FAILED',
      error: `Failed to load signed H3_MAKER artifacts: ${err instanceof Error ? err.message : 'invalid artifact'}`,
    };
  }

  const regRes = validateStrategyLifecycleRegistry(regSrc.parsed, regSrc.rawJson);
  if (!regRes.ok) {
    return {
      ok: false,
      status: 403,
      code: 'SPEC_VERIFICATION_FAILED',
      error: `Lifecycle registry verification failed (${regRes.code}): ${regRes.error}`,
    };
  }

  const specRes = validateSignedStrategySpec(specSrc.parsed, {
    ...(specSrc.rawJson ? { rawSpecJson: specSrc.rawJson } : {}),
    registry: regSrc.parsed,
    ...(regSrc.rawJson ? { rawRegistryJson: regSrc.rawJson } : {}),
  });
  if (!specRes.ok || specRes.data.strategyId !== 'H3_MAKER') {
    return {
      ok: false,
      status: 403,
      code: 'SPEC_VERIFICATION_FAILED',
      error: specRes.ok
        ? `Signed spec strategyId mismatch: expected H3_MAKER, received ${specRes.data.strategyId}`
        : `Signed H3_MAKER spec verification failed (${specRes.code}): ${specRes.error}`,
    };
  }

  const params = specRes.data.parameters;
  return {
    ok: true,
    strategy: 'h3_maker',
    verificationTier: getStrategyVerificationTier('h3_maker'),
    specSha256: specRes.data.payloadSha256,
    verifiedDefaults: {
      lookbackDays: params.lookbackDays,
      entryAnnualBps: params.entryAnnualBps,
      exitAnnualBps: params.exitAnnualBps,
      maxGrossLeverage: params.maxGrossLeverage,
      maxDrawdownHardPct: specRes.data.riskGates.maxDrawdownHardPct,
      universe: specRes.data.universe,
    },
  };
}

export function isExactVerifiedH3Config(
  config: Record<string, unknown>,
  defaults: VerifiedH3Defaults,
  expectedSpecSha256?: string,
  pairOverride?: string,
): boolean {
  if (expectedSpecSha256 && config.specSha256 !== expectedSpecSha256) return false;
  const rawPair = typeof pairOverride === 'string'
    ? pairOverride
    : typeof config.symbol === 'string'
      ? config.symbol
      : '';
  const normalizedPair = rawPair.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const inUniverse =
    defaults.universe.length === 0 ||
    (normalizedPair.length > 0 && defaults.universe.includes(normalizedPair));
  return (
    inUniverse &&
    config.lookbackDays === defaults.lookbackDays &&
    config.entryAnnualBps === defaults.entryAnnualBps &&
    config.exitAnnualBps === defaults.exitAnnualBps &&
    config.maxGrossLeverage === defaults.maxGrossLeverage &&
    config.maxDrawdownPct === defaults.maxDrawdownHardPct
  );
}

export function resolveBotVerificationTier(
  strategy: string,
  config?: Record<string, unknown>,
  pair?: string,
): StrategyVerificationTier {
  if (strategy !== 'h3_maker') return getStrategyVerificationTier('grid');
  if (!config || typeof config.specSha256 !== 'string') return getStrategyVerificationTier('grid');
  const verified = getVerifiedH3SpecInfo();
  if (
    !verified.ok ||
    !verified.verifiedDefaults ||
    !isExactVerifiedH3Config(config, verified.verifiedDefaults, verified.specSha256, pair)
  ) {
    return getStrategyVerificationTier('grid');
  }
  return getStrategyVerificationTier('h3_maker');
}

export function evaluateBotStrategyGuard(
  rawStrategy: unknown,
  paths?: StrategyArtifactPaths,
): BotStrategyGuardResult | null {
  if (typeof rawStrategy !== 'string') return null;
  const trimmed = rawStrategy.trim();
  if (trimmed.length === 0) return null;

  const upper = trimmed.toUpperCase();
  if (isArchivedFalsifiedFamily(upper)) {
    return {
      ok: false,
      status: 403,
      code: 'STRATEGY_ARCHIVED_FALSIFIED',
      error: `Strategy ${upper} is permanently ARCHIVED_FALSIFIED and barred from execution.`,
    };
  }

  const lower = trimmed.toLowerCase();
  if (lower === 'h3_maker') return getVerifiedH3SpecInfo(paths);

  if (RETAIL_STRATEGIES.has(lower as StrategyType)) {
    const strategy = lower as StrategyType;
    return {
      ok: true,
      strategy,
      verificationTier: getStrategyVerificationTier(strategy),
      warning: RETAIL_SANDBOX_WARNING,
    };
  }

  return null;
}
