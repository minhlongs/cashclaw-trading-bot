"""Reproducibility: the same data must yield the same book and the same numbers.

This is not tidiness. The lab's whole claim is that a quoted Sharpe is
conditioned on a specific, auditable search. If two runs of identical code on
identical data can disagree, the registry count describes a search that never
exactly happened twice, and every statistic computed from it inherits the
ambiguity.

The concrete failure this guards: polars sums with a parallel group-by in
whatever order the threads finish. Float addition is not associative, so the
last bits of each daily funding total vary between runs. H1 ranks trailing
funding cross-sectionally, and a 1e-18 change flips ranks that sit close
together -- which changes the book, then the returns, then the Sharpe, then
whether the DSR gate passes.
"""

from __future__ import annotations

import numpy as np
import polars as pl
import pytest

from verification_lab.strategies import loaders as L


def _funding_frame(seed: int = 20261031) -> pl.DataFrame:
    """Funding events that include deliberate near-ties in their daily sums.

    Values are chosen so that several events in the same day differ only in the
    low bits. If the sum is order-dependent, these are the rows where it shows.
    """
    rng = np.random.default_rng(seed)
    rows = []
    for day in range(12):
        for sym in ("AAA", "BBB", "CCC"):
            for k in range(3):
                # Same base magnitude, perturbations at the last representable bits.
                rate = 0.0001 + rng.normal(0.0, 1e-9) + k * 2.0**-52
                rows.append(
                    {
                        "symbol": sym,
                        "ts_ms": day * L.DAY_MS + k * 28_800_000,
                        "funding_rate": float(rate),
                    }
                )
    # Reverse the row order: a stable aggregation must not depend on input order.
    return pl.DataFrame(rows).reverse()


def test_daily_funding_is_byte_stable_across_repeated_calls(monkeypatch):
    """Repeated aggregation of the same events must produce identical bits."""
    frame = _funding_frame()
    monkeypatch.setattr(L, "load", lambda name: frame)

    first = L.daily_funding()
    for _ in range(5):
        again = L.daily_funding()
        assert again.equals(first), "daily_funding changed between identical calls"
        # Bit-exact, not approximately equal: rank flips come from the last bits.
        np.testing.assert_array_equal(
            first["funding"].to_numpy().view(np.uint64),
            again["funding"].to_numpy().view(np.uint64),
        )


def test_daily_funding_is_invariant_to_input_row_order(monkeypatch):
    """Sorting before aggregation is the fix; shuffled input must not matter."""
    frame = _funding_frame()
    monkeypatch.setattr(L, "load", lambda name: frame)
    forward = L.daily_funding()
    forward_bits = forward["funding"].to_numpy().view(np.uint64).copy()

    monkeypatch.setattr(L, "load", lambda name: frame.reverse())
    backward = L.daily_funding()
    np.testing.assert_array_equal(
        backward["funding"].to_numpy().view(np.uint64),
        forward_bits,
        err_msg="aggregation depends on input row order, so ranks can flip between runs",
    )


def test_daily_funding_sums_every_event_in_the_day(monkeypatch):
    """The aggregation must be a sum of all events, not a last-value pick."""
    frame = pl.DataFrame(
        {
            "symbol": ["AAA", "AAA", "AAA", "BBB"],
            "ts_ms": [0, 3_600_000, 7_200_000, 0],
            "funding_rate": [0.0001, 0.0002, 0.0003, 0.0005],
        }
    )
    monkeypatch.setattr(L, "load", lambda name: frame)
    out = L.daily_funding().sort("symbol")
    assert out["funding"].to_list() == pytest.approx([0.0006, 0.0005])


def test_two_days_do_not_share_a_total(monkeypatch):
    """Day bucketing is by floor of the timestamp, not by event position."""
    frame = pl.DataFrame(
        {
            "symbol": ["AAA", "AAA"],
            "ts_ms": [L.DAY_MS - 1, L.DAY_MS],
            "funding_rate": [0.001, 0.002],
        }
    )
    monkeypatch.setattr(L, "load", lambda name: frame)
    out = L.daily_funding().sort("day")
    assert out["day"].to_list() == [0, 1]
    assert out["funding"].to_list() == pytest.approx([0.001, 0.002])


def _panel(seed: int, n_symbols: int = 6) -> dict[str, pl.DataFrame]:
    """A small synthetic panel with funding persistence and a real basis."""
    rng = np.random.default_rng(seed)
    days = 240
    symbols = [f"SYM{i}" for i in range(n_symbols)]
    px = 100.0 * np.exp(rng.normal(0.0, 0.02, size=(days, n_symbols)).cumsum(axis=0))
    returns = np.vstack(
        [np.full((1, n_symbols), np.nan), px[1:] / px[:-1] - 1.0]
    )
    close = pl.DataFrame({"day": range(days), **{s: px[:, i] for i, s in enumerate(symbols)}})
    rets = pl.DataFrame(
        {"day": range(days), **{s: returns[:, i] for i, s in enumerate(symbols)}}
    )
    fund = pl.DataFrame(
        {
            "day": range(days),
            **{s: rng.normal(0.0005, 0.0003, days) for s in symbols},
        }
    )
    spot = pl.DataFrame(
        {"day": range(days), **{s: px[:, i] * 1.001 for i, s in enumerate(symbols)}}
    )
    return {"close": close, "returns": rets, "funding": fund, "spot": spot}


def _weights_matrix(pos: pl.DataFrame) -> np.ndarray:
    cols = [c for c in pos.columns if c != "day"]
    return pos.select(cols).to_numpy()


def test_h1_produces_the_same_positions_and_returns_twice():
    """The strategy rebuild must be deterministic given the same live panel."""
    from verification_lab.strategies import h1_funding_carry as h1

    p = _panel(1)
    runs = []
    for _ in range(2):
        pos = h1.build_positions(p["funding"], lookback=5, entry_band=0.6, exit_band=0.4)
        res = h1.backtest(pos, p["returns"], p["funding"])
        runs.append((pos, res))
    w0 = _weights_matrix(runs[0][0])
    w1 = _weights_matrix(runs[1][0])
    assert np.any(np.abs(w0) > 0.0), "fixture must produce active cross-sectional positions"
    np.testing.assert_array_equal(w0, w1)
    np.testing.assert_array_equal(runs[0][1]["net"], runs[1][1]["net"])


def test_h1_never_holds_a_position_before_its_signal_exists():
    """Causality: the book must be flat through the first `lookback` bars."""
    from verification_lab.strategies import h1_funding_carry as h1

    p = _panel(2)
    pos = h1.build_positions(p["funding"], lookback=7, entry_band=0.6, exit_band=0.4)
    weights = _weights_matrix(pos)
    assert np.all(np.abs(weights[:7]) == 0.0), (
        "a position exists before any trailing signal window has closed"
    )
    assert np.any(np.abs(weights[7:]) > 0.0), "book must become active once the window closes"


def test_h1_weights_are_dollar_neutral():
    """A cross-sectional carry book must sum to zero weight and unit gross on every live day."""
    from verification_lab.strategies import h1_funding_carry as h1

    p = _panel(3)
    pos = h1.build_positions(p["funding"], lookback=5, entry_band=0.6, exit_band=0.3)
    w = _weights_matrix(pos)
    active = np.abs(w).sum(axis=1) > 0.0
    assert np.any(active)
    assert np.allclose(np.nansum(w, axis=1), 0.0, atol=1e-12)
    assert np.allclose(np.abs(w[active]).sum(axis=1), 1.0, atol=1e-12)


def test_costs_reduce_net_and_never_add_to_it():
    """Net must be exactly gross minus cost, with cost non-negative everywhere."""
    from verification_lab.strategies import h1_funding_carry as h1

    p = _panel(4)
    pos = h1.build_positions(p["funding"], lookback=5, entry_band=0.5, exit_band=0.3)
    res = h1.backtest(pos, p["returns"], p["funding"], cost_bps_per_turn=6.0)
    assert np.all(res["cost"] >= 0.0)
    np.testing.assert_allclose(res["net"], res["gross"] - res["cost"])


def test_h2_volatility_of_a_late_listing_is_nan_without_warning():
    """An asset that has not listed yet has no volatility, and that is not an error.

    `nanstd(ddof=1)` on an all-NaN window warns "Degrees of freedom <= 0". Across
    19 symbols x 2130 bars that is hundreds of warnings per run, which buries any
    real one. The value must stay NaN and the run must stay quiet.
    """
    import warnings

    from verification_lab.strategies import h2_tsmom as h2

    window = np.full((30, 3), np.nan)
    window[:, 0] = 0.01  # a listed asset alongside two that are not
    with warnings.catch_warnings():
        warnings.simplefilter("error", RuntimeWarning)
        vol = h2._trailing_vol_annual(window)
    assert np.isnan(vol[1]) and np.isnan(vol[2])
    assert vol[0] == pytest.approx(0.0), "a constant return window has zero volatility"


def test_h2_volatility_matches_the_annualisation_of_a_known_window():
    from verification_lab.strategies import h2_tsmom as h2

    window = np.array([[0.01], [-0.01], [0.02], [-0.02]])
    expected = float(np.std(window, ddof=1)) * np.sqrt(365.0)
    assert h2._trailing_vol_annual(window)[0] == pytest.approx(expected)


def test_stressed_costs_are_monotone_in_the_multiplier():
    """A larger cost multiple can only make cumulative net worse."""
    from verification_lab.strategies import h1_funding_carry as h1

    p = _panel(5)
    pos = h1.build_positions(p["funding"], lookback=5, entry_band=0.5, exit_band=0.3)
    res = h1.backtest(pos, p["returns"], p["funding"])
    assert float(np.sum(res["cost"])) > 0.0
    totals = [
        float(np.sum(res["gross"] - res["cost"] * m)) for m in (1.0, 1.5, 2.0, 3.0)
    ]
    assert totals == sorted(totals, reverse=True), f"cost stress is not monotone: {totals}"


def test_wide_funding_preserves_null_for_absent_prelisting_cells(monkeypatch):
    """Absent (day, symbol) funding cells must stay null, never silently 0.0."""
    frame = pl.DataFrame(
        {
            "symbol": ["AAA", "AAA", "AAA", "LATE"],
            "ts_ms": [0, L.DAY_MS, 2 * L.DAY_MS, 2 * L.DAY_MS],
            "funding_rate": [0.0004, 0.0005, 0.0006, 0.0007],
        }
    )
    monkeypatch.setattr(L, "load", lambda name: frame)
    wide = L.wide_funding(pl.Series("day", [0, 1, 2]))
    assert wide["LATE"].to_list()[:2] == [None, None]
    assert wide["LATE"][2] == pytest.approx(0.0007)


def test_returns_from_wide_staleness_guard_on_integer_days():
    """Integer day indices must null multi-day gaps while preserving <= max_stale_days."""
    wide = pl.DataFrame(
        {
            "day": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            "SYM": [100.0, 101.0, None, 103.0, 104.0, None, None, None, None, 110.0, 111.0],
        }
    )
    rets = L.returns_from_wide(wide, max_stale_days=2)
    vals = rets["SYM"].to_list()
    assert vals[0] is None
    assert vals[1] == pytest.approx(101.0 / 100.0 - 1.0)
    assert vals[3] == pytest.approx(103.0 / 101.0 - 1.0)  # 2-day step allowed
    assert vals[4] == pytest.approx(104.0 / 103.0 - 1.0)
    assert vals[9] is None  # 5-day gap (day 4 -> day 9) nulled
    assert vals[10] == pytest.approx(111.0 / 110.0 - 1.0)


def test_h1_prelisting_nulls_stay_flat_and_book_stays_dollar_neutral():
    """Unlisted symbols with NaN funding must never receive weights before listing."""
    from verification_lab.strategies import h1_funding_carry as h1

    rng = np.random.default_rng(42)
    days = 80
    data: dict[str, object] = {"day": list(range(days))}
    for i in range(6):
        col = rng.normal(0.0003 * (i - 2.5), 0.0001, size=days)
        if i >= 4:
            col[:40] = np.nan  # late-listing symbols
        data[f"S{i}"] = col
    funding = pl.DataFrame(data)
    pos = h1.build_positions(funding, lookback=5, entry_band=0.6, exit_band=0.4)
    w = _weights_matrix(pos)
    # Late-listing symbols S4 and S5 must carry strictly zero weight while unlisted.
    assert np.all(w[:43, 4:] == 0.0)
    active = np.abs(w).sum(axis=1) > 0.0
    assert np.any(active[:40]) and np.any(active[45:])
    assert np.allclose(w.sum(axis=1), 0.0, atol=1e-12)
    assert np.allclose(np.abs(w[active]).sum(axis=1), 1.0, atol=1e-12)


def test_h1_entry_band_half_with_odd_symbol_count_stays_symmetric():
    """At entry_band=0.5 with 7 symbols, the median rank 0.5 must not break neutrality."""
    from verification_lab.strategies import h1_funding_carry as h1

    p = _panel(77, n_symbols=7)
    pos = h1.build_positions(p["funding"], lookback=3, entry_band=0.5, exit_band=0.35)
    w = _weights_matrix(pos)
    active = np.abs(w).sum(axis=1) > 0.0
    assert np.any(active)
    assert np.allclose(w.sum(axis=1), 0.0, atol=1e-12)
    assert np.allclose(np.abs(w[active]).sum(axis=1), 1.0, atol=1e-12)


def test_h1_drift_buffer_holds_until_exit_band_is_crossed():
    """A short entered at rank 1.0 holds at rank 0.5 (>= exit_band=0.4) and exits below 0.4."""
    from verification_lab.strategies import h1_funding_carry as h1

    # 5 symbols, lookback=3. Construct funding so S4 starts highest (rank 1.0),
    # then drifts to middle rank 0.5 (held because 0.5 >= exit_band=0.4),
    # then drops to rank 0.25 (< 0.4 -> exited to flat).
    rows = []
    # Days 0..2: S0 < S1 < S2 < S3 < S4 -> at day 3, S4 rank=1.0 (short), S0 rank=0.0 (long)
    for _ in range(3):
        rows.append([0.0001, 0.0002, 0.0003, 0.0004, 0.0005])
    # Days 3..5: move S4 to exact middle (0.0003) -> at day 6, S4 rank=0.5 (still >= 0.4 -> stays short!)
    for _ in range(3):
        rows.append([0.0001, 0.0002, 0.0004, 0.0005, 0.0003])
    # Days 6..8: move S4 to second-lowest (0.00015) -> at day 9, S4 rank=0.25 (< 0.4, > 0.2 -> flat!)
    for _ in range(4):
        rows.append([0.0001, 0.0003, 0.0004, 0.0005, 0.00015])
    arr = np.asarray(rows, dtype=float)
    funding = pl.DataFrame({"day": range(len(rows)), **{f"S{i}": arr[:, i] for i in range(5)}})
    pos = h1.build_positions(funding, lookback=3, entry_band=0.8, exit_band=0.4)
    w = _weights_matrix(pos)
    assert w[3, 4] < 0.0, "S4 must enter short at rank 1.0"
    assert w[6, 4] < 0.0, "S4 must hold short inside drift buffer at rank 0.5 >= exit_band=0.4"
    assert w[9, 4] == 0.0, "S4 must exit to flat once rank 0.25 drops below exit_band=0.4"
    assert np.allclose(w.sum(axis=1), 0.0, atol=1e-12)


def test_h3_causal_shift_lags_same_bar_decision_by_one_day_and_exits_on_gap():
    """H3 causal_shift=True must lag causal_shift=False by 1 bar and flatten on perp gaps."""
    from verification_lab.strategies import h3_basis_carry as h3

    days = 20
    # Flat basis for days 0..4, wide positive basis from day 5 onward, perp gap at day 12.
    b_vals = [0.0] * 5 + [0.003] * 7 + [None] + [0.003] * 7
    f_vals = [0.0005] * days
    basis = pl.DataFrame({"day": range(days), "PAIR": b_vals})
    funding = pl.DataFrame({"day": range(days), "PAIR": f_vals})

    causal = h3.build_positions(
        basis, funding, lookback=3, entry_annual_bps=200.0, exit_annual_bps=100.0, causal_shift=True
    )["PAIR"].to_numpy()
    leaky = h3.build_positions(
        basis, funding, lookback=3, entry_annual_bps=200.0, exit_annual_bps=100.0, causal_shift=False
    )["PAIR"].to_numpy()

    # At day 5, 3-bar trailing mean of [0, 0, 0.003] = 0.001 -> 3650 bps > 200 bps.
    # Unshifted (leaky) enters on day 5 itself; causal enters on day 6 (1 bar later).
    assert leaky[5] == pytest.approx(1.0)
    assert causal[5] == pytest.approx(0.0)
    assert causal[6] == pytest.approx(1.0)
    # Day 12 has missing perp basis -> unshifted drops at 12, causal drops at 13.
    assert leaky[12] == pytest.approx(0.0)
    assert causal[13] == pytest.approx(0.0)


def test_log_trials_records_train_only_turnover_and_break_even(tmp_path):
    """Registry entries must never leak OOS turnover or break-even into train records."""
    from verification_lab.runner import run_grid
    from verification_lab.runner.trial_registry import TrialRegistry

    days = 100
    split = 70
    gross = np.concatenate([np.full(split, 0.01), np.full(days - split, -0.50)])
    cost = np.concatenate([np.full(split, 0.002), np.full(days - split, 0.25)])
    turnover = np.concatenate([np.full(split, 0.10), np.full(days - split, 9.00)])
    net = gross - cost

    dummy_close = pl.DataFrame({"day": range(days), "A": np.linspace(100.0, 110.0, days)})
    panel = run_grid.Panel(
        perp_close=dummy_close,
        perp_returns=dummy_close,
        spot_close=dummy_close,
        spot_returns=dummy_close,
        funding=dummy_close,
        basis=dummy_close,
    )
    trials = {
        "H2": [
            {
                "params": {"lookback": 10, "target_vol_annual": 0.2},
                "net": net,
                "result": {
                    "net": net,
                    "gross": gross,
                    "cost": cost,
                    "turnover": turnover,
                    "break_even_multiple": -999.0,  # full-sample polluted value
                    "mean_turnover": 999.0,         # full-sample polluted value
                },
            }
        ]
    }
    reg = TrialRegistry(tmp_path / "trials.jsonl")
    run_grid.log_trials(reg, trials, panel, train_fraction=0.7)
    rec = reg.records()[0]
    assert rec["break_even_multiple"] == pytest.approx(5.0)
    assert rec["mean_turnover"] == pytest.approx(0.10)


def test_h2_staleness_guard_and_single_causal_shift_benchmark_alignment():
    """H2 must route internal returns through max_stale_days=2 and align benchmark_costs gross."""
    from verification_lab.strategies import h2_tsmom as h2

    rng = np.random.default_rng(88)
    days = 80
    px = 100.0 * np.exp(np.cumsum(rng.normal(0.001, 0.02, size=days)))
    # Inject a 5-day gap (days 40..44 missing, resuming at day 45 with a huge jump)
    vals: list[float | None] = [float(x) for x in px]
    for k in range(40, 44):
        vals[k] = None
    vals[44] = float(px[39] * 5.0)  # 5-day stale jump that must be nulled by max_stale_days=2
    for k in range(45, days):
        vals[k] = float(vals[k - 1] * 1.002)

    close_wide = pl.DataFrame({"day": list(range(days)), "BTCUSDT": vals})
    guarded = h2._guarded_returns(close_wide, ["BTCUSDT"])
    assert np.isnan(guarded[44, 0]), "5-day stale return must be nulled by max_stale_days=2"

    bh_gross = h2.benchmark_buy_and_hold(close_wide, target_vol_annual=0.25)
    bh_costed = h2.benchmark_costs(close_wide, target_vol_annual=0.25)
    # `benchmark_buy_and_hold` and `benchmark_costs["gross"]` must be bit-identical (single causal lag).
    np.testing.assert_allclose(bh_gross, bh_costed["gross"], rtol=0.0, atol=1e-15)


def test_g2_ingest_universe_has_no_duplicate_symbols():
    """Source UNIVERSE literal in g2_ingest.py must list each symbol once."""
    import importlib.util
    from pathlib import Path

    script = Path(__file__).resolve().parents[1] / "scripts" / "g2_ingest.py"
    spec = importlib.util.spec_from_file_location("g2_ingest", script)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert len(mod.UNIVERSE) == 19
    assert len(set(mod.UNIVERSE)) == 19


def test_g2_ingest_retries_transient_http_and_fails_closed_on_hard_errors(monkeypatch, tmp_path):
    """fetch() must retry transient failures, and main() must exit 1 on hard errors."""
    import importlib.util
    import io
    import zipfile
    from pathlib import Path

    import requests

    script = Path(__file__).resolve().parents[1] / "scripts" / "g2_ingest.py"
    spec = importlib.util.spec_from_file_location("g2_ingest_retry", script)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    monkeypatch.setattr(mod, "RAW", tmp_path / "raw")
    monkeypatch.setattr(mod, "NORM", tmp_path / "norm")
    monkeypatch.setattr(mod, "ART", tmp_path / "art")
    monkeypatch.setattr(mod.time, "sleep", lambda _s: None)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("BTCUSDT-1d-2023-01.csv", "1672531200000,100,105,99,102,1000\n")
    valid_zip = buf.getvalue()

    class _Resp:
        def __init__(self, status_code: int, content: bytes = b"") -> None:
            self.status_code = status_code
            self.content = content

    # 1. Transient RequestException + HTTP 503 followed by HTTP 200 succeeds on attempt 3.
    calls = {"n": 0}

    def flaky_get(_url: str, timeout: int = 60):
        del timeout
        calls["n"] += 1
        if calls["n"] == 1:
            raise requests.ConnectionError("transient reset")
        if calls["n"] == 2:
            return _Resp(503)
        return _Resp(200, valid_zip)

    monkeypatch.setattr(mod.requests, "get", flaky_get)
    rec = mod.fetch(("perp_1d", "BTCUSDT", 2023, 1))
    assert calls["n"] == 3
    assert rec["status"] == "ok"
    assert rec["rows"] == 1

    # 2. Persistent transport failure across all retries surfaces status="error" and main() exits 1.
    monkeypatch.setattr(mod, "UNIVERSE", ["ETHUSDT"])
    monkeypatch.setattr(mod, "DATASETS", {"perp_1d": mod.DATASETS["perp_1d"]})
    monkeypatch.setattr(mod, "months_until_now", lambda: [(2023, 1)])
    monkeypatch.setattr(
        mod.requests,
        "get",
        lambda _url, timeout=60: (_ for _ in ()).throw(requests.Timeout("timed out")),
    )
    assert mod.main(["--max-errors", "0"]) == 1
    assert mod.main(["--max-errors", "1"]) == 0


def test_gate_scripts_insert_src_directory_into_sys_path():
    """g4, g5, and g6 scripts must add verification_lab/src to sys.path for non-editable runs."""
    from pathlib import Path

    scripts_dir = Path(__file__).resolve().parents[1] / "scripts"
    for script_name in ("g4_leakage_audit.py", "g5_statistical_validity.py", "g6_execution_tca.py"):
        text = (scripts_dir / script_name).read_text(encoding="utf-8")
        assert 'parents[1] / "src"' in text, f"{script_name} missing / 'src' in sys.path bootstrap"


def test_g2_ingest_offline_mode_never_calls_network_and_preserves_provenance(monkeypatch, tmp_path):
    """--offline must never invoke requests.get and must preserve existing provenance bytes."""
    import importlib.util
    import io
    import zipfile
    from pathlib import Path

    script = Path(__file__).resolve().parents[1] / "scripts" / "g2_ingest.py"
    spec = importlib.util.spec_from_file_location("g2_ingest_offline", script)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    raw_dir = tmp_path / "raw"
    norm_dir = tmp_path / "norm"
    art_dir = tmp_path / "art"
    monkeypatch.setattr(mod, "REPO", tmp_path)
    monkeypatch.setattr(mod, "RAW", raw_dir)
    monkeypatch.setattr(mod, "NORM", norm_dir)
    monkeypatch.setattr(mod, "ART", art_dir)
    monkeypatch.setattr(mod, "UNIVERSE", ["BTCUSDT", "UNIUSDT"])
    monkeypatch.setattr(mod, "DATASETS", {"perp_1d": mod.DATASETS["perp_1d"]})
    monkeypatch.setattr(mod, "months_until_now", lambda: [(2023, 1)])
    monkeypatch.setattr(
        mod.requests,
        "get",
        lambda *_a, **_kw: (_ for _ in ()).throw(AssertionError("network forbidden in --offline")),
    )

    # Seed one cached archive (BTCUSDT) and leave UNIUSDT uncached.
    (raw_dir / "perp_1d").mkdir(parents=True, exist_ok=True)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("BTCUSDT-1d-2023-01.csv", "1672531200000,100,105,99,102,1000\n")
    (raw_dir / "perp_1d" / "BTCUSDT-2023-01.zip").write_bytes(buf.getvalue())

    # Without pre-existing provenance, --offline records cache_miss and enforces --max-errors.
    assert mod.main(["--offline", "--max-errors", "0"]) == 1
    assert mod.main(["--offline", "--max-errors", "1"]) == 0
    prov_path = art_dir / "g2_data_provenance.parquet"
    before_bytes = prov_path.read_bytes()

    # With pre-existing provenance, --offline reuses it byte-for-byte without touching network.
    assert mod.main(["--offline", "--max-errors", "1"]) == 0
    assert prov_path.read_bytes() == before_bytes
    assert (norm_dir / "perp_1d.parquet").exists()

    # On a fresh clone (provenance exists, cached raw zip absent), --offline fails closed cleanly.
    (raw_dir / "perp_1d" / "BTCUSDT-2023-01.zip").unlink()
    assert mod.main(["--offline", "--max-errors", "1"]) == 1
    assert prov_path.read_bytes() == before_bytes



