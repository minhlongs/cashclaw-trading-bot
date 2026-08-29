import { describe, expect, it } from 'vitest';
import { isTerminalQueueState, canTransitionJob, getJobTransition, transitionJob } from './transitions';
import type { QueueState, QueueTrigger } from './types';

describe('isTerminalQueueState', () => {
  it('returns true for ARCHIVED', () => {
    expect(isTerminalQueueState('ARCHIVED')).toBe(true);
  });

  it('returns false for every non-terminal state', () => {
    for (const s of ['PROPOSED', 'VALIDATING', 'RUNNING', 'EVALUATED', 'SURVIVED', 'FALSIFIED'] as QueueState[]) {
      expect(isTerminalQueueState(s)).toBe(false);
    }
  });
});

describe('canTransitionJob', () => {
  it('returns true for a valid trigger', () => {
    expect(canTransitionJob('PROPOSED', 'validate')).toBe(true);
    expect(canTransitionJob('ARCHIVED', 'archive' as QueueTrigger)).toBe(false);
  });

  it('returns false for an invalid trigger', () => {
    expect(canTransitionJob('ARCHIVED', 'validate' as QueueTrigger)).toBe(false);
    expect(canTransitionJob('PROPOSED', 'survived' as QueueTrigger)).toBe(false);
  });
});

describe('getJobTransition', () => {
  it('returns the target state for a valid trigger', () => {
    expect(getJobTransition('PROPOSED', 'validate')).toBe('VALIDATING');
    expect(getJobTransition('PROPOSED', 'withdraw')).toBe('ARCHIVED');
    expect(getJobTransition('VALIDATING', 'validation_passed')).toBe('RUNNING');
    expect(getJobTransition('VALIDATING', 'validation_failed')).toBe('FALSIFIED');
    expect(getJobTransition('RUNNING', 'evaluation_complete')).toBe('EVALUATED');
    expect(getJobTransition('RUNNING', 'run_failed')).toBe('FALSIFIED');
    expect(getJobTransition('EVALUATED', 'survived')).toBe('SURVIVED');
    expect(getJobTransition('EVALUATED', 'falsified')).toBe('FALSIFIED');
    expect(getJobTransition('SURVIVED', 'archive')).toBe('ARCHIVED');
    expect(getJobTransition('FALSIFIED', 'archive')).toBe('ARCHIVED');
  });

  it('returns null when the trigger is not valid from this state', () => {
    expect(getJobTransition('ARCHIVED', 'validate' as QueueTrigger)).toBeNull();
    expect(getJobTransition('PROPOSED', 'survived' as QueueTrigger)).toBeNull();
    expect(getJobTransition('RUNNING', 'validate' as QueueTrigger)).toBeNull();
  });

  it('never escapes ARCHIVED — every trigger returns null', () => {
    for (const t of ['validate', 'withdraw', 'validation_passed', 'validation_failed',
      'evaluation_complete', 'run_failed', 'survived', 'falsified', 'archive'] as QueueTrigger[]) {
      expect(getJobTransition('ARCHIVED', t)).toBeNull();
    }
  });
});

describe('transitionJob', () => {
  it('returns a TransitionRecord with from/to/trigger for a valid move', () => {
    const record = transitionJob('PROPOSED', 'validate');
    expect(record).toEqual({ from: 'PROPOSED', to: 'VALIDATING', trigger: 'validate' });
  });

  it('throws on an invalid move', () => {
    expect(() => transitionJob('ARCHIVED', 'validate' as QueueTrigger)).toThrow(
      /Invalid transition: ARCHIVED \+ validate/,
    );
  });

  it('throws when a trigger is valid elsewhere but not from this state', () => {
    expect(() => transitionJob('RUNNING', 'validate' as QueueTrigger)).toThrow(/Invalid transition/);
  });
});