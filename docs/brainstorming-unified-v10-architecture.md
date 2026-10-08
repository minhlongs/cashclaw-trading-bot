# Brainstorming Report: Unified v10 Quantitative Architecture & Operations Triad

## 1. Problem Statement & Requirements
Following the successful deployment of the v9 Quantitative Suite, the fleet requires higher alpha resilience against informed directional sweeps, stable market-neutral yield extraction, and zero-slippage liquidity coordination:
1. **Adverse Selection in L2 Market Making**: Standard inventory models (Avellaneda-Stoikov, Guéant-Tapia-Manziadi) quote symmetrically around reservation prices without accounting for short-term directional alpha signals ($\alpha(t)$), leaving quotes vulnerable to toxic sweeps.
2. **Volatile Yield Generation**: Strategies relying strictly on directional bets or inventory spread capture experience drawdown during prolonged chop or extreme volatility regimes.
3. **Execution Drag & Fee Overhead**: High-frequency order routing across disparate venues incurs exchange taker fees (2-5 bps) and market impact.

## 2. Evaluated Approaches & Trade-Offs

### Pillar 1: Cartea-Jaimungal (2014) Alpha-Informed Market Making
- **Pros**: Integrates short-term price drift $\alpha(t)$ directly into the Hamilton-Jacobi-Bellman (HJB) value function, adjusting bid and ask spreads asymmetrically to dodge adverse sweeps while aggressively capturing flow when alpha aligns.
- **Cons**: Requires reliable calculation of instantaneous alpha drift (e.g., from OFI or micro-price momentum) without introducing lookahead bias.
- **Decision**: Adopt closed-form Cartea-Jaimungal solution with configurable alpha decay and bounded inventory penalties.

### Pillar 2: Multi-Venue Perpetual Funding Rate Basis Arbitrage
- **Pros**: Yield is market-neutral ($S_{\text{long}} + F_{\text{short}}$) and harvested directly from perpetual funding rate settlements across Binance, OKX, Bybit, and Deribit.
- **Cons**: Requires margin monitoring, borrow fee modeling, and synchronization across funding intervals (8h vs 1h).
- **Decision**: Implement a pure mathematical `FundingBasisEngine` calculating annualized net yield, liquidation risk buffers, and optimal rebalancing thresholds.

### Pillar 3: RFQ Dark Mesh & Fair-Share Liquidity Aggregator
- **Pros**: Generalizes the internal crossing network into a multi-tier Request-For-Quote (RFQ) dark mesh, matching internal fleet orders and synthetic liquidity with pro-rata fair share distribution.
- **Cons**: Requires deterministic matching without starvation of smaller bots.
- **Decision**: Implement `RfqDarkMeshRouter` maintaining strict volume conservation, price-time priority, and proportional allocation.

## 3. Recommended Unified v10 Architecture

```
                    ┌──────────────────────────────────────────────┐
                    │      Trading Cockpit & Fleet HUD (v10)       │
                    └──────────────────────┬───────────────────────┘
                                           │
         ┌─────────────────────────────────┼────────────────────────────────┐
         ▼                                 ▼                                ▼
┌─────────────────┐             ┌─────────────────────┐          ┌────────────────────┐
│ Cartea-Jaimungal│             │ Multi-Venue Funding │          │ RFQ Dark Mesh      │
│ Alpha-Informed  │             │ Basis Arb Engine    │          │ P2P Liquidity Pool │
│ Market Making   │             │ (Delta-Neutral)     │          │ (Zero Taker Fee)   │
└────────┬────────┘             └──────────┬──────────┘          └─────────┬──────────┘
         │                                 │                               │
         └─────────────────────────────────┼───────────────────────────────┘
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │  v10 Unified E2E Cross-Stack Simulation     │
                    └──────────────────────────────────────────────┘
```

## 4. Key Invariants & Success Metrics
- **Strict ADR-001 Paper Invariant**: 100% paper/backtest only, zero live capital risk.
- **Code Standards**: Max 200 lines per file (target $\le 130$ LOC), 0 `:any`, 0 `console.log`.
- **Test Coverage**: 100% unit test coverage on all mathematical and routing engines.
- **Zero Lint Warnings**: Full TypeScript compile with zero suppressions.
