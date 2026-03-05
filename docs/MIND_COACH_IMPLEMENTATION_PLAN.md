# Mind Coach Implementation Plan

## Overview

Mind Coach is a portfolio demo that provides AI-supported mental wellness: therapy-style chat, coaching, journaling, meditation, and exercises. It uses a human-centered onboarding flow, predefined therapeutic pathways, and a 3-phase session model with guardrails and structured summaries.

---

## 1. Features

| Feature | Description |
|--------|-------------|
| **AI Therapy / Coaching** | Chat with a chosen therapist persona (Maya, Alex, Sage); sessions follow intake → intervention → wrap-up. |
| **Journey system** | User is assigned a pathway (e.g. cognitive reframing, boundary setting) with 4 phases and ~12 sessions; progress unlocks toolkit features. |
| **Journal** | Entries stored in `mind_coach_journal_entries`; unlocked after phase gate. |
| **Meditation & exercises** | Breathing, grounding, meditation from `mind_coach_exercises`; unlocked progressively. |
| **Mood** | Quick check-ins and trend chart; data in `mind_coach_mood_entries`. |
| **Session summary** | Post-session case notes + client-facing summary (GPT-4o-mini); memories extracted to `mind_coach_memories`. |

---

## 2. Architecture

### 2.1 Data (Supabase)

- **mind_coach_profiles** – name, age, gender, concerns, therapist_persona.
- **mind_coach_journeys** – pathway, title, phases (JSON), current_phase_index, sessions_completed.
- **mind_coach_sessions** – session_state (intake | active | wrapping_up | completed), dynamic_theme, pathway, case_notes, summary_data.
- **mind_coach_messages** – role, content, guardrail_status.
- **mind_coach_guardrail_log** – crisis/response check results.
- **mind_coach_memories** – long-term facts, preferences, triggers, coping strategies.
- **mind_coach_journal_entries**, **mind_coach_mood_entries**, **mind_coach_exercises** (seed data).

### 2.2 Therapeutic pathways (7)

1. **cognitive_reframing** – Imposter syndrome, catastrophic thinking, self-doubt, overthinking.
2. **boundary_setting** – Relationship conflicts, overwhelm, family/friends issues.
3. **emotional_regulation** – Stress, anger, panic, anxiety.
4. **grief_and_acceptance** – Loss, breakups, unchangeable situations.
5. **self_worth_building** – Low self-esteem, confidence, identity, bullying.
6. **behavioral_activation** – Low motivation, depression, loneliness, sleep, work stress.
7. **exploratory_validation** – Fallback when no pathway clearly fits.

Each pathway has a 4-phase playbook (e.g. Awareness → Challenge → Reframe → Integration) with ~3 sessions per phase.

### 2.3 Session flow

- **Intake** (early messages) – Build rapport, identify dynamic theme.
- **Intervention** – Pathway-specific techniques (playbooks).
- **Wrap-up** – Summarize, suggest reflection/homework.
- **Post-session** – Edge function generates case notes, session summary, and extracts memories.

### 2.4 Guardrails

- **Crisis classifier** – Pre-chat check on user message (intended to run in n8n).
- **Response guardrail** – Post-chat check on assistant reply.
- Results logged in `mind_coach_guardrail_log`.

---

## 3. Edge functions

| Function | Purpose |
|----------|--------|
| **mind-coach-chat** | Receives message + context; persists user message; calls n8n webhook; persists reply, updates session state/theme/pathway; logs guardrail results. Env: `MC_N8N_CHAT_WEBHOOK_URL`, `MC_N8N_WEBHOOK_SECRET`. |
| **mind-coach-session-end** | Loads transcript + journey/profile; calls GPT-4o-mini for case notes + session summary + extracted memories; updates session, writes memories, updates journey progress. Uses `OPENAI_API_KEY`. |
| **mind-coach-journey** | Given profile_id + concerns; uses GPT-4o-mini to route to a pathway; creates journey row with playbook phases. Uses `OPENAI_API_KEY`. |

---

## 4. Frontend (React)

### 4.1 Routes

- `/mind-coach` – Landing + onboarding (8 steps).
- `/mind-coach/:profileId` – App shell (bottom nav: Home, Sessions, Journey, Toolkit, Profile).

### 4.2 Key components

- **MindCoachLanding** – Onboarding (welcome, safe space, name, age, gender, concerns up to 3, therapist choice, journey preview). Creates profile; calls `mind-coach-journey` for pathway routing (fallback: mock journey).
- **MindCoachApp** – Fetches profile, journey, sessions, etc.; renders PhoneFrame + BottomNav + tab content.
- **SessionsScreen** – List sessions; start/resume; opens **TherapistChat**.
- **TherapistChat** – Messages, input; calls `mind-coach-chat` with full context; on “End Session” calls `mind-coach-session-end` and shows session summary overlay.
- **HomeScreen**, **JourneyScreen**, **ToolkitScreen**, **ProfileScreen** – Dashboard, timeline, feature cards (with unlock state), profile/stats.
- **Journal**, **Exercises**, **Meditation**, **Mood** – List/editor, library/player, mood check-in/chart.

### 4.3 State

- **mindCoachStore** (Zustand) – profile, journey, sessions, activeSession, messages, memories, journal, mood, exercises, activeTab, and computed (e.g. unlocked features by phase).

---

## 5. Implementation phases (as built)

1. **Phase 1** – DB schema, seed exercises, Zustand store, routes, constants.
2. **Phase 2** – Full onboarding (8 steps) and landing.
3. **Phase 3** – App shell, Home, Sessions, TherapistChat (with edge function wiring).
4. **Phase 4** – Journey screen, Toolkit (with unlock gates), Profile.
5. **Phase 5** – Journal, Exercises, Meditation, Mood components.
6. **Phase 6** – Polish, session summary UI, crisis/safety placeholder.

---

## 6. n8n chat workflow (intended)

- **Trigger** – Webhook from `mind-coach-chat` (with session_id, profile_id, message_text, profile, journey_context, messages, memories, recent_case_notes, etc.).
- **Crisis check** – Pre-chat classifier on user message; if crisis → return crisis_detected and appropriate reply/resources.
- **Theme router** – (Optional) Extract/update dynamic_theme and pathway from conversation.
- **Therapist LLM** – System prompt with persona + pathway playbook + session state; messages + memories + case notes as context; generate reply.
- **Response guardrail** – Post-chat check on assistant reply; log to payload for edge function to write to `mind_coach_guardrail_log`.
- **Return** – reply, session_state, dynamic_theme, pathway, guardrail_status, crisis_detected, guardrail_log.

---

## 7. Env / secrets

- **Supabase (edge functions)**  
  - `OPENAI_API_KEY` – used by session-end and journey.  
  - `MC_N8N_CHAT_WEBHOOK_URL` – n8n webhook for chat.  
  - `MC_N8N_WEBHOOK_SECRET` – webhook auth.

- **Frontend (.env)**  
  - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` – Supabase project.

---

## 8. File reference

| Area | Paths |
|------|--------|
| Store | `store/mindCoachStore.ts` |
| Routes | `App.tsx` (lazy MindCoachLanding, MindCoachApp) |
| Landing | `components/MindCoach/MindCoachLanding.tsx` |
| App shell | `components/MindCoach/MindCoachApp.tsx`, `BottomNav.tsx`, `shared/PhoneFrame.tsx` |
| Screens | `components/MindCoach/Screens/*.tsx` |
| Chat | `components/MindCoach/Chat/TherapistChat.tsx`, `ChatMessage.tsx` |
| Journal / Exercises / Meditation / Mood | `components/MindCoach/Journal/*`, `Exercises/*`, `Meditation/*`, `Mood/*` |
| DB | `supabase/migrations/20260302200000_mind_coach_schema.sql`, `20260302200100_seed_mind_coach_exercises.sql` |
| Edge | `supabase/functions/mind-coach-chat/`, `mind-coach-session-end/`, `mind-coach-journey/` |

---

*Last updated to reflect current codebase and deployment.*
