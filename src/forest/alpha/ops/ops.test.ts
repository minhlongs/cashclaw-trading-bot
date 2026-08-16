// OPS Module — Tests

import { describe, it, expect, beforeEach } from 'vitest';
import { RollbackManager } from './rollback';
import { CanaryDeployment } from './canary';
import type { SystemMetrics, CanaryConfig } from './types';

// ── Rollback tests ───────────────────────────────────────────────────────

describe('RollbackManager', () => {
  let manager: RollbackManager;

  beforeEach(() => {
    manager = new RollbackManager();
  });

  describe('createRollbackPlan', () => {
    it('creates a rollback plan with default values', () => {
      const plan = manager.createRollbackPlan('v1.0.0', 'high error rate');

      expect(plan.version).toBe('v1.0.0');
      expect(plan.reason).toBe('high error rate');
      expect(plan.maxDrawdownPct).toBeCloseTo(0.15);
      expect(plan.maxLossPct).toBeCloseTo(0.05);
      expect(plan.steps).toEqual([
        'stop_execution',
        'drain_positions',
        'restore_config',
        'verify_health',
      ]);
      expect(plan.estimatedDuration).toBe('5m');
    });

    it('includes trigger condition in plan', () => {
      const plan = manager.createRollbackPlan('v2.0.0', 'test');

      expect(plan.triggerCondition).toContain('drawdown');
      expect(plan.triggerCondition).toContain('loss');
    });
  });

  describe('validateRollbackTrigger', () => {
    it('returns true when drawdown exceeds threshold', () => {
      const plan = manager.createRollbackPlan('v1.0.0', 'test');
      const metrics: SystemMetrics = {
        drawdownPct: 0.20,
        lossPct: 0.01,
        errorRate: 0,
        totalRequests: 100,
        failedRequests: 0,
      };

      expect(manager.validateRollbackTrigger(metrics, plan)).toBe(true);
    });

    it('returns true when loss exceeds threshold', () => {
      const plan = manager.createRollbackPlan('v1.0.0', 'test');
      const metrics: SystemMetrics = {
        drawdownPct: 0.05,
        lossPct: 0.10,
        errorRate: 0,
        totalRequests: 100,
        failedRequests: 0,
      };

      expect(manager.validateRollbackTrigger(metrics, plan)).toBe(true);
    });

    it('returns false when both metrics are within thresholds', () => {
      const plan = manager.createRollbackPlan('v1.0.0', 'test');
      const metrics: SystemMetrics = {
        drawdownPct: 0.05,
        lossPct: 0.01,
        errorRate: 0,
        totalRequests: 100,
        failedRequests: 0,
      };

      expect(manager.validateRollbackTrigger(metrics, plan)).toBe(false);
    });
  });

  describe('executeRollback', () => {
    it('executes all steps and returns success', () => {
      const plan = manager.createRollbackPlan('v1.0.0', 'test');
      const result = manager.executeRollback(plan);

      expect(result.success).toBe(true);
      expect(result.stepsExecuted).toEqual(plan.steps);
      expect(typeof result.duration).toBe('number');
    });
  });

  describe('getPlan', () => {
    it('retrieves a stored plan by version', () => {
      manager.createRollbackPlan('v1.0.0', 'test');
      const plan = manager.getPlan('v1.0.0');

      expect(plan).toBeDefined();
      expect(plan!.version).toBe('v1.0.0');
    });

    it('returns undefined for unknown version', () => {
      expect(manager.getPlan('v999.0.0')).toBeUndefined();
    });
  });
});

// ── Canary tests ─────────────────────────────────────────────────────────

describe('CanaryDeployment', () => {
  let canary: CanaryDeployment;
  let config: CanaryConfig;

  beforeEach(() => {
    canary = new CanaryDeployment();
    config = {
      enabled: true,
      initialWeight: 10,
      maxWeight: 100,
      stepSize: 10,
      stepInterval: '1m',
      healthCheckUrl: '/health',
      errorThreshold: 0.05,
    };
  });

  describe('startCanary', () => {
    it('creates initial canary state with default values', () => {
      const state = canary.startCanary(config);

      expect(state.weight).toBe(10);
      expect(state.isHealthy).toBe(true);
      expect(state.errorRate).toBe(0);
      expect(state.totalRequests).toBe(0);
      expect(state.failedRequests).toBe(0);
      expect(state.startedAt).toBeDefined();
    });

    it('throws when enabled is false', () => {
      const disabledConfig = { ...config, enabled: false };

      expect(() => canary.startCanary(disabledConfig)).toThrow(
        'Cannot start canary when enabled is false',
      );
    });
  });

  describe('updateCanaryWeight', () => {
    it('updates weight and returns new state', () => {
      const state = canary.startCanary(config);
      const updated = canary.updateCanaryWeight(state, 50);

      expect(updated.weight).toBe(50);
    });

    it('throws when no deployment is in progress', () => {
      const fresh = new CanaryDeployment();
      const state = {
        version: 'v1',
        weight: 10,
        isHealthy: true,
        errorRate: 0,
        totalRequests: 0,
        failedRequests: 0,
        startedAt: new Date().toISOString(),
      };

      expect(() => fresh.updateCanaryWeight(state, 50)).toThrow(
        'No canary deployment in progress',
      );
    });
  });

  describe('checkCanaryHealth', () => {
    it('returns healthy when error rate is below threshold', () => {
      const state = canary.startCanary(config);

      expect(canary.checkCanaryHealth(state)).toBe('healthy');
    });

    it('returns degraded when error rate is at 50% of threshold', () => {
      const state = canary.startCanary(config);
      const degraded: typeof state = {
        ...state,
        totalRequests: 100,
        failedRequests: 3,
      };

      expect(canary.checkCanaryHealth(degraded)).toBe('degraded');
    });

    it('returns unhealthy when error rate exceeds threshold', () => {
      const state = canary.startCanary(config);
      const unhealthy: typeof state = {
        ...state,
        totalRequests: 100,
        failedRequests: 10,
      };

      expect(canary.checkCanaryHealth(unhealthy)).toBe('unhealthy');
    });
  });

  describe('promoteCanary', () => {
    it('creates a rollback plan for healthy canary', () => {
      const state = canary.startCanary(config);
      state.version = 'v1.0.0';

      const plan = canary.promoteCanary(state);

      expect(plan.version).toBe('v1.0.0');
      expect(plan.steps).toBeDefined();
    });

    it('throws for unhealthy canary', () => {
      const state = canary.startCanary(config);
      const unhealthy: typeof state = {
        ...state,
        isHealthy: false,
        totalRequests: 100,
        failedRequests: 10,
      };

      expect(() => canary.promoteCanary(unhealthy)).toThrow(
        'Cannot promote unhealthy canary',
      );
    });
  });

  describe('completeCanary', () => {
    it('returns success with final version', () => {
      const state = canary.startCanary(config);
      state.version = 'v1.0.0';

      const result = canary.completeCanary(state);

      expect(result.success).toBe(true);
      expect(result.finalVersion).toBe('v1.0.0');
    });

    it('throws when no deployment is in progress', () => {
      const fresh = new CanaryDeployment();
      const state = {
        version: 'v1',
        weight: 10,
        isHealthy: true,
        errorRate: 0,
        totalRequests: 0,
        failedRequests: 0,
        startedAt: new Date().toISOString(),
      };

      expect(() => fresh.completeCanary(state)).toThrow(
        'No canary deployment in progress',
      );
    });
  });
});