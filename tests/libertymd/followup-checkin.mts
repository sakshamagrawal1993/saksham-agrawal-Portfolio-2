/**
 * P4-01 — 72-hour feeling check-in: eligibility clock, full-email ban, caps,
 * emergency exclusion, unsub, worse live-join seed, Lexicon client telemetry,
 * Postgres allow-list unchanged.
 * P4-02 — doctor visit + optional match on same respond surface; two-fire
 * Mixpanel; ledger columns; AC5 SQL artifact; no email doctor links.
 *
 * Run: `deno test --no-config --no-check --allow-env --allow-read --allow-net --sloppy-imports tests/libertymd/followup-checkin.mts`
 */
import {
  handleRespondFollowupCheckin,
  handleUnsubscribeFollowupCheckin,
} from '../../supabase/functions/libertymd-care-proxy/actions/followup-checkin.ts'
import {
  assertEmailContainsNoClinicalLeak,
  buildFollowupCheckinEmail,
  coalesceReportReadyAt,
  computeDueAt,
  computeOpenUntil,
  evaluateCheckinClock,
  exceedsGlobalSendCap,
  FOLLOWUP_CHECKIN_DELAY_MS,
  FOLLOWUP_CHECKIN_EMAIL_PREHEADER,
  FOLLOWUP_CHECKIN_EMAIL_SUBJECT,
  FOLLOWUP_CHECKIN_OPEN_TAIL_MS,
} from '../../supabase/functions/libertymd-care-proxy/lib/followup-checkin.ts'
import { __setReportEmailSenderForTests } from '../../supabase/functions/libertymd-care-proxy/lib/report-email-delivery.ts'
import {
  processCandidate,
  resolveExistingCheckinAction,
} from '../../supabase/functions/libertymd-followup-checkin/sweep.ts'
import { PRODUCT_EVENT_NAMES } from '../../supabase/functions/libertymd-care-proxy/lib/telemetry.ts'
import { sha256 } from '../../supabase/functions/libertymd-care-proxy/lib/utils.ts'
import {
  emitFollowupResponded,
  __setLibertyMdTrackForTests,
} from '../../components/LibertyMD/libertymd-analytics.ts'
import {
  assertEquals,
  assertTrue,
  consultationRow,
  createFakeContext,
  opsFor,
} from './support/proxy-doubles.mts'

declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readTextFile(path: string | URL): Promise<string>
}

const CLINICAL_MARKERS = [
  'myocardial infarction',
  'pneumonia',
  'chest pain radiating',
  'acs_chest_pain',
  'differential_diagnosis',
  'SOAP note body',
]

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function parseJson(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>
}

Deno.test('P4-01 AC1 · coalesce clock + open tail eligibility', () => {
  const t0 = Date.parse('2026-07-01T12:00:00.000Z')
  // Anon report_pending_auth: completed_at null — report.created_at wins.
  const ready = coalesceReportReadyAt({
    completedAt: null,
    reportCreatedAt: new Date(t0).toISOString(),
    consultationUpdatedAt: new Date(t0 - HOUR).toISOString(),
  })
  assertEquals(ready, t0)
  const due = computeDueAt(t0!)
  assertEquals(due, t0 + FOLLOWUP_CHECKIN_DELAY_MS)
  assertEquals(computeOpenUntil(due), due + FOLLOWUP_CHECKIN_OPEN_TAIL_MS)

  assertEquals(
    evaluateCheckinClock({
      status: 'report_pending_auth',
      reportReadyAtMs: t0,
      nowMs: t0 + 71 * HOUR,
    }).ok,
    false,
  )
  const inWindow = evaluateCheckinClock({
    status: 'completed',
    reportReadyAtMs: t0,
    nowMs: t0 + 72 * HOUR + HOUR,
  })
  assertEquals(inWindow.ok, true)

  const lateAddressStillOk = evaluateCheckinClock({
    status: 'completed',
    reportReadyAtMs: t0,
    nowMs: t0 + 72 * HOUR + 6 * DAY,
  })
  assertEquals(lateAddressStillOk.ok, true)

  const pastTail = evaluateCheckinClock({
    status: 'completed',
    reportReadyAtMs: t0,
    nowMs: t0 + 72 * HOUR + 8 * DAY,
  })
  assertEquals(pastTail.ok, false)
  if (!pastTail.ok) assertEquals(pastTail.reason, 'past_open_tail')
})

Deno.test('P4-01 AC2 · full-email clinical-marker ban', () => {
  const content = buildFollowupCheckinEmail({
    betterUrl: 'https://example.com/liberty-md/checkin?t=tok&a=better',
    sameUrl: 'https://example.com/liberty-md/checkin?t=tok&a=same',
    worseUrl: 'https://example.com/liberty-md/checkin?t=tok&a=worse',
    unsubscribeUrl: 'https://example.com/liberty-md/checkin/unsubscribe?t=unsub',
  })
  assertEquals(content.subject, FOLLOWUP_CHECKIN_EMAIL_SUBJECT)
  assertEquals(content.preheader, FOLLOWUP_CHECKIN_EMAIL_PREHEADER)
  assertTrue(content.text.includes('Better:'))
  assertTrue(content.html.includes('Unsubscribe'))
  assertEmailContainsNoClinicalLeak(content, CLINICAL_MARKERS)
})

Deno.test('P4-01 AC6 · emergency_stopped never eligible', () => {
  const t0 = Date.now() - 80 * HOUR
  const verdict = evaluateCheckinClock({
    status: 'emergency_stopped',
    reportReadyAtMs: t0,
    nowMs: Date.now(),
  })
  assertEquals(verdict.ok, false)
  if (!verdict.ok) assertEquals(verdict.reason, 'emergency_stopped')

  const interviewing = evaluateCheckinClock({
    status: 'interviewing',
    reportReadyAtMs: t0,
    nowMs: Date.now(),
  })
  assertEquals(interviewing.ok, false)
})

Deno.test('P4-01 AC4 · global send cap window', () => {
  const now = Date.now()
  assertEquals(
    exceedsGlobalSendCap({ recentSendAts: [now - 2 * DAY], nowMs: now }),
    true,
  )
  assertEquals(
    exceedsGlobalSendCap({ recentSendAts: [now - 8 * DAY], nowMs: now }),
    false,
  )
  assertEquals(exceedsGlobalSendCap({ recentSendAts: [], nowMs: now }), false)
})

Deno.test('P4-01 AC3/AC5 · respond better + unsubscribe preference', async () => {
  const rawToken = `${crypto.randomUUID()}.${crypto.randomUUID()}`
  const tokenHash = await sha256(rawToken)
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({
      id: 'consultation-1',
      status: 'completed',
      chief_complaint: 'chest pain radiating',
      filled_slots: {
        chief_complaint: 'chest pain radiating',
        onset: '2 days',
        age: 44,
        sex_at_birth: 'male',
      },
    }),
    followupCheckin: {
      id: 'checkin-1',
      consultation_id: 'consultation-1',
      status: 'sent',
      answer: null,
      sent_at: new Date().toISOString(),
      new_consultation_id: null,
    },
    followupToken: {
      id: 'followup-token-1',
      token_hash: tokenHash,
      purpose: 'respond',
      checkin_id: 'checkin-1',
      consultation_id: 'consultation-1',
      contact_email: 'guest@example.com',
      user_id: 'user-1',
      expires_at: new Date(Date.now() + DAY).toISOString(),
      used_at: null,
    },
  })

  const respond = await handleRespondFollowupCheckin(ctx, {
    action: 'respond_followup_checkin',
    followup_token: rawToken,
    followup_answer: 'better',
  })
  assertEquals(respond.status, 200)
  const respondBody = await parseJson(respond)
  assertEquals(respondBody.status, 'ok')
  assertEquals(respondBody.answer, 'better')
  assertEquals(respondBody.new_consultation_id, null)

  const checkinUpdates = opsFor(ops, 'libertymd_followup_checkins', 'update')
  assertTrue(checkinUpdates.length >= 1)
  const updatePayload = checkinUpdates[0].payload as Record<string, unknown>
  assertEquals(updatePayload.answer, 'better')
  assertEquals(updatePayload.status, 'responded')

  // Unsubscribe
  const unsubRaw = `${crypto.randomUUID()}.${crypto.randomUUID()}`
  const unsubHash = await sha256(unsubRaw)
  const { ctx: unsubCtx, ops: unsubOps } = createFakeContext({
    followupToken: {
      id: 'followup-token-unsub',
      token_hash: unsubHash,
      purpose: 'unsubscribe',
      checkin_id: 'checkin-1',
      consultation_id: 'consultation-1',
      contact_email: 'guest@example.com',
      user_id: 'user-1',
      expires_at: new Date(Date.now() + DAY).toISOString(),
      used_at: null,
    },
  })
  const unsub = await handleUnsubscribeFollowupCheckin(unsubCtx, {
    action: 'unsubscribe_followup_checkin',
    followup_token: unsubRaw,
  })
  assertEquals(unsub.status, 200)
  const unsubBody = await parseJson(unsub)
  assertEquals(unsubBody.unsubscribed, true)
  const unsubInserts = opsFor(unsubOps, 'libertymd_followup_unsubscribes', 'insert')
  assertTrue(unsubInserts.length >= 1)
})

Deno.test('P4-01 AC3 · worse live-join seeds new consult without client slots', async () => {
  const rawToken = `${crypto.randomUUID()}.${crypto.randomUUID()}`
  const tokenHash = await sha256(rawToken)
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({
      id: 'consultation-1',
      status: 'completed',
      chief_complaint: 'chest pain radiating',
      filled_slots: {
        chief_complaint: 'chest pain radiating',
        onset: '2 days',
        severity: 'moderate',
        age: 44,
        sex_at_birth: 'male',
      },
    }),
    followupCheckin: {
      id: 'checkin-1',
      consultation_id: 'consultation-1',
      status: 'sent',
      answer: null,
      sent_at: new Date().toISOString(),
      new_consultation_id: null,
    },
    followupToken: {
      id: 'followup-token-1',
      token_hash: tokenHash,
      purpose: 'respond',
      checkin_id: 'checkin-1',
      consultation_id: 'consultation-1',
      contact_email: 'guest@example.com',
      user_id: 'user-1',
      expires_at: new Date(Date.now() + DAY).toISOString(),
      used_at: null,
    },
  })

  const respond = await handleRespondFollowupCheckin(ctx, {
    action: 'respond_followup_checkin',
    followup_token: rawToken,
    followup_answer: 'worse',
  })
  assertEquals(respond.status, 200)
  const body = await parseJson(respond)
  assertEquals(body.status, 'ok')
  assertEquals(body.answer, 'worse')
  assertEquals(body.new_consultation_id, 'consultation-seeded-1')

  const inserts = opsFor(ops, 'libertymd_consultations', 'insert')
  assertEquals(inserts.length, 1)
  const seeded = inserts[0].payload as Record<string, unknown>
  assertEquals(seeded.chief_complaint, 'chest pain radiating')
  const slots = seeded.filled_slots as Record<string, unknown>
  assertEquals(slots.onset, '2 days')
  assertEquals(slots.severity, 'moderate')
  // Old consult must not be mutated via update for seed.
  const consultUpdates = opsFor(ops, 'libertymd_consultations', 'update')
  assertEquals(consultUpdates.length, 0)
})

Deno.test('P4-01 AC7 · schedule artifacts present (Edge + config + runbook)', async () => {
  const config = await Deno.readTextFile(new URL('../../supabase/config.toml', import.meta.url))
  assertTrue(/\[functions\.libertymd-followup-checkin\]/.test(config))
  assertTrue(/verify_jwt\s*=\s*false/.test(config))
  const runbook = await Deno.readTextFile(
    new URL('../../scripts/sql/libertymd-checkin-cron-runbook.sql', import.meta.url),
  )
  assertTrue(/libertymd-followup-checkin/.test(runbook))
  assertTrue(/NEVER fold into/i.test(runbook) || /never fold/i.test(runbook))
  const edge = await Deno.readTextFile(
    new URL('../../supabase/functions/libertymd-followup-checkin/index.ts', import.meta.url),
  )
  assertTrue(/service_role|SERVICE_ROLE/.test(edge))
  assertTrue(/dry_run/.test(edge))
})

Deno.test('P4-01 T1 · emitFollowupResponded feeling-only; Postgres allow-list unchanged', () => {
  assertEquals(PRODUCT_EVENT_NAMES.includes('followup_responded' as never), false)
  assertEquals(PRODUCT_EVENT_NAMES.length, 18)

  const calls: Array<{ name: string; props: Record<string, unknown> }> = []
  __setLibertyMdTrackForTests((name, props) => {
    calls.push({ name, props })
  })
  try {
    emitFollowupResponded({ answer: 'same' })
    assertEquals(calls.length, 1)
    assertEquals(calls[0].name, 'LibertyMd followup_responded')
    assertEquals(calls[0].props.answer, 'same')
    assertEquals(calls[0].props.emit_origin, 'client')
    assertEquals('email' in calls[0].props, false)
    assertEquals('saw_doctor' in calls[0].props, false)
    assertEquals('report_match' in calls[0].props, false)
  } finally {
    __setLibertyMdTrackForTests(null)
  }
})

Deno.test('P4-01 AC1 · respond rejects invalid answer', async () => {
  const rawToken = `${crypto.randomUUID()}.${crypto.randomUUID()}`
  const tokenHash = await sha256(rawToken)
  const { ctx } = createFakeContext({
    followupCheckin: {
      id: 'checkin-1',
      status: 'sent',
      answer: null,
    },
    followupToken: {
      id: 'followup-token-1',
      token_hash: tokenHash,
      purpose: 'respond',
      checkin_id: 'checkin-1',
      consultation_id: 'consultation-1',
      contact_email: 'guest@example.com',
      expires_at: new Date(Date.now() + DAY).toISOString(),
    },
  })
  const bad = await handleRespondFollowupCheckin(ctx, {
    action: 'respond_followup_checkin',
    followup_token: rawToken,
    followup_answer: 'somewhat',
  })
  assertEquals(bad.status, 400)
})

Deno.test('P4-01 migration · no clinical blob columns on ledger', async () => {
  const sql = await Deno.readTextFile(
    new URL(
      '../../supabase/migrations/20260731260000_libertymd_followup_checkin_p4_01.sql',
      import.meta.url,
    ),
  )
  assertTrue(/libertymd_followup_checkins/.test(sql))
  assertTrue(/libertymd_followup_unsubscribes/.test(sql))
  assertTrue(/libertymd_followup_tokens/.test(sql))
  assertTrue(!/filled_slots|chief_complaint|report_data/.test(sql.split('create table')[1] || ''))
  assertTrue(/revoke all on table public\.libertymd_followup_checkins/.test(sql))
})

Deno.test('P4-01 AC7 · pending ledger action is retry_pending (not noop)', () => {
  assertEquals(resolveExistingCheckinAction(null), 'enqueue')
  assertEquals(
    resolveExistingCheckinAction({ id: 'c1', status: 'pending', contact_email: 'a@b.co' }),
    'retry_pending',
  )
  assertEquals(
    resolveExistingCheckinAction({ id: 'c1', status: 'sent', contact_email: 'a@b.co' }),
    'noop',
  )
  assertEquals(
    resolveExistingCheckinAction({ id: 'c1', status: 'skipped', contact_email: 'a@b.co' }),
    'noop',
  )
})

type SweepRow = Record<string, unknown>

/** Minimal supabase-shaped store for hermetic sweeper doubles. */
function createSweepFakeDb(seed: {
  checkins?: SweepRow[]
  tokens?: SweepRow[]
  reports?: SweepRow[]
  deliveryTokens?: SweepRow[]
  unsubscribes?: SweepRow[]
}) {
  const tables: Record<string, SweepRow[]> = {
    libertymd_followup_checkins: [...(seed.checkins || [])],
    libertymd_followup_tokens: [...(seed.tokens || [])],
    libertymd_reports: [...(seed.reports || [])],
    libertymd_report_delivery_tokens: [...(seed.deliveryTokens || [])],
    libertymd_followup_unsubscribes: [...(seed.unsubscribes || [])],
  }
  let idSeq = 1

  function matches(row: SweepRow, filters: Array<{ col: string; op: string; val: unknown }>) {
    return filters.every((f) => {
      const v = row[f.col]
      if (f.op === 'eq') return v === f.val
      if (f.op === 'not_null') return v != null
      return true
    })
  }

  function from(table: string) {
    const state: {
      filters: Array<{ col: string; op: string; val: unknown }>
      orderCol?: string
      orderAsc?: boolean
      limitN?: number
      insertPayload?: SweepRow | SweepRow[]
      updatePayload?: SweepRow
      deleteMode?: boolean
      selectCols?: string
    } = { filters: [] }

    const api: Record<string, unknown> = {}
    const chain = () => api

    api.select = (cols?: string) => {
      state.selectCols = cols
      return chain()
    }
    api.eq = (col: string, val: unknown) => {
      state.filters.push({ col, op: 'eq', val })
      return chain()
    }
    api.not = (col: string, _op: string, val: unknown) => {
      if (val === null) state.filters.push({ col, op: 'not_null', val: null })
      return chain()
    }
    api.order = (col: string, opts?: { ascending?: boolean }) => {
      state.orderCol = col
      state.orderAsc = opts?.ascending !== false
      return chain()
    }
    api.limit = (n: number) => {
      state.limitN = n
      return chain()
    }
    api.insert = (payload: SweepRow | SweepRow[]) => {
      state.insertPayload = payload
      return chain()
    }
    api.update = (payload: SweepRow) => {
      state.updatePayload = payload
      return chain()
    }
    api.delete = () => {
      state.deleteMode = true
      return chain()
    }

    const applyMutations = () => {
      if (state.deleteMode) {
        tables[table] = tables[table].filter((r) => !matches(r, state.filters))
        return { data: null, error: null }
      }
      if (state.updatePayload) {
        for (const row of tables[table]) {
          if (matches(row, state.filters)) Object.assign(row, state.updatePayload)
        }
        return { data: null, error: null }
      }
      if (state.insertPayload) {
        const rows = Array.isArray(state.insertPayload)
          ? state.insertPayload
          : [state.insertPayload]
        const inserted: SweepRow[] = []
        for (const row of rows) {
          if (
            table === 'libertymd_followup_checkins' &&
            tables[table].some((r) => r.consultation_id === row.consultation_id)
          ) {
            return { data: null, error: { code: '23505', message: 'unique' } }
          }
          const withId = { id: row.id ?? `row-${idSeq++}`, ...row }
          tables[table].push(withId)
          inserted.push(withId)
        }
        return {
          data: Array.isArray(state.insertPayload) ? inserted : inserted[0],
          error: null,
        }
      }
      let rows = tables[table].filter((r) => matches(r, state.filters))
      if (state.orderCol) {
        const col = state.orderCol
        const asc = state.orderAsc !== false
        rows = [...rows].sort((a, b) => {
          const av = String(a[col] ?? '')
          const bv = String(b[col] ?? '')
          return asc ? av.localeCompare(bv) : bv.localeCompare(av)
        })
      }
      if (state.limitN != null) rows = rows.slice(0, state.limitN)
      return { data: rows, error: null }
    }

    api.maybeSingle = async () => {
      const { data, error } = applyMutations()
      if (error) return { data: null, error }
      const rows = data as SweepRow[] | SweepRow | null
      if (Array.isArray(rows)) return { data: rows[0] ?? null, error: null }
      return { data: rows, error: null }
    }
    api.single = async () => {
      const { data, error } = applyMutations()
      if (error) return { data: null, error }
      if (Array.isArray(data)) return { data: data[0] ?? null, error: null }
      return { data, error: null }
    }
    // Thenable for bare await on select/insert/update/delete chains.
    api.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      try {
        return Promise.resolve(applyMutations()).then(resolve, reject)
      } catch (e) {
        return Promise.reject(e).then(resolve, reject)
      }
    }

    return api
  }

  return {
    db: { from },
    tables,
  }
}

Deno.test(
  'P4-01 AC7 · failed send leaves pending; subsequent cron retries and marks sent',
  async () => {
    const t0 = Date.parse('2026-07-01T12:00:00.000Z')
    const nowMs = t0 + 72 * HOUR + HOUR
    const consult = {
      id: 'consult-retry-1',
      user_id: 'user-1',
      status: 'completed',
      completed_at: new Date(t0).toISOString(),
      updated_at: new Date(t0).toISOString(),
    }
    const { db, tables } = createSweepFakeDb({
      reports: [{ id: 'report-1', consultation_id: consult.id, created_at: new Date(t0).toISOString() }],
      deliveryTokens: [{
        consultation_id: consult.id,
        contact_email: 'guest@example.com',
        sent_at: new Date(t0 + HOUR).toISOString(),
        created_at: new Date(t0 + HOUR).toISOString(),
      }],
    })

    let sendAttempts = 0
    __setReportEmailSenderForTests(async () => {
      sendAttempts += 1
      if (sendAttempts === 1) return { ok: false, error: 'email_provider_rejected' }
      return { ok: true }
    })
    try {
      const first = await processCandidate(db, consult, nowMs, false)
      assertEquals(first, 'noop', 'failed send must not report sent')
      assertEquals(tables.libertymd_followup_checkins.length, 1)
      assertEquals(tables.libertymd_followup_checkins[0].status, 'pending')
      assertEquals(tables.libertymd_followup_checkins[0].sent_at, undefined)
      assertTrue(tables.libertymd_followup_tokens.length >= 2)

      // Second cron: pending must retry (not forever-noop via hasExistingCheckin).
      const second = await processCandidate(db, consult, nowMs, false)
      assertEquals(second, 'sent')
      assertEquals(sendAttempts, 2)
      assertEquals(tables.libertymd_followup_checkins.length, 1)
      assertEquals(tables.libertymd_followup_checkins[0].status, 'sent')
      assertTrue(typeof tables.libertymd_followup_checkins[0].sent_at === 'string')

      // Third cron: already sent → idempotent noop (no third provider call).
      const third = await processCandidate(db, consult, nowMs, false)
      assertEquals(third, 'noop')
      assertEquals(sendAttempts, 2)
    } finally {
      __setReportEmailSenderForTests(null)
    }
  },
)

// ---------------------------------------------------------------------------
// P4-02 — doctor visit + match + two-fire + join SQL
// ---------------------------------------------------------------------------

Deno.test('P4-02 AC1 · respond accepts closed saw_doctor set; rejects invalid', async () => {
  const rawToken = `${crypto.randomUUID()}.${crypto.randomUUID()}`
  const tokenHash = await sha256(rawToken)
  const { ctx, ops } = createFakeContext({
    followupCheckin: {
      id: 'checkin-1',
      consultation_id: 'consultation-1',
      status: 'responded',
      answer: 'better',
      sent_at: new Date().toISOString(),
      new_consultation_id: null,
      saw_doctor: null,
      report_match: null,
    },
    followupToken: {
      id: 'followup-token-1',
      token_hash: tokenHash,
      purpose: 'respond',
      checkin_id: 'checkin-1',
      consultation_id: 'consultation-1',
      contact_email: 'guest@example.com',
      user_id: 'user-1',
      expires_at: new Date(Date.now() + DAY).toISOString(),
      used_at: new Date().toISOString(),
    },
  })

  const bad = await handleRespondFollowupCheckin(ctx, {
    action: 'respond_followup_checkin',
    followup_token: rawToken,
    followup_answer: 'better',
    followup_saw_doctor: 'kinda',
  })
  assertEquals(bad.status, 400)

  for (const saw of ['yes', 'no', 'not_yet'] as const) {
    const raw = `${crypto.randomUUID()}.${crypto.randomUUID()}`
    const hash = await sha256(raw)
    const { ctx: c, ops: o } = createFakeContext({
      followupCheckin: {
        id: 'checkin-1',
        consultation_id: 'consultation-1',
        status: 'responded',
        answer: 'same',
        saw_doctor: null,
        report_match: null,
        new_consultation_id: null,
      },
      followupToken: {
        id: 'followup-token-1',
        token_hash: hash,
        purpose: 'respond',
        checkin_id: 'checkin-1',
        consultation_id: 'consultation-1',
        contact_email: 'guest@example.com',
        expires_at: new Date(Date.now() + DAY).toISOString(),
        used_at: new Date().toISOString(),
      },
    })
    const res = await handleRespondFollowupCheckin(c, {
      action: 'respond_followup_checkin',
      followup_token: raw,
      followup_answer: 'same',
      followup_saw_doctor: saw,
    })
    assertEquals(res.status, 200)
    const body = await parseJson(res)
    assertEquals(body.status, 'ok')
    assertEquals(body.saw_doctor, saw)
    const updates = opsFor(o, 'libertymd_followup_checkins', 'update')
    assertTrue(updates.length >= 1)
    assertEquals((updates[updates.length - 1].payload as Record<string, unknown>).saw_doctor, saw)
  }

  // Silence unused from first fixture
  assertTrue(ops.length >= 0)
})

Deno.test('P4-02 AC2 · report_match closed set + product-framing ban in i18n', async () => {
  const rawToken = `${crypto.randomUUID()}.${crypto.randomUUID()}`
  const tokenHash = await sha256(rawToken)
  const { ctx, ops } = createFakeContext({
    followupCheckin: {
      id: 'checkin-1',
      status: 'responded',
      answer: 'better',
      saw_doctor: null,
      report_match: null,
      new_consultation_id: null,
    },
    followupToken: {
      id: 'followup-token-1',
      token_hash: tokenHash,
      purpose: 'respond',
      checkin_id: 'checkin-1',
      consultation_id: 'consultation-1',
      contact_email: 'guest@example.com',
      expires_at: new Date(Date.now() + DAY).toISOString(),
    },
  })

  const badMatch = await handleRespondFollowupCheckin(ctx, {
    action: 'respond_followup_checkin',
    followup_token: rawToken,
    followup_answer: 'better',
    followup_saw_doctor: 'yes',
    followup_report_match: 'exact',
  })
  assertEquals(badMatch.status, 400)

  const ok = await handleRespondFollowupCheckin(ctx, {
    action: 'respond_followup_checkin',
    followup_token: rawToken,
    followup_answer: 'better',
    followup_saw_doctor: 'yes',
    followup_report_match: 'unsure',
  })
  assertEquals(ok.status, 200)
  const body = await parseJson(ok)
  assertEquals(body.saw_doctor, 'yes')
  assertEquals(body.report_match, 'unsure')
  const updates = opsFor(ops, 'libertymd_followup_checkins', 'update')
  const last = updates[updates.length - 1].payload as Record<string, unknown>
  assertEquals(last.saw_doctor, 'yes')
  assertEquals(last.report_match, 'unsure')

  const en = JSON.parse(
    await Deno.readTextFile(new URL('../../i18n/locales/en.json', import.meta.url)),
  ) as { followup?: { checkin?: Record<string, string> } }
  const checkinCopy = Object.values(en.followup?.checkin || {}).join('\n')
  const page = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDFollowupCheckinPage.tsx', import.meta.url),
  )
  const banned = [
    'correct diagnosis',
    'we were right',
    'HIPAA',
    'sensitivity',
    'accuracy %',
  ]
  for (const phrase of banned) {
    assertEquals(
      checkinCopy.toLowerCase().includes(phrase.toLowerCase()),
      false,
      `checkin i18n banned: ${phrase}`,
    )
    assertEquals(
      page.toLowerCase().includes(phrase.toLowerCase()),
      false,
      `page banned: ${phrase}`,
    )
  }
  assertTrue(/product feedback/i.test(checkinCopy), 'matchHint product framing')
  assertTrue(/Not a clinical claim/i.test(checkinCopy), 'matchHint clinical claim ban')
})

Deno.test('P4-02 AC3/AC4 · migration columns + skip leaves null; no chase mailer', async () => {
  const sql = await Deno.readTextFile(
    new URL(
      '../../supabase/migrations/20260731280000_libertymd_followup_saw_doctor_p4_02.sql',
      import.meta.url,
    ),
  )
  assertTrue(/saw_doctor/.test(sql))
  assertTrue(/not_yet/.test(sql))
  assertTrue(/report_match/.test(sql))
  assertTrue(/unsure/.test(sql))
  assertTrue(!/filled_slots|chief_complaint|report_data|contact_email/.test(sql))

  const emailLib = await Deno.readTextFile(
    new URL('../../supabase/functions/libertymd-care-proxy/lib/followup-checkin.ts', import.meta.url),
  )
  assertEquals(/saw_doctor|Did you see a doctor/i.test(emailLib), false)
  const edge = await Deno.readTextFile(
    new URL('../../supabase/functions/libertymd-followup-checkin/index.ts', import.meta.url),
  )
  assertEquals(/saw_doctor|doctor.?visit|chase/i.test(edge), false)
})

Deno.test('P4-02 AC5 · triage × saw_doctor SQL artifact present', async () => {
  const sql = await Deno.readTextFile(
    new URL('../../scripts/sql/libertymd-followup-saw-doctor-by-triage.sql', import.meta.url),
  )
  assertTrue(/triage_tier/.test(sql))
  assertTrue(/saw_doctor/.test(sql))
  assertTrue(/turn_count/.test(sql))
  assertTrue(/top_dx_confidence|confidence_score/.test(sql))
  assertTrue(/is_speculative/.test(sql))
  assertTrue(/libertymd_followup_checkins/.test(sql))
})

Deno.test('P4-02 T1 · two-fire emit; categorical saw_doctor; no PHI; allow-list unchanged', () => {
  assertEquals(PRODUCT_EVENT_NAMES.includes('followup_responded' as never), false)
  assertEquals(PRODUCT_EVENT_NAMES.length, 18)

  const calls: Array<{ name: string; props: Record<string, unknown> }> = []
  __setLibertyMdTrackForTests((name, props) => {
    calls.push({ name, props })
  })
  try {
    emitFollowupResponded({ answer: 'worse' })
    emitFollowupResponded({
      answer: 'worse',
      saw_doctor: 'yes',
      report_match: 'no',
    })
    assertEquals(calls.length, 2)
    assertEquals(calls[0].props.answer, 'worse')
    assertEquals('saw_doctor' in calls[0].props, false)
    assertEquals(calls[1].props.saw_doctor, 'yes')
    assertEquals(calls[1].props.report_match, 'no')
    assertEquals(calls[1].props.answer, 'worse')
    for (const c of calls) {
      assertEquals(c.name, 'LibertyMd followup_responded')
      assertEquals('email' in c.props, false)
      assertEquals('triage_tier' in c.props, false)
      assertEquals('chief_complaint' in c.props, false)
    }
  } finally {
    __setLibertyMdTrackForTests(null)
  }
})

Deno.test('P4-02 Open Q4 · doctor one-shot lock; used_at does not block', async () => {
  const rawToken = `${crypto.randomUUID()}.${crypto.randomUUID()}`
  const tokenHash = await sha256(rawToken)
  const { ctx, ops } = createFakeContext({
    followupCheckin: {
      id: 'checkin-1',
      status: 'responded',
      answer: 'better',
      saw_doctor: null,
      report_match: null,
      new_consultation_id: null,
    },
    followupToken: {
      id: 'followup-token-1',
      token_hash: tokenHash,
      purpose: 'respond',
      checkin_id: 'checkin-1',
      consultation_id: 'consultation-1',
      contact_email: 'guest@example.com',
      expires_at: new Date(Date.now() + DAY).toISOString(),
      used_at: new Date().toISOString(),
    },
  })

  const first = await handleRespondFollowupCheckin(ctx, {
    action: 'respond_followup_checkin',
    followup_token: rawToken,
    followup_answer: 'better',
    followup_saw_doctor: 'no',
  })
  assertEquals(first.status, 200)
  const firstBody = await parseJson(first)
  assertEquals(firstBody.saw_doctor, 'no')
  assertEquals(firstBody.already_recorded, false)

  const second = await handleRespondFollowupCheckin(ctx, {
    action: 'respond_followup_checkin',
    followup_token: rawToken,
    followup_answer: 'better',
    followup_saw_doctor: 'yes',
  })
  assertEquals(second.status, 200)
  const secondBody = await parseJson(second)
  assertEquals(secondBody.already_recorded, true)
  assertEquals(secondBody.code, 'doctor_locked')
  assertEquals(secondBody.saw_doctor, 'no')

  const updates = opsFor(ops, 'libertymd_followup_checkins', 'update')
  assertEquals(updates.length, 1)
})

Deno.test('P4-02 R1 · page exposes doctor UI; email builder untouched; Lexicon two-fire', async () => {
  const page = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDFollowupCheckinPage.tsx', import.meta.url),
  )
  assertTrue(/data-libertymd-followup-doctor/.test(page))
  assertTrue(/data-libertymd-followup-saw-doctor/.test(page))
  assertTrue(/data-libertymd-followup-worse-cta/.test(page))
  assertTrue(/doctorSkip|followup\.checkin\.doctorSkip/.test(page))

  const lexicon = await Deno.readTextFile(
    new URL('../../docs/libertymd/MIXPANEL-LEXICON.md', import.meta.url),
  )
  assertTrue(/≤2 client fires|two-fire|Fire 2/i.test(lexicon))
  assertTrue(/report_match/.test(lexicon))
  assertTrue(/saw_doctor/.test(lexicon))
})
