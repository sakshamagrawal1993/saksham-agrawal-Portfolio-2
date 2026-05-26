from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel, Field

from .calculations import chain_analytics
from .demo_data import CHAIN, INSTRUMENT
from .strategy_engine import top5
from .upstox_config import get_upstox_config

app = FastAPI(title="FnO Co-Pilot Quant Service", version="0.1.0")


class ComputeRequest(BaseModel):
    instrument: str = Field(default="NIFTY")
    expiry: str = Field(default="2026-05-28")
    mode: str = Field(default="demo")


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "fno-copilot-quant",
        "mode": "demo",
        "upstox": get_upstox_config().public_status(),
    }


@app.post("/market/snapshot")
def market_snapshot(_: ComputeRequest):
    return {"instrument": INSTRUMENT, "chain": CHAIN, "source": "demo"}


@app.post("/compute/overview")
def compute_overview(_: ComputeRequest):
    analytics = chain_analytics(INSTRUMENT, CHAIN)
    return {
        "instrument": INSTRUMENT,
        "regime": "range-bound",
        "trend_score": 62,
        "volatility_regime": "normal",
        "chain": analytics,
    }


@app.post("/compute/chain")
def compute_chain(_: ComputeRequest):
    return {"instrument": INSTRUMENT, "analytics": chain_analytics(INSTRUMENT, CHAIN), "chain": CHAIN}


@app.post("/compute/top5")
def compute_top5(_: ComputeRequest):
    return {"instrument": INSTRUMENT, "candidates": top5(INSTRUMENT, CHAIN), "model_version": "top5-v0.1-demo"}


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
