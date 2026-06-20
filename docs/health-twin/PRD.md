---
title: Health Twin Platform — portfolio demo
source: digital-twin-health-twin.md
synced_from: Obsidian/Vibe Coding/Products PRD
---

# Health Twin Platform

## Product routes

- `/health-twin`: landing, twin selection, creation, and featured twins.
- `/health-twin/:id`: dashboard.
- `/health-twin/:id/playground`: wellness simulation playground.

## Purpose

The product is a personal health twin that aggregates biomarkers, documents,
wearable CSV data, manually entered health parameters, and profile data. It
computes scores and ranges and provides an AI health assistant with structured
context and persistent conversation data.

## Required product surfaces

| Surface | Required behavior |
| --- | --- |
| Twin landing | Authenticate users; list, create, select, and feature twins. |
| Dashboard | Load profile, sources, biomarkers, wearables, scores, recommendations, aggregates, and wellness programs. |
| Lab reports | Upload PDF, image, or CSV files to `health_documents`; create a source; invoke `process-lab-report`; unwrap n8n output; persist extracted biomarkers. |
| Wearables | Preview and import wearable CSV rows. |
| Manual data | Add individual and grouped lab, vital, symptom, sleep, exercise, nutrition, and reproductive-health parameters. |
| Profile | Save personal details and derive BMI from height and weight. |
| Data views | Render and edit charts across supported categories. |
| Health assistant | Invoke `chat-completion`, preserve sessions and messages, use twin context, and render supported widgets. |
| Wellness | Load cached wellness programs and generate or refresh programs through edge functions. |
| Playground | Initialize from real data, simulate changes, recalculate scores, reset to baseline, and produce simulated wellness guidance without changing real data. |

## Data model

Representative Supabase tables:

- `health_twins`
- `health_sources`
- `health_lab_parameters`
- `health_wearable_parameters`
- `health_personal_details`
- `health_summary`
- `health_scores`
- `health_recommendations`
- `health_daily_aggregates`
- `health_wellness_programs`
- `health_chat_sessions`
- `health_chat_messages`
- `health_twin_memories`

Storage bucket: `health_documents`.

## Edge functions

| Function | Required behavior |
| --- | --- |
| `process-lab-report` | Securely send the file and twin/source identifiers to the configured n8n lab workflow and return extracted parameters. |
| `chat-completion` | Persist the user message, invoke the n8n health agent, normalize the response, and persist the assistant message. |
| `generate-wellness` | Generate wellness programs for the real twin. |
| `generate-wellness-playground` / `playground-wellness` | Generate guidance for simulated playground state. |

## Integration constraints

1. Browser operations use the authenticated Supabase session and RLS-safe
   access.
2. Vendor credentials and service-role operations remain in Edge Functions.
3. n8n may read curated health data through a read-only database role.
4. Lab parsing must tolerate top-level parameters, body/output wrappers,
   repeated output wrappers, array roots, and JSON-string responses.
5. The system must keep one user's private health data isolated from other
   users.

## Completion standard

The product is complete only when every requirement in
`docs/health-twin/ACCEPTANCE.md` has executable evidence. Source-code presence
alone is not proof that a user flow works.
