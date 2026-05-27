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
}

INSTRUMENT_META: dict[str, dict[str, Any]] = {
    "NIFTY": {"name": "Nifty 50 Index Options", "lot_size": 65},
    "BANKNIFTY": {"name": "Nifty Bank Index Options", "lot_size": 30},
}


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


def resolve_instrument_key(symbol: str) -> str:
    key = INSTRUMENT_KEYS.get(symbol.upper())
    if not key:
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
