# LibertyMD Requirements Compliance Audit

**Audit date:** July 18, 2026
**Scope:** Frontend, Supabase Auth/Postgres/Edge Function, live n8n workflows, and synthetic/browser behavior
**Overall status:** Engineering baseline implemented; one shared-project blocker and clinical/operational approvals remain

## Status Definitions

- **Met:** Implemented and verified in code plus a relevant runtime or browser check.
- **Implemented, blocked:** The product behavior exists, but a deployment setting prevents a new user from reaching it.
- **Partial:** A meaningful portion is implemented, but an external or operational verification remains.

## Product Flow Requirements

| Requirement | Implementation evidence | Runtime evidence | Status |
| --- | --- | --- | --- |
| A new user is not forced to create a profile before starting chat. | The frontend calls `signInAnonymously()` and creates the user/profile invisibly. No login form is shown before the symptom composer. | A direct clean-user Auth request returned `anonymous_provider_disabled`. Existing sessions can use the flow, but genuinely new users cannot currently start. | **Implemented, blocked** |
| The first response acknowledges the symptom and asks age and gender/sex. | `start_consultation` stores the chief complaint, runs guardrail, and returns `acknowledgement()`. The chat renders `LibertyMDDemographicsPrompt`. | Browser flow showed the submitted symptom, an empathetic acknowledgement, age input, Female/Male segmented control, and Submit. | **Met for existing sessions** |
| Age and sex are saved against the user. | `save_demographics` validates age 18-120, updates `libertymd_profiles`, adds demographics to explicit slots, and writes a demographics message. | Browser flow transitioned from Age 34/Female to a focused severity question; linked profile drawer displays `Age 34 - Female`. | **Met** |
| Questioning continues after demographics. | Interview payload contains patient, history, `filled_slots`, `missing_slots`, `target_slot`, and turn count. | Browser run asked severity, associated symptoms, warning signs, history, medicines, onset, and duration. | **Met** |
| Before an anonymous diagnosis is shown, show Google login or Skip. | A valid anonymous report is stored as `withheld`; the Edge Function returns `auth_required`; `LibertyMDReportGate` offers Continue with Google and Skip and view once. Withheld reports are excluded by RLS/API reads. | Fresh anonymous report-gate E2E is unreachable while anonymous Auth is disabled. Code and prior authenticated/guest paths were inspected, but this exact fresh-user runtime gate cannot currently be repeated. | **Implemented, blocked** |
| Google is offered only after chat. | The report modal owns the Google action. The anonymous hamburger drawer now tells the user to complete a consultation and contains no Google button. | Browser audit confirmed no pre-chat Google CTA in the anonymous drawer. | **Met** |
| Google linking updates name, email, avatar, and provider. | The frontend uses `linkIdentity({ provider: 'google' })`. `sync_identity`, `ensureProfile`, and the `auth.users` trigger update linked identity fields without changing `user_id`. | `/auth/v1/settings` confirms Google is enabled and OAuth initiation redirects correctly. Management settings report `security_manual_linking_enabled=false`, so same-ID linking is blocked until the shared toggle is approved. | **Implemented, blocked** |
| Linked users can see historical chats and profile. | `get_history`, `get_consultation`, and the hamburger drawer expose authorized records. The drawer now shows name/email/avatar plus age and sex. History refreshes when the drawer opens and after a linked report completes. | Browser audit showed two completed consultations, email, and Age 34/Female in the drawer. | **Met** |
| Returning linked users are greeted by first name. | `firstName()` reads Google `full_name`/`name`; bootstrap and reset compose a named greeting. | The inspected linked test user has no display name (`test@example.com`), so a real Google-name greeting was not observable. | **Partial** |
| A stable user ID is created on arrival and retained after linking. | Supabase anonymous Auth owns all rows. Manual identity linking is designed to upgrade the same `auth.users.id`; no ownership migration is used. | New anonymous creation is blocked remotely; same-ID Google linking therefore cannot be re-verified end to end. | **Implemented, blocked** |

## Architecture And Finding Resolution

| Finding | Resolution | Status |
| --- | --- | --- |
| Explicit clinical slots were not stored. | `libertymd_consultations` stores `filled_slots`, `missing_slots`, `target_slot`, and `clinical_evidence_score`. Edge and interview workflows exchange these fields every turn. | **Met** |
| Intermediate diagnoses were unused. | Diagnosis receives stored `intermediate_diagnoses`; valid differentials are written back after diagnosis attempts and completion. | **Met** |
| Profiles could duplicate and creation used insert. | `libertymd_profiles.user_id` is unique. Profile creation now uses race-safe upsert with `onConflict: 'user_id'`. | **Met** |
| `updated_at` had no product-specific trigger. | `libertymd_set_updated_at()` is attached to profiles, consultations, and reports. | **Met** |
| `high_risk_continue` was not surfaced or persisted. | Every guardrail decision is written to `libertymd_safety_events`. High-risk responses move consultation state to `high_risk` and return a frontend safety notice. Guardrail outages now use `high_risk_continue` rather than silently passing. | **Met** |
| Turn 15 could complete with an empty differential. | Diagnosis failure returns an empty invalid result. The Edge Function requires the workflow validity flag, non-empty differential, sufficient evidence, and confidence threshold. Turn 15 can end in `clinical_review_needed` but cannot force a report. | **Met** |
| n8n might retain patient payloads. | All three workflows disable success, error, manual, and progress execution data. n8n performs no Supabase writes. | **Workflow level met; host level unverified** |

## Live n8n Verification

| Workflow | ID | Active | Model | Payload retention |
| --- | --- | --- | --- | --- |
| LibertyMD Guardrail | `9qeE6tUcEY74OYV8` | Yes | `models/gemini-3.1-flash-lite` | Disabled |
| LibertyMD Interview | `hqT6SFsmdRy1kWKa` | Yes | `models/gemini-3.1-flash-lite` | Disabled |
| LibertyMD Diagnosis | `vljapWQv5ug7pFA9` | Yes | `models/gemini-3.1-flash-lite` | Disabled |

The live workflow refresh confirmed:

- Guardrail returns `pass`, `high_risk_continue`, or `force_end`.
- Interview rejects off-topic slot updates and returns explicit relevance metadata.
- Diagnosis validates non-empty differential, confidence of at least 60, and evidence score of at least 65.
- Ambiguous values such as unknown, uncertain, and contradictory do not count as evidence.

## Data And Scale Assessment

### Implemented

- One authoritative clinical writer: the Supabase Edge Function.
- Stable Auth ownership and row-level access policies.
- Typed consultation state with JSONB only for evolving structures.
- Indexes for owner history, status queues, message order, safety events, retention, and resolution reason.
- Guest-report and anonymous-profile retention fields plus cleanup function.
- Bounded model timeouts and bounded history/options/slot values.
- Explicit workflow/model metadata and safety-event audit trail.

### Still Required Before Scale

1. Schedule `cleanup_expired_libertymd_data()` and monitor its results.
2. Configure CAPTCHA/Turnstile and per-user/IP rate limits before enabling public anonymous Auth.
3. Verify n8n host-level execution pruning and log redaction. Read-only SSH verification remains unavailable because the current machine has no accepted VPS key.
4. Complete real Google identity-link tests: success, cancel, callback expiry, duplicate identity, and preserved `user_id`.
5. Obtain licensed-clinician approval for the scenario suite and numeric safety targets; engineering fixtures cannot establish clinical efficacy.
6. Assign privacy/security and legal owners and approve the retention, identity, and public-claims controls.

### Reliability Additions Completed

- `client_message_id` provides a unique idempotency key per consultation.
- Short-lived database leases reject concurrent patient turns.
- Consultation versions support optimistic concurrency where clients provide an expected version.
- Interrupted requests can resume after a patient message was stored but before an assistant response was produced.
- Thirty-eight pgTAP checks cover RLS, report withholding, idempotency, leases, retry recovery, cross-user access, and expiry; GitHub CI runs them with local Supabase.
- `scripts/libertymd-live-backend-smoke.mjs` verifies the deployed anonymous flow after the shared Auth toggle is approved.

## Verification Performed

- Live Supabase migration list: `20260718080000`, `20260718090000`, `20260718100000`, and `20260718110000` are applied.
- Direct Supabase anonymous signup probe: blocked with `anonymous_provider_disabled`.
- Supabase Auth settings: Google enabled; signups enabled.
- Live n8n workflow pull and configuration inspection.
- Browser flow: symptom acknowledgement, age/sex prompt, persisted transition, eight focused follow-ups, linked report, profile, and history.
- Browser flow: anonymous drawer contains no pre-chat Google CTA.
- Final live n8n synthetic regression: emergency, normal differential, low-evidence turn-15 review, and random non-medical input all passed.
- Edge Function Deno check and production Vite build passed.
- Contract suite: three schemas, eight fixtures, ten deterministic loops, 15 policy tests, and 20 clinical engineering scenarios pass.
- Live guardrail regression: jaw pain with sweating/nausea, sudden severe abdominal pain, and severe right-lower abdominal pain all force-end.
- Google OAuth initiation redirects correctly with `email profile` scope; account consent was not completed.

## Launch Decision

**Not ready for anonymous-first public launch.** The implementation is substantially complete, but the remote Supabase project must enable anonymous sign-ins and manual identity linking before the required first-user and post-chat Google flows can work end to end. Both settings currently report false.

Because this is a shared Supabase project, the Auth change requires explicit project-wide approval. After enabling it, run `npm run test:libertymd:live`, then repeat a clean-browser flow through Google callback and history retrieval before launch approval.
