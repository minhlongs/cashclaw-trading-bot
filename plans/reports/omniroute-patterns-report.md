# OmniRoute → Trade-Bot Patterns Mapping Report

> **Date:** 2026-08-15  
> **Source:** [OmniRoute](https://github.com/diegosouzapw/OmniRoute) (47k+ stars, AI Gateway)  
> **Target:** CashClaw AI Trading Bot Platform  

---

## 1. Pattern Applicability Matrix

| # | OmniRoute Pattern | Applicability | Trade-Bot Equivalent | Gap |
|---|---|---|---|---|
| 1 | **Combo Routing Engine** (multi-provider fallback) | 🔴 **Critical** | No cross-exchange routing — each bot binds to 1 exchange | Each bot is exchange-locked. No failover if Binance goes down. |
| 2 | **19 Routing Strategies** (weighted, p2c, least-used, cost-optimized) | 🟡 **High** | StrategyChain exists but only for strategy composition, not exchange routing | StrategyChain = signal composition. Exchange routing = order routing. Different concerns. |
| 3 | **Provider Abstraction** (unified interface for 330+ providers) | 🟢 **Partial** | `ExchangeAdapter` interface + `ExchangeProvider` wrapper | Already 80% there. Need to extend for multi-exchange orchestration. |
| 4 | **Circuit Breaker** (triple-state FSM) | 🟢 **Exists** | `CircuitBreaker` + `Killswitch` already implemented | Trade-bot has BOTH provider-level breaker AND global killswitch. More than OmniRoute. |
| 5 | **Rate Limiting** (token-bucket, fair-share) | 🟢 **Exists** | `RateLimiter` token-bucket per exchange+endpoint | Already implemented with exponential backoff + fair-share. |
| 6 | **Quota-Aware Scheduling** | 🟡 **High** | No exchange rate-limit awareness | Binance: 1200 req/min. Bybit: 120 req/s. OKX: 60 req/2s. No tracking. |
| 7 | **Dashboard & Observability** (35+ pages) | 🟡 **High** | Basic dashboard (KPIs, bot cards, events) | Missing: per-exchange latency, cost tracking, order success rate, rate-limit consumption. |
| 8 | **Compression** (RTK + Caveman) | 🔴 **N/A** | N/A for trading | Token compression irrelevant. Market data compression could help but YAGNI. |
| 9 | **Request Queue** (admission cap, fail-open) | 🟡 **High** | No request queuing — orders go direct | Under high volatility, order flooding could hit rate limits. Queue would help. |
| 10 | **Activity Feed** (day grouping, event filtering) | 🟢 **Partial** | `FlightRecorder` + `trade_events` table | D1 event persistence exists. UI filtering/grouping missing. |
| 11 | **Auto-Combo** (zero-config best-provider selection) | 🟡 **High** | No auto-exchange selection | User picks exchange manually. Auto-routing to best-latency exchange = huge UX win. |
| 12 | **Exponential Backoff + Decay** | 🟢 **Exists** | RateLimiter has exponential backoff | Already implemented. Decay on success partially there. |

---

## 2. Priority Mapping

### Quick Wins (1-2 days each)

| Priority | Pattern | Effort | Impact | Description |
|---|---|---|---|---|
| **P0** | Exchange Health Dashboard | 1 day | High | Add per-exchange latency, success rate, rate-limit consumption to dashboard. Already have `ProviderHealth` data — just expose it. |
| **P0** | Rate-Limit Awareness in Scheduler | 1 day | High | Track per-exchange API call counts in `BotScheduler.tick()`. Skip bots on exchanges near rate limits. |
| **P1** | Order Queue with Admission Cap | 1-2 days | High | Port OmniRoute's `maxQueueDepth` concept. Prevent order flooding during volatility spikes. |
| **P1** | Activity Feed UI Enhancement | 1 day | Medium | Add day grouping + event type filtering to existing `trade_events` data. |

### Strategic Investments (1-2 weeks each)

| Priority | Pattern | Effort | Impact | Description |
|---|---|---|---|---|
| **P2** | Cross-Exchange Routing | 1-2 weeks | Critical | Extend `ExchangeOrchestrator` to route orders across exchanges based on latency + availability. OmniRoute's core innovation. |
| **P2** | Auto-Exchange Selection | 1 week | High | Like OmniRoute's `auto` model — pick best exchange for each trade based on live latency + rate limits + balance. |
| **P3** | Multi-Exchange Failover | 1 week | High | If primary exchange circuit-opens, auto-route to secondary. Currently bot just stops. |
| **P3** | Cost-Optimized Routing | 1 week | Medium | Route to exchange with lowest fees for each pair. Binance 0.1%, Bybit 0.1%, OKX 0.08%. |

---

## 3. Architecture Gaps

### What Trade-Bot is MISSING that OmniRoute does well:

**A. Multi-Target Routing**
```
// CURRENT: Bot → 1 Exchange
BotInstance → ExchangeAdapter → Binance

// NEEDED: Bot → Router → Best Exchange
BotInstance → ExchangeRouter → [Binance, Bybit, OKX]
                                ↑ health + latency + rate-limit scoring
```

**B. Exchange Health Scoring**
```
// CURRENT: Binary (circuit open/closed)
ProviderState: 'healthy' | 'degraded' | 'circuit_open' | 'cooldown'

// NEEDED: Continuous scoring (like OmniRoute's 12-factor)
ExchangeScore = f(latency, successRate, rateLimitHeadroom, balance, fee)
```

**C. Request Queue**
```
// CURRENT: Direct execution
placeOrder() → exchange API (may hit rate limit)

// NEEDED: Queued execution
placeOrder() → Queue → rateLimit.tryAcquire() → exchange API
                      ↓ queue full → reject with typed error
```

**D. Exchange-Level Cost Tracking**
```
// CURRENT: No fee tracking per exchange
// NEEDED: Track fees, slippage, fill rate per exchange
//         to enable cost-optimized routing
```

### What Trade-Bot does BETTER than OmniRoute:

- **Killswitch**: Trade-bot has a global safety mechanism (daily loss %, consecutive losses, drawdown) that OmniRoute doesn't need (it's not handling money)
- **Paper Mode**: `PaperExchange` simulation for safe testing — OmniRoute can't simulate AI providers
- **StrategyChain**: Composable strategy nodes with fallback — more sophisticated than OmniRoute's routing strategies (which are for provider selection, not signal generation)

---

## 4. Concrete Recommendations

### Recommendation 1: Exchange Router (Pattern: Combo Routing)

Create `ExchangeRouter` that sits between `BotInstance` and `ExchangeOrchestrator`:

```typescript
// NEW: src/tree/exchange/exchange-router.ts
interface ExchangeRouter {
  routeOrder(request: OrderRequest): Promise<{ exchange: ExchangeId; result: OrderResult }>;
  getScore(exchange: ExchangeId): ExchangeScore;
  getBestExchange(symbol: string, side: Side): ExchangeId;
}

interface ExchangeScore {
  exchange: ExchangeId;
  latency: number;        // ms
  successRate: number;    // 0-1
  rateLimitHeadroom: number; // 0-1 (1 = plenty of room)
  balance: number;        // available balance in quote currency
  fee: number;            // taker fee %
  composite: number;      // weighted score
}
```

**Trade-off:** Adds latency (~1-2ms scoring). For HFT this matters. For 1-minute grid trading, irrelevant.

### Recommendation 2: Request Queue (Pattern: Request Queue)

```typescript
// NEW: src/tree/exchange/request-queue.ts
interface RequestQueue {
  enqueue(request: OrderRequest): Promise<OrderResult>;
  getDepth(exchange: ExchangeId): number;
  getWaitTime(exchange: ExchangeId): number;
}
```

**Trade-off:** Adds latency for queued orders. But prevents rate-limit rejections which cost MORE time (exponential backoff).

### Recommendation 3: Enhanced Dashboard (Pattern: Dashboard & Observability)

Add to existing dashboard:
- Per-exchange health cards (latency, success rate, rate-limit usage)
- Order routing visualization (which exchange handled which order)
- Cost comparison across exchanges
- Rate-limit consumption gauges

**Trade-off:** UI work only. No backend risk.

### Recommendation 4: Auto-Exchange Selection (Pattern: Auto-Combo)

```typescript
// Like OmniRoute's `auto` — pick best exchange automatically
// User sets: exchange = 'auto'
// System picks: best exchange based on:
//   1. Available balance for the pair
//   2. Current latency
//   3. Rate limit headroom
//   4. Fee rate
```

**Trade-off:** User loses explicit exchange control. Need override option.

---

## 5. Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| **Multi-exchange order splitting** — partial fills across exchanges | 🔴 High | Never split a single order across exchanges. Route entire order to one exchange. |
| **Stale health data** — routing based on outdated latency | 🟡 Medium | Use exponential moving average, not last sample. Refresh every 30s. |
| **Rate-limit race condition** — multiple bots hit same exchange | 🟡 Medium | Global `RateLimiter` singleton already exists. Add exchange-level admission control. |
| **Complexity creep** — too many routing options | 🟡 Medium | Start with 3 strategies only: `latency`, `balance`, `auto`. Add more later. |
| **Paper/live divergence** — routing logic differs between modes | 🟢 Low | Paper mode should simulate routing too. `PaperExchangeRouter` mirrors real logic. |

---

## 6. Phased Adoption Roadmap

### Phase 1: Observe (Week 1-2)
- [ ] Add per-exchange health metrics to dashboard
- [ ] Track rate-limit consumption in `BotScheduler`
- [ ] Log order routing decisions (which exchange, why)
- [ ] Add exchange latency tracking to `TelemetryWriter`
- **Goal:** See which exchanges are actually bottlenecking

### Phase 2: Queue (Week 3-4)
- [ ] Implement `RequestQueue` with `maxQueueDepth`
- [ ] Add order admission control per exchange
- [ ] Expose queue depth + wait time in dashboard
- [ ] Add typed error codes (like OmniRoute's `RATE_LIMIT_EXECUTION_TIMEOUT`)
- **Goal:** Prevent order flooding, graceful degradation under load

### Phase 3: Route (Week 5-8)
- [ ] Implement `ExchangeRouter` with 3 strategies: `latency`, `balance`, `auto`
- [ ] Add `ExchangeScore` continuous scoring
- [ ] Wire `ExchangeRouter` into `BotInstance.tick()`
- [ ] Add exchange failover (primary → secondary on circuit-open)
- [ ] Auto-exchange selection for new bots
- **Goal:** Orders automatically go to the best available exchange

### Phase 4: Optimize (Week 9-12)
- [ ] Cost-optimized routing (lowest fees per pair)
- [ ] Cross-exchange arbitrage detection (price diff > threshold → opportunity)
- [ ] Advanced dashboard: routing visualization, cost comparison
- [ ] A/B testing framework for routing strategies
- **Goal:** Maximize execution quality across all exchanges

---

## 7. Key Insight

OmniRoute's **core innovation** is treating multiple providers as a single unreliable resource and routing around failures automatically. Trade-bot faces the **exact same problem** with exchanges — but hasn't built the routing layer yet.

The existing `ExchangeOrchestrator` is a **guard** (rejects bad orders), not a **router** (picks best exchange). The missing piece is the scoring + routing logic that makes OmniRoute's `auto` model work.

**Bottom line:** Trade-bot has 70% of OmniRoute's infrastructure (circuit breaker, rate limiter, health tracking, provider abstraction). The 30% it's missing — **cross-exchange routing with live scoring** — is the highest-impact feature to implement next.
