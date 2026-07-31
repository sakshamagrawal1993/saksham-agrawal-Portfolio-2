# Parallel mode

## Phase −1 — Lane planning (orchestrator)

Assign lanes by file collision, not by theme. Themes should fall out, not drive.

1. Derive each ticket's file manifest from its spec plus a grep for the symbols it names.
2. Choose collision granularity per file:
   - Small files → whole-file ownership.
   - Large files (roughly >600 lines) → symbol or handler ownership, because whole-file granularity collapses everything into one lane.
   - Generated JSON (workflow definitions, lockfiles) is always atomic — two agents editing different nodes of one JSON are still the same lane.
3. Build the conflict graph. Tickets share an edge when manifests intersect at the chosen granularity; connected components are candidate lanes. Exclude append-only files (docs, decision logs) or everything merges into one component — serialise those at merge time instead.
4. Identify **Lane 0** — prerequisites that must land before any parallelism. Typically:
   - Fixing gates that silently pass. In parallel, a broken gate means N lanes all verified against nothing.
   - Writing `BASELINE.md` and `CONTEXT.md`.
   - Decomposing any file that appears in most lanes' manifests. If one large file is touched by nearly every lane, splitting it by concern first is the single highest-leverage enabler of parallelism. Lane 0 runs sequentially, alone, to completion.
5. Fit component count to the requested lane count — split oversized components on internal seams, merge tiny ones. Respect dependency gates.
6. Order within each lane: dependencies first, then smallest first so early wins land and the lane's diff stays reviewable.
7. Write `LANES.md`: per lane, ticket order, file manifest, owned symbols for shared files, cross-lane contact points, merge position.

Present `LANES.md` before executing. Lane planning is cheap; a bad split is not.

## Execution

- Each lane runs the single-ticket cycle for its tickets sequentially, in its own git worktree (isolation: "worktree").
- Lanes run concurrently, capped at the requested count. One subagent is active per lane at a time — the three roles are sequential within a ticket, so N lanes means N concurrent agents, not 3N.
- Never parallelise across a dependency gate. If lane B's first ticket needs lane A's third to land, that is sequencing — restructure the lanes.
- A lane failing QA 5 times on a ticket parks; other lanes continue.
- A ticket that hits `ESCALATE:` parks and the orchestrator asks the business owner immediately; other lanes continue. Resume that ticket when the answer is appended to `DECISIONS.md`.
- Checkpoint after every completed ticket. Long runs can exhaust a session budget mid-flight and must resume from disk.

## Merge protocol

- Merge the highest-collision lane first, so others rebase onto it rather than it rebasing onto everything. Merging the easiest first maximises total conflict work.
- Run the standing gates after every single merge, not once at the end. Incremental gating is the only way to attribute a break to a lane.
- After the final merge, re-run the full suite plus any domain regression corpus. Per-lane green does not mean combined green — two changes that each pass alone can jointly break behaviour, and in safety-critical code that is the failure mode that matters most.
- On post-merge failure the last-merged lane is prime suspect: revert, confirm green, re-land with a fix rather than debugging a merged tree.
- Reconcile append-only shared files by hand at the end. Never let an agent auto-merge them.
