/**
 * Test doubles for the LibertyMD care proxy. P0-11 / P0-13.
 *
 * ## Why `.mts` and not `.test.ts`
 *
 * The repo's `tsconfig.json` includes a recursive `.ts` glob and cannot be
 * edited from this ticket's manifest. A `.ts` test that imports the proxy's
 * `lib/` modules drags `lib/config.ts` (`Deno.env`) and `lib/context.ts`
 * (`https://esm.sh/@supabase/supabase-js@2`) into the repo-wide typecheck, where
 * neither resolves — around a dozen new `error TS` lines against a baseline of
 * exactly 103, i.e. a failed gate for reasons that have nothing to do with the
 * code under test. That recursive `.ts` glob does not match `.mts`, Deno runs
 * and type-checks `.mts` natively, so the tests are fully checked by
 * `deno test` while the repo-wide count stays at 103.
 *
 * NOTE: never write a star-star slash star.ts sequence inside a block comment —
 * the slash-star closes the comment early and the file cannot parse (Defect 5).
 *
 * `declare const Deno` (rather than a Deno ns triple-slash reference) is part
 * of the same discipline: it is erased at runtime, so the real global is used.
 *
 * ## What these doubles are for
 *
 * `handleSendMessage` is where three of P0-13's four invariants are actually
 * reachable, and none of them can be exercised without a database. There is no
 * local Supabase stack in `:ci` (`test:libertymd:db` is NOT RUN per
 * BASELINE.md), so the service-role client is stubbed at the query-builder
 * level. Every operation is recorded, which is what lets a test assert the
 * interesting negative: that a rejected write *did not happen*.
 */
import type { ProxyContext } from '../../../supabase/functions/libertymd-care-proxy/lib/context.ts'
import type { ConsultationRow } from '../../../supabase/functions/libertymd-care-proxy/lib/types.ts'

export interface RecordedOp {
  table: string
  kind: 'select' | 'insert' | 'update' | 'upsert' | 'rpc'
  payload?: unknown
  filters: Array<{ column: string; value: unknown }>
  columns?: string
  cardinality: 'many' | 'single' | 'maybeSingle'
  /** Recorded `.order(column, { ascending })` calls (P0-17 Q5 proofs). */
  orders?: Array<{ column: string; ascending?: boolean }>
  limitCount?: number
}

export interface Settled {
  data?: unknown
  error?: unknown
}

export type OpResolver = (op: RecordedOp) => Settled

/**
 * A minimal stand-in for a supabase-js query builder: chainable, thenable, and
 * it records what was asked for. Only the surface the proxy actually uses is
 * implemented — anything else should fail loudly rather than silently no-op.
 */
class QueryBuilder implements PromiseLike<Settled> {
  constructor(private readonly op: RecordedOp, private readonly resolver: OpResolver) {}

  select(columns?: string) {
    this.op.columns = columns
    return this
  }

  eq(column: string, value: unknown) {
    this.op.filters.push({ column, value })
    return this
  }

  is(column: string, value: unknown) {
    this.op.filters.push({ column, value })
    return this
  }

  in(column: string, value: unknown) {
    this.op.filters.push({ column, value })
    return this
  }

  order(column?: string, options?: { ascending?: boolean }) {
    if (column) {
      this.op.orders = this.op.orders ?? []
      this.op.orders.push({ column, ascending: options?.ascending })
    }
    return this
  }

  limit(count: number) {
    this.op.limitCount = count
    return this
  }

  single() {
    this.op.cardinality = 'single'
    return this
  }

  maybeSingle() {
    this.op.cardinality = 'maybeSingle'
    return this
  }

  then<TResult1 = Settled, TResult2 = never>(
    onfulfilled?: ((value: Settled) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const settled = this.resolver(this.op)
    return Promise.resolve({ data: settled.data ?? null, error: settled.error ?? null })
      .then(onfulfilled, onrejected)
  }
}

export interface FakeDbOptions {
  consultation?: ConsultationRow | null
  profile?: Record<string, unknown> | null
  patient?: Record<string, unknown> | null
  /**
   * P1-03 — when set, patient list selects (cardinality many) return this array.
   * Single/maybeSingle still prefer `patient` (or patients[0]).
   */
  patients?: Array<Record<string, unknown>>
  history?: unknown[]
  /**
   * P4-03 — consultation list returned by `historySummary` (cardinality many).
   * Single/maybeSingle still prefer `consultation`.
   */
  historyConsultations?: Array<Record<string, unknown>>
  /**
   * P4-03 — report rows for history enrichment (`.in('consultation_id', …)` many).
   * Single/maybeSingle still prefer `report` / `storedReport`.
   */
  historyReports?: Array<Record<string, unknown>>
  /** Row returned by the `libertymd_reports` lookup on the turn-cap / orphan path. */
  report?: Record<string, unknown> | null
  /**
   * When true, message select for `message_type = report_gate` returns a stub
   * row (P2-07 detect-or-skip duplicate gate message).
   */
  reportGateMessage?: boolean
  /**
   * When true, `libertymd_reports` insert returns unique-violation (23505) so
   * `ensureReportInserted` exercises conflict → re-select. Optionally seed the
   * "winning" row via `reportConflictExisting` (defaults to a minimal stub).
   */
  reportInsertConflict?: boolean
  /** Existing row materialised when `reportInsertConflict` fires. */
  reportConflictExisting?: Record<string, unknown> | null
  /**
   * Latest terminal safety row for `get_consultation` (P0-17 AC14).
   * When null/undefined, force_end lookup returns no row → omit classification fields.
   */
  terminalSafety?: Record<string, unknown> | null
  /**
   * Latest speculative diagnostic run row for P1-08 cache lookup
   * (`findLatestSpeculativeDiagnosticRun`). When null/undefined, select returns null.
   */
  speculativeDiagnosticRun?: Record<string, unknown> | null
  /** Result of the request-lease claim RPC. */
  claim?: Record<string, unknown>
  /** Rows matched by consultation updates. `null` simulates an unowned target. */
  updateMatches?: boolean
  /**
   * P1-19 — landing session row returned by select / upsert.
   * When null/undefined on select-by-id, returns null (unknown id → NULL FK).
   */
  landingSession?: Record<string, unknown> | null
  /** When true, landing upsert/select returns an error (attribution soft-fail). */
  landingSessionError?: boolean
  /**
   * P2-10 — existing feedback row (select). When `feedbackInsertConflict` is true,
   * insert returns unique-violation 23505.
   */
  reportFeedback?: Record<string, unknown> | null
  /** When true, `libertymd_report_feedback` insert returns 23505. */
  feedbackInsertConflict?: boolean
  /**
   * P2-08 — delivery-token row. Select by token_hash returns matching row.
   */
  deliveryToken?: Record<string, unknown> | null
  /** When true, delivery-token insert fails. */
  deliveryTokenInsertError?: boolean
  /**
   * P2-12 — existing care_interest row. Upsert merges into this store.
   */
  careInterest?: Record<string, unknown> | null
  /**
   * P4-01 — followup check-in ledger row.
   */
  followupCheckin?: Record<string, unknown> | null
  /**
   * P4-01 — followup token row (respond / unsubscribe).
   */
  followupToken?: Record<string, unknown> | null
  /**
   * P4-01 — unsubscribe preference rows.
   */
  followupUnsubscribes?: Array<Record<string, unknown>>
  /**
   * P4-05 — rows returned by libertymd_complete_account_merge RPC.
   */
  mergeCompleteRows?: Array<Record<string, unknown>> | null
  /** When set, complete-merge RPC returns this error. */
  mergeCompleteError?: { message: string } | null
}

const DEFAULT_CLAIM = { accepted: true, replayed: false, current_version: 3 }

export function createFakeDb(options: FakeDbOptions = {}) {
  const ops: RecordedOp[] = []
  const updateMatches = options.updateMatches !== false
  // P2-07 — mutable report fixture so insert-once can "materialise" then re-select.
  let storedReport: Record<string, unknown> | null =
    options.report === undefined ? null : options.report
  // P2-08 — mutable delivery-token store (hash lookup).
  let storedDeliveryToken: Record<string, unknown> | null =
    options.deliveryToken === undefined ? null : options.deliveryToken
  // P2-12 — mutable care_interest store (upsert by consultation_id).
  let storedCareInterest: Record<string, unknown> | null =
    options.careInterest === undefined ? null : options.careInterest
  let storedFollowupCheckin: Record<string, unknown> | null =
    options.followupCheckin === undefined ? null : options.followupCheckin
  let storedFollowupToken: Record<string, unknown> | null =
    options.followupToken === undefined ? null : options.followupToken
  let storedFollowupUnsubs: Array<Record<string, unknown>> =
    options.followupUnsubscribes ? [...options.followupUnsubscribes] : []

  const resolver: OpResolver = (op) => {
    if (op.kind === 'rpc') {
      if (op.table === 'libertymd_claim_consultation_request') {
        return { data: [{ ...DEFAULT_CLAIM, ...(options.claim || {}) }] }
      }
      // P1-04 AC3: ensureSelfPatient reads the RPC id then updates the row.
      if (op.table === 'libertymd_ensure_self_patient') {
        return { data: options.patient?.id ?? 'patient-1' }
      }
      if (op.table === 'libertymd_complete_account_merge') {
        if (options.mergeCompleteError) {
          return { error: options.mergeCompleteError }
        }
        if (options.mergeCompleteRows !== undefined) {
          return { data: options.mergeCompleteRows }
        }
        return { data: null }
      }
      return { data: null }
    }
    if (op.table === 'libertymd_consultations') {
      if (op.kind === 'select') {
        // P4-03 historySummary list select (many + limit).
        if (op.cardinality === 'many' && Array.isArray(options.historyConsultations)) {
          return { data: options.historyConsultations }
        }
        if (op.cardinality === 'many' && options.consultation) {
          return { data: [options.consultation] }
        }
        return { data: options.consultation ?? null }
      }
      if (op.kind === 'insert') {
        const payload = (Array.isArray(op.payload) ? op.payload[0] : op.payload) as Record<string, unknown> | null
        const workflow = payload?.workflow_versions as Record<string, unknown> | undefined
        const isFollowupSeed = workflow?.followup_seed === 'p4-01'
        const row = {
          id: isFollowupSeed
            ? 'consultation-seeded-1'
            : (options.consultation?.id ?? 'consultation-1'),
          user_id: options.consultation?.user_id ?? 'user-1',
          version: options.consultation?.version ?? 1,
          patient_id: options.consultation?.patient_id ?? 'patient-1',
          status: 'awaiting_demographics',
          turn_count: 1,
          filled_slots: {},
          missing_slots: [],
          safety_state: {},
          ...(options.consultation && !isFollowupSeed ? options.consultation : {}),
          ...(payload && typeof payload === 'object' ? payload : {}),
          ...(isFollowupSeed ? { id: 'consultation-seeded-1' } : {}),
        }
        return { data: updateMatches ? row : null }
      }
      return { data: updateMatches ? { id: options.consultation?.id ?? 'consultation-1' } : null }
    }
    if (op.table === 'libertymd_profiles') {
      if (op.kind === 'update') {
        const payload = (op.payload && typeof op.payload === 'object' ? op.payload : {}) as Record<string, unknown>
        const base = options.profile ?? { user_id: 'user-1', age: 44, sex_at_birth: 'male' }
        return { data: { ...base, ...payload } }
      }
      return { data: options.profile ?? { user_id: 'user-1', age: 44, sex_at_birth: 'male' } }
    }
    if (op.table === 'libertymd_patients') {
      if (op.kind === 'insert') {
        const payload = (Array.isArray(op.payload) ? op.payload[0] : op.payload) as Record<string, unknown> | null
        const row = {
          id: 'patient-created-1',
          owner_user_id: 'user-1',
          relationship: 'dependent',
          display_label: 'Family member',
          age: 18,
          sex_at_birth: 'female',
          is_active: true,
          ...(payload && typeof payload === 'object' ? payload : {}),
        }
        return { data: row }
      }
      if (op.kind === 'update') {
        const payload = (op.payload && typeof op.payload === 'object' ? op.payload : {}) as Record<string, unknown>
        const base = options.patient ?? options.patients?.[0] ?? {
          id: 'patient-1',
          owner_user_id: 'user-1',
          relationship: 'self',
          age: 44,
          sex_at_birth: 'male',
          display_label: 'Me',
          is_active: true,
        }
        return { data: { ...base, ...payload } }
      }
      // P1-03 listOwnedActivePatients — cardinality many returns the full active list.
      // P4-03 patientDisplayLabelsByIds — many + `.in('id', …)` without is_active filter.
      if (op.cardinality === 'many') {
        if (Array.isArray(options.patients)) {
          const activeOnly = op.filters.some((f) => f.column === 'is_active' && f.value === true)
          const rows = activeOnly
            ? options.patients.filter((row) => row.is_active !== false)
            : options.patients
          const idFilter = op.filters.find((f) => f.column === 'id')
          if (idFilter) {
            if (Array.isArray(idFilter.value)) {
              const allowed = new Set(idFilter.value.map(String))
              return { data: rows.filter((row) => allowed.has(String(row.id || ''))) }
            }
            const matched = rows.filter((row) => row.id === idFilter.value)
            return { data: matched }
          }
          return { data: rows }
        }
        const sole = options.patient ?? {
          id: 'patient-1',
          owner_user_id: 'user-1',
          relationship: 'self',
          age: 44,
          sex_at_birth: 'male',
          display_label: null,
          is_active: true,
        }
        return { data: [sole] }
      }
      // single / maybeSingle — honour id filter against patients[] when present.
      if (Array.isArray(options.patients) && options.patients.length > 0) {
        const idFilter = op.filters.find((f) => f.column === 'id')
        if (idFilter) {
          const matched = options.patients.find((row) => row.id === idFilter.value)
          if (!matched) return { data: null, error: { message: 'Patient not found' } }
          return { data: matched }
        }
        return { data: options.patient ?? options.patients[0] }
      }
      return {
        data: options.patient ?? {
          id: 'patient-1',
          owner_user_id: 'user-1',
          relationship: 'self',
          age: 44,
          sex_at_birth: 'male',
          display_label: null,
          is_active: true,
        },
      }
    }
    if (op.table === 'libertymd_messages') {
      // maybeSingle is the client_message_id idempotency probe; the unbounded
      // select is getHistory. P2-07 also probes report_gate for detect-or-skip.
      if (op.kind === 'select' && op.cardinality === 'maybeSingle') {
        const gateFilter = op.filters.find((f) => f.column === 'message_type' && f.value === 'report_gate')
        if (gateFilter) {
          return { data: options.reportGateMessage ? { id: 'msg-report-gate-1' } : null }
        }
        return { data: null }
      }
      if (op.kind === 'select') return { data: options.history ?? [] }
      return { data: null }
    }
    if (op.table === 'libertymd_reports') {
      if (op.kind === 'select') {
        // P4-03 history enrichment: many + consultation_id IN filter.
        if (op.cardinality === 'many' && Array.isArray(options.historyReports)) {
          const idFilter = op.filters.find((f) => f.column === 'consultation_id')
          if (idFilter && Array.isArray(idFilter.value)) {
            const allowed = new Set(idFilter.value.map(String))
            return {
              data: options.historyReports.filter((row) =>
                allowed.has(String(row.consultation_id || '')),
              ),
            }
          }
          return { data: options.historyReports }
        }
        return { data: storedReport }
      }
      if (op.kind === 'insert') {
        if (storedReport) {
          return {
            data: null,
            error: { code: '23505', message: 'duplicate key value violates unique constraint' },
          }
        }
        if (options.reportInsertConflict) {
          storedReport = options.reportConflictExisting ?? {
            id: 'report-race-1',
            consultation_id: 'consultation-1',
            user_id: 'user-1',
            report_data: { differential_diagnosis: [{ name: 'first-insert winner' }] },
            confidence_score: 81,
            final_diagnostic_run_id: 'run-first',
            access_status: 'withheld',
            model_metadata: { source: 'libertymd-diagnosis' },
          }
          return {
            data: null,
            error: { code: '23505', message: 'duplicate key value violates unique constraint' },
          }
        }
        const payload = (Array.isArray(op.payload) ? op.payload[0] : op.payload) as Record<string, unknown> | null
        const row = {
          id: 'report-1',
          ...(payload && typeof payload === 'object' ? payload : {}),
        }
        storedReport = row
        return { data: op.cardinality === 'single' ? row : [row] }
      }
      // Updates (release / retention / ownership) succeed without rewriting body.
      if (op.kind === 'update') {
        const payload = (op.payload && typeof op.payload === 'object' ? op.payload : {}) as Record<string, unknown>
        const next = { ...(storedReport || {}), ...payload }
        storedReport = next
        return { data: op.cardinality === 'single' || op.cardinality === 'maybeSingle' ? next : [next] }
      }
      if (op.kind === 'upsert') {
        // P2-07 — clinical upsert must not be used; record and fail loudly if called.
        return {
          data: null,
          error: { message: 'libertymd_reports clinical upsert forbidden (P2-07 insert-once)' },
        }
      }
      return { data: null }
    }
    if (op.table === 'libertymd_safety_events') {
      if (op.kind === 'select') {
        // P0-17: get_consultation reads latest force_end row (maybeSingle).
        if (op.cardinality === 'maybeSingle' || op.limitCount === 1) {
          return { data: options.terminalSafety ?? null }
        }
        return { data: options.terminalSafety ? [options.terminalSafety] : [] }
      }
      // P0-15a: insert().select('id') must return a row id so shadow UPDATE can key.
      if (op.kind === 'insert' && op.columns) {
        const row = { id: 'safety-event-1' }
        return { data: op.cardinality === 'single' ? row : [row] }
      }
      return { data: null }
    }
    if (op.table === 'libertymd_diagnostic_runs') {
      if (op.kind === 'select') {
        return { data: options.speculativeDiagnosticRun ?? null }
      }
      if (op.kind === 'insert') {
        const payload = (Array.isArray(op.payload) ? op.payload[0] : op.payload) as Record<string, unknown> | null
        const row = {
          id: payload?.is_speculative ? 'spec-run-1' : 'run-1',
          ...(payload && typeof payload === 'object' ? payload : {}),
        }
        return { data: op.cardinality === 'single' ? row : [row] }
      }
      return { data: { id: 'run-1' } }
    }
    // P1-19 landing sessions — proxy-only write surface in doubles.
    if (op.table === 'libertymd_landing_sessions') {
      if (options.landingSessionError) {
        return { data: null, error: { message: 'landing_session_unavailable' } }
      }
      if (op.kind === 'select') {
        const idFilter = op.filters.find((f) => f.column === 'id')
        if (idFilter) {
          const row = options.landingSession
          if (!row || row.id !== idFilter.value) return { data: null }
          return { data: row }
        }
        return { data: options.landingSession ?? null }
      }
      if (op.kind === 'upsert' || op.kind === 'insert') {
        const payload = (Array.isArray(op.payload) ? op.payload[0] : op.payload) as Record<string, unknown> | null
        const row = {
          id: (options.landingSession?.id as string | undefined)
            ?? '11111111-1111-4111-8111-111111111111',
          anon_session_key: payload?.anon_session_key
            ?? options.landingSession?.anon_session_key
            ?? '00000000-0000-4000-8000-000000000001',
          ...(payload && typeof payload === 'object' ? payload : {}),
        }
        if (options.landingSession && typeof options.landingSession === 'object') {
          Object.assign(row, options.landingSession)
          if (payload && typeof payload === 'object') Object.assign(row, payload)
        }
        return { data: row }
      }
      return { data: null }
    }
    // P2-10 report feedback — proxy-only write; UNIQUE consultation_id.
    if (op.table === 'libertymd_report_feedback') {
      if (op.kind === 'select') return { data: options.reportFeedback ?? null }
      if (op.kind === 'insert') {
        if (options.feedbackInsertConflict || options.reportFeedback) {
          return {
            data: null,
            error: { code: '23505', message: 'duplicate key value violates unique constraint' },
          }
        }
        const payload = (Array.isArray(op.payload) ? op.payload[0] : op.payload) as Record<string, unknown> | null
        const row = {
          id: 'feedback-1',
          ...(payload && typeof payload === 'object' ? payload : {}),
        }
        return { data: op.cardinality === 'single' ? row : [row] }
      }
      return { data: null }
    }
    // P2-08 delivery tokens — proxy-only; hash lookup / insert / sent_at update.
    if (op.table === 'libertymd_report_delivery_tokens') {
      if (op.kind === 'select') {
        const hashFilter = op.filters.find((f) => f.column === 'token_hash')
        if (hashFilter) {
          if (!storedDeliveryToken) return { data: null }
          if (storedDeliveryToken.token_hash !== hashFilter.value) return { data: null }
          return { data: storedDeliveryToken }
        }
        return { data: storedDeliveryToken }
      }
      if (op.kind === 'insert') {
        if (options.deliveryTokenInsertError) {
          return { data: null, error: { message: 'delivery_token_insert_failed' } }
        }
        const payload = (Array.isArray(op.payload) ? op.payload[0] : op.payload) as Record<string, unknown> | null
        const row = {
          id: 'delivery-token-1',
          ...(payload && typeof payload === 'object' ? payload : {}),
        }
        storedDeliveryToken = row
        return { data: op.cardinality === 'single' ? row : [row] }
      }
      if (op.kind === 'update') {
        const payload = (op.payload && typeof op.payload === 'object' ? op.payload : {}) as Record<string, unknown>
        const next = { ...(storedDeliveryToken || {}), ...payload }
        storedDeliveryToken = next
        return { data: op.cardinality === 'single' || op.cardinality === 'maybeSingle' ? next : [next] }
      }
      return { data: null }
    }
    // P2-12 care_interest — proxy-only; unique consultation_id upsert.
    if (op.table === 'libertymd_care_interest') {
      if (op.kind === 'select') {
        const idFilter = op.filters.find((f) => f.column === 'consultation_id')
        if (idFilter) {
          if (!storedCareInterest) return { data: null }
          if (storedCareInterest.consultation_id !== idFilter.value) return { data: null }
          return { data: storedCareInterest }
        }
        return { data: storedCareInterest }
      }
      if (op.kind === 'insert' || op.kind === 'upsert') {
        const payload = (Array.isArray(op.payload) ? op.payload[0] : op.payload) as Record<string, unknown> | null
        const next = {
          id: (storedCareInterest?.id as string | undefined) ?? 'care-interest-1',
          created_at: (storedCareInterest?.created_at as string | undefined)
            ?? new Date().toISOString(),
          ...(payload && typeof payload === 'object' ? payload : {}),
        }
        // Upsert: preserve id/created_at when updating existing row.
        if (storedCareInterest && typeof storedCareInterest === 'object') {
          next.id = storedCareInterest.id ?? next.id
          if (storedCareInterest.created_at) next.created_at = storedCareInterest.created_at
        }
        storedCareInterest = next
        return { data: op.cardinality === 'single' || op.cardinality === 'maybeSingle' ? next : [next] }
      }
      if (op.kind === 'update') {
        const payload = (op.payload && typeof op.payload === 'object' ? op.payload : {}) as Record<string, unknown>
        const next = { ...(storedCareInterest || {}), ...payload }
        storedCareInterest = next
        return { data: op.cardinality === 'single' || op.cardinality === 'maybeSingle' ? next : [next] }
      }
      return { data: null }
    }
    // P4-01 followup check-in ledger
    if (op.table === 'libertymd_followup_checkins') {
      if (op.kind === 'select') {
        const idFilter = op.filters.find((f) => f.column === 'id')
        if (idFilter) {
          if (!storedFollowupCheckin) return { data: null }
          if (storedFollowupCheckin.id !== idFilter.value) return { data: null }
          return { data: storedFollowupCheckin }
        }
        return { data: storedFollowupCheckin }
      }
      if (op.kind === 'insert') {
        const payload = (Array.isArray(op.payload) ? op.payload[0] : op.payload) as Record<string, unknown> | null
        const row = {
          id: 'checkin-1',
          status: 'pending',
          ...(payload && typeof payload === 'object' ? payload : {}),
        }
        storedFollowupCheckin = row
        return { data: op.cardinality === 'single' || op.cardinality === 'maybeSingle' ? row : [row] }
      }
      if (op.kind === 'update') {
        const payload = (op.payload && typeof op.payload === 'object' ? op.payload : {}) as Record<string, unknown>
        const next = { ...(storedFollowupCheckin || {}), ...payload }
        storedFollowupCheckin = next
        return { data: op.cardinality === 'single' || op.cardinality === 'maybeSingle' ? next : [next] }
      }
      return { data: null }
    }
    // P4-01 followup tokens
    if (op.table === 'libertymd_followup_tokens') {
      if (op.kind === 'select') {
        const hashFilter = op.filters.find((f) => f.column === 'token_hash')
        if (hashFilter) {
          if (!storedFollowupToken) return { data: null }
          if (storedFollowupToken.token_hash !== hashFilter.value) return { data: null }
          return { data: storedFollowupToken }
        }
        return { data: storedFollowupToken }
      }
      if (op.kind === 'insert') {
        const payload = (Array.isArray(op.payload) ? op.payload[0] : op.payload) as Record<string, unknown> | null
        const row = {
          id: 'followup-token-1',
          ...(payload && typeof payload === 'object' ? payload : {}),
        }
        storedFollowupToken = row
        return { data: op.cardinality === 'single' || op.cardinality === 'maybeSingle' ? row : [row] }
      }
      if (op.kind === 'update') {
        const payload = (op.payload && typeof op.payload === 'object' ? op.payload : {}) as Record<string, unknown>
        const next = { ...(storedFollowupToken || {}), ...payload }
        storedFollowupToken = next
        return { data: op.cardinality === 'single' || op.cardinality === 'maybeSingle' ? next : [next] }
      }
      return { data: null }
    }
    // P4-01 unsubscribe preferences
    if (op.table === 'libertymd_followup_unsubscribes') {
      if (op.kind === 'select') {
        const emailFilter = op.filters.find((f) => f.column === 'contact_email')
        if (emailFilter) {
          const match = storedFollowupUnsubs.find((r) => r.contact_email === emailFilter.value)
          return { data: match ?? null }
        }
        const userFilter = op.filters.find((f) => f.column === 'user_id')
        if (userFilter) {
          const match = storedFollowupUnsubs.find((r) => r.user_id === userFilter.value)
          return { data: match ?? null }
        }
        return { data: storedFollowupUnsubs[0] ?? null }
      }
      if (op.kind === 'insert') {
        const payload = (Array.isArray(op.payload) ? op.payload[0] : op.payload) as Record<string, unknown> | null
        const row = {
          id: `unsub-${storedFollowupUnsubs.length + 1}`,
          ...(payload && typeof payload === 'object' ? payload : {}),
        }
        storedFollowupUnsubs.push(row)
        return { data: op.cardinality === 'single' || op.cardinality === 'maybeSingle' ? row : [row] }
      }
      return { data: null }
    }
    // product_events / consent_events inserts succeed with null data.
    return { data: null }
  }

  const db = {
    from(table: string) {
      const start = (kind: RecordedOp['kind'], payload?: unknown) => {
        const op: RecordedOp = { table, kind, payload, filters: [], cardinality: 'many' }
        ops.push(op)
        return new QueryBuilder(op, resolver)
      }
      return {
        select: (columns?: string) => start('select').select(columns),
        insert: (payload: unknown) => start('insert', payload),
        update: (payload: unknown) => start('update', payload),
        upsert: (payload: unknown, _options?: unknown) => start('upsert', payload),
      }
    },
    rpc(name: string, args: unknown) {
      const op: RecordedOp = { table: name, kind: 'rpc', payload: args, filters: [], cardinality: 'many' }
      ops.push(op)
      return new QueryBuilder(op, resolver)
    },
  }

  return { db, ops }
}

export interface FakeContextOptions extends FakeDbOptions {
  userId?: string
  isAnonymous?: boolean
}

export function createFakeContext(options: FakeContextOptions = {}) {
  const { db, ops } = createFakeDb(options)
  const ctx = {
    db,
    user: {
      id: options.userId ?? 'user-1',
      email: null,
      app_metadata: { provider: 'anonymous' },
      user_metadata: {},
      is_anonymous: options.isAnonymous !== false,
    },
    isAnonymous: options.isAnonymous !== false,
    requestStartedAt: 0,
  } as unknown as ProxyContext
  return { ctx, ops, db }
}

export function consultationRow(overrides: Partial<ConsultationRow> = {}): ConsultationRow {
  return {
    id: 'consultation-1',
    user_id: 'user-1',
    status: 'interviewing',
    chief_complaint: 'headache',
    turn_count: 3,
    filled_slots: { chief_complaint: 'headache' },
    missing_slots: ['onset'],
    target_slot: 'onset',
    intermediate_diagnoses: [],
    safety_state: {},
    report_gate: 'not_reached',
    non_clinical_response_count: 0,
    consecutive_non_clinical_response_count: 0,
    clinical_evidence_score: 25,
    resolution_reason: null,
    version: 3,
    active_request_id: null,
    active_request_started_at: null,
    patient_id: 'patient-1',
    patient_snapshot: {},
    workflow_versions: {},
    abandoned_from_status: null,
    abandoned_at: null,
    ...overrides,
  }
}

// --------------------------------------------------------------- fetch control

export interface FetchLog {
  calls: Array<{ url: string; body: unknown }>
  restore: () => void
}

/**
 * Replace `globalThis.fetch`. Stubbing rather than hitting a loopback server is
 * deliberate: it means the tests need no `--allow-net`, so they can run under
 * the existing gate commands unchanged.
 */
export function stubFetch(handler: (url: string, body: unknown) => Response | Promise<Response>): FetchLog {
  const original = globalThis.fetch
  const calls: Array<{ url: string; body: unknown }> = []
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input)
    let body: unknown = null
    try {
      body = init?.body ? JSON.parse(String(init.body)) : null
    } catch {
      body = init?.body ?? null
    }
    calls.push({ url, body })
    return Promise.resolve(handler(url, body))
  }) as typeof fetch
  return { calls, restore: () => { globalThis.fetch = original } }
}

export const okResponse = (payload: unknown) =>
  new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })

export const failResponse = (status = 500) => new Response('upstream failed', { status })

// ------------------------------------------------------------------ assertions

export function assertEquals<T>(actual: T, expected: T, message: string) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

export function assertTrue(value: unknown, message: string) {
  if (!value) throw new Error(message)
}

/**
 * The shape every P0-13 test needs: attempt the violation, assert it is
 * refused. A guard that throws the wrong error, or does not throw at all, both
 * fail here.
 */
export async function assertRejects(
  operation: () => unknown | Promise<unknown>,
  predicate: (error: unknown) => boolean,
  message: string,
) {
  let thrown: unknown = null
  let threw = false
  try {
    await operation()
  } catch (error) {
    threw = true
    thrown = error
  }
  if (!threw) throw new Error(`${message}: expected a rejection, none was thrown`)
  if (!predicate(thrown)) {
    throw new Error(`${message}: rejection did not match — got ${(thrown as Error)?.name}: ${(thrown as Error)?.message}`)
  }
}

/** Ops of a kind against a table, for asserting a write did or did not happen. */
export const opsFor = (ops: RecordedOp[], table: string, kind?: RecordedOp['kind']) =>
  ops.filter((op) => op.table === table && (!kind || op.kind === kind))

/**
 * P2-11 / P2-12 — client-side join double for `record_care_interest`.
 * Use when P2-12 proxy is not landed yet: UI still acks; durable write = sequence.
 * Never simulates a frontend `.from('libertymd_care_interest')` write.
 */
export type CareInterestJoinBody = {
  action: 'record_care_interest'
  consultation_id: string
  contact_email?: string | null
}

export function stubRecordCareInterestJoin(options?: {
  /** When true, simulate proxy action missing (P2-12 not merged). */
  actionMissing?: boolean
  fail?: boolean
}): {
  calls: CareInterestJoinBody[]
  invoke: (body: CareInterestJoinBody) => Promise<{ ok: boolean; actionMissing?: boolean }>
} {
  const calls: CareInterestJoinBody[] = []
  return {
    calls,
    async invoke(body) {
      calls.push(body)
      if (options?.fail) return { ok: false }
      if (options?.actionMissing) return { ok: true, actionMissing: true }
      return { ok: true }
    },
  }
}
