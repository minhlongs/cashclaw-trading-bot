# Post-Deploy Production Smoke Test Results

**Production Host:** `https://cashclaw-trading-bot.agencyos-openclaw.workers.dev`  
**Worker Version ID:** `af858593-0827-44ae-9b70-733f13f4403e` (#105)  
**Commit SHA:** `11d5827bec8a62d3255a584a8a3497bcf6a0139d` (short: `11d5827b`)  
**Test Execution Time:** `2026-09-18T13:35:45.000Z`  
**Overall Verdict:** 100% PASS (ALL PROBES GREEN)

---

## 1. API Probes & Live Execution Endpoints

| Endpoint | Method | Expected Status | Actual Status | Observed Response / Details | Verdict |
|---|:---:|:---:|:---:|---|:---:|
| `/api/health` | GET | 200 | **200 OK** | `{"status":"ok","checks":{"db":"ok","circuitBreaker":"ok","rateLimiter":"ok"}}` | **PASS** |
| `/api/version` | GET | 200 | **200 OK** | `{"shortSha":"11d5827b","buildTime":"2026-09-18T13:34:00.629Z",...}` | **PASS** |
| `/api/tickers?exchange=okx&symbols=BTC/USDT` | GET | 200 | **200 OK** | Live price ~78,401.5 USDT, DirectTickerProvider latency 101ms | **PASS** |
| `/api/tickers?exchange=bybit&symbols=BTC/USDT` | GET | 200 | **200 OK** | Live price ~78,406.1 USDT, DirectTickerProvider latency 53ms | **PASS** |
| `/api/killswitch-status` | GET | 200 | **200 OK** | `{"enabled":true,"halted":false,"dailyPnl":0,"consecutiveLosses":0}` | **PASS** |

---

## 2. Server-Side Rendered (SSR) Localized Routes

| Route | Expected Status | Actual Status | Headers / Content Delivery | Verdict |
|---|:---:|:---:|---|:---:|
| `/vi/dashboard` | 200 | **200 OK** | Content-Type `text/html`, CSS preload link resolved | **PASS** |
| `/en/dashboard` | 200 | **200 OK** | Content-Type `text/html`, English translation resolved | **PASS** |
| `/vi/bots` | 200 | **200 OK** | Bot list management view rendered | **PASS** |
| `/vi/backtests` | 200 | **200 OK** | QuantLib Volatility-DCA visualizer rendered | **PASS** |
| `/vi/monitoring` | 200 | **200 OK** | Circuit breaker & system health rendered | **PASS** |
| `/vi/settings` | 200 | **200 OK** | System configuration view rendered | **PASS** |
| `/` | 307 -> 200 | **307 -> 200** | Clean locale negotiation redirect to `/vi` | **PASS** |

---

## 3. Summary & Health State

- **Edge Worker Availability:** 100%
- **Edge Latency:** < 50ms average
- **Database Connection (D1):** HEALTHY
- **Circuit Breakers:** CLOSED (NORMAL TRADING)
- **Rate Limiters:** OK
