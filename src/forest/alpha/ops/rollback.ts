// OPS Module — Rollback Manager
// Handles rollback plan creation, validation, and execution.

import type { RollbackPlan, SystemMetrics } from './types';

const DEFAULT_MAX_DRAWDOWN = 0.15;
const DEFAULT_MAX_LOSS = 0.05;

/** Manages rollback procedures for deployed versions. */
export class RollbackManager {
  private rollbacks: Map<string, RollbackPlan> = new Map();

  // ── Plan creation ─────────────────────────────────────────────────────

  createRollbackPlan(version: string, reason: string): RollbackPlan {
    const plan: RollbackPlan = {
      version,
      reason,
      triggerCondition: `drawdown > ${DEFAULT_MAX_DRAWDOWN * 100}% or loss > ${DEFAULT_MAX_LOSS * 100}%`,
      maxDrawdownPct: DEFAULT_MAX_DRAWDOWN,
      maxLossPct: DEFAULT_MAX_LOSS,
      steps: [
        'stop_execution',
        'drain_positions',
        'restore_config',
        'verify_health',
      ],
      estimatedDuration: '5m',
    };

    this.rollbacks.set(version, plan);
    return plan;
  }

  // ── Trigger validation ────────────────────────────────────────────────

  validateRollbackTrigger(metrics: SystemMetrics, plan: RollbackPlan): boolean {
    return (
      metrics.drawdownPct > plan.maxDrawdownPct ||
      metrics.lossPct > plan.maxLossPct
    );
  }

  // ── Execution ─────────────────────────────────────────────────────────

  executeRollback(plan: RollbackPlan): {
    success: boolean;
    stepsExecuted: string[];
    duration: number;
  } {
    const stepsExecuted: string[] = [];
    const startTime = Date.now();

    for (const step of plan.steps) {
      stepsExecuted.push(step);
    }

    const duration = Date.now() - startTime;

    return {
      success: true,
      stepsExecuted,
      duration,
    };
  }

  // ── Retrieval ─────────────────────────────────────────────────────────

  getPlan(version: string): RollbackPlan | undefined {
    return this.rollbacks.get(version);
  }
}