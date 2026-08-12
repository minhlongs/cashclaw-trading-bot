---
phase: 2
title: "Exchange Integration — API + WS"
status: pending
priority: P1
effort: 2d
dependencies: [phase-01]
---

# Phase 2: Exchange Integration

## Overview
Connect Binance/Bybit/OKX via CCXT. REST for order placement, WebSocket for price feeds. Paper trading uses testnet endpoints exclusively.

## Requirements
- Functional: Unified exchange client (CCXT), WS price feed with auto-reconnect, testnet/live toggle, rate limiter, credential encryption.
- Non-functional: WS reconnect < 3s, API call latency < 500ms (p95), zero rate-limit violations.

## Architecture
```
src/lib/exchange/
  client.ts              # CCXT unified client wrapper
  rate-limiter.ts        # Per-exchange request throttle
  ws/
    manager.ts           # WebSocket connection manager (1 WS per exchange)
    binance.ts           # Binance combined stream handler
    bybit.ts             # Bybit stream handler
    okx.ts               # OKX stream handler
  types.ts               # Exchange-specific types

src/lib/exchange/adapters/
  paper.ts               # Paper trading adapter (no real orders)
  live.ts                # Live trading adapter (real orders)

src/tree/exchange/
  price-feed.ts          # Normalized price stream (OHLCV candles)
  order-executor.ts      # Order placement + tracking
  position.ts            # Position tracking
```

## Implementation Steps
1. Install `ccxt` + `ccxt-pro` (WS support).
2. Build `ExchangeClient` wrapper: unified REST calls, error handling, retry logic (max 3 retries, exponential backoff).
3. Build WS manager: 1 connection per exchange, auto-reconnect with jitter, health ping every 30s.
4. Binance: use combined stream (`/ws/btcusdc@trade/ethusdc@trade/...`) to stay within 6-WS limit.
5. Paper adapter: intercept order calls, simulate fill at next tick price, log to D1 trades table.
6. Live adapter: pass through to exchange REST API, track order status via WS.
7. Rate limiter: token bucket per exchange (Binance 1200/min, Bybit/OKX 20/s).
8. Credential encryption: use Web Crypto API (AES-GCM) for api_key + api_secret storage.

## CCXT Integration
```typescript
import ccxt from 'ccxt';

const exchanges = {
  binance: new ccxt.binance({ sandbox: true }),
  bybit: new ccxt.bybit({ sandbox: true }),
  okx: new ccxt.okx({ sandbox: true }),
};

// Normalized ticker
const ticker = await exchanges['binance'].fetchTicker('BTC/USDT');
// → { symbol, last, bid, ask, timestamp, ... }
```

## Success Criteria
- [ ] WS connects + receives price updates for BTC, ETH, SOL on all 3 exchanges
- [ ] Paper adapter logs 10 simulated trades to D1 without real orders
- [ ] Rate limiter prevents >1200 req/min on Binance
- [ ] WS auto-reconnects within 3s after simulated disconnect
- [ ] Credentials encrypted in D1, decrypted only at runtime

## Risk Assessment
- **Risk:** CCXT Pro WS has known bugs with Binance combined streams. **Mitigation:** Test with `ccxt` v4.x latest, fallback to raw WS if needed.
- **Risk:** Testnet endpoints can be unreliable (Binance testnet resets weekly). **Mitigation:** Design for graceful degradation, log all testnet failures.
- **Risk:** API key encryption key management. **Mitigation:** Generate per-deployment key from `wrangler secret`, never in code.
