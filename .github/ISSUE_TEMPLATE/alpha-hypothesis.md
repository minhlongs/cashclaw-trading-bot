---
name: Quantitative Alpha Hypothesis / Factor Proposal
about: Propose a new causal Alpha Zoo factor or microstructure estimator for the Apache-2.0 core
title: '[ALPHA] '
labels: ['alpha-zoo', 'quant-research']
---

## 1. Economic Mechanism & Academic Reference

<!-- Explain why this inefficiency exists and cite the paper or market microstructure mechanism -->

## 2. Formula / Operator Expression

```text
# Example: rank(ts_delta(close, 5)) / ts_std(returns, 20)
```

## 3. Causality & Anti-Lookahead Check (`ADR-001`)

- [ ] Uses only historical bars up to index `t` (`causal: true`)
- [ ] Survives realistic Maker/Taker fee bps and L2 slippage simulation
- [ ] Expected failure regime documented (e.g., low-liquidity chop, funding squeeze)
