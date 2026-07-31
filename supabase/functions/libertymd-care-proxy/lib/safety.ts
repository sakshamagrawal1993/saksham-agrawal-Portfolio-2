/**
 * Safety screening: the deterministic edge screen, the n8n guardrail call, and
 * the safety-event write.
 *
 * Moved verbatim from index.ts in L0-5 (pure structural refactor).
 * Lane B owns this module, together with clinical-policy.ts.
 *
 * Failure-domain rule (CONTEXT.md §3.2): the guardrail verdict is persisted by
 * `saveSafetyEvent` independently of the interview and diagnosis results. If
 * diagnosis fails, the safety verdict has still landed. Do not couple them.
 *
 * Safety asymmetry: on guardrail transport failure this returns
 * `high_risk_continue` / `error_fail_cautious` rather than a pass.
 *
 * P0-14f / P0-16: that fail-cautious *posture* is unchanged, and must stay. What
 * changed is only how it is described to the user. Every result now carries a
 * `severity` derived by `severityForSafetySignal`, and the transport-failure
 * branch carries `severity: 'technical'` with copy about the app rather than
 * about the user's body. Nothing in this file assigns a severity by hand.
 */
import { detectDeterministicEmergency } from '../clinical-policy.ts'
import { GUARDRAIL_WEBHOOK, N8N_TIMEOUT_MS } from './config.ts'
import { guardrailTransportFailureResult } from './errors.ts'
import { normalizeObject, postJson } from './n8n-client.ts'
import { severityForSafetySignal } from './types.ts'
import { limitConsultationMessage } from './utils.ts'
import type { ProxyContext } from './context.ts'
import type { ConsultationRow, GuardrailResult, JsonObject } from './types.ts'

/**
 * The verdict recorded for a turn that accepts user input but carries no free
 * text for the screen to read. P0-14d AC3/AC5.
 *
 * This is **not** a pass issued by the guardrail — nothing was screened. It
 * exists so that every input-accepting turn leaves an auditable
 * `libertymd_safety_events` row, making "this turn was never screened" a fact
 * visible in the data rather than an absence nobody can query for. `source`
 * and `raw.screened` are what distinguish it from a real `pass`; never treat
 * `status: 'pass'` alone as evidence a turn was evaluated.
 *
 * `status`/`risk_level` are constrained by a CHECK on the table, so this cannot
 * invent a fourth status. It deliberately does not touch `safety_state` on the
 * consultation — an unscreened turn must never downgrade an inherited verdict.
 */
export function unscreenedTurnResult(reason: string): GuardrailResult {
  return {
    status: 'pass',
    risk_level: 'low',
    crisis_type: 'none',
    force_end: false,
    is_emergency: false,
    care_setting: 'home',
    message: 'No user free-text was supplied on this turn, so there was nothing to screen.',
    red_flags: [],
    source: 'no_free_text_to_screen',
    // `info`: an unscreened turn is not a technical failure the user needs to
    // hear about — nothing was attempted, so nothing broke. It is an audit fact,
    // not a notice. It renders as plain content, i.e. as nothing at all.
    severity: severityForSafetySignal({ status: 'pass', source: 'no_free_text_to_screen' }),
    raw: { screened: false, reason },
  }
}

/**
 * How a guardrail transport failure is classified, without ever putting an error
 * string into the record. CONTEXT.md §3.5: no PHI and no internals in telemetry,
 * logs or client payloads — and an exception message from a fetch against a URL
 * built from request data is exactly the kind of string that leaks both.
 *
 * `timeout` vs `transport` is the only distinction recorded, and it is drawn
 * from the abort signal rather than from message text.
 */
function classifyGuardrailFailure(error: unknown): 'timeout' | 'transport' {
  const name = error && typeof error === 'object' ? (error as { name?: unknown }).name : undefined
  return name === 'AbortError' || name === 'TimeoutError' ? 'timeout' : 'transport'
}

export async function runGuardrail(
  message: string,
  history: unknown[],
  patient: JsonObject,
  slots: JsonObject,
  timeoutMs = N8N_TIMEOUT_MS.guardrail,
) {
  const local = detectDeterministicEmergency(message)
  if (local) {
    return {
      status: 'force_end',
      risk_level: 'emergency',
      crisis_type: local.crisisType,
      force_end: true,
      is_emergency: true,
      care_setting: 'call_911',
      message: local.message,
      red_flags: [local.crisisType],
      source: 'edge_deterministic',
      severity: severityForSafetySignal({ status: 'force_end', source: 'edge_deterministic' }),
      raw: {},
    } satisfies GuardrailResult
  }

  try {
    const raw = normalizeObject(await postJson(GUARDRAIL_WEBHOOK, { message, history, patient, filled_slots: slots }, timeoutMs))
    const forceEnd = Boolean(raw.force_end || raw.is_emergency || raw.status === 'force_end')
    const status: GuardrailResult['status'] = forceEnd
      ? 'force_end'
      : raw.status === 'high_risk_continue'
        ? 'high_risk_continue'
        : 'pass'
    return {
      status,
      risk_level: String(raw.risk_level || (forceEnd ? 'emergency' : status === 'high_risk_continue' ? 'high' : 'low')) as GuardrailResult['risk_level'],
      crisis_type: String(raw.crisis_type || 'none'),
      force_end: forceEnd,
      is_emergency: forceEnd,
      care_setting: String(raw.care_setting || (forceEnd ? 'call_911' : 'home')),
      message: limitConsultationMessage(raw.message || (forceEnd ? 'Please seek emergency care now.' : 'No emergency detected.')),
      red_flags: Array.isArray(raw.red_flags) ? raw.red_flags.map(String).slice(0, 12) : [],
      source: String(raw.source || 'n8n'),
      severity: severityForSafetySignal({ status, source: String(raw.source || 'n8n') }),
      raw,
    } satisfies GuardrailResult
  } catch (error) {
    console.error('LibertyMD guardrail unavailable', error)
    // ---------------------------------------------------------------- P0-14f
    // Fail cautious. This is the decision; the verdict it produces is defined by
    // `guardrailTransportFailureResult` in lib/errors.ts (which is where it can
    // be imported by a test without dragging in the env-reading module graph —
    // see the doc comment there, and P0-14f AC4).
    //
    // The internal posture is unchanged: `high_risk_continue`, so the consult is
    // still handled conservatively downstream. Only the description the user
    // reads changed, from a clinical instruction to a technical one.
    return guardrailTransportFailureResult(classifyGuardrailFailure(error)) satisfies GuardrailResult
  }
}

/**
 * Persist the verdict for a turn.
 *
 * `severity` is deliberately **not** written as a column: `libertymd_safety_events`
 * has no such column and adding one needs a migration, which is outside this
 * ticket. It does not need one — severity is a pure function of `status` and
 * `source`, both of which are persisted, so `severityForSafetySignal` recovers it
 * from any stored row. Where the classification is not recoverable from `source`
 * alone (the transport-failure branch) it is also written into `raw_result`.
 */
export async function saveSafetyEvent(
  ctx: ProxyContext,
  consultation: ConsultationRow,
  result: GuardrailResult,
  turnCount: number,
) {
  const { error } = await ctx.db.from('libertymd_safety_events').insert({
    consultation_id: consultation.id,
    user_id: ctx.user.id,
    turn_count: turnCount,
    status: result.status,
    risk_level: result.risk_level,
    crisis_type: result.crisis_type,
    care_setting: result.care_setting,
    force_end: result.force_end,
    message: result.message,
    red_flags: result.red_flags,
    source: result.source,
    raw_result: result.raw,
  })
  if (error) throw error
}
