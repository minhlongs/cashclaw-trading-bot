"""Core immutable models and live-verified venue specifications for H3_CASH_FUNDED_BASIS_CARRY_V3.

Read-only offline research models only. Zero order-capable or credential-bearing imports.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from enum import Enum


class VenueRoute(str, Enum):
    """Three candidate venue structures evaluated for cash-funded V3."""

    HYPERLIQUID_SAME_VENUE = "ROUTE_A_HYPERLIQUID_UBTC_SPOT_BTC_PERP"
    BINANCE_SAME_VENUE = "ROUTE_B_BINANCE_BTC_SPOT_BTC_PERP"
    CROSS_VENUE_BN_SPOT_HL_PERP = "ROUTE_C_CROSS_VENUE_BINANCE_SPOT_HL_PERP"


class RouteFeasibilityVerdict(str, Enum):
    """Mandated route-level feasibility classifications."""

    MECHANICALLY_FEASIBLE = "MECHANICALLY_FEASIBLE"
    INFEASIBLE_AT_TARGET_CAPITAL = "INFEASIBLE_AT_TARGET_CAPITAL"
    UNVERIFIED_MARKET_ACCESS = "UNVERIFIED_MARKET_ACCESS"
    INSUFFICIENT_AUTHENTIC_DATA = "INSUFFICIENT_AUTHENTIC_DATA"


@dataclass(frozen=True)
class AllocationPolicy:
    """Strictly cash-funded V3 capital allocation ratios.

    Invariant: spot_ratio + perp_im_ratio + free_reserve_ratio == Decimal("1")
    No literal borrowed principal is permitted anywhere in V3.
    """

    spot_ratio: Decimal = Decimal("0.60")
    perp_im_ratio: Decimal = Decimal("0.15")
    free_reserve_ratio: Decimal = Decimal("0.25")
    min_free_reserve_ratio: Decimal = Decimal("0.25")

    def __post_init__(self) -> None:
        total = self.spot_ratio + self.perp_im_ratio + self.free_reserve_ratio
        if total != Decimal("1"):
            raise ValueError(f"Allocation ratios must sum to 1, got {total}")
        if self.spot_ratio <= Decimal("0") or self.perp_im_ratio <= Decimal("0"):
            raise ValueError("Spot and perp IM ratios must be strictly positive")
        if self.free_reserve_ratio < self.min_free_reserve_ratio:
            raise ValueError(
                f"Free reserve ratio {self.free_reserve_ratio} below minimum {self.min_free_reserve_ratio}"
            )


@dataclass(frozen=True)
class VenueRouteSpec:
    """Venue & instrument specification anchored to public read-only metadata probes."""

    route: VenueRoute
    label: str
    spot_venue: str
    perp_venue: str
    spot_symbol: str
    spot_asset_id: str
    perp_symbol: str
    collateral_currency: str
    is_wrapped_spot: bool
    wrapper_risk_notes: str
    spot_price_usd: Decimal
    perp_price_usd: Decimal
    spot_bid_usd: Decimal
    spot_ask_usd: Decimal
    perp_bid_usd: Decimal
    perp_ask_usd: Decimal
    spot_min_qty: Decimal
    spot_step_size: Decimal
    spot_min_notional_usd: Decimal
    perp_min_qty: Decimal
    perp_step_size: Decimal
    perp_min_notional_usd: Decimal
    perp_maint_margin_rate: Decimal
    perp_initial_margin_rate: Decimal
    spot_maker_fee_bps: Decimal
    spot_taker_fee_bps: Decimal
    perp_maker_fee_bps: Decimal
    perp_taker_fee_bps: Decimal
    funding_interval_hours: int
    observed_annual_funding_bps: Decimal
    historical_mean_funding_bps: Decimal
    operational_penalty_bps_annual: Decimal
    cross_venue_transfer_fee_usd: Decimal
    account_mode_notes: str
    portfolio_margin_required: bool
    venue_access_classification: str
    data_confidence_classification: str
    route_verdict: RouteFeasibilityVerdict
    probe_source_sha256: tuple[str, ...]


def build_default_route_specs() -> dict[VenueRoute, VenueRouteSpec]:
    """Return live-probed (2026-11-23T06:35Z) public venue specifications.

    All instrument rules (minQty, stepSize, minNotional, maintMarginPercent, L2 quotes,
    UBTC token index 197 / universe @142) come directly from bounded read-only public
    probes archived outside Git at /Users/macbook/.cashclaw-diagnostics/cashclaw-28-20261123/.
    """
    return {
        VenueRoute.HYPERLIQUID_SAME_VENUE: VenueRouteSpec(
            route=VenueRoute.HYPERLIQUID_SAME_VENUE,
            label="Route A: Hyperliquid Same-Venue (UBTC/USDC Spot + BTC-PERP)",
            spot_venue="hyperliquid",
            perp_venue="hyperliquid",
            spot_symbol="UBTC/USDC (@142)",
            spot_asset_id="token_index=197,tokenId=0x8f254b963e8468305d409b33aa137c67,universe=@142,isCanonical=false",
            perp_symbol="BTC-PERP",
            collateral_currency="USDC",
            is_wrapped_spot=True,
            wrapper_risk_notes=(
                "UBTC ('Unit Bitcoin', isCanonical=false, evmContract=0x9fdb...463) is bridged/wrapped BTC "
                "via Unit Protocol, NOT native L1 BTC custody. Subject to bridge/custody depeg risk; "
                "observed UBTC mid ($61,415.50) traded at -15.67 bps discount vs HL BTC oracle ($61,511.90)."
            ),
            spot_price_usd=Decimal("61415.50"),
            perp_price_usd=Decimal("61494.00"),
            spot_bid_usd=Decimal("61415.00"),
            spot_ask_usd=Decimal("61416.00"),
            perp_bid_usd=Decimal("61492.00"),
            perp_ask_usd=Decimal("61493.00"),
            spot_min_qty=Decimal("0.00001"),
            spot_step_size=Decimal("0.00001"),
            spot_min_notional_usd=Decimal("10.00"),
            perp_min_qty=Decimal("0.00001"),
            perp_step_size=Decimal("0.00001"),
            perp_min_notional_usd=Decimal("10.00"),
            perp_maint_margin_rate=Decimal("0.0125"),  # 1/(2*40x) = 1.25% base tier
            perp_initial_margin_rate=Decimal("0.25"),  # Conservative 4x perp leg cap (15% of equity / 60% notional)
            spot_maker_fee_bps=Decimal("4.0"),  # Tier 0 verified from Hyperliquid docs
            spot_taker_fee_bps=Decimal("7.0"),
            perp_maker_fee_bps=Decimal("1.5"),
            perp_taker_fee_bps=Decimal("4.5"),
            funding_interval_hours=1,
            observed_annual_funding_bps=Decimal("1095.0"),  # 0.0000125 * 8760 * 10000
            historical_mean_funding_bps=Decimal("1018.8"),  # 18,264 1h rows (2024-10..2026-10)
            operational_penalty_bps_annual=Decimal("50.0"),  # UBTC wrapper/bridge risk haircut
            cross_venue_transfer_fee_usd=Decimal("0"),
            account_mode_notes=(
                "Unified Account shares a single USDC balance across spot and USDC-margined perps "
                "without Portfolio Margin, but does NOT cross-collateralize spot UBTC for BTC-PERP margin. "
                "Cash-funded V3 therefore avoids Portfolio Margin completely at the cost of ~40% idle/margin USDC."
            ),
            portfolio_margin_required=False,
            venue_access_classification="DECENTRALIZED_PUBLIC_API_VERIFIED_GEO_UNVERIFIED",
            data_confidence_classification="LIVE_L2_SNAPSHOT_LOCAL_UNAUTHENTICATED_HIST_HASH_UNVERIFIED",
            route_verdict=RouteFeasibilityVerdict.MECHANICALLY_FEASIBLE,
            probe_source_sha256=(
                "af2fc66adf89684c",
                "4b0eb6ff1b4910df",
                "8d95fd025e0c2780",
                "4556f1a40e5102d8",
                "db5e0800ba53a8b2",
            ),
        ),
        VenueRoute.BINANCE_SAME_VENUE: VenueRouteSpec(
            route=VenueRoute.BINANCE_SAME_VENUE,
            label="Route B: Binance Same-Venue (BTC/USDT Spot + BTC/USDT Perp)",
            spot_venue="binance",
            perp_venue="binance",
            spot_symbol="BTCUSDT",
            spot_asset_id="binance_spot:BTCUSDT",
            perp_symbol="BTCUSDT-PERP",
            collateral_currency="USDT",
            is_wrapped_spot=False,
            wrapper_risk_notes=(
                "Native exchange-custodied BTC spot and USDT-M perpetual on Binance. "
                "No wrapper depeg, but subject to CEX custody, KYC, and strict regional derivatives restrictions."
            ),
            spot_price_usd=Decimal("61510.395"),
            perp_price_usd=Decimal("61471.08541304"),
            spot_bid_usd=Decimal("61510.39"),
            spot_ask_usd=Decimal("61510.40"),
            perp_bid_usd=Decimal("61476.70"),
            perp_ask_usd=Decimal("61476.80"),
            spot_min_qty=Decimal("0.00001"),
            spot_step_size=Decimal("0.00001"),
            spot_min_notional_usd=Decimal("5.00"),  # Verified from /api/v3/exchangeInfo NOTIONAL=5.0
            perp_min_qty=Decimal("0.001"),  # Verified from /fapi/v1/exchangeInfo LOT_SIZE=0.001
            perp_step_size=Decimal("0.001"),
            perp_min_notional_usd=Decimal("50.00"),  # Verified from /fapi/v1/exchangeInfo MIN_NOTIONAL=50
            perp_maint_margin_rate=Decimal("0.025"),  # maintMarginPercent=2.5000 (exchangeInfo conservative bound)
            perp_initial_margin_rate=Decimal("0.25"),  # Conservative 4x perp leg cap
            spot_maker_fee_bps=Decimal("10.0"),  # Public VIP 0 spot fee
            spot_taker_fee_bps=Decimal("10.0"),
            perp_maker_fee_bps=Decimal("2.0"),  # Public VIP 0 USD-M futures fee
            perp_taker_fee_bps=Decimal("5.0"),
            funding_interval_hours=8,
            observed_annual_funding_bps=Decimal("451.6875"),  # 0.00004125 * 1095 * 10000
            historical_mean_funding_bps=Decimal("1067.9"),  # 6,390 8h rows (2021-01..2026-10)
            operational_penalty_bps_annual=Decimal("0"),
            cross_venue_transfer_fee_usd=Decimal("0"),
            account_mode_notes=(
                "Standard Spot + USD-M Futures sub-wallets require separate USDT balances (no Portfolio Margin "
                "required or available for small retail tiers). Geographic/KYC futures access is NOT verified."
            ),
            portfolio_margin_required=False,
            venue_access_classification="VENUE_ACCESS_NOT_VERIFIED",
            data_confidence_classification="LIVE_BOOKTICKER_LOCAL_UNAUTHENTICATED_HIST_HASH_UNVERIFIED",
            route_verdict=RouteFeasibilityVerdict.UNVERIFIED_MARKET_ACCESS,
            probe_source_sha256=(
                "7ca4e4254ede9d87",
                "e25cd16185450a25",
                "90c99cae8f99ee30",
                "b1c8cd4cdfc2378f",
                "30547e9513942717",
                "63c26c0b921ab324",
            ),
        ),
        VenueRoute.CROSS_VENUE_BN_SPOT_HL_PERP: VenueRouteSpec(
            route=VenueRoute.CROSS_VENUE_BN_SPOT_HL_PERP,
            label="Route C: Cross-Venue (Binance BTC/USDT Spot + Hyperliquid BTC-PERP)",
            spot_venue="binance",
            perp_venue="hyperliquid",
            spot_symbol="BTCUSDT",
            spot_asset_id="binance_spot:BTCUSDT",
            perp_symbol="BTC-PERP",
            collateral_currency="USDT+USDC",
            is_wrapped_spot=False,
            wrapper_risk_notes=(
                "Avoids UBTC wrapper, but splits custody across two venues (Binance + Hyperliquid), "
                "introduces USDT/USDC FX basis, non-fungible margin, transfer latency, and asynchronous outage risk."
            ),
            spot_price_usd=Decimal("61510.395"),
            perp_price_usd=Decimal("61494.00"),
            spot_bid_usd=Decimal("61510.39"),
            spot_ask_usd=Decimal("61510.40"),
            perp_bid_usd=Decimal("61492.00"),
            perp_ask_usd=Decimal("61493.00"),
            spot_min_qty=Decimal("0.00001"),
            spot_step_size=Decimal("0.00001"),
            spot_min_notional_usd=Decimal("5.00"),
            perp_min_qty=Decimal("0.00001"),
            perp_step_size=Decimal("0.00001"),
            perp_min_notional_usd=Decimal("10.00"),
            perp_maint_margin_rate=Decimal("0.0125"),
            perp_initial_margin_rate=Decimal("0.25"),
            spot_maker_fee_bps=Decimal("10.0"),
            spot_taker_fee_bps=Decimal("10.0"),
            perp_maker_fee_bps=Decimal("1.5"),
            perp_taker_fee_bps=Decimal("4.5"),
            funding_interval_hours=1,
            observed_annual_funding_bps=Decimal("1095.0"),
            historical_mean_funding_bps=Decimal("1018.8"),
            operational_penalty_bps_annual=Decimal("150.0"),  # Cross-venue custody + USDT/USDC FX + transfer penalty
            cross_venue_transfer_fee_usd=Decimal("2.50"),  # Stablecoin bridge/withdrawal friction per rebalance
            account_mode_notes=(
                "Requires pre-funded USDT on Binance Spot and separate pre-funded USDC on Hyperliquid Perp. "
                "Margin is strictly non-fungible across venues; emergency rebalance requires on-chain transfer."
            ),
            portfolio_margin_required=False,
            venue_access_classification="VENUE_ACCESS_NOT_VERIFIED",
            data_confidence_classification="CROSS_VENUE_UNSYNCHRONIZED_SNAPSHOT_HIST_HASH_UNVERIFIED",
            route_verdict=RouteFeasibilityVerdict.UNVERIFIED_MARKET_ACCESS,
            probe_source_sha256=(
                "7ca4e4254ede9d87",
                "e25cd16185450a25",
                "8d95fd025e0c2780",
                "4556f1a40e5102d8",
                "db5e0800ba53a8b2",
            ),
        ),
    }
