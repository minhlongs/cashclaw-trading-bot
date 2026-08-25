---
name: env-rtk-grep-wrapper
description: Bash grep/rg output is intercepted by an "rtk" wrapper in this environment; pipe results to temp files and Read them instead
metadata:
  type: reference
---

In this environment (macbook, zsh), plain `grep`/`rg` invocations via the Bash tool get intercepted by an "rtk" wrapper that compresses/truncates matches into placeholders like `[rtk:grouped ×N]` and `[rtk:truncated N lines]`, and may return stale cached output across repeated calls.

**How to apply:** When exact match lists matter (audit greps for eslint-disable, `:any`, imports), redirect output to `/tmp/*.txt` files (`cmd > /tmp/out.txt 2>&1`) and use the Read tool on the file. Note `/tmp` writes can hit a read-only sandbox — retry once, then fall back to reading command stdout directly and accepting rtk compression for non-critical lookups. Same compression applies to the Read tool on large test files — treat `[rtk:grouped]` as display elision, verify via vitest runs instead.
