# 02 — Economic Delta: `H3_BASIS_CARRY_V2` vs `H3_CASH_FUNDED_BASIS_CARRY_V3`

| Dimension | `H3_BASIS_CARRY_V2` (Frozen) | `H3_CASH_FUNDED_BASIS_CARRY_V3` (Candidate) |
| --- | --- | --- |
| **Capital Structure** | Implied 1.0x gross with venue USDC borrow APR hurdle (`487.90 bps` APR) | Strictly cash-funded: `60% Spot + 15% Perp IM + 25% Free Reserve = 100%` |
| **Borrowed Principal** | Modeled via Portfolio Margin borrow rate (ineligible for `$100–$10,000` accounts) | **Strictly `$0.00`** (`FORBIDDEN_BORROWED_PRINCIPAL_IN_V3` enforced in engine & oracle) |
| **Financing Cost Label** | Venue USDC borrow APR | Explicit **4.00% annualized stablecoin cash opportunity cost** (memo benchmark) |
| **Spot Leg Instrument** | Oracle reference proxy (`ORACLE_REFERENCE_NOT_SPOT_BOOK`) on Hyperliquid | Actual executable spot order book (`UBTC/USDC @142` or `BTC/USDT`) required |
| **Capital Efficiency** | ~100% notional (if PM existed) | **60% notional** — 40% of equity sits in perp IM + free liquidation reserve |
| **Multiple-Testing Lineage** | `N = 186` (`185 + 1`) | **`N = 201`** (`186 + 15` route×tier trials; never reset to 1) |
| **Inherited G5 / p-value** | Quarantined `H3_MAKER` | **None** (`inherits_v2_g5_or_h3_maker_p_value: false`) |
