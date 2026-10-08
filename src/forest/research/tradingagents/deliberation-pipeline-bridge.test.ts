import { describe, it, expect } from 'vitest';
import { evaluateDebateHypotheses } from './deliberation-pipeline-bridge';
import type { DebateToHypothesisResult } from './debate-to-hypothesis-types';
import type { EvaluationReport as Report } from '@/forest/alpha/evaluation/report';
import { RegimeLabel } from '@/tree/regime/types';

describe('deliberation-pipeline-bridge', () => {
  const mockDebateResult = {
    hypotheses: [{}, {}],
    debateState: {
      proposalId: 'prop-101',
      researchGoalId: 'goal-101',
      status: 'complete',
      rounds: [{ round: 1, agentRole: 'bull', agentId: 'agent-1', content: 'bull' }],
    },
  } as unknown as DebateToHypothesisResult;

  function makeReport(overrides: Partial<Report> = {}): Report {
    const regimes: Report['byRegime'] = {
      [RegimeLabel.TREND_UP]: { numTrades: 30, netPnl: 600 },
      [RegimeLabel.TREND_DOWN]: { numTrades: 0, netPnl: 0 },
      [RegimeLabel.RANGE]: { numTrades: 20, netPnl: 400 },
      [RegimeLabel.HIGH_VOLATILITY]: { numTrades: 15, netPnl: 200 },
      [RegimeLabel.LOW_VOLATILITY]: { numTrades: 10, netPnl: 100 },
      [RegimeLabel.SHOCK]: { numTrades: 0, netPnl: 0 },
      [RegimeLabel.UNKNOWN]: { numTrades: 0, netPnl: 0 },
    };
    return {
      experimentId: 'exp-1',
      symbol: 'BTC/USDT',
      timeframe: '1h',
      regime: RegimeLabel.TREND_UP,
      totalReturn: 0.1,
      netPnl: 1000,
      cagr: 0.15,
      winRate: 0.55,
      lossRate: 0.45,
      profitFactor: 1.8,
      expectancy: 0.5,
      sharpe: 1.2,
      sortino: 1.5,
      maxDrawdown: 0.08,
      avgTrade: 10,
      medianTrade: 8,
      numTrades: 50,
      turnover: 100,
      fees: 50,
      slippage: 20,
      exposure: 0.8,
      recoveryFactor: 3,
      byRegime: regimes,
      byMonth: {},
      byVolBucket: {},
      byDuration: { short: {}, medium: {}, long: {} },
      ...overrides,
    };
  }

  it('evaluates reports and tallies promoted and killed hypotheses', () => {
    const passingReport = makeReport();
    const failingReport = makeReport({
      numTrades: 5,
      expectancy: -0.2,
      profitFactor: 0.5,
      maxDrawdown: 0.5,
      sharpe: -0.5,
      netPnl: -100,
    });

    const bridgeResult = evaluateDebateHypotheses(mockDebateResult, [passingReport, failingReport]);
    expect(bridgeResult.hypothesisCount).toBe(2);
    expect(bridgeResult.promotedToPaperCount).toBe(1);
    expect(bridgeResult.killedCount).toBe(1);
    expect(bridgeResult.feedbackOutcomes).toHaveLength(2);
    expect(bridgeResult.feedbackOutcomes[0].updatedStatus).toBe('PROMOTED_TO_PAPER');
    expect(bridgeResult.feedbackOutcomes[1].updatedStatus).toBe('FALSIFIED_KILLED');
  });
});
