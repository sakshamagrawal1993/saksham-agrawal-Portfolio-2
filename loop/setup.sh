#!/usr/bin/env bash
# One-time setup for the LibertyMD delivery loop.
# Run this instead of pasting commands: ./loop/setup.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

c(){ printf '\033[%sm%s\033[0m\n' "$1" "$2"; }
ok(){ c '0;32' "  OK   $*"; }
bad(){ c '0;31' "  FAIL $*"; }
warn(){ c '0;33' "  WARN $*"; }
step(){ c '1;37' "$*"; }

FAIL=0

step "1/4  Ticket artifacts into the repo"
SRC="$HOME/Documents/Startups/Startups/LibertyMD/tickets"
if [ -d "$ROOT/tickets" ]; then
  ok "tickets/ already present ($(find "$ROOT/tickets" -maxdepth 1 -type d | wc -l | tr -d ' ') entries)"
elif [ -d "$SRC" ]; then
  cp -R "$SRC" "$ROOT/tickets" && ok "copied from $SRC"
else
  bad "cannot find $SRC — set LIBERTYMD_TICKETS_DIR when running loop.sh"; FAIL=1
fi
for f in CONTEXT.md DECISIONS.md BASELINE.md; do
  [ -f "$ROOT/tickets/$f" ] && ok "tickets/$f" || { bad "tickets/$f missing"; FAIL=1; }
done
[ -f "$ROOT/docs/product/PRD.md" ] && ok "docs/product/PRD.md" || warn "docs/product/PRD.md missing"

step "2/4  Executable bits"
chmod +x "$ROOT/loop/loop.sh" "$ROOT/loop/setup.sh" && ok "loop.sh, setup.sh"

step "3/4  CLI authentication"
for t in claude codex cursor-agent; do
  if command -v "$t" >/dev/null 2>&1; then ok "$t found at $(command -v "$t")"
  else bad "$t NOT on PATH"; FAIL=1; fi
done
cat <<'NOTE'
  Authenticate any that are not logged in, one at a time, in this shell:
      claude                 then Ctrl-D
      cursor-agent login
      codex login --check
NOTE

step "4/4  Non-interactive flags — verify these exist on YOUR versions"
probe() { # $1 tool, $2 args, $3 pattern
  local out
  out="$($1 $2 2>&1 | grep -iE "$3" | head -3)"
  if [ -n "$out" ]; then ok "$1 $2 -> $(echo "$out" | tr '\n' ' ' | cut -c1-70)"
  else warn "$1 $2 : no match for /$3/ — check the flag names in loop/loop.sh"; fi
}
command -v claude >/dev/null 2>&1      && probe claude "--help" "print|output-format|permission"
command -v codex >/dev/null 2>&1       && probe codex "exec --help" "sandbox|approval|cd"
command -v cursor-agent >/dev/null 2>&1 && probe cursor-agent "--help" "print|force|output"

echo
if [ "$FAIL" = 0 ]; then
  c '0;32' "Setup complete. Next:"
  echo "    ./loop/loop.sh doctor"
  echo "    ./loop/loop.sh run P0-14a"
else
  c '0;31' "Setup incomplete — fix the FAIL lines above, then re-run ./loop/setup.sh"
  exit 1
fi
