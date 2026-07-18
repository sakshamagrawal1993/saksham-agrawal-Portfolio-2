# LibertyMD Clinical Change Control

## Purpose

Every change that can alter emergency routing, questioning, evidence collection, differential generation, care setting, report release, retention, or patient-facing medical language must be versioned, reviewed, tested, and reversible.

## Change Classes

| Class | Examples | Required approval |
| --- | --- | --- |
| Safety critical | Emergency rules, force-end logic, crisis language, care setting | Engineering, licensed clinical owner, privacy/legal when wording or routing changes |
| Clinical behavior | Prompts, slot weights, confidence/evidence thresholds, differential schema | Engineering and licensed clinical owner |
| Model or workflow | Model identifier, agent topology, parser, timeout, fallback | Engineering; clinical review when output behavior can change |
| Privacy and identity | Auth, RLS, OAuth, retention, logging, analytics | Engineering and privacy/security owner |
| Presentation only | Layout or styling with no care-flow behavior | Engineering and design |

## Required Evidence

1. A change record describing the patient impact, rationale, and affected versions.
2. Passing n8n JSON Schema fixtures and deterministic policy tests.
3. Passing ten fixed Codex simulations and the approved clinical scenario suite.
4. Database integration results for schema, RLS, report withholding, expiry, idempotency, and concurrency when affected.
5. Before/after output examples with no raw patient data.
6. Rollback identifier and owner.

## Release Gates

- No known emergency fixture regression.
- No valid report with an empty differential.
- No off-topic response may update clinical slots.
- No withheld report may be readable through RLS or the Edge API.
- Clinical performance targets must be populated and approved before public launch.
- Safety-critical changes require two-person approval, including a licensed clinical owner.
- A model change is a clinical behavior change even when prompts are unchanged.

## Rollback

1. Deactivate or restore the previous n8n workflow version.
2. Restore the last-known-good Edge Function deployment.
3. Disable report release if integrity is uncertain; keep emergency routing available when safe.
4. Record affected consultations, version identifiers, timestamps, and observed failure without exporting raw transcript text.
5. Require a new change record and complete validation before reactivation.

## Incident Triggers

- Missed or incorrectly softened known emergency presentation.
- Report released with empty or unsupported differential.
- Cross-user access or withheld-report disclosure.
- Off-topic content persisted as clinical fact.
- Material model behavior drift, schema violation, or sustained workflow timeout.
- Identity linking changes the owning user ID or loses history.

## Ownership

Engineering owns technical correctness and rollback. The licensed clinical owner owns clinical thresholds, scenario approval, safety language, and diagnostic/care-setting acceptance. Privacy/security owns identity, access, retention, and logging. Legal/regulatory owns public claims and market eligibility.
