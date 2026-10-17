# CashClaw Enterprise & Cloud SaaS Commercial License (`src/ee/`)

Copyright (c) 2026 CashClaw Platform. All rights reserved.

## 1. Scope
This Commercial License governs all files, modules, and subdirectories inside `src/ee/` (the "Enterprise Edition Software" or "EE Software").
All files outside `src/ee/` remain licensed under the Apache License, Version 2.0 (`LICENSE`).

## 2. Permitted Evaluation & Development Use
You may view, compile, and run Automated Tests against `src/ee/` solely for:
- Local development, testing, and contributing pull requests to the official CashClaw repository; or
- Evaluating CashClaw Enterprise features in a non-production, single-user local test environment.

## 3. Commercial Restrictions
Without a valid paid CashClaw Cloud SaaS subscription (`BASIC`, `PREMIUM`, `ENTERPRISE`, or `MASTER`) or an executed Enterprise License Agreement from CashClaw:
1. You may **NOT** deploy, host, or operate `src/ee/` modules as a multi-tenant, managed, or commercial SaaS/PaaS offering to third parties.
2. You may **NOT** remove, bypass, or tamper with license/quota guards (`src/ee/billing/quota-guard.ts`), tenant isolation policies, or billing webhooks.
3. You may **NOT** redistribute `src/ee/` under an open-source license.

## 4. Open-Core Escape Hatch
You are always free to run the 100% open-source Apache-2.0 Community Core (`src/tree/`, `src/land/`, and single-user local mode `CASHCLAW_EDITION=OSS_LOCAL`) without `src/ee/` restrictions.
