from __future__ import annotations

from typing import Any

from .calculations import chain_analytics
from .demo_data import CHAIN, INSTRUMENT
from .strategy_engine import top5
from .upstox_client import (
    UpstoxClientError,
    fetch_market_status,
    fetch_option_chain,
    nearest_expiry,
    resolve_instrument_key,
)
from .upstox_config import get_upstox_config
from .upstox_normalize import normalize_option_chain_rows


def _demo_bundle() -> dict[str, Any]:
    analytics = chain_analytics(INSTRUMENT, CHAIN)
    return {
        "mode": "demo",
        "source": "demo",
        "instrument": INSTRUMENT,
        "chain": CHAIN,
        "analytics": analytics,
        "market_status": "unknown",
    }


def load_market_bundle(symbol: str = "NIFTY", expiry: str | None = None, mode: str = "auto") -> dict[str, Any]:
    config = get_upstox_config()
    wants_live = mode in {"live", "upstox", "upstox_live", "auto"} and config.has_access_token

    if not wants_live:
        return _demo_bundle()

    token = config.access_token
    if not token:
        return _demo_bundle()

    try:
        instrument_key = resolve_instrument_key(symbol, token)
        resolved_expiry = expiry or nearest_expiry(token, instrument_key)
        rows = fetch_option_chain(token, instrument_key, resolved_expiry)
        instrument, chain = normalize_option_chain_rows(symbol, resolved_expiry, rows)
        analytics = chain_analytics(instrument, chain)
        market_status = fetch_market_status(token)
        return {
            "mode": "upstox_live",
            "source": "upstox_analytics",
            "instrument": instrument,
            "chain": chain,
            "analytics": analytics,
            "market_status": market_status,
            "expiry": resolved_expiry,
        }
    except UpstoxClientError:
        if mode == "demo":
            return _demo_bundle()
        raise
    except Exception:
        if mode == "demo":
            return _demo_bundle()
        raise


def overview_from_bundle(bundle: dict[str, Any]) -> dict[str, Any]:
    analytics = bundle["analytics"]
    pcr = float(analytics.get("pcr_oi") or 1)
    if pcr > 1.1:
        regime = "bearish"
    elif pcr < 0.85:
        regime = "bullish"
    else:
        regime = "range-bound"

    atm_iv = float(analytics.get("atm_iv") or 15)
    volatility_regime = "high" if atm_iv > 22 else "low" if atm_iv < 13 else "normal"

    return {
        "instrument": bundle["instrument"],
        "regime": regime,
        "trend_score": 62,
        "volatility_regime": volatility_regime,
        "chain": analytics,
    }


def top5_from_bundle(bundle: dict[str, Any]) -> list[dict[str, Any]]:
    return top5(bundle["instrument"], bundle["chain"])
