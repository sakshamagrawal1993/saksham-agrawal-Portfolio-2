#!/usr/bin/env bash
# Run Trading Agents Phase 3 evaluation batch against production Edge proxy.
# Requires TRADING_AGENTS_ADMIN_TOKEN (same value as Supabase secret and n8n credential
# "Trading Agents Eval Admin").
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIMIT="${1:-20}"
PROXY_URL="${TRADING_AGENTS_PROXY_URL:-https://ralhkmpbslsdkwnqzqen.supabase.co/functions/v1/trading-agents-proxy}"

if [[ -z "${TRADING_AGENTS_ADMIN_TOKEN:-}" ]]; then
  TOKEN_FILE="$ROOT_DIR/.trading-agents-admin-token.local"
  if [[ -f "$TOKEN_FILE" ]]; then
    TRADING_AGENTS_ADMIN_TOKEN="$(tr -d '\n' < "$TOKEN_FILE")"
    export TRADING_AGENTS_ADMIN_TOKEN
  fi
fi

if [[ -z "${TRADING_AGENTS_ADMIN_TOKEN:-}" ]]; then
  echo "Set TRADING_AGENTS_ADMIN_TOKEN or create $ROOT_DIR/.trading-agents-admin-token.local"
  exit 1
fi

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

ANON_KEY="${VITE_SUPABASE_ANON_KEY:-}"
if [[ -z "$ANON_KEY" ]]; then
  echo "VITE_SUPABASE_ANON_KEY missing from .env"
  exit 1
fi

echo "POST $PROXY_URL (limit=$LIMIT)"
curl -sS -X POST "$PROXY_URL" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "x-trading-agents-admin-token: $TRADING_AGENTS_ADMIN_TOKEN" \
  -d "{\"action\":\"evaluate\",\"limit\":$LIMIT}"
echo
