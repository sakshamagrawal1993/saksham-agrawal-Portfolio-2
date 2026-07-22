# LibertyMD Implementation And Assurance Status

**Date:** July 19, 2026
**Scope:** The eight post-validation recommendations
**Overall:** Anonymous-first identity and persistence are live. Remaining release gates require clinical, privacy, Google-account, abuse-control, and infrastructure-owner verification.

## Status By Recommendation

| # | Recommendation | Codex implementation | Verification | Remaining owner/action | Status |
| ---: | --- | --- | --- | --- | --- |
| 1 | Clinician-authored and reviewed fixtures | Added a versioned 20-scenario clinical suite, review metadata, schema, evaluator, and clinical checklist. | All 20 scenarios pass the engineering regression; every scenario is visibly marked `pending` for clinical review. | A licensed clinical owner must review, revise, and approve each fixture. | **Engineering complete; clinical approval pending** |
| 2 | Approved sensitivity and specificity targets | Added confusion-matrix evaluation, explicit target fields, and separate engineering versus clinical release gates. | Current draft suite reports 8 true positives, 12 true negatives, no false positives, and no false negatives. This is a software-fixture result, not evidence of clinical efficacy. | Clinical owner must approve representative samples and numeric launch thresholds. | **Tooling complete; target approval pending** |
| 3 | Anonymous Supabase Auth | Frontend uses invisible anonymous Auth; schema, RLS, retention, profile upsert, and live smoke runner are implemented. | Hosted anonymous sign-in is enabled. The deployed smoke passed bootstrap, emergency, demographics, retry, concurrency, and cross-user checks. | Add CAPTCHA/Turnstile, abuse alerts, and production traffic limits before public launch. | **Live; abuse controls pending** |
| 4 | Real Google OAuth and identity-link E2E | Google appears only at the report gate. Same-ID linking updates profile identity; duplicate Google identities use a hashed ten-minute transfer and a LibertyMD-only merge transaction. | Google and manual identity linking are enabled. Callback allow-lists preserve old routes and include LibertyMD local/production chat routes. The merge transaction passed rollback verification. | Complete consent with designated new and existing Google test accounts; verify success, cancel, expiry, duplicate transfer, report release, greeting, and history. | **Backend live; real-account E2E pending** |
| 5 | Backend integration tests | Added 63 pgTAP checks for schema, RLS, report withholding, idempotency, leases, partial retry recovery, account transfer, access isolation, and expiry. Added a live backend smoke runner. | The rollback-only hosted transaction reached assertion 63. The deployed live smoke passed seven checks. Local `supabase test db` remains unavailable because Docker is not running. | Keep the local Supabase pgTAP suite in CI and monitor synthetic live smoke results. | **Implemented and remotely smoke-tested** |
| 6 | JSON Schemas and CI | Added strict guardrail, interview, and diagnosis schemas; eight positive/negative fixtures; contract runner; and CI workflow. | Three schemas, eight fixtures, ten simulations, 15 policy tests, the 20-case evaluation, and production build pass. All three n8n definitions also pass the local workflow-contract inspection. | Keep checks required for clinical/backend pull requests. | **Complete** |
| 7 | n8n execution-retention verification | All three workflows disable successful, error, manual, and progress execution payload persistence. Added a host verification runbook. | Live workflows are active, use Gemini 3.1 Flash Lite, have 60-second timeouts, and carry workflow-level no-retention settings. SSH to the host is denied from this machine. | VPS owner must run the read-only host checks and record the environment/database result. | **Workflow complete; host verification blocked** |
| 8 | Clinical governance | Added version registry, quality gates, change-control policy, review checklist, and clinical-change PR template. | Files are schema-valid and used by the evaluator/CI. Clinical release remains false while approvals are pending. | Assign licensed clinical, privacy/security, and legal owners and record approvals. | **Framework complete; organizational approval pending** |

## Production Changes Applied

- Deployed Edge function `libertymd-care-proxy` with deterministic emergency screening, evidence gates, explicit state, request leases, idempotency, and partial-retry recovery.
- Applied LibertyMD-only migrations through `20260719100000` without applying the unrelated pending Jivi migration.
- Added separate patient records, consultation snapshots, append-only diagnostic runs, consent/identity/product ledgers, and secure existing-account transfer.
- Enabled hosted anonymous Auth and manual identity linking while preserving the production site URL and every existing callback; added LibertyMD local and production chat callbacks.
- Updated and activated n8n guardrail workflow `9qeE6tUcEY74OYV8`.
- Updated and activated n8n diagnosis workflow `vljapWQv5ug7pFA9` with clinical context and explicit model/workflow metadata.
- Verified live emergency termination for jaw pain with sweating/nausea, sudden severe abdominal pain, and severe right-lower abdominal pain with vomiting.
- Verified Google OAuth initiation without completing consent against a personal account.

## Current Release Decision

The anonymous-first engineering baseline is live and suitable for continued internal testing, but not for public clinical launch. Clinician fixture approval and targets, real Google-account completion, host retention verification, privacy/legal approval, scheduled cleanup, and production abuse controls remain release gates.
