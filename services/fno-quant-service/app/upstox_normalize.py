from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .upstox_client import INSTRUMENT_META


def _normalize_iv(raw_iv: float | None) -> float:
    if raw_iv is None:
        return 0.15
    value = float(raw_iv)
    if value <= 0:
        return 0.15
    return value / 100 if value > 3 else value


def _quote_from_leg(strike: float, option_type: str, leg: dict[str, Any], quote_ts: str) -> dict[str, Any]:
    market = leg.get("market_data") or {}
    greeks = leg.get("option_greeks") or {}
    oi = float(market.get("oi") or 0)
    prev_oi = float(market.get("prev_oi") or 0)
    bid = float(market.get("bid_price") or 0)
    ask = float(market.get("ask_price") or 0)
    ltp = float(market.get("ltp") or market.get("close_price") or 0)

    return {
        "strike": float(strike),
        "type": option_type,
        "bid": bid,
        "bid_quantity": int(market.get("bid_qty") or 0),
        "ask": ask,
        "ask_quantity": int(market.get("ask_qty") or 0),
        "ltp": ltp,
        "volume": int(market.get("volume") or 0),
        "oi": oi,
        "oi_change": oi - prev_oi,
        "total_buy_quantity": int(market.get("bid_qty") or 0),
        "total_sell_quantity": int(market.get("ask_qty") or 0),
        "iv": _normalize_iv(greeks.get("iv")),
        "delta": float(greeks.get("delta") or 0),
        "gamma": float(greeks.get("gamma") or 0),
        "theta": float(greeks.get("theta") or 0),
        "vega": float(greeks.get("vega") or 0),
        "rho": 0.0,
        "quote_ts": quote_ts,
    }


def normalize_option_chain_rows(symbol: str, expiry: str, rows: list[dict[str, Any]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    if not rows:
        raise ValueError("Cannot normalize empty option chain")

    first = rows[0]
    spot = float(first.get("underlying_spot_price") or 0)
    quote_ts = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    meta = INSTRUMENT_META.get(symbol.upper(), {"name": symbol, "lot_size": 1})

    chain: list[dict[str, Any]] = []
    for row in rows:
        strike = float(row.get("strike_price") or 0)
        call = row.get("call_options") or {}
        put = row.get("put_options") or {}
        if call:
            chain.append(_quote_from_leg(strike, "CE", call, quote_ts))
        if put:
            chain.append(_quote_from_leg(strike, "PE", put, quote_ts))

    close_prices = [
        float((row.get("call_options") or {}).get("market_data", {}).get("close_price") or 0)
        for row in rows
        if (row.get("call_options") or {}).get("market_data")
    ]
    close_prices = [price for price in close_prices if price > 0]
    previous_close = close_prices[len(close_prices) // 2] if close_prices else spot

    instrument = {
        "symbol": symbol.upper(),
        "name": meta["name"],
        "lot_size": int(meta["lot_size"]),
        "minimum_lot": int(meta["lot_size"]),
        "tick_size": 0.05,
        "freeze_quantity": int(meta["lot_size"]) * 27,
        "expiry": expiry,
        "is_weekly": True,
        "spot": spot,
        "previous_close": previous_close,
        "snapshot_ts": quote_ts,
    }
    return instrument, chain
