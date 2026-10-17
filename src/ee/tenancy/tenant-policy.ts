// Step 11: Multi-Tenant Workspace Isolation & RBAC Policy Engine (Cloud SaaS Moat)
// Governed by CashClaw Commercial License (src/ee/LICENSE-COMMERCIAL.md).

import { z } from 'zod';
import { type Result, ok, err } from '../../lib/result';

export const SaasTierSchema = z.enum(['BASIC', 'PREMIUM', 'ENTERPRISE', 'MASTER']);
export type SaasTier = z.infer<typeof SaasTierSchema>;

export const WorkspaceRoleSchema = z.enum(['OWNER', 'ADMIN', 'TRADER', 'VIEWER']);
export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;

export const WorkspaceActionSchema = z.enum([
  'READ_WORKSPACE',
  'CREATE_PAPER_BOT',
  'STOP_PAPER_BOT',
  'RUN_LLM_DELIBERATION',
  'MANAGE_BILLING',
  'MANAGE_MEMBERS',
]);
export type WorkspaceAction = z.infer<typeof WorkspaceActionSchema>;

export interface TenantPrincipal {
  readonly userId: string;
  readonly workspaceId: string;
  readonly role: WorkspaceRole;
  readonly tier: SaasTier;
}

export interface ResourceContext {
  readonly resourceWorkspaceId: string;
  readonly action: WorkspaceAction;
}

const ROLE_PERMISSIONS: Readonly<Record<WorkspaceRole, readonly WorkspaceAction[]>> = {
  OWNER: [
    'READ_WORKSPACE',
    'CREATE_PAPER_BOT',
    'STOP_PAPER_BOT',
    'RUN_LLM_DELIBERATION',
    'MANAGE_BILLING',
    'MANAGE_MEMBERS',
  ],
  ADMIN: [
    'READ_WORKSPACE',
    'CREATE_PAPER_BOT',
    'STOP_PAPER_BOT',
    'RUN_LLM_DELIBERATION',
    'MANAGE_MEMBERS',
  ],
  TRADER: [
    'READ_WORKSPACE',
    'CREATE_PAPER_BOT',
    'STOP_PAPER_BOT',
    'RUN_LLM_DELIBERATION',
  ],
  VIEWER: ['READ_WORKSPACE'],
};

export function authorizeWorkspaceAction(
  principal: TenantPrincipal,
  context: ResourceContext,
): Result<{ readonly authorized: true; readonly workspaceId: string }> {
  if (!principal.userId || !principal.workspaceId) {
    return err('TENANT_AUTH_ERROR: Missing userId or workspaceId on principal');
  }
  if (principal.workspaceId !== context.resourceWorkspaceId) {
    return err('IDOR_VIOLATION: Cross-workspace access denied');
  }
  const allowedActions = ROLE_PERMISSIONS[principal.role];
  if (!allowedActions.includes(context.action)) {
    return err(
      `RBAC_DENIED: Role ${principal.role} cannot perform ${context.action}`,
    );
  }
  return ok({ authorized: true, workspaceId: principal.workspaceId });
}
