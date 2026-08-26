# Vibe-Trading Security Boundary

**Status:** Phase 0 — Recon Complete
**Date:** 2026-08-26
**Classification:** Security Architecture Document

---

## Absolute Safety Boundary (Non-Negotiable)

This integration is **RESEARCH-FIRST**. The following are hard constraints that CANNOT be violated:

| Constraint | Enforcement |
|------------|-------------|
| **NO autonomous real-money execution** | Promotion state machine: automated ceiling = `SHADOW`; `LIVE` only via `manual_approval` trigger |
| **NO LLM placing orders** | No code path from LLM → order; `AlphaExecutionEngine` only accepts `AlphaSignal` from validated pipeline |
| **NO swarm agent bypassing risk engine** | All research worker output → `AlphaCompiler` validation → CashClaw pipeline |
| **NO swarm agent bypassing cost model** | Every experiment spec requires `costMode`; `applyCosts()` applied in pipeline |
| **NO swarm agent bypassing causal feature validation** | `declareFeature()` gate rejects non-causal at compile time |
| **NO swarm agent bypassing OOS validation** | Pipeline enforces train/validate/test + walk-forward |
| **NO swarm agent bypassing promotion gates** | `transitionStrategy()` throws on invalid transitions |
| **NO swarm agent bypassing kill switch** | `KILLED` is terminal; no trigger moves out of it |
| **NO swarm agent bypassing human approval** | `MANUAL_APPROVAL` → `LIVE` requires explicit human trigger |
| **NO research component modifying historical experiment results** | `ResearchRegistry` is append-only; `ResearchEntry` fields are `readonly` |
| **NO research component modifying promotion thresholds** | Thresholds are compile-time constants in `promotion-states.ts` |
| **NO research component promoting itself** | No code path from research → `manual_approval(approved: true)` |

**FAIL CLOSED:** Any violation attempt throws or returns null — never degrades to permissive behavior.

---

## Trust Boundaries

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CASHCLAW TRUSTED ZONE                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Alpha       │  │  Cost        │  │  Risk        │  │  Promotion   │   │
│  │  Compiler    │  │  Model       │  │  Engine      │  │  State       │   │
│  │  (causal     │  │  (stress     │  │  (position   │  │  Machine     │   │
│  │   gate)      │  │   modes)     │  │   sizing,    │  │  (enforced   │   │
│  └──────┬───────┘  └──────┬───────┘  │   drawdown)  │  │   transitions)│   │
│         │                 │          └──────┬───────┘  └──────┬───────┘   │
│         │                 │                 │                 │           │
│         ▼                 ▼                 ▼                 ▼           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │              DETERMINISTIC EXPERIMENT PIPELINE                      │   │
│  │  fetch → indicators → regimes → signals → labels → walkforward      │   │
│  │  → costs → evaluate → attribute → baselines → report                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │              APPEND-ONLY EVIDENCE STORE (D1)                        │   │
│  │  research_hypotheses + research_registry + research_queue_jobs      │   │
│  │  + research_queue_events + research_testing_counters                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │  EXPLICIT ADAPTER BOUNDARY    │
                    │  (schema validation, timeout, │
                    │   audit logging, size limits) │
                    └───────────────┬───────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────────┐
│                      VIBE-TRADING UNTRUSTED ZONE                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Alpha Zoo   │  │  MCP Server  │  │  Swarm       │  │  Data        │   │
│  │  (formulas,  │  │  (tools,     │  │  Agents      │  │  Providers   │   │
│  │   metadata)  │  │   resources) │  │  (propose,   │  │  (fallback   │   │
│  └──────────────┘  └──────────────┘  │   critique)  │  │   chain)     │   │
│                                      └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Adapter Boundary Controls

Every external Vibe-Trading capability accessed through an adapter MUST implement:

### 1. Tool Allowlist
```typescript
// Example: MCPResearchAdapter allowed tools
const ALLOWED_MCP_TOOLS = [
  'market_data_discovery',
  'factor_research',
  'alpha_metadata_lookup',
  'backtest_proposal',
  'research_document_generation',
  'research_report_generation',
  'non_execution_analysis',
] as const;
```

### 2. Input Schema Validation (Zod)
```typescript
// Every adapter input validated against explicit schema
const ResearchGoalInputSchema = z.object({
  objective: z.string().min(10).max(500),
  universe: z.array(z.string()).min(1).max(100),
  timePeriod: z.object({ start: z.string(), end: z.string() }),
  constraints: z.array(z.string()).max(20),
  evidenceRequirements: z.array(z.string()).max(10),
  successCriteria: z.array(z.string()).max(10),
  failureCriteria: z.array(z.string()).max(10),
});
```

### 3. Timeout Enforcement
```typescript
// Hard timeout on every external call
const ADAPTER_TIMEOUT_MS = 30_000; // 30 seconds max
const result = await Promise.race([
  adapter.call(input),
  new Promise<never>((_, reject) => 
    setTimeout(() => reject(new Error('ADAPTER_TIMEOUT')), ADAPTER_TIMEOUT_MS)
  ),
]);
```

### 4. Output Size Limit
```typescript
// Prevent unbounded response sizes
const MAX_OUTPUT_BYTES = 1_000_000; // 1 MB
if (JSON.stringify(result).length > MAX_OUTPUT_BYTES) {
  throw new Error('ADAPTER_OUTPUT_TOO_LARGE');
}
```

### 5. Audit Logging
```typescript
// Every external call logged with full provenance
interface AdapterAuditEntry {
  adapterName: string;
  toolName: string;
  inputHash: string;        // SHA-256 of input
  outputHash: string;       // SHA-256 of output
  timestamp: number;
  durationMs: number;
  status: 'success' | 'timeout' | 'schema_error' | 'size_limit' | 'unknown_tool';
  auditId: string;          // UUID for traceability
}
```

### 6. Failure Isolation
```typescript
// Adapter failures never crash the research pipeline
try {
  const result = await adapter.call(input);
  return { success: true, data: result };
} catch (err) {
  // Log audit entry, return structured error, continue pipeline
  auditLog({ ...errorEntry, status: classifyError(err) });
  return { success: false, error: sanitizeError(err) };
}
```

---

## Prohibited Patterns (Enforced by Code Review)

| Pattern | Why Prohibited | Detection |
|---------|----------------|-----------|
| `eval()` / `exec()` / `Function()` constructor | Arbitrary code execution | `grep -r "eval\|exec\|new Function" src/` |
| `child_process.exec()` / `spawn()` | Shell execution | `grep -r "child_process" src/` |
| Dynamic `import()` of untrusted code | Runtime code loading | `grep -r "import(" src/` (review each) |
| `fetch()` / `axios` to arbitrary URLs | Uncontrolled network access | `grep -r "fetch\|axios" src/forest/research/adapters/` |
| `require()` / `import` of Python modules | Python runtime coupling | No `.py` files in `src/` |
| Direct broker API calls from research | Bypasses execution engine | `grep -r "binance\|bybit\|okx" src/forest/research/` |
| Mutation of `ResearchEntry` fields | Violates append-only | TypeScript `readonly` + code review |
| `transitionStrategy()` with `manual_approval` from non-human code | Auto-promotion | Code review: only UI/admin handlers call this |

---

## Cloudflare Workers Compatibility

**Constraint:** CashClaw production path runs on Cloudflare Workers (TypeScript only).

| Vibe-Trading Component | Compatibility | Resolution |
|------------------------|---------------|------------|
| Python agent runtime | ❌ Incompatible | Keep outside Worker path; communicate via adapter/job boundary |
| MCP server (Python) | ❌ Incompatible | `MCPResearchAdapter` calls external MCP via HTTP (separate service) |
| Heavy backtest computation | ⚠️ CPU limits | Offload to external research worker; Worker only orchestrates |
| Large alpha zoo formulas | ⚠️ Bundle size | Compile to experiment spec; don't bundle formulas in Worker |
| File system access | ❌ Not available | Use D1 / R2 / KV via CashClaw abstractions |

**Production Path (Worker-compatible):**
```
TypeScript → CashClaw Domain → D1 → Worker-compatible infrastructure
```

**Research Path (External):**
```
Python / Heavy compute → MCP / Swarm / Alpha Zoo → Adapter → Experiment Spec → CashClaw Pipeline
```

---

## Data Provenance Requirements

Every dataset used in research MUST record:

```typescript
interface DataProvenance {
  provider: string;           // e.g., 'binance', 'bybit', 'coingecko'
  symbol: string;             // e.g., 'BTCUSDT'
  timeframe: string;          // e.g., '1h', '4h', '1d'
  start: number;              // Unix ms
  end: number;                // Unix ms
  retrievalTimestamp: number; // When fetched
  timezone: string;           // 'UTC'
  adjustmentMode: 'raw' | 'split_adjusted' | 'dividend_adjusted';
  sourceVersion?: string;     // Provider API version if available
  checksum: string;           // SHA-256 of raw data
  missingDataStats: {
    totalBars: number;
    missingBars: number;
    gapCount: number;
    maxGapMs: number;
  };
}
```

**Rule:** Different providers must NOT be silently mixed inside one experiment. If provider changes → new dataset version.

---

## Research Job Architecture Security

Job states (persisted, append-only transitions):

```
PROPOSED → VALIDATING → QUEUED → RUNNING → EVALUATED
                                          ├→ FALSIFIED
                                          ├→ SURVIVED → PAPER → SHADOW → HUMAN_REVIEW → PROMOTED
                                          └→ ARCHIVED
```

**Security properties:**
- Jobs are immutable after creation (status changes = new event rows)
- `research_queue_events` is append-only audit trail
- `config_hash` prevents silent config mutation
- `git_sha` binds experiment to code version
- `seed` enables deterministic replay

---

## Threat Model & Mitigations

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| Malicious alpha formula exfiltrates data | Medium | High | AlphaCompiler rejects non-causal; no network in compiler |
| Swarm agent generates infinite hypotheses (DoS) | Medium | Medium | Rate limit on `ResearchWorkerAdapter`; job queue depth limit |
| MCP tool returns malicious payload | Low | High | Output size limit + schema validation + sandboxed parsing |
| Researcher injects future data into features | Medium | Critical | `declareFeature()` gate: `availability: 'causal'` enforced |
| Promotion threshold manipulation | Low | Critical | Thresholds in code, not config; `promotion-states.ts` is compiled |
| Evidence tampering | Low | Critical | D1 append-only tables; `readonly` TypeScript types |
| Python runtime code injection | Medium | High | No Python in Worker path; adapters communicate via JSON over HTTP |

---

## Security Testing Requirements

After every phase, these security tests must pass:

```bash
# 1. No arbitrary code execution patterns
npm run security:no-eval

# 2. No shell execution patterns  
npm run security:no-shell

# 3. No uncontrolled network access in research path
npm run security:no-direct-fetch

# 4. Adapter boundary contract tests
npm test -- --testPathPattern="adapters"

# 5. Promotion state machine invariant tests
npm test -- --testPathPattern="promotion-states"

# 6. Causal feature gate tests
npm test -- --testPathPattern="feature-declaration"

# 7. Append-only evidence store tests
npm test -- --testPathPattern="persistence"

# 8. Cost model stress mode coverage
npm test -- --testPathPattern="cost-model"
```

---

## Incident Response

If a security boundary violation is detected:

1. **Immediate:** Disable the offending adapter (feature flag)
2. **Investigate:** Audit log query by `auditId` → trace input/output
3. **Contain:** Quarantine affected research jobs (status → `ARCHIVED`)
4. **Remediate:** Fix adapter contract, add test case
5. **Verify:** Re-run security test suite
6. **Document:** Record in security incident log

---

## Compliance Checklist (Pre-Ship)

- [ ] No `eval`/`exec`/`Function` in `src/`
- [ ] No `child_process` in `src/`
- [ ] No arbitrary `fetch`/`axios` in research adapters
- [ ] All adapters implement: allowlist, schema, timeout, size limit, audit, isolation
- [ ] Promotion state machine: automated ceiling = `SHADOW` verified
- [ ] `KILLED` and `LIVE` are terminal states verified
- [ ] `manual_approval` only callable from UI/admin handlers
- [ ] `ResearchEntry` fields are `readonly`
- [ ] `research_queue_jobs` immutable after insert
- [ ] Cost model: 4 stress modes tested
- [ ] Causal gate: non-causal features rejected in tests
- [ ] Cloudflare Workers build passes (`npm run build`)
- [ ] TypeScript: zero `:any` types (`grep ": any" src/` → 0)

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-26 | Security Architect | Initial security boundary from Phase 0 recon |