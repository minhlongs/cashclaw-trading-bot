# Phase 02: MCP Streamable HTTP — Decision Record

## Decision

**No implementation required.** CashClaw's existing HTTP route layer already satisfies Vibe-Trading's intent: standardized JSON request/response with `{ ok: boolean, data?, error? }` shape.

## Why

- Trade-bot uses Next.js App Router (`src/app/api/*/route.ts`), not MCP transport.
- Error shape already matches Phase 02 requirement: `{ ok, data?, error? }`.
- No JSON-RPC or MCP-specific headers in current routes.
- Adding MCP layer would be over-engineering for v1 (YAGNI).

## Mapping

| Vibe-Trading Pattern | CashClaw Equivalent |
|----------------------|---------------------|
| MCP Streamable HTTP  | Next.js Route Handlers |
| JSON-RPC envelope    | Standard HTTP + Result types |
| Tool execution       | Server Actions / route handlers |
| Auth via headers     | Session cookie middleware |

## Skip List

- No `mcpmeta` transport layer (plan explicitly says "drop")
- No MCP CRUD verbs (use standard REST verbs)
- No streamed responses (use standard `NextResponse.json`)