// OPS Module — Types
// Rollback procedures and canary deployment framework.

// ── Rollback ──────────────────────────────────────────────────────────────

/** A plan for rolling back a deployed version. */
export interface RollbackPlan {
  version: string;
  reason: string;
  triggerCondition: string;
  maxDrawdownPct: number;
  maxLossPct: number;
  steps: string[];
  estimatedDuration: string;
}

// ── Canary ────────────────────────────────────────────────────────────────

/** Configuration for a canary deployment. */
export interface CanaryConfig {
  enabled: boolean;
  initialWeight: number;
  maxWeight: number;
  stepSize: number;
  stepInterval: string;
  healthCheckUrl: string;
  errorThreshold: number;
}

/** Current state of a canary deployment. */
export interface CanaryState {
  version: string;
  weight: number;
  isHealthy: boolean;
  errorRate: number;
  totalRequests: number;
  failedRequests: number;
  startedAt: string;
}

// ── Health ────────────────────────────────────────────────────────────────

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

// ── Events ────────────────────────────────────────────────────────────────

export type OpsEventType = 'rollback' | 'canary' | 'alert' | 'deploy';

/** Operational event for audit trail. */
export interface OpsEvent {
  timestamp: string;
  type: OpsEventType;
  severity: 'info' | 'warn' | 'critical';
  message: string;
  data: Record<string, unknown>;
}

// ── Metrics (used by both rollback and canary) ────────────────────────────

/** Current system metrics used to evaluate rollback triggers. */
export interface SystemMetrics {
  drawdownPct: number;
  lossPct: number;
  errorRate: number;
  totalRequests: number;
  failedRequests: number;
}