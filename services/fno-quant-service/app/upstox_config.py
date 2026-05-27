from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


@dataclass(frozen=True)
class UpstoxConfig:
    env: str
    client_id: str | None
    client_secret: str | None
    redirect_uri: str | None
    access_token: str | None

    @property
    def has_oauth_credentials(self) -> bool:
        return bool(self.client_id and self.client_secret and self.redirect_uri)

    @property
    def has_access_token(self) -> bool:
        return bool(self.access_token)

    def public_status(self) -> dict[str, object]:
        return {
            "env": self.env,
            "has_oauth_credentials": self.has_oauth_credentials,
            "has_access_token": self.has_access_token,
            "redirect_uri": self.redirect_uri,
        }


def get_upstox_config() -> UpstoxConfig:
    token = os.getenv("UPSTOX_ANALYTICS_TOKEN") or os.getenv("UPSTOX_ACCESS_TOKEN")
    return UpstoxConfig(
        env=os.getenv("UPSTOX_ENV", "sandbox"),
        client_id=os.getenv("UPSTOX_CLIENT_ID"),
        client_secret=os.getenv("UPSTOX_CLIENT_SECRET"),
        redirect_uri=os.getenv("UPSTOX_REDIRECT_URI"),
        access_token=token,
    )
