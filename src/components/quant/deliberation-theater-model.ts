// Pure domain model for DeliberationTheater (TradingAgents multi-agent transcript)
// Extracted to keep UI components focused and <= 135 LOC.

export type DebateStage = 'BULL_VS_BEAR' | 'RISK_AUDIT';

export interface DebateTurn {
  readonly turnId: string;
  readonly agent: 'BULL_RESEARCHER' | 'BEAR_RESEARCHER' | 'RISK_MANAGER' | 'PORTFOLIO_ADVISOR';
  readonly stage: DebateStage;
  readonly modelTier: string;
  readonly confidence: number;
  readonly claim: string;
  readonly prevHash: string;
  readonly entryHash: string;
}

export const DEBATE_LOG: readonly DebateTurn[] = [
  {
    turnId: 'TURN-01',
    agent: 'BULL_RESEARCHER',
    stage: 'BULL_VS_BEAR',
    modelTier: 'REASONING • claude-3-7-sonnet',
    confidence: 0.78,
    claim: 'Cross-sectional momentum shows +1.92 OOS Sharpe during LOW_VOL_TREND windows with positive funding carry.',
    prevHash: '0000000000000000',
    entryHash: '9a4f82e1c307b512',
  },
  {
    turnId: 'TURN-02',
    agent: 'BEAR_RESEARCHER',
    stage: 'BULL_VS_BEAR',
    modelTier: 'REASONING • deepseek-r1',
    confidence: 0.84,
    claim: 'Under EXTREME (35 bps) slippage in HIGH_VOL_CHOP, net Sharpe degrades to -0.12 and violates max drawdown cap.',
    prevHash: '9a4f82e1c307b512',
    entryHash: '4d2e99a0f813c674',
  },
  {
    turnId: 'TURN-03',
    agent: 'RISK_MANAGER',
    stage: 'RISK_AUDIT',
    modelTier: 'FAST • gpt-4o-mini',
    confidence: 0.91,
    claim: 'Enforcing Half-Kelly cap (0.25x) and Liquidity Crisis circuit breaker; live order surface remains strictly disabled.',
    prevHash: '4d2e99a0f813c674',
    entryHash: 'e71b30c5a928d409',
  },
];
