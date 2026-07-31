/**
 * Response construction + the proxy failure taxonomy.
 *
 * Moved verbatim from index.ts in L0-5 (pure structural refactor).
 * Lane C owns this module — the failure-taxonomy work (P0-12) lands here.
 */
import { corsHeaders } from '../../_shared/cors.ts'
import { severityForSafetySignal } from './types.ts'
import type { CareSeverity, GuardrailResult } from './types.ts'

export const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

/**
 * The single top-level catch mapping. Behaviour preserved exactly: the thrown
 * message is echoed, 'Consultation not found' becomes 404, everything else 500.
 *
 * P0-16: the body now carries `severity: 'technical'`. A thrown proxy error is
 * by definition an app failure, and the client had no way to know that from the
 * payload — both LibertyMDChat and LibertyMDApp render `error` in the same amber
 * chrome they use for a clinical caution, so a 500 and a red-flag symptom look
 * identical today. Publishing the tier means the client keys presentation off
 * data rather than off which state variable happened to be set (P0-16 AC2).
 *
 * Deliberately NOT changed here: the raw thrown message is still echoed to the
 * client. That is a separate defect — CONTEXT.md §4 "never leak internals into
 * the UI" — and it belongs to the failure-taxonomy work (P0-12, Lane C, which
 * owns this module). Fixing it here would collide with that lane's diff.
 */
export function errorResponse(error: unknown) {
  console.error('LibertyMD care proxy error', error)
  const message = error instanceof Error ? error.message : String(error)
  const status = message === 'Consultation not found' ? 404 : 500
  return jsonResponse({ error: message, severity: 'technical' satisfies CareSeverity }, status)
}

/** How a guardrail call failed. Coarse by design — no error string, no URL, no PHI. */
export type GuardrailFailureKind = 'timeout' | 'transport'

/**
 * P0-14f — the canonical verdict for a guardrail call that failed at the
 * transport level.
 *
 * ## Two things point in opposite directions here, on purpose
 *
 * **The internal posture stays conservative.** `status: 'high_risk_continue'` is
 * what makes `send_message` move the consultation to `high_risk`, what makes
 * `save_demographics` refuse to downgrade an inherited verdict, and what makes
 * `resolveLibertyMDResumeStatus` resume a recovered consult cautiously. A screen
 * that did not run is not a screen that passed. Do not "simplify" this to a
 * pass — that is a false negative, and CONTEXT.md §4 prices those in missed MIs.
 *
 * **The user-facing description is about the app.** The old copy read "The
 * extended safety screen was unavailable. Seek urgent care if symptoms feel
 * severe or dangerous." — a clinical instruction, rendered in amber caution
 * chrome, caused by a socket. Two live `error_fail_cautious` rows are two people
 * told something about their body by a network fault. The message below states
 * what happened, owns it as ours, and gives no clinical instruction, because the
 * system has no clinical finding to report: it failed to look.
 *
 * `source` keeps the value `error_fail_cautious`. It is the discriminator
 * P0-14f AC1 turns on, it is what the production rows already carry, and
 * renaming it would break continuity of the live data.
 *
 * ## Why this lives in `lib/errors.ts` rather than in `lib/safety.ts`
 *
 * So that it can be tested. `lib/safety.ts` transitively imports `lib/config.ts`,
 * which calls `Deno.env.get` at module load, so importing it from
 * `tests/libertymd/` would need `--allow-env` that the `:policy` gate does not
 * grant, and would drag Deno-typed modules into the repo `tsc` program. This
 * module imports only `_shared/cors.ts`. P0-14f AC4 asks for an assertion that a
 * failing guardrail is technical *and* still cautious; that assertion has to be
 * able to construct this value. The *decision* to fail cautious still reads in
 * `lib/safety.ts`, at the `catch` that calls this.
 */
export function guardrailTransportFailureResult(failure: GuardrailFailureKind): GuardrailResult {
  return {
    status: 'high_risk_continue',
    risk_level: 'medium',
    crisis_type: 'guardrail_unavailable',
    force_end: false,
    is_emergency: false,
    care_setting: 'telehealth',
    message: 'A background safety check could not run just now. That is a problem on our side, not a finding about your health. Your consultation is continuing and is being handled carefully.',
    red_flags: [],
    source: 'error_fail_cautious',
    severity: severityForSafetySignal({ status: 'high_risk_continue', source: 'error_fail_cautious' }),
    // P0-14f AC1 — make the transport failure legible in the persisted record and
    // in `safety_state` on the consultation, not only in `source`.
    raw: { screened: false, failure, severity: 'technical' },
  }
}
