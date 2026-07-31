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

  in(column: string, value: unknown) {
    this.op.filters.push({ column, value })
    return this
  }

  order(_column?: string, _options?: unknown) {
    return this
  }

  limit(_count: number) {
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
  history?: unknown[]
  /** Row returned by the `libertymd_reports` lookup on the turn-cap path. */
  report?: Record<string, unknown> | null
  /** Result of the request-lease claim RPC. */
  claim?: Record<string, unknown>
  /** Rows matched by consultation updates. `null` simulates an unowned target. */
  updateMatches?: boolean
}

const DEFAULT_CLAIM = { accepted: true, replayed: false, current_version: 3 }

export function createFakeDb(options: FakeDbOptions = {}) {
  const ops: RecordedOp[] = []
  const updateMatches = options.updateMatches !== false

  const resolver: OpResolver = (op) => {
    if (op.kind === 'rpc') {
      if (op.table === 'libertymd_claim_consultation_request') {
        return { data: [{ ...DEFAULT_CLAIM, ...(options.claim || {}) }] }
      }
      return { data: null }
    }
    if (op.table === 'libertymd_consultations') {
      if (op.kind === 'select') return { data: options.consultation ?? null }
      return { data: updateMatches ? { id: options.consultation?.id ?? 'consultation-1' } : null }
    }
    if (op.table === 'libertymd_profiles') return { data: options.profile ?? { user_id: 'user-1' } }
    if (op.table === 'libertymd_patients') {
      return { data: options.patient ?? { id: 'patient-1', owner_user_id: 'user-1', relationship: 'self', age: 44, sex_at_birth: 'male' } }
    }
    if (op.table === 'libertymd_messages') {
      // maybeSingle is the client_message_id idempotency probe; the unbounded
      // select is getHistory.
      if (op.kind === 'select' && op.cardinality === 'maybeSingle') return { data: null }
      if (op.kind === 'select') return { data: options.history ?? [] }
      return { data: null }
    }
    if (op.table === 'libertymd_reports') {
      if (op.kind === 'select') return { data: options.report ?? null }
      return { data: null }
    }
    if (op.table === 'libertymd_diagnostic_runs') return { data: { id: 'run-1' } }
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
