---
title: Jivi Mind Coach — portfolio demo
portfolio_entry: mind-coach
---

# Jivi Mind Coach — How it works in this repo

**Portfolio entry:** `mind-coach`  
**Live routes:** `/mind-coach` (landing), `/mind-coach/login`, `/mind-coach/:profileId` (main app), onboarding via `/mind-coach/new`  
**Stack:** React, Zustand (`store/mindCoachStore.ts`), Supabase (Mind Coach schema + RLS), Supabase Edge Functions, n8n (therapist chat, session end orchestration, optional journey routing).

## Purpose

Mind Coach is a **structured mental wellness coach** experience: profiles, journeys/phases, sessions, chat with therapeutic framing, exercises, assessments, mood/journal surfaces, crisis UX hooks, and session lifecycle (start/end) backed by the database.

## Client architecture

- **`MindCoachApp`:** Resolves `profileId` from the URL, loads profile/journey/sessions/memories/tasks into Zustand, handles onboarding redirect.
- **Tab shell:** `BottomNav` + `PhoneFrame` + screen components under `components/MindCoach/Screens/`.
- **Chat:** `TherapistChat.tsx` builds a rich payload and calls n8n or the **`mind-coach-chat`** edge function depending on configuration.
- **Session end:** Invokes **`mind-coach-session-end`** which POSTs to n8n and applies memories/tasks/summary.
- **Journey routing:** **`mind-coach-journey`** delegates pathway decisions to n8n when configured.

## Edge functions

| Function | Purpose |
|----------|---------|
| `mind-coach-chat` | Server context, n8n webhook, persist assistant metadata |
| `mind-coach-session-end` | Session-end bundle to orchestrator |
| `mind-coach-journey` | Pathway routing |
| `mind-coach-session-start` | Session creation side effects |

## n8n workflows (`n8n-workflows/definitions/`)

| Workflow file | Webhook path | Role |
|---------------|-------------|------|
| `mind-coach-therapist-chat-and-discovery-v6-robust__EBo9At6eCh0S7vkM.json` | `mind-coach-chat` | Main therapist + discovery pipeline |
| `mind-coach-session-end-orchestrator-v6-execute-workflow__1xntJU9IDNQ3tWle.json` | `mind-coach-session-end` | Session-end orchestrator |
| memory / summary / readiness sub-workflows | execute triggers | Session-end agents |
| `mental-health-guardrail__6BCoakPPIfGOcZo2.json` | subflow | Guardrail |

## Related docs

- [`docs/MIND_COACH_PRD.md`](../MIND_COACH_PRD.md) — detailed FR table and journey narrative
- [`docs/MIND_COACH_GAPS.md`](../MIND_COACH_GAPS.md) — prioritized gaps
- [`docs/mind-coach/ACCEPTANCE.md`](./ACCEPTANCE.md) — executable acceptance contract

## Completion standard

The product is complete only when every required criterion in `ACCEPTANCE.md` has executable evidence. Source-code presence alone is not proof.
