# Mind Coach — PRD gap review & priorities

**Purpose:** Consolidate gaps from [`MIND_COACH_PRD.md`](./MIND_COACH_PRD.md), classify by **severity / owner**, and track resolution vs [`MIND_COACH_JOBS.md`](./MIND_COACH_JOBS.md).

**Last reviewed:** 2026-03-28

---

## How to read this doc

| Priority | Meaning |
|----------|---------|
| **P0** | Safety, data loss, or broken core flow — fix soon |
| **P1** | Strong product/engineering impact — schedule next |
| **P2** | Polish, IA, or depends on product/legal |
| **P3** | Strategic / out of repo scope |

**Status:** `open` | `in_progress` | `done` | `blocked` | `wontfix` (by policy)

---

## P0 — Safety & correctness

| ID | Gap (PRD ref) | Notes | Status |
|----|----------------|-------|--------|
| G-P0-01 | **MindCoachApp load effect called `reset()` on cleanup** (§4.3, impl) | Wiped Zustand on Strict Mode remount / effect re-entry. **Fixed:** `reset()` only when `profileId` actually changes (`prevProfileIdRef`); cleanup only sets `cancelled`. | `done` |
| G-P0-02 | **PHQ-9 item 9 / self-harm** (§4.8) | Dedicated escalation in UI + clinical script — needs clinical sign-off before code-only “fix”. | `blocked` (clinical) |
| G-P0-03 | **Session-end edge: empty messages → 404** (§4.5, edge) | User ending with no messages gets error path; client falls back to dummy but edge still fails. Product: block “End session” until ≥1 message or soften edge. | `open` |

---

## P1 — Engineering & UX (in-repo)

| ID | Gap (PRD ref) | Notes | Status |
|----|----------------|-------|--------|
| G-P1-01 | **Chat via browser → n8n** (§6.3, FR-14, **E1**) | Webhook exposure, no central audit log. Optional `VITE_MIND_COACH_USE_CHAT_EDGE`. | `open` → see E1 |
| G-P1-02 | **Journey store stale after session-end** (§4.5, §10 Q2) | Edge updates `sessions_completed` / phase; client journey may be stale until full reload. **Refresh journey on summary close.** | `done` (2026-03-28) |
| G-P1-03 | **Toolkit hub unreachable** (§4.10, **E9**) | `ToolkitScreen` not in `TabContent` / nav — orphaned. **Entry from Home + `toolkit` tab (no extra bottom-nav slot).** | `done` (2026-03-28) |
| G-P1-04 | **Typing / status in chat header** (§4.5) | Only thread dots; **subtitle when loading: “Writing a reply…”**. | `done` (2026-03-28) |
| G-P1-05 | **Crisis resources India-only** (§4.5, FR-10) | Add **988** (US/CA) alongside iCall; full locale matrix = P2. | `done` (2026-03-28) |
| G-P1-06 | **Migration / ops** (**E3**) | Prod migration history; task library column mismatches — track in ops runbooks. | `open` |
| G-P1-07 | **Journey advancement contract** (**E4**) | Client vs `session-end` phase index — needs spec. | `open` |

---

## P2 — Product, IA, compliance copy

| ID | Gap (PRD ref) | Notes | Status |
|----|----------------|-------|--------|
| G-P2-01 | **Consent checkbox + timestamp** (§4.2) | Legal / DB design | `open` |
| G-P2-02 | **Gender / minors policy** (§4.2) | Copy + optional flow | `open` |
| G-P2-03 | **Proposal “talk more first” / declined path** (§9.2) | Acknowledgement toast or session note | `open` |
| G-P2-04 | **Talk vs Sessions naming** (§4.3) | Rename or tooltip | `open` |
| G-P2-05 | **Assessment severe → external help CTA** (§4.8, §9.3) | Link out + copy | `open` |
| G-P2-06 | **Terms / AI coaching** (§9.3) | Legal | `open` |
| G-P2-07 | **Progress bar legend** (§4.5, U5) | PRD still mentions long legend; **product choice:** label only under bar (current). Align PRD in next pass. | `open` (doc sync) |
| G-P2-08 | **E2E tests** (**E7**) | Playwright | `open` |
| G-P2-09 | **Observability** (**E8**) | Logging stack | `open` |

---

## P3 — Strategic / deferred

| ID | Gap | Notes |
|----|-----|-------|
| G-P3-01 | Human escalation, B2B, outcome UX (§9.4) | Not in current codebase scope |
| G-P3-02 | WebSocket streaming (**E12**) | |
| G-P3-03 | Rate limit n8n (**E10**) | |
| G-P3-04 | i18n / full a11y audit (**E13**) | |

---

## Resolved in this pass (2026-03-28)

- **G-P0-01** — Profile-switch ref + no `reset()` in data-load effect cleanup (`MindCoachApp.tsx`).
- **G-P1-02** — `TherapistChat` `handleCloseSummary`: refetch active `mind_coach_journeys` row and `setJourney`.
- **G-P1-03** — `TabId` + `toolkit`; `MindCoachApp` `TabContent`; Home entry “Toolkit”; toolkit shell with ← Home.
- **G-P1-04** — Chat header subtitle when `isLoading`.
- **G-P1-05** — Crisis overlay: 988 link + short locale note.

---

## Maintenance

- After each release, reconcile **Status** here and **§9** in the PRD.
- Engineering task IDs remain in [`MIND_COACH_JOBS.md`](./MIND_COACH_JOBS.md); this file is the **prioritised gap narrative**.
