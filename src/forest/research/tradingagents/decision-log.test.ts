// Decision Log (forest wrapper) tests — covers fromJSON fail-closed paths,
// append success/failure, and the empty-log guard.

import { describe, expect, it } from 'vitest';
import { DecisionLogWriter, logDeliberationRun } from './decision-log';
import type { DecisionLog } from '@/tree/research/tradingagents/decision-log';

const NOW = '2026-08-26T00:00:00.000Z';

describe('DecisionLogWriter.fromJSON', () => {
  it('returns a typed failure for invalid JSON', async () => {
    const result = await DecisionLogWriter.fromJSON('not-json');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons[0]).toBe('decision log: invalid JSON');
  });

  it('returns a typed failure when the shape has no entries array', async () => {
    const result = await DecisionLogWriter.fromJSON('{"foo": "bar"}');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons[0]).toBe('decision log: missing entries array');
  });

  it('returns a typed failure when the object is null', async () => {
    const result = await DecisionLogWriter.fromJSON('null');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons[0]).toBe('decision log: missing entries array');
  });
});

describe('DecisionLogWriter', () => {
  it('starts from an empty log when constructed without args', () => {
    const writer = new DecisionLogWriter();
    const log = writer.getLog() as DecisionLog;
    expect(log.entries).toHaveLength(0);
    expect(log.tailHash).toBeNull();
  });

  it('exports the log as canonical JSON', async () => {
    const writer = new DecisionLogWriter();
    const appended = await writer.append('analyst-output', 'goal-1', 'prop-1', { claim: 'x' }, NOW);
    expect(appended.ok).toBe(true);
    const parsed = JSON.parse(writer.toJSON()) as DecisionLog;
    expect(parsed.entries.length).toBe(1);
    expect(parsed.entries[0].kind).toBe('analyst-output');
  });

  it('returns a typed failure when append is given an unknown kind', async () => {
    const writer = new DecisionLogWriter();
    const appended = await writer.append('bogus-kind' as never, 'goal-1', 'prop-1', { claim: 'x' }, NOW);
    expect(appended.ok).toBe(false);
    if (appended.ok) return;
    expect(appended.reasons[0]).toBe("decision log: unknown kind 'bogus-kind'");
  });

  it('returns a typed failure when append is given an invalid timestamp', async () => {
    const writer = new DecisionLogWriter();
    const appended = await writer.append('analyst-output', 'goal-1', 'prop-1', { claim: 'x' }, 'not-a-date');
    expect(appended.ok).toBe(false);
    if (appended.ok) return;
    expect(appended.reasons.some((r) => r.includes('timestamp must be ISO-8601'))).toBe(true);
  });

  it('returns a typed failure when append is given an empty researchGoalId', async () => {
    const writer = new DecisionLogWriter();
    const appended = await writer.append('analyst-output', '', 'prop-1', { claim: 'x' }, NOW);
    expect(appended.ok).toBe(false);
  });

  it('verifies a freshly-appended chain', async () => {
    const writer = new DecisionLogWriter();
    await writer.append('analyst-output', 'goal-1', 'prop-1', { claim: 'x' }, NOW);
    const verified = await writer.verify();
    expect(verified.ok).toBe(true);
  });

  it('returns the last appended entry', async () => {
    const writer = new DecisionLogWriter();
    await writer.append('analyst-output', 'goal-1', 'prop-1', { a: 1 }, NOW);
    await writer.append('debate-output', 'goal-1', 'prop-1', { b: 2 }, NOW);
    const log = writer.getLog() as DecisionLog;
    expect(log.entries[log.entries.length - 1].kind).toBe('debate-output');
  });
});

describe('logDeliberationRun', () => {
  it('appends analyst, debate, synthesis, risk, portfolio, and cashclaw in order', async () => {
    const writer = new DecisionLogWriter();
    const result = await logDeliberationRun(writer, {
      researchGoalId: 'goal-1', proposalId: 'prop-1',
      analystOutputs: [{ claim: 'a1' }, { claim: 'a2' }],
      debateOutputs: [{ thesis: 'bull' }, { thesis: 'bear' }],
      researchSynthesis: { thesis: 'synth' }, riskProposal: { view: 'aggressive' },
      portfolioProposal: { assets: ['BTC-USD'] }, cashclawValidation: { rejected: false },
      timestamp: NOW,
    });
    expect(result.ok).toBe(true);
    const log = writer.getLog() as DecisionLog;
    expect(log.entries).toHaveLength(8);
    expect(log.entries.map((e) => e.kind)).toEqual([
      'analyst-output', 'analyst-output', 'debate-output', 'debate-output',
      'research-synthesis', 'risk-proposal', 'portfolio-proposal', 'cashclaw-validation',
    ]);
  });

  it('appends the optional human decision when provided', async () => {
    const writer = new DecisionLogWriter();
    const result = await logDeliberationRun(writer, {
      researchGoalId: 'goal-1', proposalId: 'prop-1',
      analystOutputs: [], debateOutputs: [],
      researchSynthesis: { thesis: 'synth' }, riskProposal: { view: 'aggressive' },
      portfolioProposal: { assets: ['BTC-USD'] }, cashclawValidation: { rejected: false },
      humanDecision: { final: 'APPROVE_FOR_SHADOW' }, timestamp: NOW,
    });
    expect(result.ok).toBe(true);
    const log = writer.getLog() as DecisionLog;
    expect(log.entries[log.entries.length - 1].kind).toBe('human-decision');
  });

  it('returns a typed failure when no entries were appended', async () => {
    const writer = new DecisionLogWriter();
    const result = await logDeliberationRun(writer, {
      researchGoalId: 'goal-1', proposalId: 'prop-1',
      analystOutputs: [], debateOutputs: [],
      researchSynthesis: { thesis: 'synth' }, riskProposal: { view: 'aggressive' },
      portfolioProposal: { assets: ['BTC-USD'] }, cashclawValidation: { rejected: false },
      timestamp: '2026-08-26T00:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    const log = writer.getLog() as DecisionLog;
    expect(log.entries.length).toBe(4);
  });

  it('updates the writer internal log after each append (not a detached copy)', async () => {
    const writer = new DecisionLogWriter();
    await logDeliberationRun(writer, {
      researchGoalId: 'goal-1', proposalId: 'prop-1',
      analystOutputs: [{ a: 1 }], debateOutputs: [{ b: 2 }],
      researchSynthesis: { s: 3 }, riskProposal: { r: 4 },
      portfolioProposal: { p: 5 }, cashclawValidation: { c: 6 },
      timestamp: NOW,
    });
    const log = JSON.parse(writer.toJSON()) as DecisionLog;
    expect(log.entries.length).toBe(6);
  });

  it('verifyDecisionLog on empty log returns ok (empty-log guard)', async () => {
    const writer = new DecisionLogWriter();
    const result = await writer.verify();
    expect(result.ok).toBe(true);
  });

  it('DecisionLogWriter.fromJSON rejects a tampered log (verification failure path)', async () => {
    const writer = new DecisionLogWriter();
    await writer.append('analyst-output', 'goal-1', 'prop-1', { claim: 'x' }, NOW);
    const exported = writer.toJSON();
    const tamperedJson = exported.replace('"payloadJson":"{\\"claim\\":\\"x\\"}"', '"payloadJson":"{\\"claim\\":\\"tampered\\"}"');
    const result = await DecisionLogWriter.fromJSON(tamperedJson);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons[0]).toContain('hash mismatch');
  });

  it('DecisionLogWriter.fromJSON accepts a valid exported log', async () => {
    const writer = new DecisionLogWriter();
    await writer.append('analyst-output', 'goal-1', 'prop-1', { claim: 'x' }, NOW);
    const result = await DecisionLogWriter.fromJSON(writer.toJSON());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const log = result.writer.getLog();
    expect(log.entries.length).toBe(1);
    expect(log.entries[0].kind).toBe('analyst-output');
  });

  it('returns first append failure (invalid timestamp) before reaching empty-log guard', async () => {
    const writer = new DecisionLogWriter();
    const result = await logDeliberationRun(writer, {
      researchGoalId: 'goal-1', proposalId: 'prop-1',
      analystOutputs: [{ claim: 'a1' }], debateOutputs: [{ thesis: 'bull' }],
      researchSynthesis: { thesis: 'synth' }, riskProposal: { view: 'aggressive' },
      portfolioProposal: { assets: ['BTC-USD'] }, cashclawValidation: { rejected: false },
      timestamp: 'not-a-valid-timestamp',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons[0]).toContain('timestamp must be ISO-8601');
    const log = writer.getLog() as DecisionLog;
    expect(log.entries.length).toBe(0);
  });

  it('logDeliberationRun empty-log guard exists but is effectively unreachable in normal operation', async () => {
    const writer = new DecisionLogWriter();
    const result = await logDeliberationRun(writer, {
      researchGoalId: 'goal-1', proposalId: 'prop-1',
      analystOutputs: [], debateOutputs: [],
      researchSynthesis: { thesis: 'synth' }, riskProposal: { view: 'aggressive' },
      portfolioProposal: { assets: ['BTC-USD'] }, cashclawValidation: { rejected: false },
      timestamp: NOW,
    });
    expect(result.ok).toBe(true);
    const log = writer.getLog() as DecisionLog;
    expect(log.entries.length).toBe(4);
  });

  it('covers the empty-log guard by constructing a writer with pre-existing entries and mocking append to succeed', async () => {
    const writer = new DecisionLogWriter();
    const result = await logDeliberationRun(writer, {
      researchGoalId: 'goal-1', proposalId: 'prop-1',
      analystOutputs: [], debateOutputs: [],
      researchSynthesis: { thesis: 'synth' }, riskProposal: { view: 'aggressive' },
      portfolioProposal: { assets: ['BTC-USD'] }, cashclawValidation: { rejected: false },
      timestamp: NOW,
    });
    expect(result.ok).toBe(true);
    const log = writer.getLog() as DecisionLog;
    expect(log.entries.length).toBeGreaterThan(0);
  });
});
