# Mind Coach Session-End Webhook Contract (Single Workflow, 3 AI Agents)

This contract is used by `supabase/functions/mind-coach-session-end/index.ts` when calling:

- `MC_N8N_SESSION_END_WEBHOOK_URL`

The workflow is a single orchestrator with three parallel AI branches:

1. Memory Agent
2. Summary Agent
3. Readiness Agent

The workflow merges all branch outputs and returns one final JSON payload.

## Required webhook input (to n8n)

```json
{
  "session_id": "11111111-1111-1111-1111-111111111111",
  "profile_id": "22222222-2222-2222-2222-222222222222",
  "messages": [
    { "role": "user", "content": "I spiraled before my team presentation.", "created_at": "2026-03-27T10:01:00.000Z" },
    { "role": "assistant", "content": "What thoughts showed up right before the spiral?", "created_at": "2026-03-27T10:01:25.000Z" },
    { "role": "user", "content": "That everyone would think I am incompetent.", "created_at": "2026-03-27T10:02:02.000Z" }
  ],
  "transcript": "Client: I spiraled before my team presentation.\nTherapist: What thoughts showed up right before the spiral?\nClient: That everyone would think I am incompetent.",
  "profile": {
    "id": "22222222-2222-2222-2222-222222222222",
    "name": "Aarav",
    "age": 29,
    "gender": "male",
    "concerns": ["anxiety", "overthinking"],
    "therapist_persona": "maya"
  },
  "session": {
    "pathway": "anxiety_and_stress_management",
    "dynamic_theme": "Performance anxiety",
    "session_number": 4
  },
  "phase_context": {
    "current_phase_index": 1,
    "total_phases": 4,
    "current_phase": {
      "phase_number": 2,
      "name": "Cognitive Reframing",
      "goal": "Identify and restructure anxious thought loops"
    },
    "next_phase": {
      "phase_number": 3,
      "name": "Behavioral Practice",
      "goal": "Apply skills in real-world triggers"
    },
    "completed_in_current_phase": 2,
    "target_sessions_in_current_phase": 3
  },
  "current_memory": {
    "memory_text": "Aarav experiences anticipatory anxiety before public speaking and tends to catastrophize peer judgment.",
    "memory_type": "life_context",
    "created_at": "2026-03-25T09:00:00.000Z"
  },
  "recent_case_notes": [
    {
      "dynamic_theme": "Fear of negative evaluation",
      "phase_progress": "Can identify automatic thoughts but struggles to challenge them independently"
    }
  ],
  "active_tasks": [
    {
      "task_type": "journaling",
      "dynamic_title": "Thought log before meetings",
      "dynamic_description": "Capture trigger-thought-emotion for each major meeting",
      "status": "active"
    }
  ],
  "assessments": [
    { "assessment_type": "gad7", "total_score": 11, "severity": "moderate", "created_at": "2026-03-20T08:00:00.000Z" }
  ],
  "mood_entries": [
    { "score": 5, "notes": "Nervous before standup", "created_at": "2026-03-26T07:45:00.000Z" },
    { "score": 7, "notes": "Felt better after breathing", "created_at": "2026-03-27T11:00:00.000Z" }
  ]
}
```

## Required final workflow response (from n8n)

```json
{
  "case_notes": {
    "presenting_concern": "Performance-related anxiety with fear of negative evaluation in workplace meetings.",
    "dynamic_theme": "Catastrophic thinking around competence and judgment.",
    "phase_progress": "Client can now identify key automatic thoughts and began testing alternative interpretations with prompts.",
    "readiness_for_next_phase": "approaching",
    "risk_level": "low",
    "requires_escalation": false,
    "crisis_detected": false,
    "readiness_rationale": "Near target session count and improving cognitive insight, but independent use of reframing remains inconsistent.",
    "readiness_confidence": 0.81
  },
  "session_summary": {
    "title": "From Spiral to Signal",
    "opening_reflection": "You named the fear beneath meeting anxiety and began reframing it with more balanced evidence.",
    "quote_of_the_day": "The thought is loud, but it is not the whole truth.",
    "energy_shift": { "start": "Anxious", "end": "More grounded" },
    "psychological_flexibility": {
      "self_awareness": 74,
      "observation": 70,
      "physical_awareness": 63,
      "core_values": 66,
      "relationships": 60
    },
    "self_compassion_score": 58
  },
  "extracted_tasks": [
    {
      "task_type": "cognitive_reframing",
      "dynamic_title": "2-Minute Evidence Check Before Meetings",
      "dynamic_description": "Before each key meeting, write one feared prediction and two realistic alternative outcomes based on past evidence.",
      "frequency": "situational",
      "suggested_duration_days": 7
    }
  ],
  "extracted_memories": [
    {
      "memory_text": "Aarav shows persistent anticipatory workplace anxiety driven by fear of being judged as incompetent; he is improving in identifying automatic catastrophic thoughts and benefits from brief pre-event reframing plus breathing regulation.",
      "memory_type": "life_context"
    }
  ],
  "agent_meta": {
    "memory_agent_model": "gpt-4o-mini",
    "summary_agent_model": "gpt-4o-mini",
    "readiness_agent_model": "gpt-4o-mini"
  }
}
```

### Transition fields required by backend policy

`mind-coach-session-end` now applies a canonical **strictReady** transition policy. n8n should emit these fields explicitly:

```json
{
  "objective_met": true,
  "completion_score": 0.82,
  "objective_confidence": 0.79,
  "recommended_adjustments": {
    "prompt_style": "reinforce evidence log"
  },
  "session_transition": {
    "objective_met": true,
    "session_transition": true,
    "recommended_next_action": "advance"
  },
  "phase_transition": {
    "phase_transition": false,
    "should_advance": false,
    "rationale": "readiness approaching, continue current phase"
  }
}
```

Canonical response is a single JSON object. The edge function tolerates array-wrapped payloads for backward compatibility, but new workflows should return an object.

## Fields used by edge function

- **Required for persistence/UI**
  - `case_notes`
  - `session_summary`
  - `extracted_tasks` (array, can be empty)
  - `extracted_memories` (array, can be empty)
- **Progression logic uses**
  - `case_notes.readiness_for_next_phase`
  - `objective_met`
  - `completion_score`
  - `objective_confidence` (optional, persisted)
  - `session_transition.*` and `phase_transition.*` (optional hints, normalized against policy)
- **Optional risk guards recognized**
  - `case_notes.risk_level` (`high`/`critical` blocks max-session fallback)
  - `case_notes.requires_escalation` (boolean)
  - `case_notes.crisis_detected` (boolean)

## Canonical transition policy (`strictReady`)

Order of precedence for contradictions:

1. **Risk gate wins**: if `risk_level` is high/critical, `crisis_detected=true`, or escalation is required, session cannot advance.
2. **Objective gate second**: session transition is based on `objective_met` (or deterministic fallback from `completion_score` + template threshold).
3. **Phase gate third**: phase advance requires all of:
   - no major risk,
   - objective met,
   - readiness is `ready`,
   - phase objectives complete (or max-session fallback).

If workflow signals conflict with this precedence (example: `phase_transition=true` while `objective_met=false`), backend normalizes to policy and records conflict tags in transition metadata.

## Response returned by edge function to frontend

The `mind-coach-session-end` edge function returns:

- `case_notes`
- `session_summary`
- `extracted_tasks`
- `extracted_memories`
- `agent_meta` (if provided by n8n)
- `memories_stored`
- `tasks_stored`
- `phase_transition_result`

## Validation matrix

1. Complete payload: all three branches return valid schema and merged response is valid.
2. `messages` empty + `transcript` present: workflow still returns valid output.
3. Missing `current_memory`: memory branch still returns one consolidated `life_context` memory.
4. Readiness result is `ready`: edge function applies phase gate logic (not direct unconditional advancement).
5. One branch parser fails: workflow should return an explicit error instead of partial malformed output.

## Dummy webhook for local testing

A local mock endpoint is available at:

- `scripts/mind-coach-session-end-dummy-webhook.mjs`

Run:

```bash
MC_N8N_WEBHOOK_SECRET=placeholder-secret node scripts/mind-coach-session-end-dummy-webhook.mjs
```

Point the edge function env var to:

- `MC_N8N_SESSION_END_WEBHOOK_URL=http://localhost:8787/webhook/mind-coach-session-end`
