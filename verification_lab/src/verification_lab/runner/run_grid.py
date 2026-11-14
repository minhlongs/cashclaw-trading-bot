"""Enumerate every configuration of H1/H2/H3 (and Batch-2 overlays) and log to the registry.

Why a full enumeration rather than a shortlist: the audit's objection is that a
presented Sharpe has no search behind it. The only honest answer is to run the
whole grid, keep every result including the losers, and let N be whatever the
grid size actually is. Selecting the best configuration afterwards is then a
deflated claim, not a free one.

The train/test split is chronological and fixed before any result is seen:
the first `train_fraction` of days is the search set, the remainder is the
locked out-of-sample set and is scored once, on the winner, after the registry
is sealed.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass

import numpy as np
import polars as pl

from ..stats.core import sharpe_ratio
from ..strategies import h1_funding_carry as h1
from ..strategies import h2_tsmom as h2
from ..strategies import h3_basis_carry as h3
from ..strategies import loaders as L
from ..strategies.common import break_even_multiple
from .trial_registry import TrialRecord, TrialRegistry, now

PERIODS = 365


@dataclass(frozen=True)
class Panel:
    perp_close: pl.DataFrame
    perp_returns: pl.DataFrame
    spot_close: pl.DataFrame
    spot_returns: pl.DataFrame
    funding: pl.DataFrame
    basis: pl.DataFrame
    universe: str = "CORE_19"

    @property
    def days(self) -> np.ndarray:
        return self.perp_close["day"].to_numpy()


def build_panel(universe: str | None = "CORE_19") -> Panel:
    perp_close = L.wide_close("perp_1d", symbols=universe)
    spot_close = L.wide_close("spot_1d", symbols=universe)
    return Panel(
        perp_close=perp_close,
        perp_returns=L.returns_from_wide(perp_close, max_stale_days=2),
        spot_close=spot_close,
        spot_returns=L.returns_from_wide(spot_close, max_stale_days=2),
        funding=L.wide_funding(perp_close["day"], symbols=universe, perp_close_wide=perp_close),
        basis=h3.basis_wide(perp_close, spot_close),
        universe=str(universe or "ALL"),
    )


def _slice(series: np.ndarray, lo: int, hi: int) -> np.ndarray:
    return series[lo:hi]


def run_h1(panel: Panel) -> list[dict]:
    keys = list(h1.GRID)
    out = []
    for values in itertools.product(*(h1.GRID[k] for k in keys)):
        cfg = dict(zip(keys, values))
        pos = h1.build_positions(panel.funding, **cfg)
        res = h1.backtest(pos, panel.perp_returns, panel.funding)
        out.append({"params": cfg, "result": res, "net": res["net"], "positions": pos})
    return out


def run_h2(panel: Panel) -> list[dict]:
    keys = list(h2.GRID)
    out = []
    for values in itertools.product(*(h2.GRID[k] for k in keys)):
        cfg = dict(zip(keys, values))
        pos = h2.build_positions(panel.perp_close, **cfg)
        res = h2.evaluate(pos, panel.perp_returns, panel.funding)
        out.append({"params": cfg, "result": res, "net": res["net"], "positions": pos})
    return out


def run_h3(panel: Panel) -> list[dict]:
    keys = list(h3.GRID)
    out = []
    for values in itertools.product(*(h3.GRID[k] for k in keys)):
        cfg = dict(zip(keys, values))
        pos = h3.build_positions(panel.basis, panel.funding, **cfg)
        res = h3.evaluate(pos, panel.perp_returns, panel.spot_returns, panel.funding)
        out.append({"params": cfg, "result": res, "net": res["net"], "positions": pos})
    return out


def run_h1_g1(panel: Panel) -> list[dict]:
    keys = list(h1.G1_GRID)
    out = []
    for values in itertools.product(*(h1.G1_GRID[k] for k in keys)):
        cfg = dict(zip(keys, values))
        pos = h1.build_positions_g1(panel.funding, panel.perp_returns, **cfg)
        res = h1.backtest(pos, panel.perp_returns, panel.funding)
        out.append({"params": cfg, "result": res, "net": res["net"], "positions": pos})
    return out


def run_h2_g1(panel: Panel) -> list[dict]:
    keys = list(h2.G1_GRID)
    out = []
    for values in itertools.product(*(h2.G1_GRID[k] for k in keys)):
        cfg = dict(zip(keys, values))
        pos = h2.build_positions_g1(panel.perp_close, **cfg)
        res = h2.evaluate(pos, panel.perp_returns, panel.funding)
        out.append({"params": cfg, "result": res, "net": res["net"], "positions": pos})
    return out


def run_h3_maker(panel: Panel) -> list[dict]:
    keys = list(h3.MAKER_GRID)
    out = []
    for values in itertools.product(*(h3.MAKER_GRID[k] for k in keys)):
        cfg = dict(zip(keys, values))
        pos = h3.build_positions_maker(panel.basis, panel.funding, **cfg)
        res = h3.evaluate_maker(pos, panel.perp_returns, panel.spot_returns, panel.funding)
        out.append({"params": cfg, "result": res, "net": res["net"], "positions": pos})
    return out


def enumerate_all(panel: Panel) -> dict[str, list[dict]]:
    return {"H1": run_h1(panel), "H2": run_h2(panel), "H3": run_h3(panel)}


def enumerate_batch2(panel: Panel) -> dict[str, list[dict]]:
    return {
        "H1_G1": run_h1_g1(panel),
        "H2_G1": run_h2_g1(panel),
        "H3_MAKER": run_h3_maker(panel),
    }


def log_trials(
    registry: TrialRegistry,
    trials: dict[str, list[dict]],
    panel: Panel,
    train_fraction: float = 0.7,
    *,
    note: str = "",
) -> int:
    days = len(panel.days)
    split = int(days * train_fraction)
    window = f"train 0..{split} of {days}"

    for name, runs in trials.items():
        for run in runs:
            net = run["net"]
            res = run["result"]
            net_tr = _slice(net, 0, split)
            gross_tr = _slice(res["gross"], 0, split)
            cost_tr = _slice(res["cost"], 0, split)
            turn_tr = _slice(res["turnover"], 0, split)
            registry.record(
                TrialRecord(
                    seq=registry.count + 1,
                    recorded_at=now(),
                    hypothesis=name,
                    params={k: v for k, v in run["params"].items()},
                    window=window,
                    sharpe=sharpe_ratio(net_tr, PERIODS),
                    cum_net=float(np.nansum(net_tr)),
                    cum_gross=float(np.nansum(gross_tr)),
                    cum_cost=float(np.nansum(cost_tr)),
                    break_even_multiple=float(break_even_multiple(gross_tr, cost_tr)),
                    mean_turnover=float(np.nanmean(turn_tr)),
                    days=int(split),
                    status="completed",
                    note=note,
                )
            )
    return registry.count


def return_matrix(runs: list[dict]) -> np.ndarray:
    """Trials x time matrix of net returns, the input PBO and CPCV need."""
    return np.vstack([run["net"] for run in runs])
