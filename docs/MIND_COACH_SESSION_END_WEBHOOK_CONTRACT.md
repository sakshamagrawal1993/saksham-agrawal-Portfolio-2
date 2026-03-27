# Mind Coach Session-End Webhook Contract

This is the response shape expected by `supabase/functions/mind-coach-session-end/index.ts`.

## Required top-level JSON

```json
{
  "case_notes": {
    "presenting_concern": "string",
    "dynamic_theme": "string",
    "phase_progress": "string",
    "readiness_for_next_phase": "not_ready | approaching | ready"
  },
  "session_summary": {
    "title": "string",
    "opening_reflection": "string",
    "quote_of_the_day": "string",
    "energy_shift": { "start": "string", "end": "string" },
    "psychological_flexibility": {
      "self_awareness": 0,
      "observation": 0,
      "physical_awareness": 0,
      "core_values": 0,
      "relationships": 0
    },
    "self_compassion_score": 0
  },
  "extracted_tasks": [],
  "extracted_memories": []
}
```

## Fields used by edge function

- **Required for persistence/UI**
  - `case_notes`
  - `session_summary`
  - `extracted_tasks` (array, can be empty)
  - `extracted_memories` (array, can be empty)
- **Progression logic uses**
  - `case_notes.readiness_for_next_phase` (`ready` advances when min sessions are met)
- **Optional risk guards recognized**
  - `case_notes.risk_level` (`high`/`critical` blocks max-session fallback)
  - `case_notes.requires_escalation` (boolean)
  - `case_notes.crisis_detected` (boolean)
  - `session_summary.requires_escalation` (boolean)
  - `session_summary.crisis_detected` (boolean)

## Dummy webhook for local testing

A local mock endpoint is provided at:

- `scripts/mind-coach-session-end-dummy-webhook.mjs`

Run:

```bash
MC_N8N_WEBHOOK_SECRET=placeholder-secret node scripts/mind-coach-session-end-dummy-webhook.mjs
```

Then point your edge env var to:

- `MC_N8N_SESSION_END_WEBHOOK_URL=http://localhost:8787/webhook/mind-coach-session-end`

The mock returns a valid payload including optional risk fields and realistic task/memory arrays.
