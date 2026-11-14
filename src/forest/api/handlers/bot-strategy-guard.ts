// Forest API Guard: Archived-Strategy Kill Fence & Signed H3_MAKER Spec Verification.
// Enforces Gate G13/G15 on bot creation and classifies strategy verification tiers.

import * as fs from 'node:fs';
import * as path from 'node:path';
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
}

export type BotStrategyGuardResult =
  | {
      readonly ok: true;
      readonly strategy: StrategyType;
      readonly verificationTier: StrategyVerificationTier;
      readonly warning?: string;
      readonly specSha256?: string;
      readonly verifiedDefaults?: VerifiedH3Defaults;
    }
  | {
      readonly ok: false;
      readonly status: 403;
      readonly code: BotStrategyGuardErrorCode;
      readonly error: string;
    };

export interface StrategyArtifactPaths {
  readonly specPath?: string;
  readonly registryPath?: string;
}

const RETAIL_STRATEGIES = new Set<StrategyType>(['grid', 'mean_reversion', 'volatility_dca']);

function resolveArtifactFile(relPath: string, explicitPath?: string): string {
  if (explicitPath) return explicitPath;
  const cwdCandidate = path.resolve(process.cwd(), relPath);
  if (fs.existsSync(cwdCandidate)) return cwdCandidate;
  return path.resolve(__dirname, '../../../../', relPath);
}

export function resolveBotVerificationTier(strategy: string): StrategyVerificationTier {
  return strategy === 'h3_maker'
    ? getStrategyVerificationTier('h3_maker')
    : getStrategyVerificationTier('grid');
}

function verifyH3MakerArtifacts(paths?: StrategyArtifactPaths): BotStrategyGuardResult {
  const specFile = resolveArtifactFile(
    'artifacts/signed_strategy_spec_h3_maker.json',
    paths?.specPath,
  );
  const regFile = resolveArtifactFile(
    'artifacts/strategy_lifecycle_registry.json',
    paths?.registryPath,
  );

  let rawSpecJson: string;
  let rawRegistryJson: string;
  let parsedSpec: unknown;
  let parsedReg: unknown;

  try {
    rawSpecJson = fs.readFileSync(specFile, 'utf8');
    rawRegistryJson = fs.readFileSync(regFile, 'utf8');
    parsedSpec = JSON.parse(rawSpecJson) as unknown;
    parsedReg = JSON.parse(rawRegistryJson) as unknown;
  } catch (err) {
    return {
      ok: false,
      status: 403,
      code: 'SPEC_VERIFICATION_FAILED',
      error: `Failed to load signed H3_MAKER artifacts: ${err instanceof Error ? err.message : 'invalid artifact'}`,
    };
  }

  const regRes = validateStrategyLifecycleRegistry(parsedReg, rawRegistryJson);
  if (!regRes.ok) {
    return {
      ok: false,
      status: 403,
      code: 'SPEC_VERIFICATION_FAILED',
      error: `Lifecycle registry verification failed (${regRes.code}): ${regRes.error}`,
    };
  }

  const specRes = validateSignedStrategySpec(parsedSpec, {
    rawSpecJson,
    registry: parsedReg,
    rawRegistryJson,
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
    },
  };
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
  if (lower === 'h3_maker') {
    return verifyH3MakerArtifacts(paths);
  }

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
