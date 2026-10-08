# Technical Specification: Unified v10 Quantitative Architecture & Operations Triad

## 1. Pillar 1: Cartea-Jaimungal (2014) Alpha-Informed Market Making Desk
Path: `src/tree/quantlib/marketmaking/cartea-jaimungal-engine.ts`, `cartea-jaimungal-types.ts`

### Mathematical Model
In the Cartea-Jaimungal (2014) formulation, the mid-price follows an arithmetic Brownian motion with short-term drift $\alpha_t$:
$$dS_t = \alpha_t dt + \sigma dW_t$$

The optimal quote depths $\delta^{b*}(q, \alpha)$ and $\delta^{a*}(q, \alpha)$ relative to mid-price $S_t$ for inventory $q$ and drift $\alpha$ are given by:
$$\delta^{b*}(q, \alpha) = \frac{1}{\gamma} \ln\left(1 + \frac{\gamma}{\kappa}\right) + \frac{2q + 1}{2} \sqrt{\frac{\gamma \sigma^2}{2 \kappa A} \left(1 + \frac{\gamma}{\kappa}\right)^{\frac{\kappa}{\gamma} + 1}} - \frac{\alpha}{\kappa}$$
$$\delta^{a*}(q, \alpha) = \frac{1}{\gamma} \ln\left(1 + \frac{\gamma}{\kappa}\right) - \frac{2q - 1}{2} \sqrt{\frac{\gamma \sigma^2}{2 \kappa A} \left(1 + \frac{\gamma}{\kappa}\right)^{\frac{\kappa}{\gamma} + 1}} + \frac{\alpha}{\kappa}$$

Where:
- $\gamma > 0$: Inventory risk aversion parameter.
- $\kappa > 0$: Order execution intensity decay exponent ($\lambda(\delta) = A e^{-\kappa \delta}$).
- $A > 0$: Baseline order arrival intensity parameter.
- $\sigma > 0$: Asset return volatility.
- $\alpha \in \mathbb{R}$: Short-term alpha drift (in price units/second).

When $\alpha > 0$ (bullish drift):
- Bid spread narrows ($\delta^b$ decreases) to capture buying opportunities.
- Ask spread widens ($\delta^a$ increases) to avoid adverse selection from buyer sweeps.

---

## 2. Pillar 2: Multi-Venue Perpetual Funding Basis Arbitrage Engine
Path: `src/tree/quantlib/arbitrage/funding-basis-engine.ts`, `funding-basis-types.ts`

### Mathematical Model
Given $M$ exchanges offering perpetual futures contracts on the same underlying asset:
$$\text{Yield}_{i, j} = \left(\text{FundingRate}_i - \text{FundingRate}_j\right) \times \left(\frac{24}{H}\right) \times 365$$
Where $H$ is the funding period in hours (typically 8h or 1h).

Net annual yield accounting for execution taker fees and maintenance margin requirements:
$$\text{NetYield}_{i, j} = \text{Yield}_{i, j} - \frac{2 \times (\text{TakerFee}_i + \text{TakerFee}_j)}{\text{HoldingDays} / 365} - \text{BorrowCost}$$

Liquidation distance metric:
$$D_{\text{liq}} = \min\left(\frac{P_{\text{entry}, i} - P_{\text{liq}, i}}{P_{\text{entry}, i}}, \frac{P_{\text{liq}, j} - P_{\text{entry}, j}}{P_{\text{entry}, j}}\right)$$

---

## 3. Pillar 3: RFQ Dark Mesh & Fair-Share Liquidity Aggregator
Path: `src/tree/execution/darkmesh/rfq-darkmesh-router.ts`, `rfq-darkmesh-types.ts`

### Architectural Mechanics
1. **Request-For-Quote (RFQ) Aggregation**: Internal bots publish signed RFQs with `[symbol, side, quantity, maxSlippageBps]`.
2. **Pro-Rata Fair Share Matching**: Opposing liquidity is netted at mid-price. If total demand exceeds opposing supply, allocations are distributed proportionally to requested quantity:
   $$Q_k^{\text{fill}} = Q^{\text{opposing\_total}} \times \frac{Q_k^{\text{requested}}}{\sum_m Q_m^{\text{requested}}}$$
3. **Zero-Fee Settlement**: Matches settle internally at zero taker fee with exact quantity conservation.
