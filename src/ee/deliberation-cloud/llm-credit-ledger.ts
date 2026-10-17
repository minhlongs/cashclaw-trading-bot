// Step 13: Managed Multi-Agent LLM Deliberation Credit Pool & Token Metering
// Enables Cloud SaaS users to run multi-agent TradingAgents debates without
// managing their own 9-provider API keys.

import { type Result, ok, err } from '../../lib/result';
import type { SaasTier } from '../tenancy/tenant-policy';

export type DeliberationModelTier = 'FAST' | 'REASONING' | 'LOCAL';

export interface CreditAccount {
  readonly workspaceId: string;
  readonly tier: SaasTier;
  readonly balanceCredits: number;
  readonly consumedCredits: number;
}

export interface DebateDebitRequest {
  readonly workspaceId: string;
  readonly modelTier: DeliberationModelTier;
  readonly promptTokens: number;
  readonly completionTokens: number;
}

const TIER_MONTHLY_CREDITS: Readonly<Record<SaasTier, number>> = {
  BASIC: 1_000,
  PREMIUM: 10_000,
  ENTERPRISE: 50_000,
  MASTER: 250_000,
};

const MODEL_TIER_MULTIPLIER: Readonly<Record<DeliberationModelTier, number>> = {
  LOCAL: 0,
  FAST: 1,
  REASONING: 4,
};

export function createCreditAccount(workspaceId: string, tier: SaasTier): CreditAccount {
  return {
    workspaceId,
    tier,
    balanceCredits: TIER_MONTHLY_CREDITS[tier],
    consumedCredits: 0,
  };
}

export function computeDebateCreditCost(req: DebateDebitRequest): number {
  const totalTokens = Math.max(0, req.promptTokens) + Math.max(0, req.completionTokens);
  const baseUnits = Math.ceil(totalTokens / 1000);
  return baseUnits * MODEL_TIER_MULTIPLIER[req.modelTier];
}

export function debitDeliberationCredits(
  account: CreditAccount,
  req: DebateDebitRequest,
): Result<{ readonly updated: CreditAccount; readonly debited: number }> {
  if (account.workspaceId !== req.workspaceId) {
    return err('CREDIT_LEDGER_MISMATCH: Workspace ID mismatch');
  }
  const cost = computeDebateCreditCost(req);
  if (account.balanceCredits < cost) {
    return err(
      `INSUFFICIENT_LLM_CREDITS: Required ${cost}, available ${account.balanceCredits}. Upgrade tier or switch to BYOK.`,
    );
  }
  return ok({
    debited: cost,
    updated: {
      ...account,
      balanceCredits: account.balanceCredits - cost,
      consumedCredits: account.consumedCredits + cost,
    },
  });
}
