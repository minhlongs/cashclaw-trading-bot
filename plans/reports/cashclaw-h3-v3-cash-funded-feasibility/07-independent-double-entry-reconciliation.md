# 07 — Independent Double-Entry Decimal Reconciliation

Implemented in `verification_lab/src/verification_lab/v3/double_entry_economics.py` (`CashFundedEconomicsEngine` + `IndependentDoubleEntryOracle`).

- **Canonical `$5,000` 90-Day Hyperliquid Trade Lifecycle (`7` checkpoints, L1 bid/ask fills with `spread_slippage_usd = 0` to prevent double-counting):**
  - `initial_equity_usd`: `$5000`
  - `funding_usd`: `$75.4479`
  - `basis_pnl_usd` (includes L1 bid/ask crossing): `$-0.0977`
  - `spot_fees_usd`: `$4.1993`
  - `perp_fees_usd`: `$2.7030`
  - `spread_slippage_usd` (incremental beyond L1): `$0.0000`
  - `opportunity_cost_usd` (memo benchmark): `$49.3151`
  - `ending_equity_usd`: `$5068.4479`
  - `net_carry_after_opportunity_cost_usd`: `$19.1328`
- **Oracle Verification:** `verified = True`, `checkpoints_checked = 7`, `max_balance_sheet_residual_usd = 0`, `final_liabilities_usd = 0`.
- **Mutation & Invariant Tests (`test_h3_v3_cash_funded_feasibility.py`):** Confirmed `FORBIDDEN_BORROWED_PRINCIPAL_IN_V3` rejection, exact checkpoint tampering detection (`Reported equity mismatch`), negative-quantity rejection, post-liquidation trading rejection, and accumulated deficit-liability tracking across `free_cash` and `perp_margin_cash`.
