// promotion-states.test.ts — unit tests for the Strategy Promotion State Machine
// (mission Phase 17)
//
// transitionStrategy is a pure function over states and triggers. Tests cover
// the happy path, the kill path, demotion, the safety boundary (no automated
// path to LIVE), and the integration with the survival gate result.

import { describe, it, expect } from 'vitest';
import {
  type TransitionTrigger,
  isTerminalPhase,
  canTransition,
  getTransition,
  transitionStrategy,
  gateResultToTrigger,
  AUTOMATED_CEILING,
} from './promotion-states';

// ── Test Fixtures ──────────────────────────────────────────────────────────────

const passed: TransitionTrigger = { type: 'gate_passed' };
const failed: TransitionTrigger = { type: 'gate_failed' };
const approved: TransitionTrigger = { type: 'manual_approval', approved: true };
const rejected: TransitionTrigger = { type: 'manual_approval', approved: false };
const promote: TransitionTrigger = { type: 'promote' };
const demote: TransitionTrigger = { type: 'demote' };

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('promotion state machine', () => {
  describe('happy path', () => {
    it('advances RESEARCH → BACKTEST on gate_passed', () => {
      expect(getTransition('RESEARCH', passed)).toBe('BACKTEST');
    });

    it('advances BACKTEST → OOS_PASS on gate_passed', () => {
      expect(getTransition('BACKTEST', passed)).toBe('OOS_PASS');
    });

    it('advances OOS_PASS → ROBUSTNESS_PASS on gate_passed', () => {
      expect(getTransition('OOS_PASS', passed)).toBe('ROBUSTNESS_PASS');
    });

    it('advances ROBUSTNESS_PASS → PAPER on gate_passed', () => {
      expect(getTransition('ROBUSTNESS_PASS', passed)).toBe('PAPER');
    });

    it('advances PAPER → SHADOW on gate_passed', () => {
      expect(getTransition('PAPER', passed)).toBe('SHADOW');
    });

    it('returns the from/to/trigger on a successful transition', () => {
      const result = transitionStrategy('RESEARCH', passed);
      expect(result).toEqual({ from: 'RESEARCH', to: 'BACKTEST', trigger: passed });
    });
  });

  describe('gate_failed terminates the lifecycle', () => {
    it('kills from every non-terminal phase on gate_failed', () => {
      for (const phase of [
        'RESEARCH',
        'BACKTEST',
        'OOS_PASS',
        'ROBUSTNESS_PASS',
        'PAPER',
        'SHADOW',
      ] as const) {
        expect(getTransition(phase, failed)).toBe('KILLED');
      }
    });

    it('KILLED is terminal — no trigger moves it', () => {
      expect(getTransition('KILLED', passed)).toBeNull();
      expect(getTransition('KILLED', failed)).toBeNull();
      expect(getTransition('KILLED', promote)).toBeNull();
      expect(getTransition('KILLED', demote)).toBeNull();
    });

    it('LIVE is terminal — no trigger moves it', () => {
      expect(getTransition('LIVE', promote)).toBeNull();
      expect(getTransition('LIVE', demote)).toBeNull();
    });
  });

  describe('safety boundary — no automated path to LIVE', () => {
    it('gate_passed never advances past the automated ceiling', () => {
      expect(getTransition('SHADOW', passed)).toBeNull();
    });

    it('promote is not valid from any phase except MANUAL_APPROVAL', () => {
      for (const phase of [
        'RESEARCH',
        'BACKTEST',
        'OOS_PASS',
        'ROBUSTNESS_PASS',
        'PAPER',
        'SHADOW',
      ] as const) {
        expect(getTransition(phase, promote)).toBeNull();
      }
    });

    it('MANUAL_APPROVAL → LIVE is the only route into LIVE', () => {
      expect(getTransition('MANUAL_APPROVAL', promote)).toBe('LIVE');
    });

    it('manual_approval is only valid from SHADOW', () => {
      expect(getTransition('SHADOW', approved)).toBe('MANUAL_APPROVAL');
      expect(getTransition('SHADOW', rejected)).toBe('KILLED');
      for (const phase of [
        'RESEARCH',
        'BACKTEST',
        'OOS_PASS',
        'ROBUSTNESS_PASS',
        'PAPER',
      ] as const) {
        expect(getTransition(phase, approved)).toBeNull();
        expect(getTransition(phase, rejected)).toBeNull();
      }
    });

    it('throws on an invalid transition', () => {
      expect(() => transitionStrategy('SHADOW', passed)).toThrow();
    });
  });

  describe('demotion', () => {
    it('demotes any non-terminal phase back to RESEARCH', () => {
      for (const phase of [
        'BACKTEST',
        'OOS_PASS',
        'ROBUSTNESS_PASS',
        'PAPER',
        'SHADOW',
      ] as const) {
        expect(getTransition(phase, demote)).toBe('RESEARCH');
      }
    });

    it('cannot demote a terminal phase', () => {
      expect(getTransition('KILLED', demote)).toBeNull();
      expect(getTransition('LIVE', demote)).toBeNull();
    });
  });

  describe('helpers', () => {
    it('isTerminalPhase is true only for LIVE and KILLED', () => {
      expect(isTerminalPhase('LIVE')).toBe(true);
      expect(isTerminalPhase('KILLED')).toBe(true);
      for (const phase of [
        'RESEARCH',
        'BACKTEST',
        'OOS_PASS',
        'ROBUSTNESS_PASS',
        'PAPER',
        'SHADOW',
        'MANUAL_APPROVAL',
      ] as const) {
        expect(isTerminalPhase(phase)).toBe(false);
      }
    });

    it('canTransition mirrors getTransition non-null', () => {
      expect(canTransition('RESEARCH', passed)).toBe(true);
      expect(canTransition('SHADOW', passed)).toBe(false);
    });

    it('AUTOMATED_CEILING is SHADOW', () => {
      expect(AUTOMATED_CEILING).toBe('SHADOW');
    });
  });

  describe('gate integration', () => {
    it('maps PAPER_CANDIDATE to gate_passed', () => {
      expect(gateResultToTrigger('PAPER_CANDIDATE')).toEqual({
        type: 'gate_passed',
      });
    });

    it('maps KILLED to gate_failed', () => {
      expect(gateResultToTrigger('KILLED')).toEqual({
        type: 'gate_failed',
      });
    });

    it('wires the survival gate result into the lifecycle', () => {
      // A strategy that passes the survival gate advances from RESEARCH.
      const trigger = gateResultToTrigger('PAPER_CANDIDATE');
      const result = transitionStrategy('RESEARCH', trigger);
      expect(result.to).toBe('BACKTEST');
    });

    it('kills a strategy that fails the survival gate', () => {
      const trigger = gateResultToTrigger('KILLED');
      const result = transitionStrategy('RESEARCH', trigger);
      expect(result.to).toBe('KILLED');
    });
  });
});