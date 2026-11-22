#!/usr/bin/env python3
"""Independent G3 Deterministic Signal Validation (Supreme Command #19).

Self-contained deterministic replay runner (zero LLM in path) exercising:
- H3 two-leg basis-carry signal generation (carry_annualized_bps + entry/exit state machine)
- Rolling indicator warmup boundary
- Recursive EMA & RSI in fixed-precision Decimal
- Order sizing & rounding (ROUND_HALF_EVEN micro-unit quantization)
- Deterministic event ordering by (ts_ms, symbol, leg, event_type)
- Canonical sorted-key JSON strategy serialization
- Strategy specification SHA-256 hashing

Supports --worker mode so the orchestrator spawns 10 fresh subprocesses in
/tmp/cc-g3-env1/bin/python and 10 fresh subprocesses in /tmp/cc-g3-env2/bin/python
(20 total process-restarted runs across 2 independently prepared virtualenvs),
asserts 100% identical canonical SHA-256 hashes, and emits
artifacts/g3_signal_determinism.json.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import subprocess
import sys
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_EVEN, getcontext
from pathlib import Path
from typing import Any

import numpy as np
import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[2]
SRC_DIR = REPO_ROOT / "verification_lab" / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from verification_lab.strategies import h3_basis_carry  # noqa: E402

SIGNED_SPEC_PATH = REPO_ROOT / "artifacts" / "signed_strategy_spec_h3_maker.json"
OUTPUT_PATH = REPO_ROOT / "artifacts" / "g3_signal_determinism.json"
DATA_ORIGIN_SYNTHETIC = "SYNTHETIC_SOFTWARE_TEST_FIXTURE"

ENV1_PYTHON = "/tmp/cc-g3-env1/bin/python"
ENV2_PYTHON = "/tmp/cc-g3-env2/bin/python"

Q8 = Decimal("0.00000001")
Q4 = Decimal("0.0001")
Q6 = Decimal("0.000001")


def q(val: Decimal, quant: Decimal = Q8) -> Decimal:
    return val.quantize(quant, rounding=ROUND_HALF_EVEN)


def canonical_json(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def sha256_str(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def build_synthetic_market_events() -> list[dict[str, Any]]:
    """Deterministic multi-symbol synthetic fixture for replay determinism tests."""
    base_ts = 1_704_067_200_000  # 2024-01-01T00:00:00Z
    day_ms = 86_400_000
    symbols = ["ETHUSDT", "BTCUSDT", "SOLUSDT"]
    events: list[dict[str, Any]] = []

    # Deliberately emit in scrambled order to verify deterministic tie-breaking
    for day in range(45):
        ts = base_ts + day * day_ms
        for s_idx, sym in enumerate(symbols):
            base_px = Decimal(str(100 + s_idx * 50))
            wave = Decimal(str((day * 7 + s_idx * 13) % 19 - 9)) / Decimal("10")
            spot_px = q(base_px + wave + Decimal(str(day)) * Decimal("0.25"), Q4)
            # Funding rate regime: high positive carry in days 12..30, low/negative after
            if 12 <= day <= 30:
                funding_8h = q(Decimal("0.00095") + Decimal(str(s_idx)) * Decimal("0.00012"), Q8)
            elif day > 30:
                funding_8h = q(Decimal("0.00008") - Decimal(str(day - 30)) * Decimal("0.00001"), Q8)
            else:
                funding_8h = q(Decimal("0.00015"), Q8)
            perp_px = q(spot_px * (Decimal("1") + funding_8h * Decimal("2")), Q4)
            events.append(
                {
                    "ts_ms": ts,
                    "symbol": sym,
                    "leg": "perp",
                    "event_type": "funding_and_mark",
                    "price": str(perp_px),
                    "funding_8h": str(funding_8h),
                }
            )
            events.append(
                {
                    "ts_ms": ts,
                    "symbol": sym,
                    "leg": "spot",
                    "event_type": "close_bar",
                    "price": str(spot_px),
                    "funding_8h": "0",
                }
            )

    # Reverse list so event-ordering logic is actively exercised
    events.reverse()
    return events


def compute_recursive_ema(values: list[Decimal], span: int) -> list[Decimal | None]:
    alpha = Decimal("2") / Decimal(str(span + 1))
    one_minus_alpha = Decimal("1") - alpha
    out: list[Decimal | None] = []
    ema: Decimal | None = None
    for idx, v in enumerate(values):
        if idx < span - 1:
            out.append(None)
        elif idx == span - 1:
            ema = q(sum(values[:span], Decimal("0")) / Decimal(str(span)), Q8)
            out.append(ema)
        else:
            assert ema is not None
            ema = q(alpha * v + one_minus_alpha * ema, Q8)
            out.append(ema)
    return out


def compute_recursive_rsi(values: list[Decimal], period: int) -> list[Decimal | None]:
    out: list[Decimal | None] = [None]
    gains: list[Decimal] = []
    losses: list[Decimal] = []
    avg_gain: Decimal | None = None
    avg_loss: Decimal | None = None

    for idx in range(1, len(values)):
        delta = values[idx] - values[idx - 1]
        gain = delta if delta > Decimal("0") else Decimal("0")
        loss = -delta if delta < Decimal("0") else Decimal("0")
        if idx < period:
            gains.append(gain)
            losses.append(loss)
            out.append(None)
        elif idx == period:
            gains.append(gain)
            losses.append(loss)
            avg_gain = q(sum(gains, Decimal("0")) / Decimal(str(period)), Q8)
            avg_loss = q(sum(losses, Decimal("0")) / Decimal(str(period)), Q8)
            if avg_loss == Decimal("0"):
                out.append(Decimal("100.00000000"))
            else:
                rs = avg_gain / avg_loss
                out.append(q(Decimal("100") - (Decimal("100") / (Decimal("1") + rs)), Q8))
        else:
            assert avg_gain is not None and avg_loss is not None
            avg_gain = q((avg_gain * Decimal(str(period - 1)) + gain) / Decimal(str(period)), Q8)
            avg_loss = q((avg_loss * Decimal(str(period - 1)) + loss) / Decimal(str(period)), Q8)
            if avg_loss == Decimal("0"):
                out.append(Decimal("100.00000000"))
            else:
                rs = avg_gain / avg_loss
                out.append(q(Decimal("100") - (Decimal("100") / (Decimal("1") + rs)), Q8))
    return out


def verify_signed_strategy_spec(spec_path: Path = SIGNED_SPEC_PATH) -> dict[str, Any]:
    raw = json.loads(spec_path.read_text(encoding="utf-8"))
    claimed_sha = str(raw["payloadSha256"])
    body = {k: v for k, v in raw.items() if k != "payloadSha256"}
    recomputed_sha = sha256_str(canonical_json(body))
    if recomputed_sha != claimed_sha:
        raise ValueError(
            f"Signed strategy spec SHA-256 mismatch: claimed={claimed_sha} recomputed={recomputed_sha}"
        )
    return {
        "spec": raw,
        "claimed_payload_sha256": claimed_sha,
        "recomputed_payload_sha256": recomputed_sha,
        "verified": True,
    }


def run_production_h3_maker_panel(spec: dict[str, Any]) -> dict[str, Any]:
    """Execute real production h3_basis_carry.basis_wide + build_positions_maker on a deterministic Polars panel."""
    params = spec["parameters"]
    lookback = int(params["lookbackDays"])
    entry_bps = float(params["entryAnnualBps"])
    exit_bps = float(params["exitAnnualBps"])
    p_fill = float(params["fifoFillProbability"])
    max_gross = float(params["maxGrossLeverage"])

    n_days = 90
    days = list(range(n_days))
    symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"]

    spot_cols: dict[str, list[float]] = {"day": days}
    perp_cols: dict[str, list[float]] = {"day": days}
    fund_cols: dict[str, list[float]] = {"day": days}

    for s_idx, sym in enumerate(symbols):
        base_px = 100.0 + s_idx * 50.0
        s_list: list[float] = []
        p_list: list[float] = []
        f_list: list[float] = []
        for d in days:
            sp = round(base_px + d * 0.25 + ((d * 7 + s_idx * 13) % 19 - 9) * 0.1, 6)
            # Basis & funding regime: high positive basis in days 15..60 (>800 bps ann), low afterwards
            if 15 <= d <= 60:
                basis_frac = 0.00030 + s_idx * 0.00004  # ~1095-1387 bps annualized
                fund_daily = 0.0006 + s_idx * 0.0001
            else:
                basis_frac = 0.00002
                fund_daily = 0.00005
            s_list.append(sp)
            p_list.append(round(sp * (1.0 + basis_frac), 6))
            f_list.append(round(fund_daily, 8))
        spot_cols[sym] = s_list
        perp_cols[sym] = p_list
        fund_cols[sym] = f_list

    spot_df = pl.DataFrame(spot_cols)
    perp_df = pl.DataFrame(perp_cols)
    fund_df = pl.DataFrame(fund_cols)

    basis_df = h3_basis_carry.basis_wide(perp_df, spot_df)
    pos_df = h3_basis_carry.build_positions_maker(
        basis_df,
        fund_df,
        lookback=lookback,
        entry_annual_bps=entry_bps,
        exit_annual_bps=exit_bps,
        p_fill=p_fill,
        causal_shift=True,
    )

    rows_serialized: list[dict[str, Any]] = []
    max_observed_gross = 0.0
    nonzero_position_days = 0
    for row in pos_df.sort("day").to_dicts():
        gross = sum(abs(float(row[s])) for s in symbols)
        if gross > max_observed_gross:
            max_observed_gross = gross
        if gross > 0.0:
            nonzero_position_days += 1
        rows_serialized.append(
            {
                "day": int(row["day"]),
                **{s: f"{float(row[s]):.10f}" for s in symbols},
            }
        )

    if max_observed_gross > max_gross + 1e-9:
        raise ValueError(
            f"Production H3_MAKER exceeded maxGrossLeverage={max_gross}: {max_observed_gross}"
        )

    pos_sha256 = sha256_str(canonical_json(rows_serialized))
    return {
        "params_used": {
            "lookbackDays": lookback,
            "entryAnnualBps": entry_bps,
            "exitAnnualBps": exit_bps,
            "fifoFillProbability": p_fill,
            "maxGrossLeverage": max_gross,
        },
        "days": n_days,
        "nonzero_position_days": nonzero_position_days,
        "max_observed_gross_leverage": round(max_observed_gross, 8),
        "positions_sha256": pos_sha256,
        "positions": rows_serialized,
    }


def run_deterministic_replay() -> dict[str, Any]:
    getcontext().prec = 28
    getcontext().rounding = ROUND_HALF_EVEN

    signed_spec_check = verify_signed_strategy_spec(SIGNED_SPEC_PATH)
    prod_h3 = run_production_h3_maker_panel(signed_spec_check["spec"])

    strategy_spec = {
        "strategy_id": "H3_MAKER_BASIS_CARRY",
        "version": "2.0.0",
        "lookback_days": 10,
        "ema_span": 8,
        "rsi_period": 14,
        "entry_annual_bps": "800.0000",
        "exit_annual_bps": "150.0000",
        "notional_usd_per_leg": "10000.00000000",
        "lot_step": "0.000001",
        "rounding_mode": "ROUND_HALF_EVEN",
        "llm_in_path": False,
        "signed_spec_payload_sha256": signed_spec_check["recomputed_payload_sha256"],
    }
    spec_canonical = canonical_json(strategy_spec)
    spec_sha256 = sha256_str(spec_canonical)

    raw_events = build_synthetic_market_events()
    # Deterministic tie-breaking by (ts_ms, symbol, leg, event_type)
    ordered_events = sorted(
        raw_events,
        key=lambda e: (e["ts_ms"], e["symbol"], e["leg"], e["event_type"]),
    )

    # Group per symbol in chronological order
    by_symbol: dict[str, dict[int, dict[str, Any]]] = {}
    for ev in ordered_events:
        sym = ev["symbol"]
        ts = ev["ts_ms"]
        by_symbol.setdefault(sym, {}).setdefault(ts, {})[ev["leg"]] = ev

    entry_thresh = Decimal(strategy_spec["entry_annual_bps"])
    exit_thresh = Decimal(strategy_spec["exit_annual_bps"])
    lookback = int(strategy_spec["lookback_days"])
    notional = Decimal(strategy_spec["notional_usd_per_leg"])

    signals_out: list[dict[str, Any]] = []
    for sym in sorted(by_symbol.keys()):
        timestamps = sorted(by_symbol[sym].keys())
        spot_prices = [Decimal(by_symbol[sym][ts]["spot"]["price"]) for ts in timestamps]
        perp_prices = [Decimal(by_symbol[sym][ts]["perp"]["price"]) for ts in timestamps]
        fundings = [Decimal(by_symbol[sym][ts]["perp"]["funding_8h"]) for ts in timestamps]

        ema_series = compute_recursive_ema(spot_prices, span=int(strategy_spec["ema_span"]))
        rsi_series = compute_recursive_rsi(spot_prices, period=int(strategy_spec["rsi_period"]))

        in_position = False
        for i, ts in enumerate(timestamps):
            # Rolling warmup boundary: no signal before lookback bars
            if i < lookback - 1:
                carry_ann_bps: Decimal | None = None
                action = "WARMUP"
            else:
                window_funding = fundings[i - lookback + 1 : i + 1]
                mean_8h = sum(window_funding, Decimal("0")) / Decimal(str(lookback))
                # 3 funding periods/day * 365 days * 10_000 bps
                carry_ann_bps = q(mean_8h * Decimal("3") * Decimal("365") * Decimal("10000"), Q4)
                if not in_position and carry_ann_bps >= entry_thresh:
                    in_position = True
                    action = "ENTER_BASIS_CARRY"
                elif in_position and carry_ann_bps <= exit_thresh:
                    in_position = False
                    action = "EXIT_BASIS_CARRY"
                elif in_position:
                    action = "HOLD"
                else:
                    action = "FLAT"

            qty_spot = q(notional / spot_prices[i], Q6)
            qty_perp = q(notional / perp_prices[i], Q6)

            signals_out.append(
                {
                    "ts_ms": ts,
                    "symbol": sym,
                    "action": action,
                    "in_position": in_position,
                    "carry_annualized_bps": str(carry_ann_bps) if carry_ann_bps is not None else None,
                    "ema": str(ema_series[i]) if ema_series[i] is not None else None,
                    "rsi": str(rsi_series[i]) if rsi_series[i] is not None else None,
                    "spot_qty": str(qty_spot),
                    "perp_qty": str(qty_perp),
                }
            )

    payload = {
        "data_origin": DATA_ORIGIN_SYNTHETIC,
        "strategy_spec_sha256": spec_sha256,
        "strategy_spec_canonical": spec_canonical,
        "signed_strategy_spec_payload_sha256": signed_spec_check["recomputed_payload_sha256"],
        "production_h3_positions_sha256": prod_h3["positions_sha256"],
        "production_h3_positions": prod_h3["positions"],
        "event_count": len(ordered_events),
        "signal_count": len(signals_out),
        "signals": signals_out,
    }
    output_canonical = canonical_json(payload)
    output_sha256 = sha256_str(output_canonical)

    return {
        "pid": os.getpid(),
        "python_executable": sys.executable,
        "python_version": platform.python_version(),
        "packages": {
            "polars": pl.__version__,
            "numpy": np.__version__,
        },
        "signed_strategy_spec_verified": signed_spec_check["verified"],
        "signed_strategy_spec_payload_sha256": signed_spec_check["recomputed_payload_sha256"],
        "production_h3_positions_sha256": prod_h3["positions_sha256"],
        "production_h3_nonzero_position_days": prod_h3["nonzero_position_days"],
        "production_h3_params_used": prod_h3["params_used"],
        "strategy_spec_sha256": spec_sha256,
        "output_sha256": output_sha256,
        "event_count": len(ordered_events),
        "signal_count": len(signals_out),
        "entries": sum(1 for s in signals_out if s["action"] == "ENTER_BASIS_CARRY"),
        "exits": sum(1 for s in signals_out if s["action"] == "EXIT_BASIS_CARRY"),
    }


def run_orchestrator(
    runs_per_env: int = 10,
    env1_python: str = ENV1_PYTHON,
    env2_python: str = ENV2_PYTHON,
) -> int:
    script_path = str(Path(__file__).resolve())
    envs = [
        ("env1", env1_python),
        ("env2", env2_python),
    ]
    runs: list[dict[str, Any]] = []
    for env_label, py_bin in envs:
        for run_idx in range(1, runs_per_env + 1):
            proc = subprocess.run(
                [py_bin, script_path, "--worker"],
                capture_output=True,
                text=True,
                check=True,
            )
            worker_res = json.loads(proc.stdout.strip())
            worker_res["env_label"] = env_label
            worker_res["run_index"] = run_idx
            runs.append(worker_res)

    unique_output_hashes = sorted({r["output_sha256"] for r in runs})
    unique_spec_hashes = sorted({r["strategy_spec_sha256"] for r in runs})
    unique_prod_hashes = sorted({r["production_h3_positions_sha256"] for r in runs})
    unique_signed_hashes = sorted({r["signed_strategy_spec_payload_sha256"] for r in runs})
    all_signed_verified = all(r["signed_strategy_spec_verified"] for r in runs)
    unique_pids = len({r["pid"] for r in runs})
    identical = (
        len(unique_output_hashes) == 1
        and len(unique_spec_hashes) == 1
        and len(unique_prod_hashes) == 1
        and len(unique_signed_hashes) == 1
        and all_signed_verified
        and len(runs) == 2 * runs_per_env
    )

    report = {
        "gate": "G3_DETERMINISTIC_SIGNAL_VALIDATION",
        "schema_version": "1.1.0",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "data_origin": DATA_ORIGIN_SYNTHETIC,
        "llm_in_path": False,
        "runs_per_env": runs_per_env,
        "total_runs": len(runs),
        "unique_pids": unique_pids,
        "environments": [
            {"label": label, "python_executable": py_bin} for label, py_bin in envs
        ],
        "signed_strategy_spec_verified": all_signed_verified,
        "signed_strategy_spec_payload_sha256": unique_signed_hashes[0] if unique_signed_hashes else None,
        "production_h3_positions_sha256": unique_prod_hashes[0] if unique_prod_hashes else None,
        "canonical_strategy_spec_sha256": unique_spec_hashes[0] if unique_spec_hashes else None,
        "canonical_output_sha256": unique_output_hashes[0] if unique_output_hashes else None,
        "unique_output_hash_count": len(unique_output_hashes),
        "identical_across_all_runs": identical,
        "verdict": "PASS_100_PCT_IDENTICAL" if identical else "FAIL_NON_DETERMINISTIC",
        "runs": runs,
    }

    OUTPUT_PATH.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if not identical:
        print(f"G3 determinism FAILED: {len(unique_output_hashes)} distinct hashes", file=sys.stderr)
        return 1
    print(
        f"G3 determinism PASS: {len(runs)}/{2 * runs_per_env} runs identical across 2 envs "
        f"(sha256={unique_output_hashes[0][:16]}...)"
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Independent G3 Deterministic Signal Validation")
    parser.add_argument("--worker", action="store_true", help="Run single deterministic worker")
    parser.add_argument("--runs-per-env", type=int, default=10, help="Subprocess runs per virtualenv")
    parser.add_argument("--env1", default=ENV1_PYTHON, help="Python executable for environment 1")
    parser.add_argument("--env2", default=ENV2_PYTHON, help="Python executable for environment 2")
    args = parser.parse_args()

    if args.worker:
        print(json.dumps(run_deterministic_replay(), sort_keys=True))
        return 0
    return run_orchestrator(
        runs_per_env=args.runs_per_env,
        env1_python=args.env1,
        env2_python=args.env2,
    )


if __name__ == "__main__":
    raise SystemExit(main())
