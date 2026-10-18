// OPS Module — Canary Deployment
import type { CanaryConfig, CanaryState, HealthStatus, RollbackPlan } from './types';
import { RollbackManager } from './rollback';

export class CanaryDeployment {
  private state: CanaryState | null = null;
  private rollbackManager = new RollbackManager();

  startCanary(config: CanaryConfig): CanaryState {
    if (!config.enabled) throw new Error('Cannot start canary when enabled is false');
    this.state = {
      version: '', weight: config.initialWeight, isHealthy: true,
      errorRate: 0, totalRequests: 0, failedRequests: 0, startedAt: new Date().toISOString(),
    };
    return this.state;
  }

  updateCanaryWeight(state: CanaryState, newWeight: number): CanaryState {
    if (!this.state) throw new Error('No canary deployment in progress');
    this.state = { ...state, weight: newWeight };
    return this.state;
  }

  checkCanaryHealth(state: CanaryState): HealthStatus {
    const threshold = 0.05;
    const errorRate = state.totalRequests > 0 ? state.failedRequests / state.totalRequests : 0;
    if (errorRate >= threshold) return 'unhealthy';
    if (errorRate >= threshold * 0.5) return 'degraded';
    return 'healthy';
  }

  promoteCanary(state: CanaryState): RollbackPlan {
    if (!state.isHealthy) throw new Error('Cannot promote unhealthy canary');
    return this.rollbackManager.createRollbackPlan(state.version || 'unknown', 'canary promotion rollback plan');
  }

  completeCanary(state: CanaryState): { success: boolean; finalVersion: string } {
    if (!this.state) throw new Error('No canary deployment in progress');
    this.state = null;
    return { success: true, finalVersion: state.version };
  }
}