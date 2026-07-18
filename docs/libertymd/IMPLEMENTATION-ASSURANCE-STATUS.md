# LibertyMD Implementation And Assurance Status

**Date:** July 18, 2026
**Scope:** The eight post-validation recommendations
**Overall:** Four recommendations are implemented, four have the maximum engineering work completed but still require an external approval or access step.

## Status By Recommendation

| # | Recommendation | Codex implementation | Verification | Remaining owner/action | Status |
| ---: | --- | --- | --- | --- | --- |
| 1 | Clinician-authored and reviewed fixtures | Added a versioned 20-scenario clinical suite, review metadata, schema, evaluator, and clinical checklist. | All 20 scenarios pass the engineering regression; every scenario is visibly marked `pending` for clinical review. | A licensed clinical owner must review, revise, and approve each fixture. | **Engineering complete; clinical approval pending** |
| 2 | Approved sensitivity and specificity targets | Added confusion-matrix evaluation, explicit target fields, and separate engineering versus clinical release gates. | Current draft suite reports 8 true positives, 12 true negatives, no false positives, and no false negatives. This is a software-fixture result, not evidence of clinical efficacy. | Clinical owner must approve representative samples and numeric launch thresholds. | **Tooling complete; target approval pending** |
| 3 | Anonymous Supabase Auth | Frontend uses anonymous Auth; schema, RLS, retention, profile upsert, live smoke runner, and repository config are ready. | Public Auth settings still report `anonymous_users=false`. A narrow Management API change was intentionally not applied because this is a shared project. | Project owner must explicitly approve enabling anonymous sign-ins across the shared Supabase project, then run `npm run test:libertymd:live`. | **Blocked on shared-project approval** |
| 4 | Real Google OAuth and identity-link E2E | Google is linked only at the report gate; callback sync updates name, email, avatar, provider, and preserves the owning user ID by design. | Google provider is enabled and OAuth initiation redirects correctly to Google with `email profile` scope and the Supabase callback. Supabase currently reports `security_manual_linking_enabled=false`. | Explicitly approve shared-project manual identity linking, then complete consent with a designated test Google account and verify same-ID linking, cancel, expiry, duplicate identity, report release, greeting, and history. | **Initiation verified; shared toggle and account E2E pending** |
| 5 | Backend integration tests | Added 38 pgTAP checks for schema, RLS, report withholding, idempotency, leases, partial retry recovery, access isolation, and expiry. Added a live backend smoke runner. | Migrations `20260718100000` and `20260718110000` are live; the care proxy is deployed and type-checks. CI is configured to run pgTAP with Supabase. Local pgTAP execution is unavailable because Docker is not installed. | Enable anonymous Auth for live smoke; let GitHub CI run the local Supabase database suite. | **Implemented; two runtime gates pending** |
| 6 | JSON Schemas and CI | Added strict guardrail, interview, and diagnosis schemas; eight positive/negative fixtures; contract runner; and CI workflow. | Three schemas, eight fixtures, ten simulations, 15 policy tests, the 20-case evaluation, and production build pass. All three n8n definitions also pass the local workflow-contract inspection. | Keep checks required for clinical/backend pull requests. | **Complete** |
| 7 | n8n execution-retention verification | All three workflows disable successful, error, manual, and progress execution payload persistence. Added a host verification runbook. | Live workflows are active, use Gemini 3.1 Flash Lite, have 60-second timeouts, and carry workflow-level no-retention settings. SSH to the host is denied from this machine. | VPS owner must run the read-only host checks and record the environment/database result. | **Workflow complete; host verification blocked** |
| 8 | Clinical governance | Added version registry, quality gates, change-control policy, review checklist, and clinical-change PR template. | Files are schema-valid and used by the evaluator/CI. Clinical release remains false while approvals are pending. | Assign licensed clinical, privacy/security, and legal owners and record approvals. | **Framework complete; organizational approval pending** |

## Production Changes Applied

- Deployed Edge function `libertymd-care-proxy` with deterministic emergency screening, evidence gates, explicit state, request leases, idempotency, and partial-retry recovery.
- Applied LibertyMD-only migrations `20260718100000` and `20260718110000` without applying the unrelated pending Jivi migration.
- Updated and activated n8n guardrail workflow `9qeE6tUcEY74OYV8`.
- Verified live emergency termination for jaw pain with sweating/nausea, sudden severe abdominal pain, and severe right-lower abdominal pain with vomiting.
- Verified Google OAuth initiation without completing consent against a personal account.

## Current Release Decision

The engineering baseline is suitable for continued internal testing, but not for an anonymous-first public clinical launch. Anonymous Auth, manual identity linking, clinician fixture approval and targets, real Google identity-link completion, host retention verification, privacy/legal approval, and production abuse controls remain release gates.
