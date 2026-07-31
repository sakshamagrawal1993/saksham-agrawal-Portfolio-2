# LibertyMD Delivery Loop — Runbook

Claude (PM) → Codex (tech refine → build) → Cursor (QA), one ticket per git worktree, many tickets in parallel.

**Why it is built this way:** the three CLIs cannot share conversation state — their session formats are private and incompatible. So **durable artifacts in git are the only interface between stages.** Every stage reads files and writes files. Nothing depends on a previous agent's context surviving.

That constraint turns out to be a feature: a crashed run resumes from disk, and each stage can be re-run independently.

---

## 0. One-time setup

> **Do not paste blocks of this file into zsh.** Interactive zsh does not treat `#`
> as a comment unless `interactivecomments` is set, so an apostrophe inside a
> comment (as in "the ticket's worktree") opens a quote that never closes and you
> land in a `quote>` prompt with everything after it swallowed. Press `Ctrl-C` if
> that happens. Run the script below instead — it takes no arguments and pastes nothing.

Three commands, one at a time:

```
cd ~/Documents/Projects/saksham-agrawal-Portfolio-2
```
```
chmod +x loop/setup.sh && ./loop/setup.sh
```
```
./loop/loop.sh doctor
```

`setup.sh` copies the ticket artifacts into the repo, sets executable bits, checks all three CLIs are on PATH, and probes each one for the non-interactive flags the loop depends on — flag names move between releases, so it reports what your versions actually accept rather than assuming.

It will tell you which CLIs still need authenticating. Do those one line at a time:

```
claude
```
```
cursor-agent login
```
```
codex login --check
```

`doctor` then verifies `deno` is available, all six gates run and pass at baseline, `git worktree` works, and the context pack exists. **Fix everything it reports before running a ticket** — a red gate at baseline means every ticket after it is verified against nothing.

Once green, commit:

```
git add tickets docs/product loop && git commit -m "Add delivery loop, PRD, ticket artifacts"
```

---

## 1. The context pack — already built

The loop does not invent a context pack. It passes the files you already have:

| File | Role | Authority |
|---|---|---|
| `docs/product/PRD.md` | Why we're building, required user behaviour | Product intent |
| `tickets/CONTEXT.md` | Architecture rules, principles, conventions, traps | Engineering constraints |
| `tickets/DECISIONS.md` | Business-owner answers, append-only | **Highest — overrides all** |
| `tickets/BASELINE.md` | Known pre-existing failures with counts | What is not your fault |
| `LibertyMD_Ticket_Specs_Phase0_Phase1.md` | The 87 ticket specs | Ticket scope |

**Conflict rule, enforced in every prompt:** if two authoritative sources disagree, the agent **stops and escalates**. It never silently decides that one wins. Precedence is: latest `DECISIONS.md` entry → approved ticket contract → PRD → design spec → repo conventions.

---

## 2. Run one ticket

```bash
./loop/loop.sh run P0-14a
```

Stages, each gated:

```
pm        → tickets/P0-14a/01-story.md          (claude)
refine    → tickets/P0-14a/02-questions.md      (codex)
enrich    → tickets/P0-14a/03-clarified.md      (claude)  ← may HALT for you
build     → tickets/P0-14a/04-implementation.md (codex)
qa        → tickets/P0-14a/05-qa-report.md      (cursor)
```

The orchestrator will not advance a stage until the previous artifact exists and is non-trivial. On QA **FAIL** it loops back to `build` with the QA report attached, up to 5 attempts. On QA **UNTESTABLE** it loops back to `enrich` instead — an untestable criterion is a spec defect, and rebuilding cannot fix it.

## 3. Run several in parallel

```bash
./loop/loop.sh plan P0-14a P0-14b P0-15a P0-17     # collision check first
./loop/loop.sh parallel 2 P0-14a P0-14b            # start with 2
```

`plan` reads each ticket's file manifest and **refuses** to schedule two tickets that touch the same file, or the same single-file blob. Raise the concurrency only once you've seen a clean run.

**Start with 2.** Not 6. The failure mode is not agent capacity, it is merge conflict, and you find that out cheaply at 2.

## 4. Merge

```bash
./loop/loop.sh merge P0-14a
```

Serialised by design. It rebases the worktree on `main`, re-runs all six gates **after** the rebase, and refuses to merge on any new failure. Then the next ticket rebases onto the result.

**Per-lane green does not mean combined green** — two changes that each pass alone can jointly break emergency detection. That is why gates run again post-rebase, every time.

---

## 5. When it stops and asks you

A `HALT` writes `tickets/<ID>/NEEDS_DECISION.md` and exits. Answer by appending to `tickets/DECISIONS.md` — **not** by replying in a chat window, or the answer is trapped in one platform and lost to the next agent.

```bash
$EDITOR tickets/DECISIONS.md      # append the decision, dated, with the ticket id
./loop/loop.sh resume P0-14a
```

---

## 6. What the loop will not do

- **It will not mark a clinical ticket safe.** QA PASS means "the code does what the ticket said". Anything touching safety detection, thresholds or clinical copy gets a `REQUIRES EXPERT REVIEW` header listing the exact hunks. That needs a clinician, and the loop has no clinician.
- **It will not merge without gates green post-rebase.**
- **It will not update `BASELINE.md`.** Only you do that, deliberately. An agent that can edit the baseline can silence its own regressions.
- **It will not let QA read the implementation notes.** That asymmetry is the entire reason QA finds anything.

---

## 7. Known-good first ticket

Run `P0-14a` first. It is well-specified, the n8n side already has the five presentations, and the edge-screen parity work is contained. Verify the whole pipeline on it before trusting the loop with anything larger.

```bash
./loop/loop.sh doctor
./loop/loop.sh run P0-14a
cat tickets/P0-14a/05-qa-report.md
```
