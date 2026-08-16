import { describe, it, expect } from 'vitest';
import {
  EXPERIMENTS_TABLE_SQL,
  EXPERIMENT_RESULTS_TABLE_SQL,
  ALPHA_EVALUATIONS_TABLE_SQL,
  MIGRATION_SQL,
  ROLLBACK_SQL,
} from './d1-sql';

describe('D1 SQL migration constants', () => {
  describe('EXPERIMENTS_TABLE_SQL', () => {
    it('is non-empty', () => {
      expect(EXPERIMENTS_TABLE_SQL.length).toBeGreaterThan(0);
    });

    it('contains CREATE TABLE for EXPERIMENTS', () => {
      expect(EXPERIMENTS_TABLE_SQL).toContain('CREATE TABLE IF NOT EXISTS EXPERIMENTS');
    });

    it('has expected columns', () => {
      expect(EXPERIMENTS_TABLE_SQL).toContain('id TEXT PRIMARY KEY');
      expect(EXPERIMENTS_TABLE_SQL).toContain('name TEXT');
      expect(EXPERIMENTS_TABLE_SQL).toContain('config_snapshot TEXT');
      expect(EXPERIMENTS_TABLE_SQL).toContain('random_seed INTEGER');
      expect(EXPERIMENTS_TABLE_SQL).toContain('status TEXT DEFAULT');
      expect(EXPERIMENTS_TABLE_SQL).toContain('created_at INTEGER');
      expect(EXPERIMENTS_TABLE_SQL).toContain('updated_at INTEGER');
    });

    it('includes status index', () => {
      expect(EXPERIMENTS_TABLE_SQL).toContain('idx_experiments_status');
    });
  });

  describe('EXPERIMENT_RESULTS_TABLE_SQL', () => {
    it('is non-empty', () => {
      expect(EXPERIMENT_RESULTS_TABLE_SQL.length).toBeGreaterThan(0);
    });

    it('contains CREATE TABLE for EXPERIMENT_RESULTS', () => {
      expect(EXPERIMENT_RESULTS_TABLE_SQL).toContain('CREATE TABLE IF NOT EXISTS EXPERIMENT_RESULTS');
    });

    it('has expected columns', () => {
      expect(EXPERIMENT_RESULTS_TABLE_SQL).toContain('id TEXT PRIMARY KEY');
      expect(EXPERIMENT_RESULTS_TABLE_SQL).toContain('experiment_id TEXT');
      expect(EXPERIMENT_RESULTS_TABLE_SQL).toContain('window_index INTEGER');
      expect(EXPERIMENT_RESULTS_TABLE_SQL).toContain('train_metrics TEXT');
      expect(EXPERIMENT_RESULTS_TABLE_SQL).toContain('sharpe_ratio REAL');
      expect(EXPERIMENT_RESULTS_TABLE_SQL).toContain('total_pnl REAL');
      expect(EXPERIMENT_RESULTS_TABLE_SQL).toContain('total_trades INTEGER');
    });

    it('includes experiment_id index', () => {
      expect(EXPERIMENT_RESULTS_TABLE_SQL).toContain('idx_experiment_results_experiment');
    });
  });

  describe('ALPHA_EVALUATIONS_TABLE_SQL', () => {
    it('is non-empty', () => {
      expect(ALPHA_EVALUATIONS_TABLE_SQL.length).toBeGreaterThan(0);
    });

    it('contains CREATE TABLE for ALPHA_EVALUATIONS', () => {
      expect(ALPHA_EVALUATIONS_TABLE_SQL).toContain('CREATE TABLE IF NOT EXISTS ALPHA_EVALUATIONS');
    });

    it('has expected columns', () => {
      expect(ALPHA_EVALUATIONS_TABLE_SQL).toContain('id TEXT PRIMARY KEY');
      expect(ALPHA_EVALUATIONS_TABLE_SQL).toContain('experiment_id TEXT');
      expect(ALPHA_EVALUATIONS_TABLE_SQL).toContain('alpha_id TEXT');
      expect(ALPHA_EVALUATIONS_TABLE_SQL).toContain('total_contribution REAL');
      expect(ALPHA_EVALUATIONS_TABLE_SQL).toContain('feature_importance TEXT');
      expect(ALPHA_EVALUATIONS_TABLE_SQL).toContain('regime_breakdown TEXT');
    });

    it('includes experiment_id index', () => {
      expect(ALPHA_EVALUATIONS_TABLE_SQL).toContain('idx_alpha_evaluations_experiment');
    });
  });

  describe('MIGRATION_SQL', () => {
    it('is non-empty', () => {
      expect(MIGRATION_SQL.length).toBeGreaterThan(0);
    });

    it('contains all three table names', () => {
      expect(MIGRATION_SQL).toContain('EXPERIMENTS');
      expect(MIGRATION_SQL).toContain('EXPERIMENT_RESULTS');
      expect(MIGRATION_SQL).toContain('ALPHA_EVALUATIONS');
    });
  });

  describe('ROLLBACK_SQL', () => {
    it('is non-empty', () => {
      expect(ROLLBACK_SQL.length).toBeGreaterThan(0);
    });

    it('contains DROP TABLE statements for all tables', () => {
      expect(ROLLBACK_SQL).toContain('DROP TABLE IF EXISTS EXPERIMENTS');
      expect(ROLLBACK_SQL).toContain('DROP TABLE IF EXISTS EXPERIMENT_RESULTS');
      expect(ROLLBACK_SQL).toContain('DROP TABLE IF EXISTS ALPHA_EVALUATIONS');
    });
  });
});
