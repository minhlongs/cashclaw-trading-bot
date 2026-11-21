#!/usr/bin/env python3
"""Independent Decimal event-level accounting oracle for CashClaw paper ledger.

Reads a JSON payload containing:
  - events: ordered list of raw ledger events (DEPOSIT, RESERVE_MARGIN,
    RELEASE_MARGIN, FILL_OPEN, FILL_CLOSE, FUNDING) with integer micro-USD amounts
  - observed_balances: final D1 paper_ledger_accounts integer micro-USD balances
  - observed_journal_legs: rows from D1 paper_journal_entries

Computes every balance independently using Python Decimal (prec=50) without
importing or calling any TypeScript code, verifies Assets - Liabilities - Equity == 0
after every single event, and asserts exact 0 micro-unit discrepancy against D1.
"""

from __future__ import annotations

import json
import sys
from decimal import Decimal, getcontext
from typing import Any

getcontext().prec = 50

ACCOUNTS = (
    "CASH_AVAILABLE",
    "MARGIN_RESERVED",
    "POSITION_MARGIN",
    "REALIZED_PNL",
    "FEES_EXPENSE",
    "FUNDING_NET",
    "INITIAL_CAPITAL",
)

DEBIT_NORMAL = {"CASH_AVAILABLE", "MARGIN_RESERVED", "POSITION_MARGIN", "FEES_EXPENSE"}
CREDIT_NORMAL = {"INITIAL_CAPITAL", "REALIZED_PNL", "FUNDING_NET"}


def zero_balances() -> dict[str, Decimal]:
    return {acct: Decimal(0) for acct in ACCOUNTS}


def balance_sheet_residual(bal: dict[str, Decimal]) -> Decimal:
    # Assets = CASH_AVAILABLE + MARGIN_RESERVED + POSITION_MARGIN
    # Liabilities = 0 (paper margin is segregated within assets; no external debt)
    # Equity = INITIAL_CAPITAL + REALIZED_PNL + FUNDING_NET - FEES_EXPENSE
    assets = bal["CASH_AVAILABLE"] + bal["MARGIN_RESERVED"] + bal["POSITION_MARGIN"]
    liabilities = Decimal(0)
    equity = (
        bal["INITIAL_CAPITAL"]
        + bal["REALIZED_PNL"]
        + bal["FUNDING_NET"]
        - bal["FEES_EXPENSE"]
    )
    return assets - liabilities - equity


def parse_int_micro_usd(
    val: Any, *, field: str, allow_negative: bool = False, allow_zero: bool = True
) -> Decimal:
    if isinstance(val, bool) or val is None:
        raise ValueError(f"Invalid integer micro-USD for {field}: {val!r}")
    d = Decimal(str(val))
    if not d.is_finite() or d != d.to_integral_value():
        raise ValueError(f"Non-integer micro-USD for {field}: {val!r}")
    if not allow_negative and d < 0:
        raise ValueError(f"Negative micro-USD forbidden for {field}: {d}")
    if not allow_zero and d == 0:
        raise ValueError(f"Zero micro-USD forbidden for {field}")
    return d


def apply_event(bal: dict[str, Decimal], ev: dict[str, Any]) -> None:
    kind = ev["type"]
    if kind == "DEPOSIT":
        amt = parse_int_micro_usd(ev["amount_micro_usd"], field="DEPOSIT.amount_micro_usd")
        bal["CASH_AVAILABLE"] += amt
        bal["INITIAL_CAPITAL"] += amt
    elif kind == "RESERVE_MARGIN":
        amt = parse_int_micro_usd(ev["amount_micro_usd"], field="RESERVE_MARGIN.amount_micro_usd")
        bal["CASH_AVAILABLE"] -= amt
        bal["MARGIN_RESERVED"] += amt
    elif kind == "RELEASE_MARGIN":
        amt = parse_int_micro_usd(ev["amount_micro_usd"], field="RELEASE_MARGIN.amount_micro_usd")
        bal["MARGIN_RESERVED"] -= amt
        bal["CASH_AVAILABLE"] += amt
    elif kind == "FILL_OPEN":
        margin_used = parse_int_micro_usd(ev["margin_used_micro_usd"], field="FILL_OPEN.margin_used_micro_usd")
        fee = parse_int_micro_usd(ev["fee_micro_usd"], field="FILL_OPEN.fee_micro_usd")
        bal["MARGIN_RESERVED"] -= margin_used
        bal["POSITION_MARGIN"] += margin_used
        if fee > 0:
            bal["CASH_AVAILABLE"] -= fee
            bal["FEES_EXPENSE"] += fee
    elif kind == "FILL_CLOSE":
        margin_released = parse_int_micro_usd(
            ev["margin_released_micro_usd"], field="FILL_CLOSE.margin_released_micro_usd"
        )
        realized_pnl = parse_int_micro_usd(
            ev["realized_pnl_micro_usd"], field="FILL_CLOSE.realized_pnl_micro_usd", allow_negative=True
        )
        fee = parse_int_micro_usd(ev["fee_micro_usd"], field="FILL_CLOSE.fee_micro_usd")
        bal["POSITION_MARGIN"] -= margin_released
        bal["CASH_AVAILABLE"] += margin_released + realized_pnl - fee
        bal["REALIZED_PNL"] += realized_pnl
        bal["FEES_EXPENSE"] += fee
    elif kind == "FUNDING":
        amt = parse_int_micro_usd(ev["amount_micro_usd"], field="FUNDING.amount_micro_usd", allow_negative=True)
        bal["CASH_AVAILABLE"] += amt
        bal["FUNDING_NET"] += amt
    else:
        raise ValueError(f"Unsupported event type: {kind}")


def reconcile_journal_legs(legs: list[dict[str, Any]]) -> dict[str, Decimal]:
    bal = zero_balances()
    by_entry: dict[str, list[dict[str, Any]]] = {}
    for leg in legs:
        by_entry.setdefault(str(leg["entry_id"]), []).append(leg)
    for entry_id, entry_legs in by_entry.items():
        debits = Decimal(0)
        credits = Decimal(0)
        for leg in entry_legs:
            direction = leg.get("direction")
            if direction not in ("DEBIT", "CREDIT"):
                raise ValueError(f"Invalid journal direction in {entry_id}: {direction!r}")
            amt = parse_int_micro_usd(
                leg["amount_micro_usd"],
                field=f"journal[{entry_id}].amount_micro_usd",
                allow_negative=False,
                allow_zero=False,
            )
            if direction == "DEBIT":
                debits += amt
            else:
                credits += amt
            acct = str(leg["account_code"])
            if acct in DEBIT_NORMAL:
                bal[acct] += amt if direction == "DEBIT" else -amt
            elif acct in CREDIT_NORMAL:
                bal[acct] += amt if direction == "CREDIT" else -amt
            else:
                raise ValueError(f"Unknown account_code: {acct}")
        if debits != credits:
            raise ValueError(f"Unbalanced journal entry {entry_id}: debits={debits} credits={credits}")
    return bal


def main() -> int:
    payload = json.load(sys.stdin)
    events: list[dict[str, Any]] = payload["events"]
    observed: dict[str, Any] = payload["observed_balances"]
    journal_legs: list[dict[str, Any]] = payload.get("observed_journal_legs", [])

    bal = zero_balances()
    mismatches: list[dict[str, Any]] = []
    event_residuals: list[dict[str, Any]] = []

    for idx, ev in enumerate(events):
        apply_event(bal, ev)
        residual = balance_sheet_residual(bal)
        event_residuals.append(
            {
                "index": idx,
                "event_id": ev.get("event_id", f"ev-{idx}"),
                "type": ev["type"],
                "residual_micro_usd": str(residual),
            }
        )
        if residual != 0:
            mismatches.append(
                {
                    "event_id": ev.get("event_id", f"ev-{idx}"),
                    "reason": "BALANCE_SHEET_RESIDUAL_NONZERO",
                    "residual_micro_usd": str(residual),
                }
            )
        if bal["CASH_AVAILABLE"] < 0 or bal["MARGIN_RESERVED"] < 0 or bal["POSITION_MARGIN"] < 0:
            mismatches.append(
                {
                    "event_id": ev.get("event_id", f"ev-{idx}"),
                    "reason": "NEGATIVE_ASSET_BALANCE",
                    "balances": {k: str(v) for k, v in bal.items()},
                }
            )

    for acct in ACCOUNTS:
        obs_val = parse_int_micro_usd(observed[acct], field=f"observed_balances.{acct}", allow_negative=True)
        exp_val = bal[acct]
        if obs_val != exp_val:
            mismatches.append(
                {
                    "account": acct,
                    "reason": "ACCOUNT_MISMATCH_VS_D1",
                    "expected_micro_usd": str(exp_val),
                    "observed_micro_usd": str(obs_val),
                    "diff_micro_usd": str(obs_val - exp_val),
                }
            )

    journal_bal = reconcile_journal_legs(journal_legs) if ("observed_journal_legs" in payload or len(events) > 0) else None
    if journal_bal is not None:
        for acct in ACCOUNTS:
            if journal_bal[acct] != bal[acct]:
                mismatches.append(
                    {
                        "account": acct,
                        "reason": "JOURNAL_REPLAY_MISMATCH",
                        "expected_micro_usd": str(bal[acct]),
                        "journal_micro_usd": str(journal_bal[acct]),
                        "diff_micro_usd": str(journal_bal[acct] - bal[acct]),
                    }
                )

    report = {
        "ok": len(mismatches) == 0,
        "events_reconciled": len(events),
        "journal_legs_reconciled": len(journal_legs),
        "final_residual_micro_usd": str(balance_sheet_residual(bal)),
        "expected_balances": {k: str(v) for k, v in bal.items()},
        "mismatches": mismatches,
        "event_residuals": event_residuals,
    }
    json.dump(report, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
