import { describe, it, expect } from 'vitest';
import {
  type StrategyPhase,
  type TransitionTrigger,
  isTerminalPhase,
  canTransition,
  getTransition,
  transitionStrategy,
  gateResultToTrigger,
  AUTOMATED_CEILING,
} from '../../src/forest/alpha/gate/promotion-states';

const ALL_PHASES: readonly StrategyPhase[] = [
  'RESEARCH', 'BACKTEST', 'OOS_PASS', 'ROBUSTNESS_PASS',
  'PAPER', 'SHADOW', 'MANUAL_APPROVAL', 'LIVE', 'KILLED',
];

const STANDARD_TRIGGERS: readonly TransitionTrigger[] = [
  { type: 'gate_passed' },
  { type: 'gate_failed' },
  { type: 'manual_approval', approved: true },
  { type: 'manual_approval', approved: false },
  { type: 'promote' },
  { type: 'demote' },
];

const ADVERSARIAL_TRIGGERS: readonly TransitionTrigger[] = [
  ...STANDARD_TRIGGERS,
  { type: 'auto_promote' } as unknown as TransitionTrigger,
  { type: 'force_live' } as unknown as TransitionTrigger,
  { type: 'override' } as unknown as TransitionTrigger,
  { type: 'resurrect' } as unknown as TransitionTrigger,
  { type: 'admin_bypass' } as unknown as TransitionTrigger,
];

describe('Adversarial Challenge: Promotion State Machine & SHADOW Ceiling', () => {
  describe('Challenge 1: Chaining gate_passed from RESEARCH, PAPER_TRADING, SHADOW', () => {
    it('chains gate_passed up to SHADOW and strictly halts at automated ceiling', () => {
      let current: StrategyPhase = 'RESEARCH';
      const path: StrategyPhase[] = [current];

      while (canTransition(current, { type: 'gate_passed' })) {
        const res = transitionStrategy(current, { type: 'gate_passed' });
        current = res.to;
        path.push(current);
      }

      expect(path).toEqual(['RESEARCH', 'BACKTEST', 'OOS_PASS', 'ROBUSTNESS_PASS', 'PAPER', 'SHADOW']);
      expect(current).toBe(AUTOMATED_CEILING);

      // Attempting further gate_passed at SHADOW must strictly fail
      expect(getTransition('SHADOW', { type: 'gate_passed' })).toBeNull();
      expect(canTransition('SHADOW', { type: 'gate_passed' })).toBe(false);
      expect(() => transitionStrategy('SHADOW', { type: 'gate_passed' })).toThrow(
        /Invalid transition: SHADOW \+ gate_passed — no valid target/,
      );
    });

    it('rejects gate_passed from non-existent or alias phase PAPER_TRADING', () => {
      const invalidPhase = 'PAPER_TRADING' as unknown as StrategyPhase;
      expect(getTransition(invalidPhase, { type: 'gate_passed' })).toBeNull();
      expect(canTransition(invalidPhase, { type: 'gate_passed' })).toBe(false);
      expect(() => transitionStrategy(invalidPhase, { type: 'gate_passed' })).toThrow(
        /Invalid transition: PAPER_TRADING \+ gate_passed — no valid target/,
      );
    });

    it('repeatedly blocks gate_passed attempts directly initiated at SHADOW', () => {
      for (let i = 0; i < 10; i++) {
        expect(getTransition('SHADOW', { type: 'gate_passed' })).toBeNull();
        expect(canTransition('SHADOW', { type: 'gate_passed' })).toBe(false);
        expect(() => transitionStrategy('SHADOW', { type: 'gate_passed' })).toThrow();
      }
    });
  });

  describe('Challenge 2: Verify no automated trigger from SHADOW reaches MANUAL_APPROVAL, PAPER_CANDIDATE, or LIVE', () => {
    it('proves automated triggers cannot transition SHADOW to MANUAL_APPROVAL, PAPER_CANDIDATE, or LIVE', () => {
      const automatedTriggers: TransitionTrigger[] = [
        { type: 'gate_passed' },
        { type: 'gate_failed' },
        { type: 'auto_promote' } as unknown as TransitionTrigger,
      ];

      for (const trigger of automatedTriggers) {
        const next = getTransition('SHADOW', trigger);
        expect(next).not.toBe('MANUAL_APPROVAL');
        expect(next).not.toBe('PAPER_CANDIDATE');
        expect(next).not.toBe('LIVE');
      }
    });

    it('proves zero triggers of any kind from SHADOW can transition directly to LIVE or PAPER_CANDIDATE', () => {
      for (const trigger of ADVERSARIAL_TRIGGERS) {
        const next = getTransition('SHADOW', trigger);
        expect(next).not.toBe('LIVE');
        expect(next).not.toBe('PAPER_CANDIDATE');
      }
    });
  });

  describe('Challenge 3: Attempt direct leap to LIVE from any non-MANUAL_APPROVAL state', () => {
    it('proves impossible to jump to LIVE from any non-MANUAL_APPROVAL state under any trigger', () => {
      const nonManualPhases = ALL_PHASES.filter((p) => p !== 'MANUAL_APPROVAL');
      const invalidPhases = ['PAPER_TRADING', 'PAPER_CANDIDATE', 'UNKNOWN_PHASE', ''] as unknown as StrategyPhase[];

      for (const phase of [...nonManualPhases, ...invalidPhases]) {
        for (const trigger of ADVERSARIAL_TRIGGERS) {
          const target = getTransition(phase, trigger);
          expect(target).not.toBe('LIVE');
          if (target === null) {
            expect(() => transitionStrategy(phase, trigger)).toThrow();
          }
        }
      }
    });
  });

  describe('Challenge 4: MANUAL_APPROVAL gate enforcement', () => {
    it('kills candidate when manual_approval has approved: false from SHADOW', () => {
      const rejectTrigger: TransitionTrigger = { type: 'manual_approval', approved: false };
      expect(getTransition('SHADOW', rejectTrigger)).toBe('KILLED');
      const res = transitionStrategy('SHADOW', rejectTrigger);
      expect(res.to).toBe('KILLED');
    });

    it('rejects manual_approval (approved: false or true) applied directly on MANUAL_APPROVAL', () => {
      const approvedTrigger: TransitionTrigger = { type: 'manual_approval', approved: true };
      const rejectTrigger: TransitionTrigger = { type: 'manual_approval', approved: false };

      expect(getTransition('MANUAL_APPROVAL', approvedTrigger)).toBeNull();
      expect(getTransition('MANUAL_APPROVAL', rejectTrigger)).toBeNull();
      expect(() => transitionStrategy('MANUAL_APPROVAL', approvedTrigger)).toThrow();
      expect(() => transitionStrategy('MANUAL_APPROVAL', rejectTrigger)).toThrow();
    });

    it('proves MANUAL_APPROVAL cannot reach LIVE without explicit promote trigger', () => {
      const nonPromoteTriggers = ADVERSARIAL_TRIGGERS.filter((t) => t.type !== 'promote');
      for (const trigger of nonPromoteTriggers) {
        const next = getTransition('MANUAL_APPROVAL', trigger);
        expect(next).not.toBe('LIVE');
      }

      // Only promote reaches LIVE
      expect(getTransition('MANUAL_APPROVAL', { type: 'promote' })).toBe('LIVE');
    });
  });

  describe('Challenge 5: Terminal states KILLED and LIVE reject all triggers', () => {
    it('rejects all triggers on KILLED and LIVE', () => {
      const terminalStates: StrategyPhase[] = ['KILLED', 'LIVE'];

      for (const terminal of terminalStates) {
        expect(isTerminalPhase(terminal)).toBe(true);

        for (const trigger of ADVERSARIAL_TRIGGERS) {
          expect(getTransition(terminal, trigger)).toBeNull();
          expect(canTransition(terminal, trigger)).toBe(false);
          expect(() => transitionStrategy(terminal, trigger)).toThrow(
            new RegExp(`Invalid transition: ${terminal} \\+ ${trigger.type}`),
          );
        }
      }
    });
  });

  describe('Challenge 6: Adversarial Fail-Closed gateResultToTrigger', () => {
    it('fails closed on unknown or malicious verdict/status payloads', () => {
      // Malicious payloads attempting to inject LIVE or PASSED strings
      const malformedInputs = [
        'LIVE',
        'APPROVED',
        'UNKNOWN',
        'paper_candidate', // wrong casing
        { verdict: 'LIVE' },
        { verdict: 'MANUAL_APPROVAL' },
        { status: 'LIVE' },
        { status: 'SHADOW' },
        {},
      ];

      for (const input of malformedInputs) {
        const trigger = gateResultToTrigger(input as unknown as Parameters<typeof gateResultToTrigger>[0]);
        expect(trigger).toEqual({ type: 'gate_failed' });
      }
    });
  });
});
