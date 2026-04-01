#!/usr/bin/env bash
# Drive one Mind Coach chat session via agent-browser (production). Requires an open chat with refs from snapshot -i.
# Usage: MC_SESSION=mc-e2e-5phase MSG_BOX=@e8 SEND=@e9 END=@e6 ./scripts/mindcoach_browser_session_turns.sh "line1" "line2" ...
set -euo pipefail
MC="${MC_SESSION:-mc-e2e-5phase}"
BOX="${MSG_BOX:-@e8}"
SEND="${SEND_BTN:-@e9}"
END="${END_BTN:-@e6}"

wait_idle() {
  local i
  for i in $(seq 1 120); do
    sleep 2
    local out
    out=$(agent-browser --session-name "$MC" snapshot -i 2>&1 || true)
    echo "$out" | grep -q "Writing a reply" || break
  done
  sleep 1
}

close_exercise_if_any() {
  local snap out
  snap=$(agent-browser --session-name "$MC" snapshot -i 2>&1 || true)
  if echo "$snap" | grep -q "END EXERCISE"; then
    ref=$(echo "$snap" | grep 'END EXERCISE' | sed -n 's/.*\[ref=\(e[0-9]*\)\].*/\1/p' | head -1)
    [[ -n "$ref" ]] && agent-browser --session-name "$MC" click "@$ref" --force || true
    sleep 2
  fi
  out=$(agent-browser --session-name "$MC" snapshot -i 2>&1 || true)
  if echo "$out" | grep -q "Start Activity"; then
    : # collapsed card, ok
  fi
}

for m in "$@"; do
  agent-browser --session-name "$MC" fill "$BOX" "$m"
  sleep 0.35
  agent-browser --session-name "$MC" click "$SEND" --force
  wait_idle
  close_exercise_if_any
done
