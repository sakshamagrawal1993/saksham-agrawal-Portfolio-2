# P0-13 · Clarified contract

## Scope
Close AC5 with adversarial Deno tests using the existing proxy doubles. Do not duplicate invariant logic in tests.

## Test contract
1. Attempt `nextTurnCount = 16`; require the `max_turns` invariant error.
2. Attempt both Interview and Diagnosis calls with `status = emergency_stopped`; require typed rejection and zero fetches.
3. Attempt `message_type = question`; require typed rejection and zero message inserts.
4. Attempt a consultation update where the row owner differs from the JWT subject; require 404-style rejection and zero updates.

## Ownership defect
Route both `save-demographics.ts` consultation writes through `updateOwnedConsultation`, which asserts row ownership and attaches `id` plus `user_id` filters.

## Gates
Add `test:libertymd:invariants` to the aggregate CI script and delivery-loop gate list. Existing gates must remain unchanged otherwise.

## Manifest
- `tests/libertymd/proxy-invariants.mts`
- `supabase/functions/libertymd-care-proxy/actions/save-demographics.ts`
- `package.json`
- `loop/loop.sh`
- `tickets/P0-13/01-story.md`
- `tickets/P0-13/03-clarified.md`
- `tickets/P0-13/04-implementation.md`
- `tickets/P0-13/diff.patch`
