'use client';

import { useCallback, useEffect, useState } from 'react';
import { SaasTierSchema, type SaasTier } from '@/ee/tenancy/tenant-policy';

interface QuotasPayload {
  ok?: boolean;
  tier?: string;
  entitlements?: { monthlyLlmCredits?: number };
}

interface CreditsPayload {
  ok?: boolean; balanceCredits?: number; consumedCredits?: number; totalCredits?: number;
  account?: { balanceCredits?: number; consumedCredits?: number; totalCredits?: number };
}

interface BotsPayload {
  ok?: boolean;
  runningBots?: number;
  data?: Array<{ status?: string }>;
  bots?: Array<{ status?: string }>;
}

/**
 * Resolves the workspace this session actually belongs to.
 *
 * The workspace is no longer named by the page: a hardcoded value shared one
 * entitlement across every visitor, and letting the client name it would let it
 * read someone else's tier. `/api/ee/quotas` derives the workspace from the
 * validated session, so calling it without a `workspaceId` is the whole point.
 */
async function resolveActiveWorkspaceId(): Promise<string | null> {
  if (typeof fetch !== 'function') return null;
  try {
    const res = await fetch('/api/ee/quotas', { headers: { Accept: 'application/json' } });
    if (!res?.ok) return null;
    const body = (await res.json()) as { workspaceId?: string | null };
    return typeof body.workspaceId === 'string' && body.workspaceId.length > 0 ? body.workspaceId : null;
  } catch {
    return null;
  }
}

/** Workspace-scoped reads; `/api/bots` is already scoped by the session. */
async function fetchBillingPayloads(workspaceId: string | null) {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const [quotasRes, creditsRes, botsRes] = await Promise.all([
    fetch(`/api/ee/quotas${qs}`),
    workspaceId ? fetch(`/api/ee/credits${qs}`) : Promise.resolve(undefined),
    fetch('/api/bots'),
  ]);
  const qData = quotasRes?.ok ? ((await quotasRes.json()) as QuotasPayload) : undefined;
  const cData = creditsRes?.ok ? ((await creditsRes.json()) as CreditsPayload) : undefined;
  const bData = botsRes?.ok ? ((await botsRes.json()) as BotsPayload) : undefined;
  return { qData, cData, bData };
}

function resolveCreditsSnapshot(qData?: QuotasPayload, cData?: CreditsPayload) {
  const acct = cData?.account ?? cData;
  const consumed = typeof acct?.consumedCredits === 'number' ? acct.consumedCredits : undefined;
  const totalFromAcct =
    typeof acct?.totalCredits === 'number'
      ? acct.totalCredits
      : typeof acct?.balanceCredits === 'number' && typeof acct?.consumedCredits === 'number'
        ? acct.balanceCredits + acct.consumedCredits
        : undefined;
  return { consumed, total: totalFromAcct ?? qData?.entitlements?.monthlyLlmCredits };
}

export function useWorkspaceBilling() {
  const [currentTier, setCurrentTier] = useState<SaasTier>('BASIC');
  const [runningBots, setRunningBots] = useState<number>(1);
  const [consumedCredits, setConsumedCredits] = useState<number>(250);
  const [totalCredits, setTotalCredits] = useState<number>(1000);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const refreshBilling = useCallback(async () => {
    if (typeof fetch !== 'function') return;
    try {
      const resolvedWorkspaceId = await resolveActiveWorkspaceId();
      setWorkspaceId(resolvedWorkspaceId);

      const { qData, cData, bData } = await fetchBillingPayloads(resolvedWorkspaceId);
      const parsedTier = SaasTierSchema.safeParse(qData?.tier);
      if (parsedTier.success) {
        setCurrentTier(parsedTier.data);
      }
      const { consumed, total } = resolveCreditsSnapshot(qData, cData);
      if (typeof consumed === 'number') setConsumedCredits(consumed);
      if (typeof total === 'number') setTotalCredits(total);
      const list = Array.isArray(bData?.data) ? bData.data : bData?.bots;
      if (typeof bData?.runningBots === 'number') setRunningBots(bData.runningBots);
      else if (Array.isArray(list)) {
        setRunningBots(list.filter((b) => b.status !== 'stopped' && b.status !== 'halted').length);
      }
    } catch { /* Preserve fallback state */ }
  }, []);

  useEffect(() => { void Promise.resolve().then(refreshBilling); }, [refreshBilling]);

  return { currentTier, setCurrentTier, runningBots, consumedCredits, totalCredits, refreshBilling, workspaceId };
}
