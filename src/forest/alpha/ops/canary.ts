// OPS Module — Canary Deployment
// Manages canary traffic shifting, health checks, and promotion.

import type {
  CanaryConfig,
  CanaryState,
  HealthStatus,
  RollbackPlan,
} from './types';
import { RollbackManager } from './rollback';

/** Manages canary deployment lifecycle. */
export class CanaryDeployment {
  private state: CanaryState | null = null;
  private rollbackManager = new RollbackManager();

  // ── Start canary ──────────────────────────────────────────────────────

  startCanary(config: CanaryConfig): CanaryState {
    if (!config.enabled) {
      throw new Error('Cannot start canary when enabled is false');
    }

    this.state = {
      version: '',
      weight: config.initialWeight,
      isHealthy: true,
      errorRate: 0,
      totalRequests: 0,
      failedRequests: 0,
      startedAt: new Date().toISOString(),
    };

    return this.state;
  }

  // ── Weight updates ────────────────────────────────────────────────────

  updateCanaryWeight(state: CanaryState, newWeight: number): CanaryState {
    if (!this.state) {
      throw new Error('No canary deployment in progress');
    }

    this.state = {
      ...state,
      weight: newWeight,
    };

    return this.state;
  }

  // ── Health checks ─────────────────────────────────────────────────────

  checkCanaryHealth(state: CanaryState): HealthStatus {
    const threshold = 0.05;
    const errorRate = state.totalRequests > 0
      ? state.failedRequests / state.totalRequests
      : 0;

    if (errorRate >= threshold) {
      return 'unhealthy';
    }

    if (errorRate >= threshold * 0.5) {
      return 'degraded';
    }

    return 'healthy';
  }

  // ── Promote to full deployment ────────────────────────────────────────

  promoteCanary(state: CanaryState): RollbackPlan {
    if (!state.isHealthy) {
      throw new Error('Cannot promote unhealthy canary');
    }

    const version = state.version || 'unknown';
    const plan = this.rollbackManager.createRollbackPlan(
      version,
      'canary promotion rollback plan',
    );

    return plan;
  }

  // ── Complete canary ───────────────────────────────────────────────────

  completeCanary(state: CanaryState): { success: boolean; finalVersion: string } {
    if (!this.state) {
      throw new Error('No canary deployment in progress');
    }

    this.state = null;

    return {
      success: true,
      finalVersion: state.version,
    };
  }
}