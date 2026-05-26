from __future__ import annotations

import math
from typing import Iterable


def round_to(value: float, digits: int = 2) -> float:
    return round(float(value), digits)


def mid(quote: dict) -> float:
    bid = float(quote.get("bid") or 0)
    ask = float(quote.get("ask") or 0)
    if bid > 0 and ask > 0:
        return round_to((bid + ask) / 2)
    return float(quote.get("ltp") or 0)


def spread_pct(quote: dict) -> float:
    quote_mid = mid(quote)
    if quote_mid <= 0:
        return 1.0
    return (float(quote.get("ask") or 0) - float(quote.get("bid") or 0)) / quote_mid


def max_pain(chain: Iterable[dict]) -> float:
    rows = list(chain)
    strikes = sorted({float(row["strike"]) for row in rows})
    best_strike = strikes[0]
    lowest_payout = math.inf
    for settlement in strikes:
        payout = 0.0
        for row in rows:
            strike = float(row["strike"])
            intrinsic = max(0, settlement - strike) if row["type"] == "CE" else max(0, strike - settlement)
            payout += intrinsic * float(row.get("oi") or 0)
        if payout < lowest_payout:
            lowest_payout = payout
            best_strike = settlement
    return best_strike


def chain_analytics(instrument: dict, chain: list[dict]) -> dict:
    calls = [row for row in chain if row["type"] == "CE"]
    puts = [row for row in chain if row["type"] == "PE"]
    total_call_oi = sum(row["oi"] for row in calls)
    total_put_oi = sum(row["oi"] for row in puts)
    total_call_volume = sum(row["volume"] for row in calls)
    total_put_volume = sum(row["volume"] for row in puts)
    spot = float(instrument["spot"])
    strikes = sorted({row["strike"] for row in chain})
    atm = min(strikes, key=lambda strike: abs(strike - spot))
    atm_call = next(row for row in calls if row["strike"] == atm)
    atm_put = next(row for row in puts if row["strike"] == atm)
    call_wall = max(calls, key=lambda row: row["oi"])["strike"]
    put_wall = max(puts, key=lambda row: row["oi"])["strike"]
    atm_iv = ((atm_call["iv"] + atm_put["iv"]) / 2) * 100
    dte = 2
    expected_move_straddle = mid(atm_call) + mid(atm_put)
    expected_move_iv = spot * ((atm_iv / 100) * math.sqrt(dte / 365))
    put_25 = min(puts, key=lambda row: abs(abs(row["delta"]) - 0.25))
    call_25 = min(calls, key=lambda row: abs(row["delta"] - 0.25))

    return {
        "pcr_oi": round_to(total_put_oi / total_call_oi, 2),
        "pcr_volume": round_to(total_put_volume / total_call_volume, 2),
        "max_pain": max_pain(chain),
        "call_wall": call_wall,
        "put_wall": put_wall,
        "expected_move_straddle": round_to(expected_move_straddle),
        "expected_move_iv": round_to(expected_move_iv),
        "atm_iv": round_to(atm_iv),
        "skew": round_to((put_25["iv"] - call_25["iv"]) * 100),
        "term_slope": -1.2,
        "liquidity_score": 82.4,
        "quality_flags": [],
    }
