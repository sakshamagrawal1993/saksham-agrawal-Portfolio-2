from __future__ import annotations

import json
import os
import ssl
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path
from typing import Any

try:
    import certifi
except ImportError:
    certifi = None

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

UPSTOX_API_BASE = "https://api.upstox.com/v2"

INSTRUMENT_KEYS: dict[str, str] = {
    "NIFTY": "NSE_INDEX|Nifty 50",
    "BANKNIFTY": "NSE_INDEX|Nifty Bank",
    "FINNIFTY": "NSE_INDEX|Nifty Fin Service",
    "MIDCPNIFTY": "NSE_INDEX|NIFTY MID SELECT",
    "NIFTYNEXT50": "NSE_INDEX|Nifty Next 50",
}

INSTRUMENT_META: dict[str, dict[str, Any]] = {
    "NIFTY": {"name": "Nifty 50 Index Options", "lot_size": 65},
    "BANKNIFTY": {"name": "Nifty Bank Index Options", "lot_size": 30},
    "FINNIFTY": {"name": "Nifty Financial Services Index Options", "lot_size": 65},
    "MIDCPNIFTY": {"name": "Nifty Midcap Select Index Options", "lot_size": 120},
    "NIFTYNEXT50": {"name": "Nifty Next 50 Index Options", "lot_size": 25},
}

_INSTRUMENT_KEY_CACHE: dict[str, str] = {}


class UpstoxClientError(RuntimeError):
    pass


def _request(token: str, path: str, params: dict[str, str] | None = None) -> dict[str, Any]:
    query = f"?{urllib.parse.urlencode(params)}" if params else ""
    url = f"{UPSTOX_API_BASE}{path}{query}"
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "User-Agent": "FnO-CoPilot-Quant/0.2",
        },
        method="GET",
    )
    try:
        context = ssl.create_default_context(cafile=certifi.where()) if certifi else None
        with urllib.request.urlopen(request, timeout=25, context=context) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:400]
        raise UpstoxClientError(f"Upstox HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise UpstoxClientError(f"Upstox network error: {error.reason}") from error

    if payload.get("status") != "success":
        raise UpstoxClientError(f"Upstox API error: {payload}")
    return payload


def _search_instruments(token: str, query: str, params: dict[str, str]) -> list[dict[str, Any]]:
    payload = _request(token, "/instruments/search", {"query": query, **params})
    data = payload.get("data") or []
    return data if isinstance(data, list) else []


def _score_instrument_match(symbol: str, row: dict[str, Any]) -> int:
    normalized = symbol.upper()
    trading_symbol = str(row.get("trading_symbol") or row.get("tradingsymbol") or "").upper()
    short_name = str(row.get("short_name") or "").upper()
    symbol_value = str(row.get("symbol") or row.get("underlying_symbol") or "").upper()
    segment = str(row.get("segment") or "").upper()
    instrument_type = str(row.get("instrument_type") or "").upper()

    score = 0
    if trading_symbol == normalized:
        score += 100
    if symbol_value == normalized:
        score += 90
    if short_name == normalized:
        score += 60
    if segment == "NSE_EQ":
        score += 30
    if instrument_type in {"EQ", "EQUITY"}:
        score += 20
    if row.get("instrument_key"):
        score += 10
    return score


def resolve_instrument_key(symbol: str, token: str | None = None) -> str:
    normalized = symbol.upper()
    key = INSTRUMENT_KEYS.get(normalized)
    if not key:
        cached = _INSTRUMENT_KEY_CACHE.get(normalized)
        if cached:
            return cached
        if not token:
            raise UpstoxClientError(f"Unsupported instrument without token-backed search: {symbol}")

        eq_matches = _search_instruments(
            token,
            normalized,
            {"exchanges": "NSE", "segments": "EQ"},
        )
        matches = sorted(eq_matches, key=lambda row: _score_instrument_match(normalized, row), reverse=True)
        if matches and _score_instrument_match(normalized, matches[0]) > 0:
            resolved = str(matches[0].get("instrument_key") or "")
            if resolved:
                _INSTRUMENT_KEY_CACHE[normalized] = resolved
                return resolved

        fo_matches = _search_instruments(
            token,
            normalized,
            {"exchanges": "NSE", "segments": "FO"},
        )
        for row in fo_matches:
            underlying_key = str(row.get("underlying_key") or "")
            underlying_symbol = str(row.get("underlying_symbol") or "").upper()
            if underlying_key and underlying_symbol == normalized:
                _INSTRUMENT_KEY_CACHE[normalized] = underlying_key
                return underlying_key

        raise UpstoxClientError(f"Unsupported instrument: {symbol}")
    return key


def nearest_expiry(token: str, instrument_key: str) -> str:
    payload = _request(token, "/option/contract", {"instrument_key": instrument_key})
    contracts = payload.get("data") or []
    today = date.today().isoformat()
    expiries = sorted({str(row["expiry"]) for row in contracts if row.get("expiry") and str(row["expiry"]) >= today})
    if not expiries:
        raise UpstoxClientError("No active option expiries found")
    return expiries[0]


def fetch_option_chain(token: str, instrument_key: str, expiry: str) -> list[dict[str, Any]]:
    payload = _request(
        token,
        "/option/chain",
        {
            "instrument_key": instrument_key,
            "expiry_date": expiry,
        },
    )
    rows = payload.get("data") or []
    if not rows:
        raise UpstoxClientError(f"Empty option chain for {instrument_key} @ {expiry}")
    return rows


def fetch_market_status(token: str, exchange: str = "NSE") -> str:
    payload = _request(token, f"/market/status/{exchange}")
    data = payload.get("data") or {}
    return str(data.get("status") or "unknown")
