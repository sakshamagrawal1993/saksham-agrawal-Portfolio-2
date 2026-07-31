#!/usr/bin/env bash
# LibertyMD delivery loop — Claude (PM) -> Codex (refine/build) -> Cursor (QA)
#
# Artifacts in git are the ONLY interface between stages. The three CLIs cannot
# share session state, so every stage reads files and writes files. A crashed run
# resumes from disk; any stage can be re-run alone.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Ticket artifacts MUST be inside the repo: they are the interface between stages,
# and every stage needs them under version control in the ticket's own worktree.
# Override only if you deliberately keep them elsewhere.
TICKETS="${LIBERTYMD_TICKETS_DIR:-$ROOT/tickets}"

# The 87 ticket specs. Lives outside the repo today; set this if you move it.
SPECS="${LIBERTYMD_SPECS:-$ROOT/../../Startups/Startups/LibertyMD/LibertyMD_Ticket_Specs_Phase0_Phase1.md}"

PROMPTS="$ROOT/loop/prompts"
WT="$ROOT/.worktrees"
REGISTRY="$TICKETS/registry.json"
MAX_BUILD_ATTEMPTS=5
MAX_ENRICH_ATTEMPTS=2

# Gates. Run individually — the full chain can exceed a single timeout.
GATES=(contracts separability policy recovery breaker simulations evaluation)

# Portable timeout.
#
# Two macOS traps, both hit for real:
#  1. `timeout` is GNU coreutils and is ABSENT on stock macOS. Using it unguarded
#     made all six gates report a false failure while the one check that skipped
#     it passed -- the tell was "6 gates failing" next to "3 workflows validated".
#  2. An empty bash ARRAY expanded under `set -u` errors on bash 3.2, which is
#     what stock macOS ships. So this deliberately uses a plain string, no arrays.
GATE_TIMEOUT="${GATE_TIMEOUT:-300}"
TIMEOUT_BIN=""
if command -v gtimeout >/dev/null 2>&1;  then TIMEOUT_BIN=gtimeout
elif command -v timeout  >/dev/null 2>&1; then TIMEOUT_BIN=timeout
fi
run_limited() {
  if [ -n "$TIMEOUT_BIN" ]; then "$TIMEOUT_BIN" "$GATE_TIMEOUT" "$@"; else "$@"; fi
}

# ALL logging goes to stderr.
#
# This is load-bearing, not stylistic. Functions here return values via `echo` on
# stdout and command substitution captures stdout, so a single log line written to
# stdout gets concatenated into the return value -- which is exactly what happened:
# ensure_worktree() returned "<ansi>info text\n/path/to/worktree", breaking both the
# cd and the sed that consumed it. Keep stdout for data, stderr for humans.
c()   { printf '\033[%sm%s\033[0m\n' "$1" "$2" >&2; }
info(){ c '0;36' "  $*"; }
ok()  { c '0;32' "  ✓ $*"; }
bad() { c '0;31' "  ✗ $*"; }
warn(){ c '0;33' "  ! $*"; }
die() { bad "$*"; exit 1; }

need_deno() { [ -x /tmp/deno/bin/deno ] && export PATH="/tmp/deno/bin:$PATH"; }

# ---------------------------------------------------------------- doctor
doctor() {
  local fail=0
  c '1;37' "LibertyMD loop — preflight"

  for tool in claude codex cursor-agent git; do
    if command -v "$tool" >/dev/null 2>&1; then ok "$tool $(command -v $tool)"
    else bad "$tool NOT FOUND"; fail=1; fi
  done

  need_deno
  command -v deno >/dev/null 2>&1 && ok "deno $(deno --version | head -1)" \
    || { bad "deno missing — :policy and :evaluation cannot run"; fail=1; }

  ok "bash ${BASH_VERSION:-unknown}"
  if [ -n "$TIMEOUT_BIN" ]; then ok "gate timeout via $TIMEOUT_BIN (${GATE_TIMEOUT}s)"
  else warn "no timeout/gtimeout — gates run unbounded (brew install coreutils for gtimeout)"; fi

  # The context pack must exist AND be COMMITTED. Stages run inside a git worktree,
  # and a worktree contains only tracked files -- so an uncommitted context pack is
  # invisible to every agent while looking perfectly fine here in the main tree.
  # That exact mismatch made the PM stage hang with nothing to read.
  local tracked_rel
  for f in CONTEXT.md DECISIONS.md BASELINE.md; do
    if [ ! -f "$TICKETS/$f" ]; then bad "tickets/$f MISSING"; fail=1; continue; fi
    tracked_rel="${TICKETS#$ROOT/}/$f"
    if git -C "$ROOT" ls-files --error-unmatch "$tracked_rel" >/dev/null 2>&1; then ok "tickets/$f (committed)"
    else bad "tickets/$f exists but is NOT COMMITTED — worktrees cannot see it"; fail=1; fi
  done
  if [ -f "$ROOT/docs/product/PRD.md" ]; then
    git -C "$ROOT" ls-files --error-unmatch docs/product/PRD.md >/dev/null 2>&1 \
      && ok "docs/product/PRD.md (committed)" \
      || { bad "docs/product/PRD.md is NOT COMMITTED — worktrees cannot see it"; fail=1; }
  else warn "docs/product/PRD.md missing (PM stage will be weaker)"; fi
  if [ "$fail" != 0 ]; then
    info "fix with:  git add tickets docs/product loop .gitignore && git commit -m 'Add delivery loop'"
  fi

  info "gates:"
  for g in "${GATES[@]}"; do
    if (cd "$ROOT" && run_limited npm run --silent "test:libertymd:$g" >/dev/null 2>&1); then ok "  $g"
    else bad "  $g FAILING at baseline — fix before running tickets"; fail=1; fi
  done

  # A gate that checks nothing is worse than no gate.
  local checked
  checked=$(cd "$ROOT" && npm run --silent test:libertymd:contracts 2>/dev/null \
            | python3 -c 'import sys,json;t=sys.stdin.read();print(json.loads(t[t.find("{"):t.rfind("}")+1])["workflowsChecked"])' 2>/dev/null || echo 0)
  [ "${checked:-0}" -gt 0 ] && ok "contract gate validated $checked workflows" \
    || { bad "contract gate checked 0 workflows — a green light wired to nothing"; fail=1; }

  # A fresh worktree can trigger a trust/permission dialog that blocks forever on
  # piped stdin. Probe each CLI non-interactively in a throwaway dir so a blocking
  # prompt surfaces HERE, not 40 minutes into a stage.
  info "non-interactive probe (a hang here means a blocking prompt):"
  local probe_dir; probe_dir="$(mktemp -d)"
  local PROBE_SECS="${PROBE_SECS:-45}"
  _probe() { # $1 label, then command
    local label="$1"; shift
    local out rc=0
    # Short, dedicated budget: a blocked prompt must surface in seconds, not
    # inherit the 300s gate timeout and make doctor look hung itself.
    if [ -n "$TIMEOUT_BIN" ]; then
      out="$(printf 'Reply with exactly: PROBE_OK\n' | (cd "$probe_dir" && "$TIMEOUT_BIN" "$PROBE_SECS" "$@" 2>&1) )" || rc=$?
    else
      out="$(printf 'Reply with exactly: PROBE_OK\n' | (cd "$probe_dir" && "$@" 2>&1) )" || rc=$?
    fi
    if printf '%s' "$out" | grep -q PROBE_OK; then ok "  $label responds non-interactively"
    elif [ "$rc" = 124 ]; then bad "  $label BLOCKED (timed out) — a prompt is waiting; run it once by hand in a new dir"; fail=1
    else warn "  $label returned rc=$rc: $(printf '%s' "$out" | tr '\n' ' ' | cut -c1-90)"; fi
  }
  _probe claude       claude -p $CLAUDE_FLAGS
  _probe codex        codex exec $CODEX_RO_FLAGS -
  _probe cursor-agent cursor-agent -p $CURSOR_FLAGS
  rm -rf "$probe_dir"

  [ "$fail" = 0 ] && c '0;32' "READY" || die "preflight failed"
}

# ---------------------------------------------------------------- helpers
manifest_of() {
  local id="$1" src="$TICKETS/$id/03-clarified.md"
  # Prefer the approved contract's manifest; fall back to the spec doc before one exists.
  [ -s "$src" ] || src="$TICKETS/$id/01-story.md"
  if [ -s "$src" ]; then
    sed -n '/[Mm]anifest/,/^##/p' "$src" | grep -oE '`[^`]+\.(ts|tsx|json|mjs)`' | tr -d '`' | sort -u
    return
  fi
  [ -f "$SPECS" ] || return 0
  grep -A400 "^### $id " "$SPECS" 2>/dev/null \
    | sed -n '/manifest/,/^$/p' | grep -oE '`[^`]+\.(ts|tsx|json|mjs)`' | tr -d '`' | sort -u
}

ticket_dir() { echo "$TICKETS/$1"; }
worktree_of() { echo "$WT/$1"; }

ensure_worktree() {
  local id="$1" wt err; wt="$(worktree_of "$id")"
  if [ ! -d "$wt" ]; then
    info "creating worktree $wt on branch ticket/$id"
    mkdir -p "$WT"
    # Do NOT swallow git's stderr -- a silent failure here produced a
    # "No such file or directory" three lines later with no cause shown.
    if ! err="$(git -C "$ROOT" worktree add "$wt" -b "ticket/$id" 2>&1)"; then
      # branch may already exist from an earlier run; reuse it
      if ! err="$(git -C "$ROOT" worktree add "$wt" "ticket/$id" 2>&1)"; then
        bad "git worktree add failed for $id:"
        printf '%s\n' "$err" >&2
        return 1
      fi
    fi
  fi
  [ -d "$wt" ] || { bad "worktree path still missing after add: $wt"; return 1; }

  # A worktree contains only COMMITTED files. Verify the context pack actually
  # landed in it -- otherwise every stage runs blind against missing files, which
  # presents as a silent hang rather than an error.
  local missing=""
  for f in tickets/CONTEXT.md tickets/DECISIONS.md tickets/BASELINE.md docs/product/PRD.md; do
    [ -f "$wt/$f" ] || missing="$missing $f"
  done
  if [ -n "$missing" ]; then
    bad "worktree $id is missing the context pack:$missing"
    info "the files exist in the main tree but are not committed, so the worktree cannot see them"
    info "fix:  git add tickets docs/product loop .gitignore && git commit -m 'Add delivery loop'"
    info "then: git worktree remove --force $wt && git branch -D ticket/$id"
    return 1
  fi
  echo "$wt"
}

# Substitutes {{TICKET}} and {{WORKTREE}} into a prompt template.
render() { sed -e "s|{{TICKET}}|$2|g" -e "s|{{WORKTREE}}|$3|g" "$PROMPTS/$1.md"; }

# artifact must exist AND be substantial — an empty file is not a completed stage
artifact_ok() { [ -s "$1" ] && [ "$(wc -l < "$1")" -ge 8 ]; }

halted() { [ -f "$(ticket_dir "$1")/NEEDS_DECISION.md" ]; }

run_gates() { # $1 = dir
  local d="$1" f=0
  need_deno
  for g in "${GATES[@]}"; do
    (cd "$d" && run_limited npm run --silent "test:libertymd:$g" >/dev/null 2>&1) \
      && ok "gate $g" || { bad "gate $g FAILED"; f=1; }
  done
  return $f
}

# ---------------------------------------------------------------- stages
#
# Each stage is one non-interactive CLI call. Two hard lessons are encoded here:
#
#  1. NEVER send stage output to /dev/null. A hung stage and a working stage look
#     identical when muted, and the first thing that hung was a hidden interactive
#     prompt. Output is streamed to the terminal AND kept in tickets/<ID>/logs/.
#
#  2. A fresh git worktree is a directory these CLIs have never seen, so each one
#     may raise a trust / permission dialog that blocks forever on piped stdin.
#     The flags below are the unattended forms. They are deliberately overridable
#     because flag names move between releases -- see RUNBOOK step 0.
#
# An isolated throwaway worktree is the one place broad permissions are reasonable;
# override if you would rather approve each edit by hand.
CLAUDE_FLAGS="${LOOP_CLAUDE_FLAGS:---dangerously-skip-permissions}"
CODEX_RO_FLAGS="${LOOP_CODEX_RO_FLAGS:---sandbox read-only --skip-git-repo-check}"
CODEX_RW_FLAGS="${LOOP_CODEX_RW_FLAGS:---sandbox workspace-write --skip-git-repo-check}"
CURSOR_FLAGS="${LOOP_CURSOR_FLAGS:---force}"
STAGE_TIMEOUT="${STAGE_TIMEOUT:-2400}"   # 40 min per stage; a hang must not be forever

# $1 stage name, $2 ticket, $3 worktree, $4 prompt template, then the command
run_stage() {
  local stage="$1" id="$2" wt="$3" tmpl="$4"; shift 4
  local logdir="$(ticket_dir "$id")/logs"; mkdir -p "$logdir"
  local log="$logdir/$stage.log"
  info "[$id] $stage -> $log"
  info "      $* (cwd $wt)"
  local rc=0

  # Heartbeat. These CLIs run in print mode, which BUFFERS the whole response and
  # emits nothing until it finishes -- so a healthy multi-minute stage looks
  # identical to a hang. The loop reports liveness itself rather than relying on
  # the child to stream, which also works for whichever CLI does not.
  local started; started=$(date +%s)
  ( while :; do
      sleep 30
      printf '\033[0;36m      … %s running %ss\033[0m\n' "$stage" "$(( $(date +%s) - started ))" >&2
    done ) &
  local hb=$!
  # Kill the subshell AND its in-flight `sleep`; killing only the parent leaves an
  # orphan per stage, which accumulates across tickets.
  stop_hb() { pkill -P "$hb" 2>/dev/null; kill "$hb" 2>/dev/null; wait "$hb" 2>/dev/null; }
  # shellcheck disable=SC2064
  trap stop_hb RETURN

  # tee: visible live where the CLI does stream, and always kept for post-mortem
  if [ -n "$TIMEOUT_BIN" ]; then
    render "$tmpl" "$id" "$wt" | (cd "$wt" && "$TIMEOUT_BIN" "$STAGE_TIMEOUT" "$@") 2>&1 | tee "$log" >&2 || rc=$?
  else
    render "$tmpl" "$id" "$wt" | (cd "$wt" && "$@") 2>&1 | tee "$log" >&2 || rc=$?
  fi
  stop_hb

  if [ "$rc" = 124 ]; then
    bad "[$id] $stage TIMED OUT after ${STAGE_TIMEOUT}s — see $log; a blocked prompt is the usual cause"
  fi
  local lines; lines="$(wc -l < "$log" 2>/dev/null | tr -d ' ')"
  info "[$id] $stage finished rc=$rc, ${lines:-0} log lines"
  return 0   # stage success is judged by the artifact, not the exit code
}

stage_pm()      { run_stage pm      "$1" "$2" pm          claude -p $CLAUDE_FLAGS; }
stage_enrich()  { run_stage enrich  "$1" "$2" pm-enrich   claude -p $CLAUDE_FLAGS; }
stage_refine()  { run_stage refine  "$1" "$2" tech-refine codex exec $CODEX_RO_FLAGS -; }
stage_build()   { run_stage build   "$1" "$2" tech-build  codex exec $CODEX_RW_FLAGS -; }
stage_qa()      { run_stage qa      "$1" "$2" qa          cursor-agent -p $CURSOR_FLAGS; }

qa_verdict() { # PASS | FAIL | UNTESTABLE | NONE
  local r="$1"
  [ -f "$r" ] || { echo NONE; return; }
  grep -qiE '^\**(overall )?verdict\**:?\s*\**FAIL' "$r" && { echo FAIL; return; }
  grep -qi 'UNTESTABLE' "$r" && { echo UNTESTABLE; return; }
  grep -qiE '^\**(overall )?verdict\**:?\s*\**PASS' "$r" && { echo PASS; return; }
  echo FAIL
}

# ---------------------------------------------------------------- run
# One ticket, one runner.
#
# Without this, a second `run <same ticket>` happily starts a parallel pipeline in
# the SAME worktree and both write 01-story.md, 04-implementation.md and the diff
# on top of each other. That happened. mkdir is atomic, so it is the lock.
acquire_lease() {
  local id="$1" lock; lock="$(ticket_dir "$id")/.lease"
  mkdir -p "$(ticket_dir "$id")"
  if mkdir "$lock" 2>/dev/null; then
    printf '%s\n%s\n' "$$" "$(date)" > "$lock/owner"
    LEASE_DIR="$lock"
    return 0
  fi
  local owner; owner="$(head -1 "$lock/owner" 2>/dev/null || echo unknown)"
  if [ "$owner" != unknown ] && kill -0 "$owner" 2>/dev/null; then
    bad "$id is already being run by PID $owner (since $(sed -n 2p "$lock/owner" 2>/dev/null))"
    info "two runners in one worktree corrupt each other's artifacts"
    info "wait for it, or: kill $owner && rm -rf $lock"
    return 1
  fi
  warn "$id had a stale lease from dead PID $owner — reclaiming"
  printf '%s\n%s\n' "$$" "$(date)" > "$lock/owner"
  LEASE_DIR="$lock"
  return 0
}
release_lease() { [ -n "${LEASE_DIR:-}" ] && rm -rf "$LEASE_DIR"; LEASE_DIR=""; }

run_ticket() {
  local id="$1" wt d build=0 enrich=0
  c '1;37' "── $id ──"
  acquire_lease "$id" || return 4
  trap 'release_lease' EXIT INT TERM
  wt="$(ensure_worktree "$id")" || die "[$id] cannot proceed without a worktree"
  # Guard against the class of bug that broke this once: a captured value that is
  # not a single clean path means some function logged to stdout.
  case "$wt" in
    *$'\n'*|*$'\033'*|"") die "[$id] worktree path is not a clean single line: $(printf %q "$wt")" ;;
  esac
  [ -d "$wt" ] || die "[$id] worktree missing: $wt"
  d="$(ticket_dir "$id")"; mkdir -p "$d"

  artifact_ok "$d/01-story.md"     || stage_pm     "$id" "$wt"
  artifact_ok "$d/01-story.md"     || die "[$id] PM produced no story"
  artifact_ok "$d/02-questions.md" || stage_refine "$id" "$wt"

  while :; do
    artifact_ok "$d/03-clarified.md" || stage_enrich "$id" "$wt"
    if halted "$id"; then
      warn "[$id] HALTED — answer in tickets/DECISIONS.md then: ./loop/loop.sh resume $id"
      return 3
    fi
    artifact_ok "$d/03-clarified.md" || die "[$id] enrich produced nothing"

    stage_build "$id" "$wt"
    build=$((build+1))

    # fail fast before spending QA
    if ! (cd "$wt" && npx tsc --noEmit -p tsconfig.json >/dev/null 2>&1); then
      warn "[$id] typecheck broken after build — bouncing without spending QA"
      [ "$build" -ge "$MAX_BUILD_ATTEMPTS" ] && { bad "[$id] build attempts exhausted"; return 1; }
      continue
    fi

    stage_qa "$id" "$wt"
    case "$(qa_verdict "$d/05-qa-report.md")" in
      PASS)
        run_gates "$wt" || { bad "[$id] QA passed but gates failed — treating as FAIL"; }
        ok "[$id] QA PASS"
        release_lease
        grep -qi 'REQUIRES EXPERT REVIEW' "$d/05-qa-report.md" \
          && warn "[$id] REQUIRES EXPERT REVIEW — not safe to ship without a clinician"
        return 0 ;;
      UNTESTABLE)
        enrich=$((enrich+1))
        [ "$enrich" -ge "$MAX_ENRICH_ATTEMPTS" ] && { bad "[$id] spec keeps producing untestable criteria — escalating"; return 2; }
        warn "[$id] UNTESTABLE — spec defect, back to enrich (not build)"
        rm -f "$d/03-clarified.md" ;;
      *)
        [ "$build" -ge "$MAX_BUILD_ATTEMPTS" ] && { bad "[$id] QA FAIL x$build — escalating, the story is likely the problem"; return 1; }
        warn "[$id] QA FAIL — rebuilding with the report attached ($build/$MAX_BUILD_ATTEMPTS)" ;;
    esac
  done
}

# ---------------------------------------------------------------- plan
plan() {
  c '1;37' "collision check"
  local -a ids=("$@"); local i j a b overlap=0
  for ((i=0;i<${#ids[@]};i++)); do
    for ((j=i+1;j<${#ids[@]};j++)); do
      a="$(manifest_of "${ids[i]}")"; b="$(manifest_of "${ids[j]}")"
      local shared; shared="$(comm -12 <(echo "$a") <(echo "$b") | grep -v '^$' || true)"
      if [ -n "$shared" ]; then
        bad "${ids[i]} ✗ ${ids[j]} share: $(echo $shared | tr '\n' ' ')"; overlap=1
      else ok "${ids[i]} ∥ ${ids[j]}"; fi
    done
  done
  [ "$overlap" = 1 ] && die "put colliding tickets in the same lane and run them sequentially"
  ok "no collisions — safe to run in parallel"
}

parallel() {
  local n="$1"; shift
  plan "$@" || exit 1
  printf '%s\n' "$@" | xargs -n1 -P"$n" -I{} bash -c "'$0' run {}"
}

merge_ticket() {
  local id="$1" wt; wt="$(worktree_of "$id")"
  [ -d "$wt" ] || die "no worktree for $id"
  local v; v="$(qa_verdict "$(ticket_dir "$id")/05-qa-report.md")"
  [ "$v" = PASS ] || die "$id QA verdict is $v — not merging"

  info "rebasing $id on main"
  (cd "$wt" && git fetch origin >/dev/null 2>&1; git rebase origin/main) || die "$id rebase conflict — resolve in $wt"
  info "re-running gates AFTER rebase (per-lane green != combined green)"
  run_gates "$wt" || die "$id fails gates after rebase — fix before merge"
  (cd "$ROOT" && git merge --no-ff "ticket/$id" -m "$id: $(head -1 "$(ticket_dir "$id")/01-story.md" | sed 's/^#* *//')") \
    || die "$id merge failed"
  ok "$id merged"
}

resume() { rm -f "$(ticket_dir "$1")/NEEDS_DECISION.md"; run_ticket "$1"; }

status() {
  [ -d "$TICKETS" ] || die "tickets dir not found: $TICKETS (set LIBERTYMD_TICKETS_DIR)"
  printf '%-14s %-9s %-9s %-9s %-9s %-9s %s\n' TICKET STORY QUESTIONS CLARIFIED BUILD QA VERDICT
  shopt -s nullglob
  local found=0
  for d in "$TICKETS"/*/; do
    found=1
    local id; id="$(basename "$d")"
    case "$id" in registry.json|*.md) continue;; esac
    printf '%-14s %-9s %-9s %-9s %-9s %-9s %s\n' "$id" \
      "$([ -s "$d/01-story.md" ] && echo yes || echo -)" \
      "$([ -s "$d/02-questions.md" ] && echo yes || echo -)" \
      "$([ -s "$d/03-clarified.md" ] && echo yes || echo -)" \
      "$([ -s "$d/04-implementation.md" ] && echo yes || echo -)" \
      "$([ -s "$d/05-qa-report.md" ] && echo yes || echo -)" \
      "$([ -f "$d/NEEDS_DECISION.md" ] && echo HALTED || qa_verdict "$d/05-qa-report.md")"
  done
  [ "$found" = 0 ] && warn "no ticket directories in $TICKETS"
  return 0
}

case "${1:-help}" in
  doctor)   doctor ;;
  run)      shift; run_ticket "$1" ;;
  plan)     shift; plan "$@" ;;
  parallel) shift; parallel "$@" ;;
  merge)    shift; merge_ticket "$1" ;;
  resume)   shift; resume "$1" ;;
  status)   status ;;
  *) cat <<'EOF'
LibertyMD delivery loop

  ./loop/loop.sh doctor                    preflight: CLIs, deno, gates, context pack
  ./loop/loop.sh run <TICKET>              one ticket through PM -> refine -> build -> QA
  ./loop/loop.sh plan <T1> <T2> ...        collision check only
  ./loop/loop.sh parallel <N> <T1> ...     run N at a time (start with 2)
  ./loop/loop.sh merge <TICKET>            rebase, re-gate, merge (serialised)
  ./loop/loop.sh resume <TICKET>           after answering NEEDS_DECISION.md
  ./loop/loop.sh status                    artifact + verdict table
EOF
  ;;
esac
