# P0-13 · Proxy hard invariants

## Story
As a LibertyMD patient, clinical state transitions must remain bounded, terminal, typed, and scoped to my identity even when a caller attempts an invalid operation.

## Acceptance
- Turn 16 is rejected.
- Interview and Diagnosis inference are rejected after `emergency_stopped`.
- A message type outside the database enum is rejected before insert.
- A JWT subject cannot update another user's consultation.
- Each rejection is exercised by an automated test.

## Manifest
- `tests/libertymd/proxy-invariants.mts`
- `supabase/functions/libertymd-care-proxy/actions/save-demographics.ts`
- `package.json`
- `loop/loop.sh`
- `tickets/P0-13/`
