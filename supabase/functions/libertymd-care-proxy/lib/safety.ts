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
 *
 * P0-14c: edge firings carry an optional internal `match` audit object. It is
 * merged into `libertymd_safety_events.raw_result` only. Client-facing `raw`
 * and every HTTP `safety:` payload omit it via `toClientSafety`.
 *
 * P0-15a: after an `edge_deterministic` force_end, an optional observational
 * LLM shadow may be scheduled from `saveSafetyEvent` (flag on). It never alters
 * acted-on columns, copy, consult status, or the HTTP body, and never trips
 * `N8N_BREAKER.guardrail` (`postJson(..., stage: null)`).
 */
import { detectDeterministicEmergency } from '../clinical-policy.ts'
import {
  applyCanonicalForceEndCopy,
  applyCanonicalForceEndCopyResolved,
  type EmergencyResolveOptions,
} from './emergency-copy.ts'
import {
  GUARDRAIL_SHADOW_TIMEOUT_MS,
  GUARDRAIL_WEBHOOK,
  isGuardrailShadowLlmEnabled,
  N8N_TIMEOUT_MS,
} from './config.ts'
import { guardrailTransportFailureResult } from './errors.ts'
import { enforceCardioRespiratoryEmergencySpecificity } from './emergency-specificity.ts'
import { normalizeObject, postJson, revokeStageSuccessAsFailure } from './n8n-client.ts'
import { severityForSafetySignal } from './types.ts'
import { buildConversationTranscript, buildDenseContext, buildQASummary, formatHistoryForInference, limitConsultationMessage } from './utils.ts'
import type { ProxyContext } from './context.ts'
import type {
  ConsultationRow,
  GuardrailMatchAudit,
  GuardrailResult,
  GuardrailScreenContext,
  JsonObject,
  ShadowLlmOutcome,
  ShadowLlmPayload,
  ShadowLlmStatus,
} from './types.ts'

/** Nine verdict keys allowed in client-facing `raw` and in `raw_result` (plus optional `match` / `shadow_llm`). */
export const GUARDRAIL_VERDICT_RAW_KEYS = [
  'status',
  'risk_level',
  'crisis_type',
  'force_end',
  'is_emergency',
  'care_setting',
  'message',
  'red_flags',
  'source',
] as const

const TRANSCRIPT_RAW_KEYS = new Set(['message_text', 'history', 'patient', 'match', 'shadow_llm'])

/** Persist-time span bound (AC5/AC7). Detector keeps a tighter ≤64 guard. */
export const MATCH_SPAN_MAX_CHARS = 120

/** Categorical-only keys allowed under `raw_result.shadow_llm` (P0-15a). */
export const SHADOW_LLM_RAW_KEYS = [
  'status',
  'force_end',
  'crisis_type',
  'care_setting',
  'outcome',
  'shadow_llm_status',
] as const

function verdictRawFromResult(result: Omit<GuardrailResult, 'raw' | 'match' | 'severity'> & {
  severity?: GuardrailResult['severity']
  red_flags: string[]
}): JsonObject {
  return {
    status: result.status,
    risk_level: result.risk_level,
    crisis_type: result.crisis_type,
    force_end: result.force_end,
    is_emergency: result.is_emergency,
    care_setting: result.care_setting,
    message: result.message,
    red_flags: result.red_flags,
    source: result.source,
  }
}

/**
 * Keep only the nine verdict keys from an n8n webhook blob. Drops transcript
 * echo fields (`message_text` / `history` / `patient`) and unknown blobs (AC8).
 */
export function allowListGuardrailRaw(raw: JsonObject): JsonObject {
  const out: JsonObject = {}
  for (const key of GUARDRAIL_VERDICT_RAW_KEYS) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) out[key] = raw[key]
  }
  return out
}

function stripForbiddenRawKeys(raw: JsonObject): JsonObject {
  const out: JsonObject = {}
  for (const [key, value] of Object.entries(raw)) {
    if (TRANSCRIPT_RAW_KEYS.has(key)) continue
    out[key] = value
  }
  return out
}

export function clampMatchAudit(match: GuardrailMatchAudit): GuardrailMatchAudit {
  const spanEnd = Math.min(match.span_end, match.span_start + MATCH_SPAN_MAX_CHARS)
  return {
    rule_id: match.rule_id,
    span: match.span.slice(0, MATCH_SPAN_MAX_CHARS),
    span_start: match.span_start,
    span_end: spanEnd,
    pattern_set_version: match.pattern_set_version,
    lane: 'edge',
  }
}

/**
 * PHI-free shadow sibling. Never stores LLM `message`, spans, or transcripts.
 */
export function allowListShadowLlm(payload: ShadowLlmPayload): ShadowLlmPayload {
  return {
    status: String(payload.status || 'pass'),
    force_end: Boolean(payload.force_end),
    crisis_type: String(payload.crisis_type || 'none'),
    care_setting: String(payload.care_setting || 'home'),
    outcome: payload.outcome,
    shadow_llm_status: payload.shadow_llm_status,
  }
}

/**
 * Strip audit-only fields before any HTTP `safety:` response. `raw` is already
 * client-safe by construction on the edge/n8n paths that set it.
 */
export function toClientSafety(result: GuardrailResult): GuardrailResult {
  const { match: _omit, ...client } = result
  if (client.raw && typeof client.raw === 'object' && ('shadow_llm' in client.raw || 'match' in client.raw)) {
    const { match: _m, shadow_llm: _s, ...raw } = client.raw as JsonObject & {
      match?: unknown
      shadow_llm?: unknown
    }
    return { ...client, raw }
  }
  return client
}

/**
 * Compose the row written to `libertymd_safety_events.raw_result`.
 *
 * - Edge force-end: nine verdict keys + `match`.
 * - n8n: allow-listed nine keys only (no transcript echo).
 * - Special sources (`error_fail_cautious`, `no_free_text_to_screen`): keep their
 *   existing metadata blobs, still stripped of forbidden keys.
 * - `shadow_llm` is never composed here — it is merged later via async UPDATE
 *   (P0-15a) so the sync return / `safety_state` stay free of it.
 */
export function composeSafetyRawResult(result: GuardrailResult): JsonObject {
  const isSpecialAuditRaw = result.source === 'error_fail_cautious'
    || result.source === 'no_free_text_to_screen'

  const base = isSpecialAuditRaw
    ? stripForbiddenRawKeys(result.raw)
    : {
      ...allowListGuardrailRaw(result.raw),
      // Result fields win so post-canonicalization message stays authoritative.
      ...verdictRawFromResult(result),
    }

  if (!result.match) return base
  return { ...base, match: clampMatchAudit(result.match) }
}

/**
 * Merge an allow-listed shadow sibling onto a previously composed raw_result.
 * Explicit sibling key — never via wholesale `raw` (P0-14c discipline).
 */
export function mergeShadowLlmIntoRawResult(rawResult: JsonObject, shadow: ShadowLlmPayload): JsonObject {
  return { ...rawResult, shadow_llm: allowListShadowLlm(shadow) }
}

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

/**
 * P0-08 AC3 / Q1 — a body cannot support a trusted screen when it has neither a
 * valid `status` nor a usable `force_end` / `is_emergency` signal. Empty `{}`
 * is included. Malformed HTTP 200 must never become `pass` / "No emergency detected."
 */
export function isUsableGuardrailPayload(raw: JsonObject): boolean {
  const status = raw.status
  const hasValidStatus = status === 'pass'
    || status === 'high_risk_continue'
    || status === 'force_end'
  const hasEmergencySignal = Boolean(
    raw.force_end
    || raw.is_emergency
    || status === 'force_end',
  )
  return hasValidStatus || hasEmergencySignal
}

function shadowStatusForOutcome(
  outcome: ShadowLlmOutcome,
  forceEnd: boolean,
): ShadowLlmStatus {
  if (outcome === 'timeout') return 'timeout'
  if (outcome === 'transport' || outcome === 'error') return 'error'
  return forceEnd ? 'agreed_force_end' : 'disagreed'
}

function scheduleDetached(task: Promise<unknown>) {
  const edgeRuntime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void }
  }).EdgeRuntime
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(task)
    return
  }
  // Detached fallback: never await on the request path; swallow rejections.
  void task.catch(() => {})
}

function extractInsertedId(data: unknown): string | null {
  if (Array.isArray(data) && data[0] && typeof data[0] === 'object') {
    const id = (data[0] as { id?: unknown }).id
    return typeof id === 'string' && id ? id : null
  }
  if (data && typeof data === 'object') {
    const id = (data as { id?: unknown }).id
    return typeof id === 'string' && id ? id : null
  }
  return null
}

/**
 * Observational LLM shadow. Best-effort: failures leave `shadow_llm` absent and
 * never fail the user request. Uses `postJson(..., stage: null)` so hangs/fails
 * cannot open `N8N_BREAKER.guardrail`.
 */
async function runGuardrailShadowLlm(
  ctx: ProxyContext,
  safetyEventId: string,
  baseRawResult: JsonObject,
  screen: GuardrailScreenContext,
  correlationId?: string | null,
): Promise<void> {
  let payload: ShadowLlmPayload
  try {
    // Reuse parent turn correlation when available (P0-07 Q1); distinguish via
    // target `guardrail_shadow` / `shadow_llm: true` — never log message/history.
    const webhookRaw = normalizeObject(await postJson(
      GUARDRAIL_WEBHOOK,
      {
        message: screen.message,
        history: screen.history,
        patient: screen.patient,
        shadow_llm: true,
        skip_deterministic: true,
      },
      GUARDRAIL_SHADOW_TIMEOUT_MS,
      null,
      {
        correlationId: correlationId || undefined,
        shadowLlm: true,
      },
    ))
    const forceEnd = Boolean(
      webhookRaw.force_end || webhookRaw.is_emergency || webhookRaw.status === 'force_end',
    )
    const status = forceEnd
      ? 'force_end'
      : webhookRaw.status === 'high_risk_continue'
        ? 'high_risk_continue'
        : 'pass'
    const outcome: ShadowLlmOutcome = 'completed'
    payload = allowListShadowLlm({
      status,
      force_end: forceEnd,
      crisis_type: String(webhookRaw.crisis_type || 'none'),
      care_setting: String(webhookRaw.care_setting || (forceEnd ? 'call_911' : 'home')),
      outcome,
      shadow_llm_status: shadowStatusForOutcome(outcome, forceEnd),
    })
  } catch (error) {
    const failure = classifyGuardrailFailure(error)
    const outcome: ShadowLlmOutcome = failure === 'timeout' ? 'timeout' : 'transport'
    payload = allowListShadowLlm({
      status: 'unknown',
      force_end: false,
      crisis_type: 'none',
      care_setting: 'home',
      outcome,
      shadow_llm_status: shadowStatusForOutcome(outcome, false),
    })
  }

  try {
    const { error } = await ctx.db
      .from('libertymd_safety_events')
      .update({ raw_result: mergeShadowLlmIntoRawResult(baseRawResult, payload) })
      .eq('id', safetyEventId)
    if (error) {
      // Best-effort only — never surface to the user path.
      console.warn('LibertyMD shadow_llm persist skipped', { outcome: 'update_failed' })
    }
  } catch {
    console.warn('LibertyMD shadow_llm persist skipped', { outcome: 'update_failed' })
  }
}

function i18nResolveLog(event: string, props: Record<string, string | number | boolean>) {
  // Key-name / table only — never PHI / symptom text (P3-08 telemetry).
  console.warn(JSON.stringify({ scope: 'libertymd_i18n', event, ...props }))
}

/**
 * P3-08 · Canonicalize force_end patient-facing copy via catalog + region when
 * `resolveOpts` is provided; otherwise fixture (hermetic / degraded).
 */
async function canonicalizeForceEnd(
  result: GuardrailResult,
  resolveOpts?: EmergencyResolveOptions,
): Promise<GuardrailResult> {
  if (resolveOpts) {
    return await applyCanonicalForceEndCopyResolved(result, {
      ...resolveOpts,
      log: resolveOpts.log || i18nResolveLog,
    })
  }
  return applyCanonicalForceEndCopy(result)
}

export async function runGuardrail(
  message: string,
  history: unknown[],
  patient: JsonObject,
  slots: JsonObject,
  timeoutMs = N8N_TIMEOUT_MS.guardrail,
  correlationId?: string | null,
  /** P3-08 catalog/region resolve options (db + region + language). */
  resolveOpts?: EmergencyResolveOptions,
): Promise<GuardrailResult> {
  const local = detectDeterministicEmergency(message)
  if (local) {
    const core = {
      status: 'force_end' as const,
      risk_level: 'emergency' as const,
      crisis_type: local.crisisType,
      force_end: true,
      is_emergency: true,
      care_setting: local.careSetting,
      message: local.message,
      red_flags: [local.crisisType],
      source: 'edge_deterministic',
    }
    const match = clampMatchAudit({
      rule_id: local.patternId,
      span: local.matchedSpan,
      span_start: local.spanStart,
      span_end: local.spanEnd,
      pattern_set_version: local.patternSetVersion,
      lane: 'edge',
    })
    // P0-17 / P3-08: canonicalize patient-facing detail (+ emergency_copy wire).
    return await canonicalizeForceEnd({
      ...core,
      severity: severityForSafetySignal({ status: 'force_end', source: 'edge_deterministic' }),
      // Client-safe nine keys only — never `match` / `shadow_llm` (AC9/AC10 / P0-15a).
      raw: verdictRawFromResult(core),
      match,
    } satisfies GuardrailResult, resolveOpts)
  }

  try {
    const formattedHistory = formatHistoryForInference(history)
    const transcriptText = buildConversationTranscript(history)
    const qaSummaryText = buildQASummary(history)
    const denseContextText = buildDenseContext(history, patient, slots)
    const webhookRaw = normalizeObject(await postJson(
      GUARDRAIL_WEBHOOK,
      {
        message,
        history: formattedHistory,
        conversation_transcript: transcriptText,
        transcript: transcriptText,
        history_text: transcriptText,
        qa_summary: qaSummaryText,
        dense_context: denseContextText,
        patient,
        filled_slots: slots,
      },
      timeoutMs,
      undefined,
      { correlationId: correlationId || undefined },
    ))
    // P0-08 AC3: unusable/empty HTTP 200 → same fail-cautious technical path as transport.
    if (!isUsableGuardrailPayload(webhookRaw)) {
      revokeStageSuccessAsFailure('guardrail')
      return guardrailTransportFailureResult('malformed_payload') satisfies GuardrailResult
    }
    const screenedRaw = enforceCardioRespiratoryEmergencySpecificity(
      webhookRaw,
      message,
      history,
      resolveOpts?.language,
    )
    const forceEnd = Boolean(screenedRaw.force_end || screenedRaw.is_emergency || screenedRaw.status === 'force_end')
    const requestedStatus: GuardrailResult['status'] = forceEnd
      ? 'force_end'
      : screenedRaw.status === 'high_risk_continue'
        ? 'high_risk_continue'
        : 'pass'
    const riskLevel = String(screenedRaw.risk_level || (forceEnd ? 'emergency' : requestedStatus === 'high_risk_continue' ? 'high' : 'low')) as GuardrailResult['risk_level']
    const crisisType = String(screenedRaw.crisis_type || 'none')
    const redFlags = Array.isArray(screenedRaw.red_flags) ? screenedRaw.red_flags.map(String).filter(Boolean).slice(0, 12) : []
    // The LLM occasionally returned the internally contradictory combination
    // high_risk_continue + low risk + no crisis + no red flags for routine
    // symptoms. That briefly put benign consultations into the user-facing
    // high-risk state even though the same verdict explicitly said there was
    // no emergency. Normalize that exact contradiction to pass. Medium/high
    // risk, a named crisis, any red flag, transport failures, and force_end are
    // deliberately untouched.
    const lowRiskFalsePositive = !forceEnd
      && requestedStatus === 'high_risk_continue'
      && riskLevel === 'low'
      && crisisType === 'none'
      && redFlags.length === 0
    const status: GuardrailResult['status'] = lowRiskFalsePositive ? 'pass' : requestedStatus
    const core = {
      status,
      risk_level: riskLevel,
      crisis_type: crisisType,
      force_end: forceEnd,
      is_emergency: forceEnd,
      care_setting: String(screenedRaw.care_setting || (forceEnd ? 'call_911' : 'home')),
      message: limitConsultationMessage(screenedRaw.message || (forceEnd ? 'Please seek emergency care now.' : 'No emergency detected.')),
      red_flags: redFlags,
      source: lowRiskFalsePositive
        ? 'n8n_low_risk_normalized'
        : String(screenedRaw.source || 'n8n'),
    }
    const result = {
      ...core,
      severity: severityForSafetySignal({ status, source: core.source }),
      // Allow-list before assign/persist — drop n8n transcript echo (AC8).
      raw: allowListGuardrailRaw({ ...screenedRaw, ...verdictRawFromResult(core) }),
    } satisfies GuardrailResult
    // P0-17 / P3-08: overwrite model-authored force_end messages with catalog/fixture.
    return forceEnd ? await canonicalizeForceEnd(result, resolveOpts) : result
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
 *
 * P0-14c: `match` is merged into `raw_result` here and nowhere else. Rollback is
 * a one-line revert of `composeSafetyRawResult` — no migration, no n8n redeploy.
 *
 * P0-15a: when `edge_deterministic` + `force_end` + flag on + screen context,
 * schedules an observational LLM shadow after insert (never awaited). Acted-on
 * columns are already written and are never rewritten by the shadow UPDATE.
 */
export async function saveSafetyEvent(
  ctx: ProxyContext,
  consultation: ConsultationRow,
  result: GuardrailResult,
  turnCount: number,
  screenContext?: GuardrailScreenContext,
  correlationId?: string | null,
) {
  const rawResult = composeSafetyRawResult(result)
  const { data, error } = await ctx.db.from('libertymd_safety_events').insert({
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
    raw_result: rawResult,
  }).select('id')
  if (error) throw error

  const safetyEventId = extractInsertedId(data)
  if (
    safetyEventId
    && result.source === 'edge_deterministic'
    && result.force_end
    && isGuardrailShadowLlmEnabled()
    && screenContext
  ) {
    scheduleDetached(runGuardrailShadowLlm(ctx, safetyEventId, rawResult, screenContext, correlationId))
  }
}
