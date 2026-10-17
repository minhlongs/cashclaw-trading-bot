import { describe, it, expect } from 'vitest';
import { authorizeWorkspaceAction } from '../tenancy/tenant-policy';
import { CloudSchedulerCoordinator } from '../scheduler/cloud-scheduler-coordinator';
import {
  createCreditAccount,
  debitDeliberationCredits,
} from '../deliberation-cloud/llm-credit-ledger';
import { getCloudAlphaFeedForTier } from '../alpha-cloud/alpha-feed-service';
import {
  signAlertWebhookPayload,
  CloudAlertDeduplicator,
} from '../alerts/cloud-alert-dispatcher';

describe('Phase 3 (Steps 11-15): SaaS Value Moat & Cloud-Only Architecture', () => {
  it('Step 11: Enforces multi-tenant anti-IDOR and RBAC role boundaries', () => {
    const trader = {
      userId: 'u_1',
      workspaceId: 'ws_alpha',
      role: 'TRADER' as const,
      tier: 'PREMIUM' as const,
    };

    const allowed = authorizeWorkspaceAction(trader, {
      resourceWorkspaceId: 'ws_alpha',
      action: 'CREATE_PAPER_BOT',
    });
    expect(allowed.ok).toBe(true);

    const idorAttempt = authorizeWorkspaceAction(trader, {
      resourceWorkspaceId: 'ws_other',
      action: 'READ_WORKSPACE',
    });
    expect(idorAttempt.ok).toBe(false);
    if (!idorAttempt.ok) {
      expect(idorAttempt.error).toContain('IDOR_VIOLATION');
    }

    const rbacDenied = authorizeWorkspaceAction(trader, {
      resourceWorkspaceId: 'ws_alpha',
      action: 'MANAGE_BILLING',
    });
    expect(rbacDenied.ok).toBe(false);
  });

  it('Step 12: Prevents duplicate 24/7 scheduler ticks across worker isolates', () => {
    const scheduler = new CloudSchedulerCoordinator();
    const now = 1_760_000_005_000;

    const first = scheduler.acquireTickLease({
      botId: 'bot_btc_dca',
      workspaceId: 'ws_alpha',
      isolateId: 'iso_sfo_1',
      nowMs: now,
    });
    expect(first.ok).toBe(true);

    const duplicate = scheduler.acquireTickLease({
      botId: 'bot_btc_dca',
      workspaceId: 'ws_alpha',
      isolateId: 'iso_sin_2',
      nowMs: now + 1000,
    });
    expect(duplicate.ok).toBe(false);
    expect(scheduler.activeLeaseCount(now + 1000)).toBe(1);
  });

  it('Step 13: Meters LLM deliberation credits by model tier and fails closed when exhausted', () => {
    const account = createCreditAccount('ws_alpha', 'BASIC');
    expect(account.balanceCredits).toBe(1000);

    const debit = debitDeliberationCredits(account, {
      workspaceId: 'ws_alpha',
      modelTier: 'REASONING',
      promptTokens: 2000,
      completionTokens: 1000,
    });
    expect(debit.ok).toBe(true);
    if (debit.ok) {
      expect(debit.data.debited).toBe(12);
      expect(debit.data.updated.balanceCredits).toBe(988);
    }
  });

  it('Step 14: Gates curated pre-computed Alpha Zoo IC/IR feeds by SaaS tier', () => {
    expect(getCloudAlphaFeedForTier('BASIC')).toHaveLength(1);
    expect(getCloudAlphaFeedForTier('PREMIUM')).toHaveLength(2);
    expect(getCloudAlphaFeedForTier('ENTERPRISE')).toHaveLength(3);
    expect(getCloudAlphaFeedForTier('MASTER')).toHaveLength(3);
  });

  it('Step 15: Signs webhook payloads via WebCrypto HMAC-SHA256 and deduplicates alerts', async () => {
    const sig = await signAlertWebhookPayload('{"botId":"b1"}', 'whsec_test');
    expect(sig).toMatch(/^[a-f0-9]{64}$/);

    const dedup = new CloudAlertDeduplicator();
    const event = {
      eventId: 'ev_1',
      workspaceId: 'ws_1',
      botId: 'b_1',
      channel: 'TELEGRAM' as const,
      message: 'Paper fill BTCUSDT',
      timestampMs: 100_000,
    };
    expect(dedup.shouldDispatch(event)).toBe(true);
    expect(dedup.shouldDispatch({ ...event, timestampMs: 120_000 })).toBe(false);
    expect(dedup.shouldDispatch({ ...event, timestampMs: 170_000 })).toBe(true);
  });
});
