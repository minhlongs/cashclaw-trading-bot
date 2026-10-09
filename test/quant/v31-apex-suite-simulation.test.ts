import { describe, it, expect } from 'vitest';
import { computeKyleDuttaMadhavanExecution } from '@/tree/quantlib/execution/kyle-dutta-madhavan-engine';
import { computeBgtAsymmetricBook } from '@/tree/quantlib/microstructure/bgt-asymmetric-book-engine';
import { Parser } from '@/tree/research/alpha/zoo/operator-parser-core';
import { tokenize } from '@/tree/research/alpha/zoo/operator-tokenizer';

describe('Triad v31 Apex Suite Cross-Domain Simulation & Architecture E2E', () => {
  it('orchestrates multi-dealer execution alongside asymmetric limit order book and modular parser', () => {
    // 1. Kyle-Dutta-Madhavan (1995) Multi-Dealer Dynamic Execution
    const execution = computeKyleDuttaMadhavanExecution({
      totalShares: 10_000,
      timeHorizon: 1.0,
      numSteps: 4,
      numDealers: 3,
      dealerRiskAversion: 0.1,
      adverseSelectionBase: 0.04,
      traderRiskAversion: 0.01,
      impactParam: 0.02,
    });
    expect(execution.terminalShares).toBe(0);
    expect(execution.trajectory.length).toBe(4);
    expect(execution.expectedCost).toBeGreaterThan(0);
    expect(execution.costSavings).toBeGreaterThanOrEqual(0);

    // 2. Boehmer-Grammig-Theissen (2007) Microstructure Asymmetric Book
    const firstTradeSize = execution.trajectory[0].tradeSize;
    const microstructure = computeBgtAsymmetricBook({
      bidVolume: 1000,
      askVolume: 400,
      ofi: firstTradeSize,
      imbalanceCoeff: 0.05,
      depthRatioCoeff: 0.02,
      ofiCoeff: 0.001,
      baseInformedLogit: -1.2,
      sensitivityInformed: 1.8,
    });
    expect(microstructure.bookState).toBe('BUY_PRESSURE');
    expect(microstructure.queueImbalance).toBeGreaterThan(0.15);
    expect(microstructure.expectedPriceChange).toBeGreaterThan(0);
    expect(microstructure.informedTradingProbability).toBeGreaterThan(0);

    // 3. Modular Alpha Zoo Operator Parser (< 45 LOC modules)
    const tokens = tokenize('rank(close)');
    const parser = new Parser(tokens);
    const ast = parser.parseExpression(0);
    expect(ast.kind).toBe('call');
    if (ast.kind === 'call') {
      expect(ast.name).toBe('rank');
      expect(ast.args.length).toBe(1);
    }

    const tsTokens = tokenize('ts_rank(close, 10)');
    const tsParser = new Parser(tsTokens);
    const tsAst = tsParser.parseExpression(0);
    expect(tsAst.kind).toBe('call');
    if (tsAst.kind === 'call') {
      expect(tsAst.name).toBe('ts_rank');
      expect(tsAst.args.length).toBe(2);
    }
  });
});
