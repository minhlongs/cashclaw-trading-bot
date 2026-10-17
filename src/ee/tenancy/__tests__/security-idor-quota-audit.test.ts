// Security Audit Test Suite for Anti-IDOR & Quota Bypass Prevention
// Verifies tenant isolation and strict entitlement bounds across hostile requests.

import { describe, it, expect } from 'vitest';
import {
  authorizeWorkspaceAction,
  type TenantPrincipal,
  type ResourceContext,
} from '../tenant-policy';
import { enforceWorkspaceQuota } from '../../billing/quota-guard';

describe('Security Audit: Anti-IDOR & Quota Bypass', () => {
  const victimWorkspace = 'ws_victim_corp';
  const attackerWorkspace = 'ws_attacker_corp';

  const attackerPrincipal: TenantPrincipal = {
    userId: 'usr_attacker_99',
    workspaceId: attackerWorkspace,
    role: 'ADMIN',
    tier: 'BASIC',
  };

  it('rejects cross-workspace resource access (anti-IDOR defense)', () => {
    const maliciousContext: ResourceContext = {
      resourceWorkspaceId: victimWorkspace,
      action: 'READ_WORKSPACE',
    };

    const result = authorizeWorkspaceAction(attackerPrincipal, maliciousContext);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('IDOR_VIOLATION');
    }
  });

  it('rejects unauthenticated principals with missing workspaceId or userId', () => {
    const brokenPrincipal: TenantPrincipal = {
      userId: '',
      workspaceId: attackerWorkspace,
      role: 'ADMIN',
      tier: 'BASIC',
    };

    const ctx: ResourceContext = {
      resourceWorkspaceId: attackerWorkspace,
      action: 'READ_WORKSPACE',
    };

    const result = authorizeWorkspaceAction(brokenPrincipal, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('TENANT_AUTH_ERROR');
    }
  });

  it('blocks privilege escalation: VIEWER role attempting CREATE_PAPER_BOT', () => {
    const viewerPrincipal: TenantPrincipal = {
      userId: 'usr_viewer_01',
      workspaceId: 'ws_normal',
      role: 'VIEWER',
      tier: 'BASIC',
    };

    const ctx: ResourceContext = {
      resourceWorkspaceId: 'ws_normal',
      action: 'CREATE_PAPER_BOT',
    };

    const result = authorizeWorkspaceAction(viewerPrincipal, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('RBAC_DENIED');
    }
  });

  it('strictly blocks bot creation when quota is exceeded on BASIC tier', () => {
    const quotaResult = enforceWorkspaceQuota({
      tier: 'BASIC',
      activeRunningBots: 1, // BASIC allows max 1
      requestedWalkForwardWindows: 2,
    });

    expect(quotaResult.ok).toBe(false);
    if (!quotaResult.ok) {
      expect(quotaResult.error).toContain('QUOTA_EXCEEDED');
      expect(quotaResult.error).toContain('allows max 1');
      expect(quotaResult.error).toContain('Upgrade at');
    }
  });

  it('strictly blocks excessive walk-forward windows requested beyond tier entitlement', () => {
    const quotaResult = enforceWorkspaceQuota({
      tier: 'PREMIUM',
      activeRunningBots: 2,
      requestedWalkForwardWindows: 32, // PREMIUM allows max 16
    });

    expect(quotaResult.ok).toBe(false);
    if (!quotaResult.ok) {
      expect(quotaResult.error).toContain('QUOTA_EXCEEDED');
      expect(quotaResult.error).toContain('allows max 16');
    }
  });

  it('grants approved quota within valid bounds', () => {
    const quotaResult = enforceWorkspaceQuota({
      tier: 'ENTERPRISE',
      activeRunningBots: 5, // allows 25
      requestedWalkForwardWindows: 32, // allows 64
    });

    expect(quotaResult.ok).toBe(true);
    if (quotaResult.ok) {
      expect(quotaResult.data.allowed).toBe(true);
      expect(quotaResult.data.tier).toBe('ENTERPRISE');
      expect(quotaResult.data.remainingBotSlots).toBe(19);
    }
  });
});
