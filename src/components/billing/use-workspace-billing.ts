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

async function fetchBillingPayloads(workspaceId: string) {
  const qs = `workspaceId=${encodeURIComponent(workspaceId)}`;
  const [quotasRes, creditsRes, botsRes] = await Promise.all([
    fetch(`/api/ee/quotas?${qs}`),
    fetch(`/api/ee/credits?${qs}`),
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

export function useWorkspaceBilling(workspaceId: string) {
  const [currentTier, setCurrentTier] = useState<SaasTier>('BASIC');
  const [runningBots, setRunningBots] = useState<number>(1);
  const [consumedCredits, setConsumedCredits] = useState<number>(250);
  const [totalCredits, setTotalCredits] = useState<number>(1000);

  const refreshBilling = useCallback(async () => {
    if (typeof fetch !== 'function') return;
    try {
      const { qData, cData, bData } = await fetchBillingPayloads(workspaceId);
      const parsedTier = SaasTierSchema.safeParse(qData?.tier);
      if (parsedTier.success) {
        setCurrentTier((prev) => (parsedTier.data === 'BASIC' && prev !== 'BASIC' ? prev : parsedTier.data));
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
  }, [workspaceId]);

  useEffect(() => { void Promise.resolve().then(refreshBilling); }, [refreshBilling]);

  return { currentTier, setCurrentTier, runningBots, consumedCredits, totalCredits, refreshBilling };
}
