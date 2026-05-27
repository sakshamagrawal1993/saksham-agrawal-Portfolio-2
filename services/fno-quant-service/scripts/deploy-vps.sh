#!/usr/bin/env bash
# Deploy FnO quant service to your VPS (same host as Trading Agents yfinance).
# Usage (from repo root, with SSH access):
#   export VPS_HOST=72.61.231.160
#   export VPS_USER=root
#   export SSHPASS='...'   # or: brew install hudochenkov/sshpass/sshpass
#   bash services/fno-quant-service/scripts/deploy-vps.sh
#
# Requires sshpass when using password auth: /opt/homebrew/bin/sshpass -e ...
set -euo pipefail

VPS_HOST="${VPS_HOST:-72.61.231.160}"
VPS_USER="${VPS_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:-/opt/fno-quant-service}"
PORT="${PORT:-8010}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SSHPASS_BIN="${SSHPASS_BIN:-/opt/homebrew/bin/sshpass}"
SSH_BASE=(ssh -o StrictHostKeyChecking=accept-new)
if [[ -n "${SSHPASS:-}" ]] && [[ -x "$SSHPASS_BIN" ]]; then
  SSH_CMD=("$SSHPASS_BIN" -e ssh "${SSH_BASE[@]}" -o PreferredAuthentications=password -o PubkeyAuthentication=no)
  RSYNC_SSH="$SSHPASS_BIN -e ssh -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password -o PubkeyAuthentication=no"
else
  SSH_CMD=(ssh "${SSH_BASE[@]}")
  RSYNC_SSH="ssh -o StrictHostKeyChecking=accept-new"
fi

echo "Syncing $ROOT -> ${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}"
"${SSH_CMD[@]}" "${VPS_USER}@${VPS_HOST}" "mkdir -p ${REMOTE_DIR}"
rsync -az --delete \
  --exclude '.venv' \
  --exclude '__pycache__' \
  --exclude '.env' \
  "$ROOT/" "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/"

echo "Installing deps and starting systemd unit on VPS..."
ssh "${VPS_USER}@${VPS_HOST}" bash -s <<EOF
set -euo pipefail
cd ${REMOTE_DIR}
python3 -m venv .venv
.venv/bin/pip install -q -r requirements.txt
if [ ! -f .env ]; then
  echo "Create ${REMOTE_DIR}/.env with UPSTOX_ANALYTICS_TOKEN=..." >&2
  exit 1
fi
cat > /etc/systemd/system/fno-quant.service <<UNIT
[Unit]
Description=FnO Co-Pilot Quant Service
After=network.target

[Service]
Type=simple
WorkingDirectory=${REMOTE_DIR}
EnvironmentFile=${REMOTE_DIR}/.env
ExecStart=${REMOTE_DIR}/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now fno-quant.service
systemctl status fno-quant.service --no-pager
EOF

echo ""
echo "On Supabase (optional, after health check):"
echo "  npx supabase secrets set FNO_QUANT_SERVICE_URL=\"http://${VPS_HOST}:${PORT}\""
echo "  npx supabase functions deploy fno-copilot-proxy"
