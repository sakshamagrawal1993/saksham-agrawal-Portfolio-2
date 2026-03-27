# Mind Coach — Product Requirements Document (PRD)

**Version:** 1.1 (codebase snapshot)  
**Audience:** Engineering, Clinical / Safety, UX / Product  
**Scope:** In-repo Mind Coach experience (`/mind-coach/*`), Supabase data layer, n8n orchestration, and documented gaps.

**Implementation tracker:** Detailed job IDs and statuses live in [`MIND_COACH_JOBS.md`](./MIND_COACH_JOBS.md). Section §9 below summarizes **done vs still open** as of the last PRD sync.

---

## 1. Executive summary

Mind Coach is a **web-based, AI-assisted mental wellness companion** embedded in the portfolio app. It offers:

- Onboarding and a **persistent user profile**
- **Text chat** with a selectable **therapist persona** (Maya, Alex, Sage)
- **Structured journeys** (phases, sessions) aligned to **clinical-style pathways** (20+ pathway slugs)
- **Self-serve tools**: journal, mood check-in, exercises, meditations, standardized assessments (GAD-7, PHQ-9, PSS-4), and a **diary** aggregating session summaries and journal entries

**Critical positioning (for Clinical + Legal):** The product copy and flows describe a “coach” / “guide,” not a licensed clinician. There is **no** live human therapist, **no** formal diagnosis workflow in-app, and **no** guaranteed clinical oversight of model outputs. This PRD flags where **clinical review, disclaimers, and escalation paths** are still required.

---

## 2. Goals and success metrics (proposed)

| Stakeholder | Goal | Suggested metric |
|-------------|------|------------------|
| Product | Users complete discovery and accept a pathway | % onboarding → first session → proposal viewed |
| UX | Low friction, trust, clarity of “what happens next” | Task success, drop-off per step, SUS |
| Engineering | Reliable persistence, observability | Error rate on message save, n8n latency, RLS violations |
| Clinical | Safe defaults, appropriate escalation | Crisis path usage, assessment severe-band follow-up (TBD) |

*Baseline analytics are not fully wired in this codebase; treat metrics as PRD targets.*

---

## 3. User personas (assumed)

1. **Exploring user** — Wants low-commitment emotional support; may not read long copy.  
2. **Engaged self-helper** — Uses journal, exercises, and chat together.  
3. **Stressed / acute user** — May need crisis resources; model may surface risk language.

---

## 4. Customer journey (UX narrative)

### 4.1 Discovery and entry

| Step | Touchpoint | What happens |
|------|------------|--------------|
| 1 | Marketing / portfolio (`ProductGrid`, project page) | User opens Mind Coach. |
| 2 | `/mind-coach` (`MindCoachLanding`) | If logged in: resolve latest `mind_coach_profiles` row → `/mind-coach/:profileId`; else login. |
| 3 | `/mind-coach/login` | Supabase auth; redirect path `/mind-coach`. |
| 4 | `/mind-coach/new` | If profile exists → redirect to profile; else `OnboardingFlow`. |

**UX (addressed in v1.1):** `MindCoachLanding` shows a short **not therapy / not medical care** disclaimer and a **988** crisis link **before** the spinner. Broader data-use education is still optional product copy.

---

### 4.2 Onboarding (`OnboardingFlow.tsx`)

**8 steps** including: welcome, safety framing, name, age, gender, concerns (multi-select from fixed list), therapist persona selection, journey preview.

**Completion actions (server):**

1. Insert `mind_coach_profiles` (`user_id`, demographics, `concerns`, `therapist_persona`).  
2. Insert `mind_coach_journeys` — title **“Initial Assessment Phase”**, minimal `phases` JSON (single phase scaffold).  
3. Insert `mind_coach_sessions` — `pathway: engagement_rapport_and_assessment`, `session_state: intake`, `message_count: 0`, linked to journey.  
4. Client sets **active session** and navigates to `/mind-coach/:profileId` with tab **Sessions**.

**UX gaps:**

- **Gender options** are limited (“Male / Female / Non-binary / Prefer not to say”) — may not meet inclusivity bar.  
- **No explicit consent** artifact for AI coaching, data retention, or crisis limitations (checkbox + timestamp in DB).  
- **Age** collected as number — consider minor flow / parental consent policy (product/legal).  
- **Save failures (addressed in v1.1):** final onboarding step shows an **inline error** and **Try again** (`JourneyPreviewStep`). Deeper consent / legal artifacts remain gaps below.

---

### 4.3 Main shell (`MindCoachApp.tsx`)

- **Phone-frame** layout; bottom navigation: **Home, Talk (sessions), Exercises, Assessments, Journal, Diary**.  
- Loads in parallel: profile, **latest journey** (by `created_at`), sessions, memories, mood, journal, exercises, active tasks.  
- **Note:** `JourneyScreen` exists but is **not** a bottom-nav tab — journey visualization is partially duplicated on Home / Toolkit patterns.

**UX gap:** “Talk” vs “Sessions” naming vs list of past sessions — cognitive load.

---

### 4.4 Home (`HomeScreen.tsx`)

- Greeting, **random static quote** (not personalized).  
- **Mood** 1–5 tap → `mind_coach_mood_entries`.  
- **Journey progress** derived from `journey.phases[current_phase]` and **completed sessions** in that phase.  
- **Active tasks** from `mind_coach_user_tasks` (hybrid task model).  
- Links to tabs; **account deletion** flow (wipes profile-related data — verify RLS/cascade with Engineering).

**UX (partially addressed in v1.1):** Home shows **phase-aware shortcuts** (Journal / Assessments / Exercises) only when those features are unlocked for the current journey phase. Dedicated tabs (**Journal, Exercises, Assessments**) use the same `UNLOCK_MAP` rules with a locked placeholder when closed. Remaining IA nuance: Toolkit hub vs bottom-nav duplication (see §9, E9).

---

### 4.5 Talk / Sessions (`SessionsScreen.tsx` + `TherapistChat.tsx`)

| Action | Behavior |
|--------|----------|
| **New session** | Inserts row in `mind_coach_sessions` (phase/session numbers from journey + completed count); clears messages; opens chat. |
| **Resume session** | Sets active session; **loads** `mind_coach_messages` ordered by `created_at`. |
| **Chat** | User message saved with `role: user`. Assistant reply from **n8n webhook** (client-side `fetch` to configured URL); assistant row saved with `role`, `content`, `guardrail_status`, `dynamic_content` (DB column must exist). |
| **Initial greeting** | Auto-fired when `messages.length === 0` and `message_count === 0`; same n8n path with `is_system_greeting`. |

**Discovery UI (engagement pathway only):**

- “Clinical insight” strip: dynamic theme, pathway confidence bands (Listening / Connecting / Formulating).  
- **Progress bar** toward plan reveal: linear to **30 messages**; if confidence &lt; 80 at 30, bar **90%** then +2% per **5** further messages until 100%.  
- **Therapy proposal** CTA when confidence ≥ 80 **or** message count ≥ 30 → opens `PlanProposalModal` (bottom drawer).  
- **End session** → `mind-coach-session-end` edge function (n8n summarizer) or **dummy summary** + client completes session if edge fails.

**Crisis:** `TherapistChat` can set crisis state from n8n flags → **full-screen overlay** with **iCall** (India) phone + web — **not localized** for other regions.

**UX gaps:**

- **Progress legend (addressed in v1.1):** discovery strip includes plain-language copy for **~30 messages**, **confidence threshold (80%)**, and the **90% + ~every 5 messages** rule.  
- **Errors / retry (addressed in v1.1):** failed user save, n8n, assistant save, or initial greeting surface an **alert** with **Retry** / **Dismiss** (no silent fallback assistant message).  
- **No typing indicator** from therapist persona name in header during wait (only dots in thread).  
- **Reload** mid-session: messages come from DB — any **only-local** state is lost.

---

### 4.6 Therapy proposal (`PlanProposalModal.tsx`)

- Resolves pathway: session `pathway` if not engagement, else `journey.discovery_state.suggested_pathway`.  
- Loads **four phases** from `mind_coach_pathway_phases` (`pathway_name`, `phase_number`, …); fallback to static playbooks.  
- **Accept:** deactivates old journey, inserts **new** `mind_coach_journeys` with phases from DB, marks current session completed.

**Clinical gap:** Accepting a pathway is a **major clinical commitment** in UX copy; ensure **informed consent** and **“not a diagnosis”** language.  
**Product (partially addressed in v1.1):** After accept, `PlanProposalModal` shows a **short “what changes next”** note and **Continue** before closing — still room for richer phase-1 session onboarding elsewhere.

---

### 4.7 Exercises (`ExercisesScreen.tsx`)

- Lists `mind_coach_exercises` by category.  
- `ExercisePlayer`: breathing vs grounding/meditation detection; **in-chat** variant uses compact layouts.  
- **Dynamic exercise** payloads from chat resolved via `lib/mindCoachExerciseResolve.ts` (slug aliases).

**Gap:** Library vs chat **naming drift** must stay synced with n8n prompt lists.

---

### 4.8 Assessments (`AssessmentsScreen.tsx`)

- Pulls questions from DB (`mind_coach_assessment_questions` / related schema per migrations).  
- Scores persisted; **severity** copy and advice blocks are **hardcoded** (refer to “Maya / Alex” generically).

**Clinical gaps:**

- **PHQ-9 item 9** (self-harm) — verify dedicated **safety escalation** in UI (not fully audited in this PRD pass).  
- **Cutoffs** must be validated by clinical team; **“severe”** should link to **professional help**, not only in-app exercises.  
- **No** automated handoff to services.

---

### 4.9 Journal & Diary

- **Journal:** CRUD on `mind_coach_journal_entries` (mood tag mapped to `mood` in client).  
- **Diary:** Merges **completed sessions** (with or without `summary_data`; missing summary uses fallback copy) and journal entries by date.

**Gap (addressed in v1.1):** Completed sessions **without** `summary_data` still appear in the Diary with a **fallback title/preview** (summarizer failure no longer hides the row).

---

### 4.10 Toolkit (`ToolkitScreen.tsx`)

- Hub with **phase-based locks** (journal phase 2, exercises 3, meditation 4); unlock list is driven by **`UNLOCK_MAP` + `journey.current_phase`** (reactive, aligned with bottom-nav screens).  
- **Not** wired as default tab — may be **orphaned** if nothing links to it (verify routes); consolidation is backlog **E9**.

---

## 5. Functional requirements (implemented vs partial)

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| FR-01 | Supabase auth-gated access | ✅ | `/mind-coach/login` |
| FR-02 | Profile CRUD | ✅ | Onboarding + `ProfileScreen` |
| FR-03 | Multi-tab shell | ✅ | BottomNav |
| FR-04 | Persist chat messages | ✅ | Fixed: assistant `role` required; `dynamic_content` column |
| FR-05 | LLM replies via n8n | ✅ | Client `fetch` + workflow JSON in `/n8n` |
| FR-06 | Session list + new/resume | ✅ | `SessionsScreen` |
| FR-07 | Session end + summary | ⚠️ | Depends on n8n + `mind-coach-session-end`; dummy fallback |
| FR-08 | Pathway discovery + proposal | ✅ | UI + DB phases; n8n discovery agent |
| FR-09 | In-chat structured content | ⚠️ | video, game, assessment, exercise, `exercise_card` |
| FR-10 | Crisis overlay | ⚠️ | India-centric resources |
| FR-11 | Memories in model context | ✅ | Sent in n8n payload from client |
| FR-12 | User tasks from summarizer | ⚠️ | Edge function inserts; client displays on Home |
| FR-13 | Journey phase unlock features | ✅ | Enforced on **Journal, Exercises, Assessments** + **Toolkit** hub + **Home** shortcuts via `UNLOCK_MAP` / phase |
| FR-14 | Edge `mind-coach-chat` | 🔲 | Function implemented (incl. `dynamic_content` on assistant insert); **TherapistChat** still calls n8n from the browser — route via edge is **E1** |

---

## 6. Technical architecture

### 6.1 Frontend

- **React 18**, **Vite**, **React Router**, **Zustand** (`store/mindCoachStore.ts`), **Framer Motion**, **Supabase JS** client.  
- **Key routes:** `/mind-coach`, `/mind-coach/login`, `/mind-coach/new`, `/mind-coach/:profileId`.  
- Mind Coach components live under `components/MindCoach/`.

### 6.2 Backend (Supabase)

**Tables (core):**  
`mind_coach_profiles`, `mind_coach_journeys`, `mind_coach_sessions`, `mind_coach_messages`, `mind_coach_memories`, `mind_coach_journal_entries`, `mind_coach_mood_entries`, `mind_coach_exercises`, `mind_coach_user_tasks`, `mind_coach_personas`, `mind_coach_pathway_phases`, assessment tables, task library, dynamic content library (see migrations).

**RLS:** Authenticated users scoped by `user_id` → `profile_id` (see `20260306020000_mind_coach_auth.sql`).

### 6.3 Edge functions (Deno)

| Function | Role |
|----------|------|
| `mind-coach-chat` | Optional server-side chat proxy: persist user message, call n8n, persist assistant (service role) |
| `mind-coach-session-end` | Session summary via n8n; memories/tasks; journey `sessions_completed` / phase advance hooks |
| `mind-coach-session-start` | Session creation helper (pathway from journey) |
| `mind-coach-journey` | Journey lifecycle |

**Gap:** Production chat uses **browser → n8n** directly (`TherapistChat.tsx`). Implications:

- Webhook URL **exposed** in client bundle.  
- No single **server audit log** of prompts/responses unless n8n logs.  
- **CORS** must allow browser origin on n8n.  
- **mind-coach-chat** function is **out of band** for the main UX path.

### 6.4 n8n

- Workflow JSON under `n8n/` (e.g. `mind-coach-therapist-chat-v6-robust.json`).  
- **Patch script:** `n8n/patch-mind-coach-v6.mjs`.  
- Env expectations: discovery pacing (e.g. ≥30 messages, every 5), structured JSON output, session-end summarizer webhook for edge function.

### 6.5 Constants (product tuning)

- `THERAPY_PROPOSAL_MIN_MESSAGE_COUNT` = 30  
- `THERAPY_PROPOSAL_CONFIDENCE_READY` = 80  
- Proposal hero image: Supabase public URL in `MindCoachConstants.ts`

---

## 7. Data model highlights (for Tech)

- **Sessions** carry `pathway`, `pathway_confidence`, `dynamic_theme`, `session_state`, `message_count`, `summary_data`, `case_notes`.  
- **Journeys** store `phases` as **JSONB**; **`discovery_state` JSONB** on DB (`dynamic_discovery` migration); TypeScript includes optional `discovery_state` on `MindCoachJourney`.  
- **Messages:** `role` enum `user | assistant | system`; `dynamic_content` **JSONB** (add in prod if missing).  
- **Pathway enum** expanded in migration `20260324000000_fix_sessions_pathway_constraint.sql` (20 pathways + engagement).

---

## 8. Clinical and safety considerations

### 8.1 What the system does today

- AI-generated **supportive dialogue**, **grounding exercises**, **psychoeducation-style** content.  
- **Standardized screenings** with severity labels.  
- **Crisis flag** path from model → blocking UI with hotline.

### 8.2 Required clinical review (checklist)

- [ ] **Scope of service** copy: not therapy, not emergency services, not for minors without policy.  
- [ ] **Crisis:** validate **locale-specific** resources; **988 / international** equivalents; **repeat contact** policy.  
- [ ] **PHQ-9 item 9** and any self-harm detection: mandatory **safety script** reviewed by clinician.  
- [ ] **Pathway labels** (20+) vs **evidence-based care** mapping — are they aspirational vs committed treatment modalities?  
- [ ] **Discovery confidence** (0–100) — clinical meaning; avoid implying diagnostic certainty.  
- [ ] **Tasks** generated by LLM — frequency and burden; **contraindications** (e.g. exposure tasks without supervision).  
- [ ] **Personas** — ensure styles don’t contradict clinical best practices (e.g. false reassurance).

### 8.3 Governance

- Model version / prompt version **not** surfaced to user.  
- **No** built-in clinician dashboard in this repo.  
- **Guardrail** enums exist in schema; **logging** to `mind_coach_guardrail_log` should be verified end-to-end.

---

## 9. Known gaps and implementation backlog

This section is split into **completed work** (synced with the repo and [`MIND_COACH_JOBS.md`](./MIND_COACH_JOBS.md)) and **still to do / deferred**.

### 9.0 Completed (engineering + UX backlog items)

| ID | Item | Summary |
|----|------|---------|
| **E2** | Chat / save errors | User-visible alert, Retry (greeting / n8n / assistant save), rollback if user message not persisted; no silent mock reply. |
| **E5** | Phase unlock enforcement | Journal, Exercises, Assessments screens + Toolkit hub + Home shortcuts use **`UNLOCK_MAP`** and current phase. |
| **E6** | `discovery_state` on journey | After n8n pathway signal, client updates **Zustand** and **persists** `mind_coach_journeys.discovery_state` via Supabase. |
| **E11** | Greeting idempotency | Module session set + Retry clears lock; avoids duplicate greeting on strict remount. |
| **E11b** | Edge assistant `dynamic_content` | `mind-coach-chat` insert includes `dynamic_content` (parity with client path). |
| **U1** | Trust & safety in onboarding | Covered by existing onboarding step(s) (limits + crisis / **988**); see jobs file for nuance. |
| **U2** | Sessions empty state | Empty state when there are no sessions (`SessionsScreen`). |
| **U3** | Post-accept note | `PlanProposalModal`: short “what’s next” + **Continue** after successful accept. |
| **U4** | Diary without `summary_data` | Completed sessions listed with fallback title/preview. |
| **U5** | Progress bar legend | Plain-language explanation under discovery progress (30 messages, 80% confidence, 90% rule). |
| **U6** | Landing disclaimer | Not-therapy disclaimer + **988** before spinner on `MindCoachLanding`. |
| **U7** | Home + unlock | Phase-aware shortcuts to unlocked tools only. |
| **U8** | Onboarding save failure | Inline error + **Try again** on final step. |

### 9.1 Engineering — still to do or deferred

| ID | Item | Status / notes |
|----|------|----------------|
| **E1** | Route chat through **`mind-coach-chat`** edge | **Deferred** — optional env e.g. `VITE_MIND_COACH_USE_CHAT_EDGE`; align double-persist with edge. |
| **E3** | Migration hygiene (`pathway_id` task library, prod push) | **Deferred** — ops / reconcile migrations. |
| **E4** | Journey advancement vs `session-end` | **Deferred** — needs agreed product rules. |
| **E7** | E2E: onboarding → message → reload | **Deferred** — no Playwright (or equivalent) in repo yet. |
| **E8** | Structured observability | **Deferred** — needs logging stack / dashboards. |
| **E9** | Single IA: Toolkit vs bottom-nav | **Deferred** — reduce duplicate entry points. |
| **E10** | Rate limit / abuse protection on n8n | **Deferred**. |
| **E12** | WebSocket / streaming | **Deferred**. |
| **E13** | i18n / a11y audit | **Deferred**. |

### 9.2 UX — still open (not fully covered by jobs above)

- **Empty / edge states:** e.g. **failed summary** UX beyond Diary listing, **proposal declined** path, sessions list polish if gaps remain.  
- **Typing indicator** in chat header (persona name) during wait.  
- **Reload** — document or improve restoration of ephemeral UI state.  
- Broader **data use / consent** copy and optional **checkbox + timestamp** in DB (see §4.2 clinical gaps).

### 9.3 Clinical / policy — priority

- Disclaimers and **terms of use** specific to AI coaching.  
- **Regional crisis** matrix.  
- **Severe** assessment band: mandatory **external help** CTA + optional **check-in** task.  
- Review **task library** and **pathway phases** content for clinical accuracy.

### 9.4 Product — strategic

- **Human escalation** (coach of record, EAP handoff) — not in scope of current codebase.  
- **Outcome measurement** (PHQ-9 delta over time) — data exists, no dedicated UX.  
- **B2B** (employer / clinic) tenant model — not supported.

---

## 10. Open questions by team

### For Tech

1. Should chat **always** go through edge functions in production? Timeline?  
2. What is the **source of truth** for journey phase after partial session end (client dummy vs edge success)?  
3. **Discovery → DB (v1.1):** `discovery_state` is **persisted** from the client when n8n returns `suggested_pathway` and numeric `pathway_confidence`. Remaining question: throttle / batch writes vs every response, or mirror writes **only** in edge chat (**E1**).

### For Clinical

1. Are **20 pathways** appropriate for self-serve, or should some be **human-only**?  
2. Sign-off on **proposal** copy and **confidence** display.  
3. Required **assessment** follow-up playbook for moderate/severe.

### For UX

1. Single **information architecture** for Journey vs Home progress.  
2. **Crisis** flow copy and **frequency** of showing resources.  
3. **Persona** selection impact on expectations — test with users.

---

## 11. Appendix: file map (quick reference)

| Area | Path |
|------|------|
| App shell | `components/MindCoach/MindCoachApp.tsx` |
| Store | `store/mindCoachStore.ts` |
| Chat | `components/MindCoach/Chat/TherapistChat.tsx`, `ChatMessage.tsx` |
| Sessions | `components/MindCoach/Screens/SessionsScreen.tsx` |
| Proposal | `components/MindCoach/PlanProposalModal.tsx` |
| Onboarding | `components/MindCoach/Onboarding/OnboardingFlow.tsx` |
| Constants | `components/MindCoach/MindCoachConstants.ts` |
| Exercise resolve | `lib/mindCoachExerciseResolve.ts` |
| Dynamic content types | `lib/dynamicContentLibrary.ts` |
| n8n | `n8n/mind-coach-therapist-chat-v6-robust.json`, `n8n/patch-mind-coach-v6.mjs` |
| Edge functions | `supabase/functions/mind-coach-*/` |
| Schema | `supabase/migrations/20260302200000_mind_coach_schema.sql` + subsequent mind_coach_* migrations |

---

*PRD v1.1 synced with implementation backlog in `docs/MIND_COACH_JOBS.md` (2026-03-27). Update version and sections when major flows or compliance posture change.*
