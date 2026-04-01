# Jivi Mind Coach E2E Journey — Workplace department closure / anxiety

**Date:** 2026-04-01  
**Entry URL:** [https://saksham-experiments.com/project/mind-coach](https://saksham-experiments.com/project/mind-coach)  
**Account:** `test@example.com` / `password`  
**Scenario:** Anxiety and stress after the workplace shut down the user’s department; uncertainty about income, identity tied to work, rumination, sleep impact.

---

## Requested journey steps (checklist)

| # | Step | Status this run |
|---|------|-----------------|
| 1 | Onboard on Mind Coach | **Done** — `test@example.com` via production Live Demo (steps 1–6); profile + journey created |
| 2 | ~30 chat turns until pathway revealed | **Done (API)** — `scripts/jivi_mindcoach_e2e_chat_runner.py --turns 30 --theme workplace_anxiety` (~4.5 min); see *Post–30-turn session state* |
| 3 | Accept pathway | **Done (browser)** — Home → suggested **Grief & Loss** → **Follow this pathway** |
| 4 | End session | **Partial** — multiple **End session** runs; first produced full summary, later runs often **placeholder** (session-end errors) |
| 5 | Home screen | **Done** — stepper shows phases 1–5; Phase 2 **Acknowledging the Loss** **2/3** sessions |
| 6 | Journey page | **Done** — **Your Journey**; **3.0/13** sessions, **~23%** |
| 7+ | Further sessions through 5 phases | **Not completed** — blocked by session-end + exercise UI (see *Browser-only continuation*) |
| 14 | Final summary + congratulations / personal letter | **Not reached** |

---

## Execution log (what was actually run)

### Production site & auth

- Opened [https://saksham-experiments.com/project/mind-coach](https://saksham-experiments.com/project/mind-coach) (portfolio **Mind Coach** project page).
- Used **Live Demo** → Mind Coach **email sign-in** with `test@example.com` / `password`.
- After authentication, the app showed **onboarding step 1 of 6** (“Whatever brought you here, you are in the right place.”) with **Begin**.

### Backend state (Supabase, same project as production app)

- **Earlier check:** `mind_coach_profiles` had **no row** until onboarding finished in the UI.
- **After onboarding (this run):** Profile exists for `test@example.com`; journey created; chat session active.
- **Post–30-turn session state** (REST snapshot, session `d4502005-28ef-4544-a60c-2f725438de3e`): `pathway` = `engagement_rapport_and_assessment`, `pathway_confidence` = **85**, `session_state` = `intake`, `dynamic_theme` = `Grief and Loss Processing`, `message_count` = **61** (includes initial greeting traffic + 30 scripted user/assistant pairs). Pathway **not** yet switched to a post-engagement slug — product may require **in-app** pathway confirmation, additional turns, or n8n thresholds before `pathway` updates.
- **Script telemetry:** All 30 assistant payloads logged **`objective_progress=None`** (no `dynamic_content.current_objective_progress` from n8n). During engagement/discovery the UI emphasizes plan unlock / clinical insight, not the pathway session-goal stepper; once on a concrete pathway phase, 2.1 still depends on the model emitting progress metadata or the client fallback.

### Onboarding choices (this run)

- Concerns: **Anxiety & Worry**, **Stress & Burnout**, **Overthinking**; guide **Maya**; display name **Test User**, age **32**, gender **Male**.

### Browser automation note

- Some `agent-browser` steps with `--wait --load networkidle` **timed out** on production (heavy third-party assets). Prefer **`domcontentloaded`** or short `--wait --time` for follow-up runs.
- **`agent-browser click` without `--force`** sometimes failed to advance onboarding (e.g. concerns → therapist); **`--force`** on **Continue** reliably advanced steps.

---

## Your goals — findings (code + product)

### 2.1 Session goal visibility & progress each chat turn

**What the user sees (pathway phase, not engagement-only):**

- `PhaseProgressStepper` renders:
  - Phase strip, **Phase N: title**, **sessions completed / target**
  - Dot indicators per session in phase
  - **“Session Goal: {topic}”** from `mind_coach_journey_sessions` row (topic) or phase template fallback
  - **Percent + bar** when `currentObjectiveProgress` is passed

**How progress % is computed in the client:**

- `TherapistChat` walks **assistant messages from newest to oldest** and uses the first numeric `dynamic_content.current_objective_progress` from the model payload.
- If none is found, it uses a **fallback heuristic:** `min(85, round((message_count / 25) * 100))` — **not** a stored per-turn server calculation in Postgres.

**Backend context (not the same as the % bar):**

- `buildContinuityPack` / `mindCoachContext` builds **`session_goal_context`** (objective text, phase context) for the **edge function** to send to n8n so the model can ground replies. That does **not** by itself update a running “objective %” in the database each turn.

**Conclusion for 2.1**

- **Session goal (topic):** Yes — shown in chat chrome for non–engagement sessions via `PhaseProgressStepper`.
- **Progress toward goal:** **Partially** — UI updates when the **LLM** returns `current_objective_progress` in `dynamic_content`; otherwise the user sees only the **message-count heuristic**, which is **not** a clinical/objective scoring engine and **not** guaranteed to move meaningfully every turn.

Relevant code:

```1368:1388:components/MindCoach/Chat/TherapistChat.tsx
      {!isEngagementDiscovery && journey && (() => {
        let computedProgress = 0;
        for (let i = messages.length - 1; i >= 0; i--) {
          const p = messages[i]?.dynamic_content?.current_objective_progress;
          if (typeof p === 'number') {
            computedProgress = p;
            break;
          }
        }
        if (computedProgress === 0 && activeSession) {
          const count = activeSession.message_count || 0;
          computedProgress = Math.min(85, Math.round((count / 25) * 100));
        }

        return (
          <PhaseProgressStepper 
            journey={journey} 
            sessions={sessions} 
            currentObjectiveProgress={computedProgress} 
          />
        );
      })()}
```

```133:151:components/MindCoach/Chat/PhaseProgressStepper.tsx
      <div className="mt-2.5 p-2 bg-white rounded-lg border border-[#E8E4DE]">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] font-medium text-[#2C2A26]">
            Session Goal: {sessionGoalTopic}
          </p>
          {currentObjectiveProgress !== undefined && (
            <p className="text-[10px] text-[#2C2A26]/45 font-medium">
              {currentObjectiveProgress}%
            </p>
          )}
        </div>
        {currentObjectiveProgress !== undefined && (
          <div className="w-full h-1.5 bg-[#F5F0EB] rounded-full overflow-hidden">
            <div 
              className="h-full bg-[#D4A574] rounded-full transition-all duration-500 ease-out"
              style={{ width: `${currentObjectiveProgress}%` }}
            />
          </div>
        )}
      </div>
```

**Engagement / discovery (before pathway):**

- Different UI: plan-unlock bar (“Your plan unlocks with the conversation”) and **Clinical insight** strip — not the pathway session-goal card above.

---

### 2.2 Congratulations when moving from one phase to the next

**Where:** `SessionSummaryView` (session end / summary), **celebration banners** at top of scroll.

- When `phase_transition_result.advanced` is true and `phase_gate_reason` is **not** `journey_completed`, the user sees **“Phase X Unlocked!”** and copy: *Congratulations! You've leveled up and advanced to your next milestone.*

```283:296:components/MindCoach/Summary/SessionSummaryView.tsx
        {phaseTransitionResult?.advanced && phaseTransitionResult?.phase_gate_reason !== 'journey_completed' && (
          <motion.div
            ...
            <h2 className="text-xl font-bold text-[#4A6B50] mb-2">Phase {(phaseTransitionResult.new_phase_index ?? 0) + 1} Unlocked!</h2>
            <p className="text-sm text-[#4A6B50]/80 leading-relaxed font-medium">
              Congratulations! You've leveled up and advanced to your next milestone.
            </p>
          </motion.div>
        )}
```

- **Depends on** `summary_data.phase_transition_result` populated by **session-end** pipeline (Supabase `mind-coach-session-end` + n8n orchestration). If the backend marks `advanced: false` while messaging still sounds positive, UX can feel mismatched — that’s a **data contract** issue, not this banner component.

---

### 2.3 Message when the user completes the full journey

**Where:** Same summary view:

- **Banner:** `phase_gate_reason === 'journey_completed'` → “Journey Completed!” + congratulations paragraph.

```267:280:components/MindCoach/Summary/SessionSummaryView.tsx
        {phaseTransitionResult?.phase_gate_reason === 'journey_completed' && (
          <motion.div ...>
            ...
            <h2 className="text-xl font-bold text-amber-800 mb-2">Journey Completed!</h2>
            <p className="text-sm text-amber-900/80 leading-relaxed font-medium">
              Congratulations! You have successfully completed all phases in this pathway. We are incredibly proud of your progress.
            </p>
          </motion.div>
        )}
```

- **Personal letter:** When `journey_completion_message` `{ Heading, Description }` is present in summary JSON, the UI offers **Open your personal letter** (sheet / inline reveal depending on version deployed).

---

## Errors / monitoring this run

- **App:** No errors observed through onboarding and first chat shell (“Writing a reply…” / engagement chrome).
- **Supabase / edge:** `mind-coach-session-start` + **30×** `mind-coach-chat` invocations via anon JWT **succeeded** (no 4xx/5xx in runner).
- **2.1 signal:** No `current_objective_progress` in stored `dynamic_content` for these 30 turns — aligns with engagement phase and/or n8n prompt not populating that field every turn.

---

## How to continue this E2E (after you finish onboarding in the browser)

1. Complete all **6** onboarding steps (name, age, gender, concerns, therapist, start) — **done** for `test@example.com` in this run.
2. Run the helper script from the repo root (requires `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`):

```bash
cd /path/to/saksham-agrawal-Portfolio-2
python3 scripts/jivi_mindcoach_e2e_chat_runner.py --turns 30 --theme workplace_anxiety
```

Optional credentials: `--email` / `--password`. The script mirrors client persistence (`client_managed_persistence: true`), merges n8n payloads like `TherapistChat`, and prints `objective_progress` per turn when present.

3. **In the app:** Refresh or reopen chat — accept any **pathway** proposal, **end session**, verify **home** + **journey** + **SessionSummaryView** banners (2.2 / 2.3).
4. For full **five-phase** completion, repeat session loops or extend the script with `mind-coach-session-end` / orchestrator calls (not implemented in the script yet).

Script path: `scripts/jivi_mindcoach_e2e_chat_runner.py`.

---

## Browser-only continuation — five-phase E2E (agent-browser, production)

**Goal:** Complete the journey using only the live UI (no Python chat runner), with substantive turns so session goals and progress matter.

### What completed

| Step | Result |
|------|--------|
| Sign-in | `test@example.com` / `password` via **Live Demo** (`agent-browser --session-name mc-e2e-5phase`). |
| Pathway | From **Home**, opened suggested pathway (**Grief & Loss** / “Healing Through Grief Plan”) → **Follow this pathway** → dismissed stacked drawer (**Close** on erroneous **General Wellness** overlay — see issues below). |
| Home stepper | All **five** phase labels visible; **Phase 2 — Acknowledging the Loss**, session progress advanced to **2/3** by end of run. |
| **Journey** tab | Opened from the main journey card: **Healing Through Grief Plan**, **3.0/13 sessions**, **~23%** overall; narrative: *Keep going in this phase. 2/3 sessions completed.* |
| First post-pathway session | **Session Goal** and **progress %** visible in chat chrome (e.g. “Acknowledging the Loss - Orientation”, **12% → 28%** across turns). Full **SESSION COMPLETE** summary from orchestrator (not placeholder): themes, takeaways, **1/3 sessions** in phase, `continue_in_phase`. |
| Later sessions | Mixed: some **End session** flows produced **`Session wrap-up` placeholder** (`MIND_COACH_DUMMY_SESSION_SUMMARY`), which matches `TherapistChat` behavior when `mind-coach-session-end` returns an error payload or the client throws (see ```1050:1061:components/MindCoach/Chat/TherapistChat.tsx```). |

### What did **not** complete

- **All five phases** and final **Journey Completed** / personal letter (2.3): blocked by **unreliable session-end** (placeholder summaries), **in-chat Box Breathing** UI covering the composer (send button stays disabled until text is entered; **END EXERCISE** / **Return to Chat** did not always restore a clean chat layout), and **automation fragility** when accessibility refs shifted between turns.
- **Phase-advance congratulations** (2.2): not observed — phase remained **Acknowledging the Loss** at **2/3** sessions on Home at pause point; no **“Phase X Unlocked!”** banner on summaries we captured.

### UI / product checks (browser)

- **2.1 Session goal + progress:** **Confirmed** on post-engagement chat: stepper shows phase title, session index, **Session Goal** line, and **percentage** (from `dynamic_content.current_objective_progress` and/or message-count fallback per earlier audit).
- **2.2 / 2.3:** **Not verified** end-to-end in this browser run.

### Issues to fix (app / n8n / ops)

1. **`mind-coach-session-end` failures** — Investigate production logs for intermittent errors/timeouts; placeholder completion **still marks the session completed** in Postgres but **without** rich `phase_transition_result`, which stalls phase progression and confuses QA.
2. **Stacked proposal modals** — After accepting **Grief & Loss**, a **General Wellness** drawer remained; **Close** was required. Likely **PlanProposalModal** / Home proposal state desync.
3. **In-chat exercise vs composer** — Box Breathing repeatedly overlapped **Message Maya**; consider **collapsing to chip**, **auto-dismiss after complete**, or ensuring **Return to Chat** always restores the input row for keyboard and automation.

### Helper script (browser driver only)

- `scripts/mindcoach_browser_session_turns.sh` — sends a fixed list of messages using **static** `@e8`/`@e9`-style refs; only safe right after a fresh snapshot. Prefer re-snapping per message for long runs.

---

## Suggested improvements (from this audit)

| Area | Suggestion |
|------|------------|
| 2.1 | Add explicit **server-side or structured** objective progress (e.g. rubric score) if product requires “true” per-turn progress, not only LLM-supplied `current_objective_progress`. |
| 2.1 | Document in UI that fallback % is **approximate** when the coach doesn’t send progress metadata. |
| E2E | Keep `test@example.com` with a stable profile when you want API-assisted long runs; otherwise expect onboarding first. |
| Session end | Stabilize **`mind-coach-session-end`** + n8n orchestrator on production so completed sessions always persist rich `summary_data` / `phase_transition_result` (avoid silent fallback to ```MIND_COACH_DUMMY_SESSION_SUMMARY```). |
| Exercises | Ensure **in-chat exercise** flow cannot trap focus over the composer; validate **Return to Chat** / **END EXERCISE** with a single clear exit. |
| Proposals | Fix duplicate / wrong-pathway modal after accept (**General Wellness** over **Grief**). |

---

## Related docs

- Prior relationship-scenario E2E: `docs/JIVI_MINDCOACH_E2E_RELATIONSHIP_JOURNEY_2026-03-31.md`
