from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from .market_data import load_market_bundle, overview_from_bundle, top5_from_bundle
from .upstox_config import get_upstox_config

app = FastAPI(title="FnO Co-Pilot Quant Service", version="0.2.0")


class ComputeRequest(BaseModel):
    instrument: str = Field(default="NIFTY")
    expiry: str | None = Field(default=None)
    mode: str = Field(default="auto")


def _resolve_bundle(request: ComputeRequest):
    try:
        return load_market_bundle(request.instrument, request.expiry, request.mode)
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.get("/health")
def health():
    config = get_upstox_config()
    mode = "upstox_live" if config.has_access_token else "demo"
    return {
        "ok": True,
        "service": "fno-copilot-quant",
        "mode": mode,
        "upstox": get_upstox_config().public_status(),
    }


@app.post("/market/snapshot")
def market_snapshot(request: ComputeRequest):
    bundle = _resolve_bundle(request)
    return {
        "instrument": bundle["instrument"],
        "chain": bundle["chain"],
        "source": bundle["source"],
        "mode": bundle["mode"],
        "market_status": bundle.get("market_status"),
        "expiry": bundle.get("expiry"),
    }


@app.post("/compute/overview")
def compute_overview(request: ComputeRequest):
    bundle = _resolve_bundle(request)
    return overview_from_bundle(bundle)


@app.post("/compute/chain")
def compute_chain(request: ComputeRequest):
    bundle = _resolve_bundle(request)
    return {
        "instrument": bundle["instrument"],
        "analytics": bundle["analytics"],
        "chain": bundle["chain"],
        "mode": bundle["mode"],
        "source": bundle["source"],
        "market_status": bundle.get("market_status"),
        "expiry": bundle.get("expiry"),
    }


@app.post("/compute/top5")
def compute_top5(request: ComputeRequest):
    bundle = _resolve_bundle(request)
    return {
        "instrument": bundle["instrument"],
        "candidates": top5_from_bundle(bundle),
        "model_version": "top5-v0.1-upstox" if bundle["mode"] == "upstox_live" else "top5-v0.1-demo",
        "mode": bundle["mode"],
    }


@app.post("/compute/backtest")
def compute_backtest(_: ComputeRequest):
    return {
        "state": "completed",
        "summary": {
            "total_trades": 12,
            "win_rate": 58.3,
            "max_drawdown_pct": 6.8,
            "profit_factor": 1.42,
            "data_version": "demo-v0.1",
        },
    }


@app.post("/compute/mark-paper")
def compute_mark_paper(_: ComputeRequest):
    return {"state": "paper_open", "pnl": 0, "note": "Demo mark-to-market placeholder"}
