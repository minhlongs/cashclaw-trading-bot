# Phase 2: Git Hygiene, Worktrees & Scratch Cleanup

## Context & Objective
Clean up obsolete local branches (`feat/alpha-research-os-phase7..10`), stale git worktrees (`knip-cleanup` and `microstructure-type-consolidation`), and untracked candidate scratch files so the workspace is completely clean.

## Files Owned
- Local git refs & worktrees
- `plans/reports/advise-261024-1146-*` (delete untracked scratch files)

## Steps
1. Verify no active processes or uncommitted code exist in stale worktrees.
2. Remove stale worktrees `/Users/macbook/trade-bot-worktrees/knip-cleanup` and `/Users/macbook/trade-bot-worktrees/microstructure-type-consolidation` and run `git worktree prune`.
3. Remove 4 merged local branches `feat/alpha-research-os-phase7..10` (`ahead=0`).
4. Remove untracked scratch files from `plans/reports/`.

## Validation
- `git worktree list` shows only `/Users/macbook/trade-bot` and `/Users/macbook/trade-bot-worktrees/comprehensive-4phase-roadmap`.
- `git branch --list "feat/alpha-research-os-phase*"` returns empty.
