# Code Standards — CashClaw Trade Bot

## File Naming

- **kebab-case** for all file names (`d1-hydration.ts`, `bots-list-client.tsx`).
- Name files by purpose so a directory listing is self-explanatory; a long name beats an ambiguous one.

## File Size

- Keep individual files under ~200 lines. Split large files into focused modules and extract utilities into dedicated files.

## Canonical Imports

Single sources of truth — do not create alternative paths:

| Concern | Import |
|---|---|
| D1 client (sync, no await) | `import { createServerClient } from '@/lib/db/client'` |
| BotManager | `import { getBotManager } from '@/tree/bot'` |
| Logger | `import { createLogger } from '@/lib/logger'` |
| Result type | `import { Result } from '@/lib/result'` |

Prefer existing imports and contracts over introducing new cross-layer couplings.

## Quality Gates

- **Zero `:any` types** in production code — use proper TypeScript interfaces. A single `:any` propagates type-safety holes.
- **Zero `console.log` / `warn` / `error`** — use the logger utility; console output pollutes Worker logs and leaks implementation details.
- **Zod validation on all API inputs.**
- **Server Actions for data mutations** (preferred over API routes).
- **ESLint suppression freeze:** the suppression count in `eslint-suppressions.json` is frozen as baseline. New `eslint-disable` comments are forbidden unless already in the baseline or approved with a tracked issue. The count must only decrease over time.
- **Test every change.** `npm test` must pass; full-suite coverage thresholds are enforced in `vitest.config.ts`.

## Error Handling

- Use `try/catch` with structured logging:

```ts
catch (e) {
  const err = e instanceof Error ? e : new Error(String(e));
  log.error('Action failed', err, { action: 'action-name' });
}
```

- API routes return `{ ok: boolean, data?: T, error?: string }` shapes; domain logic uses the `Result` type.

## Conventions

- **Tier/status enums** use uppercase-only values where they represent protocol states (e.g. bot mode `'paper' | 'live'`; status `'draft' | 'paper_test' | 'live_running' | 'paused' | 'error' | 'stopped'`).
- **Paper-only v1:** `mode: 'live'` is rejected at the API level; no UI path can trigger live exchange calls.
- **Bilingual customer-facing content** via `next-intl` — no hardcoded Vietnamese/English strings in components; use `useTranslations` / `t()`.

## Commits

- Conventional commit format (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- No AI references, no phase/plan labels in messages.
- Keep commits focused on actual code changes.
