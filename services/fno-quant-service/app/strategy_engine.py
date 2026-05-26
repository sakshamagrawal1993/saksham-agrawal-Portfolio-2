from __future__ import annotations

from .calculations import chain_analytics, mid, round_to


def leg(chain: list[dict], side: str, option_type: str, strike: float, quantity: int = 1) -> dict:
    quote = next(row for row in chain if row["strike"] == strike and row["type"] == option_type)
    return {
        "side": side,
        "type": option_type,
        "strike": strike,
        "quantity": quantity,
        "premium": mid(quote),
        "iv": quote["iv"],
        "delta": quote["delta"],
        "gamma": quote["gamma"],
        "theta": quote["theta"],
        "vega": quote["vega"],
    }


def payoff_at_expiry(legs: list[dict], spot: float, lot_size: int) -> float:
    per_unit = 0.0
    for item in legs:
        intrinsic = max(0, spot - item["strike"]) if item["type"] == "CE" else max(0, item["strike"] - spot)
        expiry_value = intrinsic if item["side"] == "BUY" else -intrinsic
        premium_value = item["premium"] if item["side"] == "SELL" else -item["premium"]
        per_unit += (expiry_value + premium_value) * item["quantity"]
    return round(per_unit * lot_size)


def create_candidate(instrument: dict, strategy: str, title: str, direction: str, legs: list[dict], score: float) -> dict:
    spot = float(instrument["spot"])
    lot_size = int(instrument["lot_size"])
    payoff = [{"spot": strike, "pnl": payoff_at_expiry(legs, strike, lot_size)} for strike in range(int(spot * 0.97 // 50 * 50), int(spot * 1.03 // 50 * 50) + 50, 50)]
    max_profit = max(row["pnl"] for row in payoff)
    max_loss = abs(min(row["pnl"] for row in payoff))
    return {
        "title": title,
        "strategy": strategy,
        "direction": direction,
        "legs": legs,
        "score": score,
        "score_breakdown": {
            "liquidity": 82,
            "risk_reward": 68,
            "regime_fit": 84,
            "vol_fit": 78,
            "data_confidence": 92,
            "simplicity": 80,
        },
        "max_profit": max_profit,
        "max_loss": max_loss,
        "payoff": payoff,
        "quality_flags": [],
    }


def top5(instrument: dict, chain: list[dict]) -> list[dict]:
    analytics = chain_analytics(instrument, chain)
    strikes = sorted({row["strike"] for row in chain})
    spot = float(instrument["spot"])
    atm = min(strikes, key=lambda strike: abs(strike - spot))
    lower = max(strike for strike in strikes if strike < atm)
    upper = min(strike for strike in strikes if strike > atm)
    lower_wing = max(strike for strike in strikes if strike < lower)
    upper_wing = min(strike for strike in strikes if strike > upper)

    candidates = [
        create_candidate(
            instrument,
            "Iron Condor",
            "Range Credit: Iron Condor",
            "range-bound",
            [
                leg(chain, "BUY", "PE", lower_wing),
                leg(chain, "SELL", "PE", lower),
                leg(chain, "SELL", "CE", upper),
                leg(chain, "BUY", "CE", upper_wing),
            ],
            82.0,
        ),
        create_candidate(
            instrument,
            "Bull Call Spread",
            "Directional Debit: Bull Call Spread",
            "bullish",
            [leg(chain, "BUY", "CE", atm), leg(chain, "SELL", "CE", upper)],
            79.0,
        ),
    ]

    if analytics["pcr_oi"] < 1:
        candidates.append(
            create_candidate(
                instrument,
                "Bear Put Spread",
                "Risk Hedge: Bear Put Spread",
                "bearish",
                [leg(chain, "BUY", "PE", atm), leg(chain, "SELL", "PE", lower)],
                73.0,
            )
        )

    return sorted(candidates, key=lambda item: item["score"], reverse=True)[:5]
