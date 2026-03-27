# Mind Coach — Jobs to be done (PRD gaps)

Tracker for **Engineering** and **UX** items from `MIND_COACH_PRD.md`. Status: `todo` | `in_progress` | `done` | `blocked` | `deferred`.

_Last updated: 2026-03-27 — statuses reconciled with implementation in repo._

---

## Engineering — high priority

| ID | Job | Status |
|----|-----|--------|
| E1 | Route chat through `mind-coach-chat` edge (optional `VITE_MIND_COACH_USE_CHAT_EDGE`); align double-persist with edge | `deferred` |
| E2 | User-visible errors on message save failures + n8n/chat failures (no silent drift) | `done` |
| E3 | Migration hygiene / prod `pathway_id` task library — **ops**; document only in PRD | `deferred` |
| E4 | Journey advancement client vs `session-end` — needs product spec | `deferred` |
| E5 | Enforce `unlockedFeatures()` on Journal, Exercises, Assessments (lock UI + copy) | `done` |
| E6 | Persist `discovery_state` to `mind_coach_journeys` when n8n returns pathway signal | `done` |
| E7 | E2E: onboarding → message → reload — **deferred** (no Playwright in repo yet) | `deferred` |
| E8 | Structured observability — **deferred** (needs logging stack) | `deferred` |

## Engineering — medium

| ID | Job | Status |
|----|-----|--------|
| E9 | Toolkit vs bottom-nav — single IA | `deferred` |
| E10 | Rate limit n8n | `deferred` |
| E11 | Greeting idempotency (no double greeting on strict remount) | `done` |
| E11b | Edge `mind-coach-chat`: persist `dynamic_content` on assistant insert | `done` |
| E12 | WebSocket / streaming | `deferred` |
| E13 | i18n / a11y audit | `deferred` |

## UX — PRD §9.3 + journey gaps

| ID | Job | Status |
|----|-----|--------|
| U1 | Onboarding trust & safety screen (AI coach limits + crisis note) | `done` |
| U2 | Empty state: sessions list when no sessions | `done` |
| U3 | Post-accept pathway note in `PlanProposalModal` / after accept | `done` |
| U4 | Diary: show completed sessions even without `summary_data` | `done` |
| U5 | Plan progress bar plain-language legend (30 messages / confidence) | `done` |
| U6 | Landing: short disclaimer before spinner (Mind Coach ≠ therapy) | `done` |
| U7 | Home: respect phase unlock for toolkit-style shortcuts | `done` |
| U8 | Onboarding save failure: in-flow error + retry | `done` |

## Clinical / policy (out of scope for this tracker)

Tracked in PRD §9.4 only.

---

## Completion notes

- **E5:** Journal, Exercises, and Assessments screens gate on `UNLOCK_MAP` + `journey.current_phase` (reactive); `firstPhaseWhereFeatureUnlocks` drives copy. Toolkit hub uses the same map so cards re-render when phase changes.
- **E6:** `syncDiscoveryFromN8n` updates Zustand and `mind_coach_journeys.discovery_state` via Supabase.
- **E2:** `TherapistChat` amber alert for failures; no silent mock assistant reply; Retry for greeting, n8n-only, or assistant-save-only paths; user message rolled back if persist fails.
- **E11:** Module `greetingAttemptedForSession` prevents duplicate greeting for the same `session_id`; Retry clears the lock and bumps `greetingRetryToken`.
- **E11b:** Edge `mind-coach-chat` inserts `dynamic_content` on assistant rows (matches client).
- **U3:** `PlanProposalModal` shows a short post-accept note and **Continue** before `onAccept`.
- **U4:** `DiaryScreen` lists completed sessions without requiring `summary_data`; fallback title/preview.
- **U5:** Plan progress strip includes plain-language legend (30 messages / confidence / 90% rule).
- **U6:** `MindCoachLanding` disclaimer + 988 before spinner.
- **U7:** `HomeScreen` phase-aware shortcuts to Journal / Assessments / Exercises.
- **U8:** `JourneyPreviewStep` inline save error + Try again; `finally` clears saving state.
- **U1:** Trust/safety copy remains in onboarding flow (step with 988 / limits); no change this pass.
