import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  type StrategyPhase,
  type TransitionTrigger,
  type AutomatedCeiling,
  type AutomatedProgressionPhase,
  type AutomatedTransitionTarget,
  type PhaseAfterGatePassed,
  AUTOMATED_CEILING,
  isTerminalPhase,
  canTransition,
  getTransition,
  transitionStrategy,
  gateResultToTrigger,
} from '../../src/forest/alpha/gate/promotion-states';
import type { PromotionGateResult } from '../../src/forest/alpha/gate/types';

const GATE_DIR = path.resolve(__dirname, '../../src/forest/alpha/gate');
const TREE_DIR = path.resolve(__dirname, '../../src/tree');

function getTsSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== '__tests__') {
      files.push(...getTsSourceFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(full);
    }
  }
  return files;
}

const ALL_PHASES: readonly StrategyPhase[] = [
  'RESEARCH', 'BACKTEST', 'OOS_PASS', 'ROBUSTNESS_PASS',
  'PAPER', 'SHADOW', 'MANUAL_APPROVAL', 'LIVE', 'KILLED',
];

const TRIGGERS: readonly TransitionTrigger[] = [
  { type: 'gate_passed' },
  { type: 'gate_failed' },
  { type: 'manual_approval', approved: true },
  { type: 'manual_approval', approved: false },
  { type: 'promote' },
  { type: 'demote' },
];

describe('Promotion State Machine Safety Hardening', () => {
  describe('Compile-Time Safety Invariants', () => {
    it('verifies compile-time ceiling and impossible automated leaps', () => {
      expectTypeOf<AutomatedCeiling>().toEqualTypeOf<'SHADOW'>();
      expectTypeOf(AUTOMATED_CEILING).toEqualTypeOf<'SHADOW'>();
      expectTypeOf<PhaseAfterGatePassed<'SHADOW'>>().toBeNever();
      expectTypeOf<PhaseAfterGatePassed<'MANUAL_APPROVAL'>>().toBeNever();
      expectTypeOf<PhaseAfterGatePassed<'LIVE'>>().toBeNever();
      expectTypeOf<PhaseAfterGatePassed<'KILLED'>>().toBeNever();
      expectTypeOf<AutomatedTransitionTarget<AutomatedProgressionPhase>>().not.toEqualTypeOf<'LIVE'>();
      expectTypeOf<AutomatedTransitionTarget<AutomatedProgressionPhase>>().not.toEqualTypeOf<'MANUAL_APPROVAL'>();
    });
  });

  describe('Runtime Safety: Automated Capping & Zero Automated Path to LIVE', () => {
    it('caps gate_passed progression strictly at SHADOW', () => {
      const passed: TransitionTrigger = { type: 'gate_passed' };
      let phase: StrategyPhase = 'RESEARCH';
      const expectedSteps: StrategyPhase[] = ['BACKTEST', 'OOS_PASS', 'ROBUSTNESS_PASS', 'PAPER', 'SHADOW'];
      for (const step of expectedSteps) {
        phase = transitionStrategy(phase, passed).to;
        expect(phase).toBe(step);
      }
      expect(phase).toBe(AUTOMATED_CEILING);
      expect(getTransition('SHADOW', passed)).toBeNull();
      expect(canTransition('SHADOW', passed)).toBe(false);
      expect(() => transitionStrategy('SHADOW', passed)).toThrow(/Invalid transition: SHADOW \+ gate_passed/);
    });

    it('proves zero automated paths to LIVE or MANUAL_APPROVAL from any phase', () => {
      const passed: TransitionTrigger = { type: 'gate_passed' };
      for (const p of ALL_PHASES) {
        const next = getTransition(p, passed);
        expect(next).not.toBe('LIVE');
        expect(next).not.toBe('MANUAL_APPROVAL');
      }
    });

    it('requires human approval to reach MANUAL_APPROVAL and promote to reach LIVE', () => {
      const app = { type: 'manual_approval' as const, approved: true };
      const rej = { type: 'manual_approval' as const, approved: false };
      const prom = { type: 'promote' as const };

      expect(getTransition('SHADOW', app)).toBe('MANUAL_APPROVAL');
      expect(getTransition('SHADOW', rej)).toBe('KILLED');
      for (const p of ALL_PHASES.filter((x) => x !== 'SHADOW')) {
        expect(getTransition(p, app)).toBeNull();
        expect(getTransition(p, rej)).toBeNull();
      }

      expect(getTransition('MANUAL_APPROVAL', prom)).toBe('LIVE');
      for (const p of ALL_PHASES.filter((x) => x !== 'MANUAL_APPROVAL')) {
        expect(getTransition(p, prom)).toBeNull();
      }
    });

    it('proves terminal states KILLED and LIVE cannot transition under any trigger', () => {
      for (const term of ['LIVE', 'KILLED'] as const) {
        expect(isTerminalPhase(term)).toBe(true);
        for (const trig of TRIGGERS) {
          expect(getTransition(term, trig)).toBeNull();
          expect(canTransition(term, trig)).toBe(false);
          expect(() => transitionStrategy(term, trig)).toThrow(/Invalid transition/);
        }
      }
    });

    it('handles strengthened gateResultToTrigger inputs correctly', () => {
      expect(gateResultToTrigger('PASSED')).toEqual({ type: 'gate_passed' });
      expect(gateResultToTrigger('PAPER_CANDIDATE')).toEqual({ type: 'gate_passed' });
      expect(gateResultToTrigger('KILLED')).toEqual({ type: 'gate_failed' });
      expect(gateResultToTrigger({ verdict: 'PASSED' })).toEqual({ type: 'gate_passed' });
      expect(gateResultToTrigger({ verdict: 'KILLED' })).toEqual({ type: 'gate_failed' });
      expect(gateResultToTrigger({ status: 'PAPER_CANDIDATE' })).toEqual({ type: 'gate_passed' });
      expect(gateResultToTrigger({ status: 'KILLED' })).toEqual({ type: 'gate_failed' });

      const mockPassedResult: PromotionGateResult = {
        passed: true, verdict: 'PASSED', checks: [], failedChecks: [],
        diagnosticReasons: [], timestamp: Date.now(),
      };
      const mockKilledResult: PromotionGateResult = {
        passed: false, verdict: 'KILLED', checks: [], failedChecks: [],
        diagnosticReasons: ['check failed'], timestamp: Date.now(),
      };
      expect(gateResultToTrigger(mockPassedResult)).toEqual({ type: 'gate_passed' });
      expect(gateResultToTrigger(mockKilledResult)).toEqual({ type: 'gate_failed' });
    });
  });

  describe('Static Isolation & Tree Layer Purity', () => {
    const FORBIDDEN_TOKENS = [
      'ccxt', 'tree/exchange', 'land/exchange-orchestration',
      'OrderProvider', 'ExchangeOrchestrator', 'BotOrderExecutor',
      'LiveExchangeAdapter', 'placeOrder', 'executeLive',
      'tree/order', 'tree/wallet', 'land/wallet',
    ];

    it('verifies gate source files contain zero live exchange or execution adapters', () => {
      const gateFiles = getTsSourceFiles(GATE_DIR);
      expect(gateFiles.length).toBeGreaterThanOrEqual(5);
      for (const file of gateFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        const rel = path.relative(GATE_DIR, file);
        for (const token of FORBIDDEN_TOKENS) {
          const isPath = token.includes('/');
          const regex = isPath
            ? new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            : new RegExp(`\\b${token}\\b`);
          expect(content.match(regex), `Forbidden token '${token}' in ${rel}`).toBeNull();
        }
      }
    });

    it('verifies Tree layer purity: zero imports of forest alpha gate from tree', () => {
      const treeFiles = getTsSourceFiles(TREE_DIR);
      expect(treeFiles.length).toBeGreaterThanOrEqual(20);
      for (const file of treeFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        const rel = path.relative(TREE_DIR, file);
        const hasGate = /from\s+['"][^'"]*(?:forest\/alpha\/gate|promotion-states|survival-gate)/.test(content);
        expect(hasGate, `Tree file ${rel} illegally imports gate`).toBe(false);
      }
      const obsDir = path.resolve(TREE_DIR, 'alpha/observability');
      for (const file of getTsSourceFiles(obsDir)) {
        const content = fs.readFileSync(file, 'utf-8');
        const rel = path.relative(TREE_DIR, file);
        expect(/from\s+['"][^'"]*(?:src\/forest|@\/forest)/.test(content), `Observability ${rel} imports forest`).toBe(false);
      }
    });
  });
});
