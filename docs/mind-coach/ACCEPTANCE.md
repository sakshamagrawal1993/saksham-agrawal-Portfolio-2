# Mind Coach acceptance contract

Status values are `PASS`, `FAIL`, `BLOCKED`, and `NOT_TESTED`. Only `PASS` counts toward completion.

## Authentication and entry

- **MC-001** Unauthenticated users are redirected to `/mind-coach/login`.
- **MC-002** Landing shows not-therapy disclaimer and crisis line (988) before spinner.
- **MC-003** Authenticated users without a profile reach onboarding (`/mind-coach/new`).
- **MC-004** Authenticated users with a profile are routed to `/mind-coach/:profileId`.

## Onboarding

- **MC-010** Onboarding creates `mind_coach_profiles`, `mind_coach_journeys`, and initial session.
- **MC-011** Onboarding save failure shows inline error and retry (no silent failure).

## Shell and navigation

- **MC-020** Bottom navigation exposes Home, Talk, Exercises, Assessments, Journal, Diary.
- **MC-021** Toolkit hub is reachable from Home without a seventh bottom-nav tab.
- **MC-022** `MindCoachApp` does not wipe Zustand on effect cleanup (profile switch only).

## Home and mood

- **MC-030** Mood check-in persists to `mind_coach_mood_entries`.
- **MC-031** Home shows phase-aware shortcuts respecting `UNLOCK_MAP`.
- **MC-032** Active tasks from `mind_coach_user_tasks` render on Home.

## Sessions and chat

- **MC-040** Users can create and resume sessions; messages load from `mind_coach_messages`.
- **MC-041** User messages persist with `role: user`; assistant messages persist with metadata.
- **MC-042** Chat failures surface user-visible errors with retry (no silent mock reply).
- **MC-043** Greeting is idempotent per session (no duplicate on Strict Mode remount).
- **MC-044** Discovery state persists to `mind_coach_journeys.discovery_state` when n8n signals pathway.
- **MC-045** Chat header shows loading subtitle while awaiting assistant reply.

## Session end

- **MC-050** End session with at least one message produces summary UI (not raw error-only path).
- **MC-051** Session-end invokes `mind-coach-session-end` edge function with transcript context.
- **MC-052** After summary close, journey row is refetched so Home progress matches server.
- **MC-053** End session with zero messages is blocked or returns a safe UX (G-P0-03).

## Journey and pathway

- **MC-060** Pathway proposal modal accepts pathway and updates journey phases.
- **MC-061** Phase progress stepper renders for non-engagement pathways in chat.
- **MC-062** Journey screen shows phase/session progress consistent with DB.
- **MC-063** Phase unlock gates Journal, Exercises, and Assessments via `UNLOCK_MAP`.

## Toolkit, journal, diary, exercises, assessments

- **MC-070** Locked features show `FeaturePreviewLockOverlay` with phase hint.
- **MC-071** Diary lists completed sessions even without `summary_data`.
- **MC-072** Crisis overlay includes 988 (US/CA) and retains India iCall link.

## Edge functions and n8n

- **MC-080** `mind-coach-chat` edge persists `dynamic_content` on assistant insert.
- **MC-081** `mind-coach-session-end` posts to n8n session-end webhook with shared secret pattern.
- **MC-082** Chat n8n workflow export contains `mind-coach-chat` webhook path.
- **MC-083** Session-end orchestrator export contains `mind-coach-session-end` webhook path.

## Security and isolation

- **MC-090** Mind Coach tables use RLS scoped by authenticated `user_id`.
- **MC-091** Users cannot read another user's `mind_coach_profiles` or sessions.

## Engineering loop

- **MC-095** Production build succeeds (`npm run build`).
- **MC-096** Mind Coach contract and browser QA scripts exist and run.
- **MC-097** Loop publication does not perform git push or PR creation.

## Blocked (clinical / legal — do not loop-fix)

- **MC-B01** PHQ-9 item 9 dedicated clinical escalation script — `BLOCKED` until clinical sign-off.
- **MC-B02** Consent checkbox + legal timestamp artifact — `BLOCKED` until legal.
