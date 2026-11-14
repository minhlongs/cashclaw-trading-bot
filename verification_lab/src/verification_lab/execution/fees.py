"""VIP-0 venue fee schedule, transcribed from the audit's section 14.1 table.

Every number below is an *assumption copied from a published schedule*, labelled
`assumed_not_measured` in the artifacts: no fee endpoint was queried, and none of
it is a historical CashClaw fee. Rates are fractions of notional per side, and
the audit is explicit that derivatives fees are charged on notional value rather
than on posted margin -- so a book weight is a notional weight and the rate
applies to it directly.

This table exists because the lab's previous cost model charged a flat 6.0 bps
per unit of turnover on every hypothesis, which is H1's baseline from the audit's
cost-stress table applied to books it was never derived for. On notional terms
the venues differ by more than 2x on spot, and H3 pays two different schedules on
two legs.
"""

from __future__ import annotations

from dataclasses import dataclass

BASIS = "assumed_not_measured"
SOURCE = "audit section 14.1, VIP-0 fee table, October-November 2026"


@dataclass(frozen=True)
class VenueFees:
    """Per-side VIP-0 fee fraction of notional. None means the venue publishes no such market."""

    venue: str
    spot_maker: float | None
    spot_taker: float | None
    perp_maker: float | None
    perp_taker: float | None
    funding_hours: int | None

    def taker(self, leg: str) -> float:
        rate = self.spot_taker if leg == "spot" else self.perp_taker
        if rate is None:
            raise ValueError(f"{self.venue} publishes no {leg} fee; the leg cannot be priced")
        return rate

    def taker_bps(self, leg: str) -> float:
        return self.taker(leg) * 1e4

    def available(self, leg: str) -> bool:
        return (self.spot_taker if leg == "spot" else self.perp_taker) is not None


_VENUES = {
    "binance": VenueFees("binance", 0.0010, 0.0010, 0.00020, 0.00050, 8),
    "bybit": VenueFees("bybit", 0.0010, 0.0010, 0.00020, 0.00055, 8),
    "okx": VenueFees("okx", 0.00080, 0.0010, 0.00020, 0.00050, 8),
    "hyperliquid": VenueFees("hyperliquid", 0.00040, 0.00070, 0.00015, 0.00045, 1),
}

# Discounted schedules exist and are deliberately not used: BNB pays 0.018/0.045
# on perps and 0.075% on spot, MNT pays 0.075% on Bybit spot, and Bybit's
# Innovation Zone charges 0.200%/0.200%. The base VIP-0 rate is what a client who
# holds no exchange token actually pays, and quoting the discounted tier would
# flatter every hypothesis in the same direction.
VENUE_NOTES = {
    "binance": "USD-M perp 0.020/0.050; spot 0.100/0.100; BNB discount 0.018/0.045 and 0.075% spot not applied",
    "bybit": "perp 0.020/0.055 — 0.5 bps dearer than Binance on the taker side; Innovation Zone 0.200/0.200 not applied",
    "okx": "perp 0.020/0.050; spot 0.080/0.100",
    "hyperliquid": "perp 0.015/0.045 with zero gas and 1h funding; spot 0.040/0.070",
}


def venue(name: str) -> VenueFees:
    try:
        return _VENUES[name]
    except KeyError:
        raise KeyError(f"unknown venue {name!r}; priced venues are {sorted(_VENUES)}") from None


def venue_names() -> list[str]:
    return sorted(_VENUES)


def priced_venues(leg: str) -> list[str]:
    return [name for name, fees in _VENUES.items() if fees.available(leg)]


def per_side_bps(legs: tuple[str, ...], venue_name: str, side: str = "taker") -> float:
    """Fee in bps charged on each unit of notional traded across the named legs.

    This is a per-side number on purpose. Turnover measured as |w_t - w_{t-1}| is
    already notional-per-side, so a round trip appears as two units of turnover
    and is charged twice without the caller having to remember to double it.

    `side="maker"` is refused rather than defaulted: the lab scores books on daily
    closes with no queue position, so a maker assumption cannot be supported by
    this data.
    """
    if side != "taker":
        raise ValueError("only taker fills are priced; maker fills need a queue model this lab lacks")
    fees = venue(venue_name)
    return float(sum(fees.taker_bps(leg) for leg in legs))


def funding_cadence(venue_name: str) -> dict:
    """What the ingested data can and cannot say about this venue's funding cadence.

    The normalized funding panel holds Binance Vision 8-hourly events only, so a
    venue that settles hourly is described here but not priced from it.
    """
    hours = venue(venue_name).funding_hours
    measured = 8
    matches = hours == measured
    return {
        "venue": venue_name,
        "funding_hours_declared": hours,
        "funding_hours_in_ingested_data": measured,
        "priced_from_measured_events": matches,
        "note": (
            "funding is read from the 8-hourly events and applied as a cash flow on held "
            "notional, not as a turn cost"
            if matches
            else (
                f"{venue_name} settles funding every {hours}h; the panel holds only 8-hourly "
                "Binance events, so the cadence is documented but not simulated"
            )
        ),
    }
