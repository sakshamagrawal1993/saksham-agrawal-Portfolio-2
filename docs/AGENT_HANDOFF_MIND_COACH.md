# Mind Coach — Agent Handoff: Context and Implementation Plan

**Purpose:** Give another agent enough context and step-by-step instructions to continue Mind Coach implementation from the current state.

---

## Part 1: Project context

### What is Mind Coach?
Mind Coach is a **portfolio demo** (not a production app) for AI-supported mental wellness. It offers:
- **AI therapy/coaching chat** with a chosen therapist persona (Maya, Alex, Sage).
- **Structured journey** with 7 therapeutic pathways (e.g. cognitive reframing, boundary setting), each with 4 phases and ~12 sessions.
- **Toolkit:** Journal, meditation, exercises, mood tracking — unlocked progressively by phase.
- **Session summaries** and **long-term memory** extraction after each session.

### Tech stack
- **Frontend:** React 18, TypeScript, Vite, Tailwind, Framer Motion, Zustand, React Router, Supabase JS client.
- **Backend:** Supabase (Postgres, Auth, Edge Functions, RLS).
- **AI:** OpenAI (GPT-4o-mini) in edge functions; chat intended to be orchestrated via **n8n** (webhook).

### Repo layout (relevant paths)
- **App routes:** `App.tsx` — routes `/mind-coach` and `/mind-coach/:profileId`.
- **Mind Coach UI:** `components/MindCoach/` (Landing, App, Screens, Chat, Journal, Exercises, Meditation, Mood, Safety, shared).
- **State:** `store/mindCoachStore.ts`.
- **DB:** `supabase/migrations/20260302200000_mind_coach_schema.sql`, `20260302200100_seed_mind_coach_exercises.sql`.
- **Edge functions:** `supabase/functions/mind-coach-chat/`, `mind-coach-session-end/`, `mind-coach-journey/`.
- **Docs:** `docs/MIND_COACH_IMPLEMENTATION_PLAN.md` (architecture), this file (handoff).

---

## Part 2: Current implementation status

### Done and deployed
1. **Database**
   - Migrations applied on remote Supabase: `20260302200000_mind_coach_schema.sql`, `20260302200100_seed_mind_coach_exercises.sql`.
   - Tables: `mind_coach_profiles`, `mind_coach_journeys`, `mind_coach_sessions`, `mind_coach_messages`, `mind_coach_guardrail_log`, `mind_coach_memories`, `mind_coach_journal_entries`, `mind_coach_mood_entries`, `mind_coach_exercises`. RLS policies allow full CRUD for demo.
2. **Edge functions**
   - `mind-coach-chat`, `mind-coach-session-end`, `mind-coach-journey` are deployed to Supabase (project `ralhkmpbslsdkwnqzqen`).
   - Session-end and journey use `OPENAI_API_KEY`; chat uses placeholder/dummy n8n URL and secret until n8n is set up.
3. **Frontend**
   - **Landing:** 8-step onboarding (welcome, safe space, name, age, gender, up to 3 concerns, therapist choice, journey preview). Creates profile; calls `mind-coach-journey` for pathway routing with fallback to mock journey.
   - **App shell:** Bottom nav (Home, Sessions, Journey, Toolkit, Profile), PhoneFrame, tab content.
   - **Sessions:** Start/resume session; **TherapistChat** with message list, input, “End Session.” Chat invokes `mind-coach-chat` with full context; on end invokes `mind-coach-session-end` and shows session summary overlay.
   - **Home / Journey / Toolkit / Profile:** Implemented (dashboard, timeline, feature cards with unlock, profile/stats).
   - **Journal, Exercises, Meditation, Mood:** Components present (list/editor, library/player, check-in/chart); may need wiring to Supabase and unlock logic verification.
   - **Constants:** `constants.ts` has Mind Coach project entry with `demoUrl: '/mind-coach'`.
4. **Behavior**
   - User can complete onboarding, get a pathway, enter app, start a session, send messages (chat returns mock reply if n8n not configured), end session and see AI-generated summary (session-end works with OpenAI).

### Known gaps and bugs (fix these first)
1. **Schema vs code**
   - **mind_coach_profiles:** Table has `user_id UUID NOT NULL`, but onboarding insert does **not** send `user_id`. Profile creation will fail unless `user_id` is made nullable or given a default (e.g. a fixed demo UUID) for the portfolio demo.
   - **mind_coach_journeys:** Schema has `current_phase` and `version` only. Edge functions and store use `current_phase_index`, `sessions_completed`, and `active`. Add these columns (or a migration) and align inserts/updates.
   - **mind_coach_memories:** Schema CHECK for `memory_type` allows: `trigger`, `pattern`, `breakthrough`, `coping_strategy`, `life_context`, `preference`. Session-end extracts types: `fact`, `preference`, `trigger`, `coping_strategy`, `relationship`, `goal`. Add `fact`, `relationship`, `goal` to the CHECK (or expand the enum) so inserts do not fail.
2. **Journey creation flow**
   - Onboarding step 8 calls `mind-coach-journey` **before** profile is inserted in one code path (routeJourney creates profile then calls journey); in another path (handleStart fallback) profile is inserted then journey is inserted manually. Ensure profile always exists before journey creation and that journey insert uses columns that exist in DB.
3. **n8n chat**
   - Real chat replies require an n8n workflow and secrets: `MC_N8N_CHAT_WEBHOOK_URL`, `MC_N8N_WEBHOOK_SECRET`. Until then, frontend falls back to a mock reply when the edge function returns an error or no reply.

### Not done / optional next steps
- n8n workflow: crisis classifier → theme router → therapist LLM → response guardrail; return `reply`, `session_state`, `dynamic_theme`, `pathway`, `guardrail_status`, `crisis_detected`, `guardrail_log`.
- Crisis UI: `CrisisScreen` is a placeholder; wire to crisis_detected and show resources (e.g. 988, Crisis Text Line).
- Persist journal/mood to Supabase from the new components and ensure Toolkit unlock gates use `unlockedFeatures()` from store.
- Test full flow: onboarding → journey creation → chat (with mock or n8n) → end session → summary; fix any remaining schema/type mismatches.

---

## Part 3: Step-by-step instructions for the next agent

### Step 1: Understand the codebase
- Read `docs/MIND_COACH_IMPLEMENTATION_PLAN.md` for architecture, pathways, and file map.
- Skim `store/mindCoachStore.ts` for state shape and `App.tsx` for Mind Coach routes.
- Confirm workspace is the repo root (or the worktree that contains the above paths).

### Step 2: Fix schema and data model
- **Profiles:** In `supabase/migrations/`, add a new migration that either (a) makes `mind_coach_profiles.user_id` nullable, or (b) sets a default (e.g. `gen_random_uuid()`) for demo. Ensure `components/MindCoach/MindCoachLanding.tsx` (and any other profile insert) either sends a valid `user_id` or relies on the new default.
- **Journeys:** In a new migration, add to `mind_coach_journeys`: `current_phase_index INT NOT NULL DEFAULT 0`, `sessions_completed INT NOT NULL DEFAULT 0`, `active BOOLEAN NOT NULL DEFAULT true`. Keep or map `current_phase` if still used elsewhere; otherwise prefer `current_phase_index` in code and DB. Update `supabase/functions/mind-coach-journey/index.ts` and `mind-coach-session-end/index.ts` to use only columns that exist.
- **Memories:** In a new migration, update `mind_coach_memories.memory_type` CHECK to include `fact`, `relationship`, `goal` (and any other types the session-end prompt emits). Ensure `mind-coach-session-end` only uses allowed values (or map to allowed values before insert).
- Run migrations locally if needed; then apply to remote: `npx supabase db push` (from repo root, with Supabase linked).

### Step 3: Align journey creation with DB
- In `MindCoachLanding.tsx`, ensure profile is always created first and that `mind-coach-journey` is called with the new `profile_id`. If the edge function creates the journey, ensure it only sets columns that exist (`title`, `description`, `phases`, `current_phase_index`, `sessions_completed`, `active`, `pathway`, `profile_id`; add `concerns_snapshot` if desired). Remove or adapt any insert of `current_phase` if the table no longer has it.
- In `mindCoachStore.ts` and any component using journey (e.g. `JourneyScreen`, `HomeScreen`), use the same field names as DB and edge functions (`current_phase_index`, `sessions_completed`, `active`). Map from API response to store if the backend uses different names.

### Step 4: Verify end-to-end flow
- Start dev server: `npm run dev`. Open `/mind-coach`.
- Complete onboarding (name, age, gender, up to 3 concerns, therapist). On step 8, either the journey is created by `mind-coach-journey` or the fallback creates profile + journey. Confirm no DB/insert errors and that the user is redirected to `/mind-coach/:profileId`.
- In the app, start a new session, send a few messages, then “End Session.” Confirm session summary appears (session-end runs and returns summary). If chat fails (e.g. n8n not set), mock reply is acceptable for this step.
- Optionally: create a journal entry and a mood entry; confirm they persist and appear in the UI.

### Step 5: Optional — n8n chat workflow
- Create an n8n workflow triggered by the same webhook URL you will set in Supabase secrets.
- Payload from `mind-coach-chat`: `session_id`, `profile_id`, `message_text`, `user_message_id`, `profile`, `journey_context`, `session_state`, `dynamic_theme`, `pathway`, `messages`, `memories`, `recent_case_notes`, `message_count`.
- Steps: (1) Crisis classifier on `message_text`; if crisis, return `crisis_detected: true` and a safe reply. (2) Optional: theme router to update `dynamic_theme`/`pathway`. (3) Therapist LLM with persona + pathway playbook + context. (4) Response guardrail on assistant reply. (5) Return JSON: `reply`, `session_state`, `dynamic_theme`, `pathway`, `guardrail_status`, `crisis_detected`, `guardrail_log` (array for edge function to write to `mind_coach_guardrail_log`).
- Set secrets: `npx supabase secrets set MC_N8N_CHAT_WEBHOOK_URL="https://your-n8n/webhook/..."` and `MC_N8N_WEBHOOK_SECRET="..."`. Redeploy `mind-coach-chat` if needed.

### Step 6: Optional — crisis UI and polish
- In `TherapistChat` (or global state), when `crisis_detected` is true from the chat response, show `CrisisScreen` (or a modal) with crisis resources (988, Crisis Text Line, etc.) and do not rely only on the assistant message for safety.
- Remove or feature-flag any dev-only UI (e.g. canary banner in `App.tsx`) before production or demo.

---

## Part 4: Environment and secrets reference

- **Frontend (`.env`):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Supabase project used for Mind Coach).
- **Supabase Edge Functions (set via `npx supabase secrets set`):**
  - `OPENAI_API_KEY` — used by `mind-coach-session-end` and `mind-coach-journey`.
  - `MC_N8N_CHAT_WEBHOOK_URL` — n8n webhook for chat (optional until n8n is ready).
  - `MC_N8N_WEBHOOK_SECRET` — secret for webhook auth.

---

## Part 5: File checklist for edits

| Task | Files to touch |
|------|-----------------|
| Fix profile user_id | New migration; `MindCoachLanding.tsx` (if adding user_id to insert). |
| Fix journey columns | New migration; `mind-coach-journey/index.ts`, `mind-coach-session-end/index.ts`; `mindCoachStore.ts` and components using journey. |
| Fix memory_type | New migration; optionally `mind-coach-session-end/index.ts` (map types). |
| Journey creation flow | `MindCoachLanding.tsx`, `mind-coach-journey/index.ts`. |
| Crisis UI | `TherapistChat.tsx`, `CrisisScreen.tsx`, store if needed. |
| n8n | External n8n; Supabase secrets; no code change in repo except possibly response parsing. |

---

*End of handoff. The next agent should start with Part 2 (current status) and Part 3 (steps), and use Part 4–5 as reference.*
