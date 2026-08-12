# OmniRoute — Essence Extract for CashClaw Trade Bot

Source: https://github.com/diegosouzapw/OmniRoute

## 1. Stateless Proxy Pattern
- Single OpenAI-compatible endpoint fans out to many upstream providers.
- For Workers: implement a thin `ExchangeProxy` layer that normalises Binance / Bybit / OKX behind one `src/tree/exchange/types.ts` adapter surface.
- Benefits: one handler, one auth path, one retry surface.

## 2. Combos / Chaining
- A “combo” is a chain of models with automatic fallback on quota / failure.
- Mapping to bot strategy: a `StrategyChain` (Grid → MeanReversion → DCA) where each leg declares its own preconditions and the orchestrator slides to the next on stop-loss or Throw.
- Keep chains declarative: array of `{strategy, when, fallback}`.

## 3. Provider Abstraction
- Providers are connections with credentials, key pools, and health state.
- For trade-bot: wrap `ExchangeAdapter` in a `Provider` that owns rate-limit tokens, cooldown state, and health score.
- Decouple credentials (Paper vs Live) from the adapter itself — same adapter, two providers.

## 4. Resilience Layers
Three tiers learnable here:
1. **Circuit breaker per provider** — open after N consecutive failures / latency threshold.
2. **Per-key cooldown with exponential backoff** — avoid hammering a single key; shared `rateLimiter` already exists but lacks backoff.
3. **Global lockout** — after killswitch trips, prevent requeue for cooldown window.

Currently trade-bot has only (1) in `killswitch.ts` and a token-bucket in `rate-limiter/`. Backoff and circuit breaker are the biggest gaps.

## 5. Fair-Share Quota
- OmniRoute distributes requests across key pools by quota, not just round-robin.
- Apply to exchange API budget: each Paper/Live adapter has a `budget: { reqPerMin, reqPerHour }`; scheduler picks the healthiest adapter under budget.

## 6. MCP / A2A for Agent-to-Agent
- OmniRoute exposes `/api/mcp/stream` and `/.well-known/agent.json`.
- For CashClaw: a minimal `/.well-known/agent.json` metadata doc lets external dashboards discover the bot’s running strategies and health without coupling.

## Mapping to existing trade-bot layers
| OmniRoute concept | Existing trade-bot piece | Gap |
|---|---|---|
| Stateless proxy | `ExchangeOrchestrator` | Hardcodes `PaperExchange`, no live path |
| Provider | `ExchangeAdapter` + `rateLimiter` | No health scores, no backoff |
| Combo / chain | `BotInstance.strategy` | No composable chain, single strategy only |
| Circuit breaker | `Killswitch` | Reactive only, no per-provider breaker |
| Fair-share quota | `rateLimiter` | No budget / health weighting |

## Constraints for v1 (Paper-mode)
Do not introduce live-trading dependencies. Implement:
- Provider wrapper around `PaperExchange`.
- StrategyChain as a documented interface (implementation can be grid + mean-reversion only).
- Circuit-breaker decorator around adapter calls.
- `/.well-known/agent.json` static file.

Defer: actual CCXT live adapter until separate milestone.
