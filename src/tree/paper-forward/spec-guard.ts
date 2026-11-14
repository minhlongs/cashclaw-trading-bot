// Gate G13 & G15: Fail-Closed Archived-Strategy Kill Fence & SignedStrategySpec Verifier.

import { computeCanonicalPayloadSha256, verifyCanonicalPayloadSha256 } from './canonical-hash';
import {
  ARCHIVED_FALSIFIED_FAMILIES,
  PaperForwardGuardError,
  SignedStrategySpecSchema,
  StrategyLifecycleRegistrySchema,
  type PaperForwardGuardErrorCode,
  type SignedStrategySpec,
  type StrategyLifecycleRegistry,
  type UnsignedStrategySpec,
} from './spec-types';

export type SpecGuardValidationResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly code: PaperForwardGuardErrorCode; readonly error: string };

export interface ValidateSpecOptions {
  readonly registry?: unknown;
  readonly rawSpecJson?: string;
  readonly rawRegistryJson?: string;
}

const archivedFamilySet = new Set<string>(ARCHIVED_FALSIFIED_FAMILIES);

function failGuard<T>(code: PaperForwardGuardErrorCode, error: string): SpecGuardValidationResult<T> {
  return { ok: false, code, error };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isArchivedFalsifiedFamily(strategyId: string): boolean {
  return archivedFamilySet.has(strategyId.trim());
}

export function computeSpecPayloadSha256(spec: Readonly<Record<string, unknown>>): string {
  return computeCanonicalPayloadSha256(spec, 'payloadSha256');
}

export function computeRegistryPayloadSha256(registry: Readonly<Record<string, unknown>>): string {
  return computeCanonicalPayloadSha256(registry, 'registry_sha256');
}

export function signStrategySpecPayload(unsignedSpec: UnsignedStrategySpec): SignedStrategySpec {
  const payloadSha256 = computeSpecPayloadSha256(unsignedSpec as unknown as Record<string, unknown>);
  return assertValidSignedStrategySpec({ ...unsignedSpec, payloadSha256 });
}

export function signLifecycleRegistryPayload(
  unsignedRegistry: Omit<StrategyLifecycleRegistry, 'registry_sha256'>,
): StrategyLifecycleRegistry {
  const registry_sha256 = computeRegistryPayloadSha256(
    unsignedRegistry as unknown as Record<string, unknown>,
  );
  return StrategyLifecycleRegistrySchema.parse({ ...unsignedRegistry, registry_sha256 });
}

export function validateStrategyLifecycleRegistry(
  rawRegistry: unknown,
  rawRegistryJson?: string,
): SpecGuardValidationResult<StrategyLifecycleRegistry> {
  if (!isPlainObject(rawRegistry)) {
    return failGuard('INVALID_SPEC_SCHEMA', 'StrategyLifecycleRegistry must be a JSON object');
  }
  if (rawRegistry.live_trading_locked !== true) {
    return failGuard('LIVE_AUTHORITY_FORBIDDEN', 'Registry live_trading_locked must remain true');
  }
  const parsed = StrategyLifecycleRegistrySchema.safeParse(rawRegistry);
  if (!parsed.success) {
    return failGuard('INVALID_SPEC_SCHEMA', parsed.error.issues[0]?.message ?? 'Invalid registry schema');
  }
  const validSig = verifyCanonicalPayloadSha256(
    rawRegistry,
    'registry_sha256',
    parsed.data.registry_sha256,
    rawRegistryJson,
  );
  if (!validSig) {
    return failGuard('SPEC_SIGNATURE_MISMATCH', 'StrategyLifecycleRegistry registry_sha256 mismatch');
  }
  return { ok: true, data: parsed.data };
}

function checkAuthorityAndArchiveFences(
  rawSpec: Record<string, unknown>,
): SpecGuardValidationResult<string> {
  if (rawSpec.executionMode !== 'PAPER_ONLY' || rawSpec.liveOrderAuthority !== false) {
    return failGuard(
      'LIVE_AUTHORITY_FORBIDDEN',
      'SignedStrategySpec requires executionMode=PAPER_ONLY and liveOrderAuthority=false',
    );
  }
  if (rawSpec.aiOrderAuthority !== false) {
    return failGuard('AI_AUTHORITY_FORBIDDEN', 'SignedStrategySpec requires aiOrderAuthority=false');
  }
  if (typeof rawSpec.strategyId !== 'string' || rawSpec.strategyId.trim().length === 0) {
    return failGuard('INVALID_SPEC_SCHEMA', 'SignedStrategySpec strategyId is required');
  }
  const strategyId = rawSpec.strategyId.trim();
  if (isArchivedFalsifiedFamily(strategyId)) {
    return failGuard(
      'STRATEGY_ARCHIVED_FALSIFIED',
      `Strategy ${strategyId} is permanently ARCHIVED_FALSIFIED and barred from Gate G13`,
    );
  }
  return { ok: true, data: strategyId };
}

function checkDynamicRegistryEligibility(
  strategyId: string,
  options?: ValidateSpecOptions,
): SpecGuardValidationResult<true> {
  if (options?.registry === undefined) return { ok: true, data: true };
  const regRes = validateStrategyLifecycleRegistry(options.registry, options.rawRegistryJson);
  if (!regRes.ok) return regRes;
  const entry = regRes.data.strategies.find((s) => s.strategy_id === strategyId);
  if (!entry || entry.status === 'ARCHIVED_FALSIFIED' || !entry.paper_forward_allowed) {
    return failGuard(
      'STRATEGY_ARCHIVED_FALSIFIED',
      `Strategy ${strategyId} is not PAPER_FORWARD_ELIGIBLE in StrategyLifecycleRegistry`,
    );
  }
  return { ok: true, data: true };
}

export function validateSignedStrategySpec(
  rawSpec: unknown,
  options?: ValidateSpecOptions,
): SpecGuardValidationResult<SignedStrategySpec> {
  if (!isPlainObject(rawSpec)) {
    return failGuard('INVALID_SPEC_SCHEMA', 'SignedStrategySpec must be a JSON object');
  }
  const fenceRes = checkAuthorityAndArchiveFences(rawSpec);
  if (!fenceRes.ok) return fenceRes;

  const regCheck = checkDynamicRegistryEligibility(fenceRes.data, options);
  if (!regCheck.ok) return regCheck;

  const parsed = SignedStrategySpecSchema.safeParse(rawSpec);
  if (!parsed.success) {
    return failGuard('INVALID_SPEC_SCHEMA', parsed.error.issues[0]?.message ?? 'Invalid spec schema');
  }

  const validSha = verifyCanonicalPayloadSha256(
    rawSpec,
    'payloadSha256',
    parsed.data.payloadSha256,
    options?.rawSpecJson,
  );
  if (!validSha) {
    return failGuard('SPEC_SIGNATURE_MISMATCH', 'SignedStrategySpec payloadSha256 mismatch');
  }
  return { ok: true, data: parsed.data };
}

export function assertValidSignedStrategySpec(
  rawSpec: unknown,
  options?: ValidateSpecOptions,
): SignedStrategySpec {
  const res = validateSignedStrategySpec(rawSpec, options);
  if (!res.ok) throw new PaperForwardGuardError(res.code, res.error);
  return res.data;
}
