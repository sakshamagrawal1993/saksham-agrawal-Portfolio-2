# Mind Coach Product Requirements Document (Detailed Handoff)

Version: 2.0 (detailed handoff draft)  
Date: 2026-03-30  
Primary audiences: Clinical team, Engineering team, Product/UX

---

## 1) Purpose of this document

This PRD is designed as a dual-review handoff:

- Clinical review focus:
  - patient journey quality and safety from onboarding through pathway completion
  - clinical coherence of phase and session progression
  - risk and escalation handling
- Technical review focus:
  - architecture, data model, and state machines
  - frontend/backend contract behavior
  - workflow orchestration and deployment ownership

This is intentionally implementation-grounded and minute so both teams can review the same source of truth.

---

## 2) Product overview

Mind Coach is an AI-assisted mental wellness experience with:

- onboarding and profile creation
- persona-based conversational support (Maya, Alex, Sage)
- pathway-based therapeutic journeys (engagement/discovery followed by a selected pathway)
- session-level progression with runtime adaptation
- journal, mood tracking, exercises, assessments, and diary summaries

The operating model is:

1. Start in `engagement_rapport_and_assessment`.
2. Build rapport and collect context.
3. Propose a personalized pathway.
4. Accept pathway and instantiate phase/session runtime plan.
5. Progress session-by-session and phase-by-phase using deterministic transition logic.
6. Adapt when goals are not met (revisit/stabilize) rather than forcing advancement.

---

## 3) Scope and repository ownership

- App repository (`saksham-agrawal-Portfolio-2`):
  - React frontend
  - Supabase migrations
  - Supabase edge functions
  - documentation
- n8n repository (`n8n-workflows`):
  - all n8n workflow definitions
  - n8n apply/deploy scripts
  - n8n is source of truth for workflow JSON

Important governance update:

- n8n workflow JSON is no longer maintained in the app repo.
- Workflow source of truth is the `n8n-workflows` repo only.

---

## 4) Core user journey (clinical detail)

### 4.1 Entry and onboarding

User flow:

1. User lands on Mind Coach and authenticates.
2. Onboarding captures:
   - name
   - age
   - gender
   - concerns
   - therapist persona preference
3. System creates:
   - `mind_coach_profiles`
   - initial `mind_coach_journeys`
   - initial `mind_coach_sessions` in engagement pathway

Clinical intent:

- establish safety framing and emotional containment early
- reduce friction while collecting enough context for pathway recommendation

### 4.2 Engagement and rapport phase (initial clinical stage)

Canonical initial pathway: `engagement_rapport_and_assessment`.

Clinical intent in this stage:

- alliance building and validation
- contextual intake (stressors, concerns, baseline coping patterns)
- readiness and suitability signal generation
- non-diagnostic pathway recommendation

Expected outputs during this stage:

- dynamic theme updates
- confidence toward pathway fit
- suggested pathway candidate

### 4.3 Assignment to a pathway

Pathway assignment is surfaced when confidence and interaction depth are sufficient.

Mechanism:

- n8n/edge output supplies `suggested_pathway` and confidence signal.
- client persists discovery state on journey.
- proposal modal presents pathway and phase overview.
- user acceptance deactivates old journey and creates new pathway journey.

On acceptance:

- new journey row is created for selected pathway.
- runtime session plan is materialized from session templates.
- initial runtime session is activated for phase 1.

### 4.4 Session-to-session movement logic

At each session end, deterministic evaluation runs:

- objective evaluation (`objective_met`)
- completion intensity (`completion_score`)
- risk evaluation (`risk_level`, escalation, crisis)

Session outcomes:

- `completed`: objective met and not risk-blocked
- `revisit`: objective not met, low/no major risk
- `blocked`: major risk or stabilization required

When objective is not met:

- system creates/activates another attempt for same session order
- attempt count increments
- adapted session content can be reused or adjusted

Clinical implication:

- users are not progressed purely by elapsed session count
- remedial work is explicitly represented in runtime plan

### 4.5 Phase-to-phase movement logic

Current canonical phase policy: `strictReady`.

Precedence and gate order:

1. Risk gate (highest priority)
2. Objective gate (session-level)
3. Readiness + phase requirement gate (phase-level)

Advance is allowed only when all required conditions are true:

- no major risk
- objective met
- readiness is `ready`
- phase completion requirement met:
  - required template session objectives met
  - or max-session fallback rule satisfied

If any condition fails, phase does not advance and reason is persisted (`phase_gate_reason`).

### 4.6 Clinical edge cases and expected behavior

Case: phase signal true but objective false

- normalized to no-advance
- recorded as normalized conflict metadata

Case: objective true but readiness not ready

- session can be complete
- phase remains in current phase
- rationale shown in summary/journey UI

Case: high-risk or escalation

- session marked `blocked` or stabilization path
- no phase advancement
- risk reason persisted

Case: duplicate session-end webhook/retry

- idempotent replay returns prior result
- duplicate eval writes are guarded

---

## 5) Clinical review checklist

### 5.1 Initial engagement quality

- Is rapport-building language safe, non-coercive, and non-diagnostic?
- Is discovery confidence communicated as guidance, not diagnosis?
- Is pathway recommendation language clinically responsible?

### 5.2 Progression model quality

- Are objective criteria per session clinically valid and realistic?
- Are revisit and stabilization branches therapeutically appropriate?
- Is phase advancement too strict, too lax, or balanced for real users?

### 5.3 Risk and crisis quality

- Is risk escalation policy sufficiently conservative?
- Are crisis/escalation steps explicit and reviewable?
- Are locale-specific emergency resources adequate?

### 5.4 Task and homework safety

- Are generated tasks bounded and non-harmful?
- Are contraindications handled for vulnerable users?
- Is pacing appropriate for distress or low-capacity states?

---

## 6) Technical architecture overview

### 6.1 Frontend architecture

Stack:

- React + TypeScript + Vite
- Zustand state store
- Supabase JS client

Key Mind Coach surfaces:

- onboarding
- home
- therapist chat
- proposal modal
- journey screen
- summary view
- phase stepper
- toolkit (journal/exercises/assessments/diary)

Frontend progression behavior:

- reads journey-level `phase_transition_result`
- reads runtime `mind_coach_journey_sessions` for accurate per-phase status
- displays revisit/blocked status and transition rationale

### 6.2 Backend architecture (Supabase)

Components:

- Postgres data model
- edge functions:
  - `mind-coach-chat`
  - `mind-coach-session-end`
  - `mind-coach-journey`
- migrations as canonical schema evolution

### 6.3 Orchestration architecture (n8n)

Source of truth repo: `n8n-workflows`.

Session-end orchestration pattern:

- parent orchestrator executes child agents:
  - memory agent
  - summary agent
  - readiness agent
- merge layer normalizes and emits canonical payload for edge function

Current emitted transition payload (canonical fields):

- `objective_met`
- `completion_score`
- `objective_confidence`
- `recommended_adjustments`
- `session_transition`
- `phase_transition`

---

## 7) Data model (technical detail)

### 7.1 Foundational entities

- `mind_coach_profiles`: user profile and persona preference
- `mind_coach_journeys`: per-user active/inactive journey state
- `mind_coach_sessions`: chat session records
- `mind_coach_messages`: user/assistant/system turns
- `mind_coach_memories`: durable context memory
- `mind_coach_user_tasks`: actionable between-session assignments

### 7.2 Pathway and phase authoring

- `mind_coach_pathway_phases`:
  - canonical pathway metadata and 4-phase structure
  - dynamic prompt content per phase

### 7.3 Session template overlay model

- `mind_coach_session_templates`:
  - authoring-level session templates by pathway + phase + order
  - includes `min_completion_score`, `fallback_strategy`, success criteria

- `mind_coach_journey_sessions`:
  - runtime, per-user session instances
  - statuses: `planned`, `in_progress`, `completed`, `revisit`, `blocked`, `cancelled`
  - attempt-aware (`attempt_count`) for remedial loops

- `mind_coach_session_evaluations`:
  - structured outcome records
  - objective/risk/next-action traceability

### 7.4 Proposal and discovery persistence

- `mind_coach_pathway_proposals`:
  - stores suggested pathways with confidence and source metadata
  - supports home/proposal continuity

### 7.5 Runtime invariants

Database/runtime hardening includes:

- one `in_progress` runtime row per `(journey_id, phase_number)`
- dedupe guard for evaluations per `(journey_session_id, session_id)`
- latest-attempt semantics for counting completed/active session slots

---

## 8) Backend state-machine logic (minute detail)

Primary function: `supabase/functions/mind-coach-session-end/index.ts`.

### 8.1 Inputs

- session context, transcript/messages, profile context
- n8n summary/readiness output
- runtime template/session state for current phase

### 8.2 Deterministic calculations

- `completion_score`:
  - from n8n if provided
  - fallback based on readiness baseline
  - clamped to `[0, 1]`

- `objective_met`:
  - uses incoming signal when provided
  - otherwise evaluated against template threshold (`min_completion_score`)
  - overridden to false if major risk

- `recommended_next_action`:
  - `escalate`/`stabilize` on risk
  - `advance` if objective met
  - `revisit` if objective unmet without major risk

### 8.3 State transitions

Active runtime session is resolved, then:

- update current runtime row with `completion_status`
- write evaluation row (idempotent guarded)
- if objective unmet:
  - create next attempt row for same session order
- if objective met:
  - activate next planned session order in phase (if present)

### 8.4 Phase transition evaluation

Compute:

- completed latest-attempt rows in phase
- completed template-linked rows
- required template count
- max-session fallback

Apply strict policy:

- advance only if `objective_met AND readiness_ready AND no_major_risk AND phase_requirements_met`

Persist:

- journey phase pointer updates
- full `phase_transition_result` payload with reasons and normalized conflicts

### 8.5 Idempotency and retries

Idempotency key:

- session-end processing keyed by `session_id` metadata on summary payload

Behavior:

- duplicate execution returns prior summary/transition
- duplicate eval insertion blocked by uniqueness + existence guard

---

## 9) Frontend logic and state consumption

### 9.1 Chat flow

- `TherapistChat` calls `mind-coach-chat` edge function with timeout handling.
- discovery progression tracks message volume plus pathway confidence.
- proposal CTA appears from discovery state, not message count only.

### 9.2 Proposal acceptance flow

- user locks selected pathway in modal state
- app fetches template sessions for selected pathway
- inserts new journey + runtime sessions
- marks prior journey inactive

### 9.3 Journey rendering flow

- `JourneyScreen` reads `mind_coach_journey_sessions` by phase.
- latest attempt per session order is used for accurate slot status.
- next session title/description can come from generated runtime values.
- transition reason labels displayed using `phase_gate_reason`.

### 9.4 Summary rendering flow

- summary shows:
  - phase advancement or hold
  - `session_transition_status` (completed/revisit/blocked)
  - `recommended_next_action`
  - human-readable rationale from `phase_gate_reason`

### 9.5 Stepper rendering flow

- stepper reflects runtime session counts (latest attempt semantics)
- supplementary status reason text appears for blocked/revisit/readiness holds

---

## 10) API and contract boundaries

### 10.1 Session-end webhook contract

Documented at:

- `docs/MIND_COACH_SESSION_END_WEBHOOK_CONTRACT.md`

Contract now explicitly includes objective/session/phase transition fields and conflict normalization expectations.

### 10.2 n8n ownership contract

- Workflow authoring: `n8n-workflows` repo.
- App repo consumes output contract and does not host workflow source JSON.

---

## 11) Risk, safety, and governance notes

- This is AI-assisted coaching and must not be represented as emergency or physician-directed care.
- Clinical policy signoff is required for:
  - crisis protocol
  - severe assessment handling
  - task contraindications
  - pathway messaging and diagnostic framing
- Escalation behavior is implemented technically but requires clinical and legal language validation.

---

## 12) Open review questions for both teams

### Clinical

1. Is strict readiness gating clinically appropriate, or should objective-first advancement be allowed in defined cases?
2. Are revisit/stabilize triggers and generated adaptations therapeutically suitable?
3. Are all pathways safe for fully self-serve users, or should some require stronger escalation guidance?

### Technical

1. Should all chat path traffic remain edge-mediated (current) with no direct client-to-orchestrator route?
2. Do we need stronger observability around transition conflicts and retry frequency?
3. Should template fallback behavior be tightened for pathways with sparse/missing template coverage?

### Product/UX

1. Is the transition rationale comprehensible to users without exposing clinical internals?
2. Is the proposal acceptance moment clear enough about what changes next?
3. Are progression expectations (especially revisit loops) set early enough in the journey?

#### Product patch options (recommended)

1) Transition rationale comprehension

- Option A (light): keep current one-line rationale labels (`objective_not_met`, `readiness_not_ready`, etc.) with friendlier text only.
- Option B (recommended baseline): add a 3-part explanation card on summary and journey:
  - "What happened this session"
  - "Why phase stayed/advanced"
  - "What to do next"
- Option C (full): add tappable "How progression works" explainer modal with examples for revisit, stabilize, and phase hold.
- Recommendation: ship Option B first; add Option C if support tickets show confusion.

2) Proposal acceptance clarity

- Option A (light): improve post-accept copy only ("Your pathway is active. Next session focus: ...").
- Option B (recommended baseline): after accept, show a short "What changes now" checkpoint:
  - new pathway name
  - active phase and next session title
  - newly unlocked tools
- Option C (full): add guided first-run for new pathway (2-3 screens) before returning user to chat/home.
- Recommendation: ship Option B; reserve Option C for a later UX sprint.

3) Early expectation setting for revisit loops

- Option A (light): single onboarding sentence that progress can include repeat sessions when needed.
- Option B (recommended baseline): set expectations in two places:
  - onboarding/journey intro ("Some sessions may repeat to strengthen progress")
  - first summary where a hold/revisit occurs (explicit and reassuring)
- Option C (full): add persistent "Progress model" helper in Journey with visual examples of normal vs revisit paths.
- Recommendation: ship Option B immediately, then test Option C if confusion persists.

---

## 13) Review signoff template

### Clinical signoff

- Reviewer:
- Date:
- Approved with conditions:
- Required changes:

### Engineering signoff

- Reviewer:
- Date:
- Architecture approved:
- Required changes:

### Product signoff

- Reviewer:
- Date:
- UX messaging approved:
- Required changes:

---

## 14) Reference map

- Frontend state: `store/mindCoachStore.ts`
- Chat UI: `components/MindCoach/Chat/TherapistChat.tsx`
- Proposal flow: `components/MindCoach/PlanProposalModal.tsx`
- Journey UI: `components/MindCoach/Screens/JourneyScreen.tsx`
- Summary UI: `components/MindCoach/Summary/SessionSummaryView.tsx`
- Session-end edge: `supabase/functions/mind-coach-session-end/index.ts`
- Chat edge: `supabase/functions/mind-coach-chat/index.ts`
- Core schema: `supabase/migrations/20260302200000_mind_coach_schema.sql`
- Pathway/phase authoring: `supabase/migrations/20260323030000_mind_coach_tables.sql`
- Template/runtime/eval layer: `supabase/migrations/20260330010000_mind_coach_session_templates_and_evaluations.sql`
- Invariant hardening: `supabase/migrations/20260330023000_mind_coach_journey_invariant_hardening.sql`
- Session-end contract doc: `docs/MIND_COACH_SESSION_END_WEBHOOK_CONTRACT.md`

