---
name: project-db-schema-modularization-plan
description: Cycle 22 plan to modularize src/lib/db/schema.ts into schema-tables.ts & schema-indexes.ts (<= 150 LOC) & Cloudflare Go-Live
metadata:
  type: project
---

Cycle 22 plan written for modularizing `src/lib/db/schema.ts` (198 LOC) into `schema-tables.ts` (~120 LOC) + `schema-indexes.ts` (~40 LOC) + `schema.ts` (~45 LOC facade).

**Why:** Satisfy repo-wide file size target <= 150 LOC (hard ceiling <= 200 LOC) without modifying D1 migration state or SQL statements.
**How to apply:** Preserves `SQL` (all 18 keys) and `MIGRATION` export contracts, 0 `:any` types, 0 new `eslint-disable`, 4,133+ green tests, and Cloudflare Workers deploy doctrine.
