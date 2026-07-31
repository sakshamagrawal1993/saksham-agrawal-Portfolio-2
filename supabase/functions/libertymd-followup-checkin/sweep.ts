/**
 * P4-01 · Check-in sweeper core (enqueue + pending retry).
 *
 * Separates first-time enqueue from `pending` retry so a failed Resend never
 * leaves the consult stuck in forever-noop via hasExistingCheckin.
 */
import {
  assertEmailContainsNoClinicalLeak,
  buildFollowupCheckinEmail,
  buildFollowupRespondUrl,
  buildFollowupUnsubscribeUrl,
  coalesceReportReadyAt,
  evaluateCheckinClock,
  exceedsGlobalSendCap,
  followupTokenExpiresAt,
  mintFollowupToken,
  normalizeDeliveryEmail,
  resolvePublicAppOrigin,
  sendFollowupCheckinEmail,
} from '../libertymd-care-proxy/lib/followup-checkin.ts'

// Minimal subset of Supabase client used by the sweeper (hermetic tests inject fakes).
export type SweepDb = {
  from: (table: string) => any
}

export type ConsultCandidate = {
  id: string
  user_id: string | null
  status: string
  completed_at: string | null
  updated_at: string | null
}

export type ExistingCheckin = {
  id: string
  status: string
  contact_email: string | null
}

export type CheckinProcessAction = 'enqueue' | 'retry_pending' | 'noop'

/** Ledger branch: pending rows must retry send; terminal statuses noop. */
export function resolveExistingCheckinAction(
  existing: ExistingCheckin | null,
): CheckinProcessAction {
  if (!existing) return 'enqueue'
  if (existing.status === 'pending') return 'retry_pending'
  return 'noop'
}

async function isUnsubscribed(
  db: SweepDb,
  email: string,
  userId: string | null,
): Promise<boolean> {
  const { data: byEmail } = await db
    .from('libertymd_followup_unsubscribes')
    .select('id')
    .eq('contact_email', email)
    .maybeSingle()
  if (byEmail) return true
  if (userId) {
    const { data: byUser } = await db
      .from('libertymd_followup_unsubscribes')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()
    if (byUser) return true
  }
  return false
}

async function latestSentDeliveryEmail(
  db: SweepDb,
  consultationId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from('libertymd_report_delivery_tokens')
    .select('contact_email,sent_at,created_at')
    .eq('consultation_id', consultationId)
    .not('sent_at', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data?.contact_email) return null
  return normalizeDeliveryEmail(String(data.contact_email))
}

async function getExistingCheckin(
  db: SweepDb,
  consultationId: string,
): Promise<ExistingCheckin | null> {
  const { data } = await db
    .from('libertymd_followup_checkins')
    .select('id,status,contact_email')
    .eq('consultation_id', consultationId)
    .maybeSingle()
  if (!data) return null
  return {
    id: String((data as ExistingCheckin).id),
    status: String((data as ExistingCheckin).status),
    contact_email: (data as ExistingCheckin).contact_email ?? null,
  }
}

async function recentSendsForCap(
  db: SweepDb,
  email: string,
  userId: string | null,
): Promise<Array<string | null>> {
  const { data: byEmail } = await db
    .from('libertymd_followup_checkins')
    .select('sent_at')
    .eq('contact_email', email)
    .not('sent_at', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(5)
  const ats: Array<string | null> = (byEmail || []).map(
    (r: { sent_at?: string | null }) => r.sent_at ?? null,
  )
  if (userId) {
    const { data: byUser } = await db
      .from('libertymd_followup_checkins')
      .select('sent_at')
      .eq('user_id', userId)
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(5)
    for (const r of byUser || []) {
      ats.push((r as { sent_at?: string | null }).sent_at ?? null)
    }
  }
  return ats
}

async function mintAndStoreTokens(
  db: SweepDb,
  args: {
    checkinId: string
    consultationId: string
    email: string
    userId: string | null
    nowMs: number
  },
): Promise<{ respondRaw: string; unsubRaw: string }> {
  // Remint on every send attempt — raw tokens are not durable; hashes alone cannot rebuild links.
  await db.from('libertymd_followup_tokens').delete().eq('checkin_id', args.checkinId)

  const respondMint = await mintFollowupToken()
  const unsubMint = await mintFollowupToken()
  const expiresAt = followupTokenExpiresAt(args.nowMs)
  const { error: tokenError } = await db.from('libertymd_followup_tokens').insert([
    {
      token_hash: respondMint.tokenHash,
      purpose: 'respond',
      checkin_id: args.checkinId,
      consultation_id: args.consultationId,
      contact_email: args.email,
      user_id: args.userId,
      expires_at: expiresAt,
    },
    {
      token_hash: unsubMint.tokenHash,
      purpose: 'unsubscribe',
      checkin_id: args.checkinId,
      consultation_id: args.consultationId,
      contact_email: args.email,
      user_id: args.userId,
      expires_at: expiresAt,
    },
  ])
  if (tokenError) throw tokenError
  return { respondRaw: respondMint.rawToken, unsubRaw: unsubMint.rawToken }
}

async function sendAndMaybeMarkSent(
  db: SweepDb,
  args: {
    checkinId: string
    email: string
    respondRaw: string
    unsubRaw: string
    nowMs: number
  },
): Promise<'sent' | 'noop'> {
  const origin = resolvePublicAppOrigin()
  const content = buildFollowupCheckinEmail({
    betterUrl: buildFollowupRespondUrl(origin, args.respondRaw, 'better'),
    sameUrl: buildFollowupRespondUrl(origin, args.respondRaw, 'same'),
    worseUrl: buildFollowupRespondUrl(origin, args.respondRaw, 'worse'),
    unsubscribeUrl: buildFollowupUnsubscribeUrl(origin, args.unsubRaw),
  })
  assertEmailContainsNoClinicalLeak(content, [
    'differential',
    'diagnosis',
    'triage',
    'chief_complaint',
    'SOAP',
  ])

  const sendResult = await sendFollowupCheckinEmail({ to: args.email, content })
  if (!sendResult.ok) {
    // Leave pending for subsequent cron retry — do not mark sent.
    console.log('libertymd followup checkin: send_failed=1')
    return 'noop'
  }

  const sentAt = new Date(args.nowMs).toISOString()
  const { error: sentError } = await db
    .from('libertymd_followup_checkins')
    .update({ status: 'sent', sent_at: sentAt, updated_at: sentAt })
    .eq('id', args.checkinId)
    .eq('status', 'pending')
  if (sentError) throw sentError
  return 'sent'
}

/**
 * Retry path for an existing `pending` ledger row (prior send failure).
 * Re-checks clock / address / unsub / cap; remints tokens; conditional pending→sent.
 */
async function retryPendingCheckin(
  db: SweepDb,
  existing: ExistingCheckin,
  consult: ConsultCandidate,
  nowMs: number,
  dryRun: boolean,
): Promise<'sent' | 'skipped' | 'noop'> {
  const { data: report } = await db
    .from('libertymd_reports')
    .select('id,created_at')
    .eq('consultation_id', consult.id)
    .maybeSingle()
  if (!report) return 'skipped'

  const reportReadyAtMs = coalesceReportReadyAt({
    completedAt: consult.completed_at,
    reportCreatedAt: (report as { created_at?: string }).created_at ?? null,
    consultationUpdatedAt: consult.updated_at,
  })
  const clock = evaluateCheckinClock({
    status: consult.status,
    reportReadyAtMs,
    nowMs,
  })
  if (!clock.ok) {
    if (clock.reason === 'past_open_tail' && !dryRun) {
      await db
        .from('libertymd_followup_checkins')
        .update({
          status: 'skipped',
          skip_reason: 'past_open_tail',
          updated_at: new Date(nowMs).toISOString(),
        })
        .eq('id', existing.id)
        .eq('status', 'pending')
      return 'skipped'
    }
    return 'noop'
  }

  const email = await latestSentDeliveryEmail(db, consult.id)
  if (!email) return 'noop'

  if (await isUnsubscribed(db, email, consult.user_id)) {
    if (!dryRun) {
      await db
        .from('libertymd_followup_checkins')
        .update({
          status: 'skipped',
          skip_reason: 'unsubscribed',
          contact_email: email,
          updated_at: new Date(nowMs).toISOString(),
        })
        .eq('id', existing.id)
        .eq('status', 'pending')
    }
    return 'skipped'
  }

  const recent = await recentSendsForCap(db, email, consult.user_id)
  if (exceedsGlobalSendCap({ recentSendAts: recent, nowMs })) {
    if (!dryRun) {
      await db
        .from('libertymd_followup_checkins')
        .update({
          status: 'skipped',
          skip_reason: 'global_cap',
          contact_email: email,
          updated_at: new Date(nowMs).toISOString(),
        })
        .eq('id', existing.id)
        .eq('status', 'pending')
    }
    return 'skipped'
  }

  if (dryRun) return 'sent'

  const tokens = await mintAndStoreTokens(db, {
    checkinId: existing.id,
    consultationId: consult.id,
    email,
    userId: consult.user_id,
    nowMs,
  })
  return sendAndMaybeMarkSent(db, {
    checkinId: existing.id,
    email,
    respondRaw: tokens.respondRaw,
    unsubRaw: tokens.unsubRaw,
    nowMs,
  })
}

/**
 * First-time enqueue for a consult with no ledger row.
 */
async function enqueueNewCheckin(
  db: SweepDb,
  consult: ConsultCandidate,
  nowMs: number,
  dryRun: boolean,
): Promise<'sent' | 'skipped' | 'noop'> {
  const { data: report } = await db
    .from('libertymd_reports')
    .select('id,created_at')
    .eq('consultation_id', consult.id)
    .maybeSingle()
  if (!report) return 'skipped'

  const reportReadyAtMs = coalesceReportReadyAt({
    completedAt: consult.completed_at,
    reportCreatedAt: (report as { created_at?: string }).created_at ?? null,
    consultationUpdatedAt: consult.updated_at,
  })
  const clock = evaluateCheckinClock({
    status: consult.status,
    reportReadyAtMs,
    nowMs,
  })
  if (!clock.ok) {
    if (clock.reason === 'past_open_tail') {
      if (!dryRun) {
        const emailOrSentinel = (await latestSentDeliveryEmail(db, consult.id)) || '_no_address_'
        const dueMs = reportReadyAtMs != null
          ? reportReadyAtMs + 72 * 60 * 60 * 1000
          : nowMs
        await db.from('libertymd_followup_checkins').insert({
          consultation_id: consult.id,
          user_id: consult.user_id,
          contact_email: emailOrSentinel,
          due_at: new Date(dueMs).toISOString(),
          open_until: new Date(dueMs + 7 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'skipped',
          skip_reason: 'past_open_tail',
        })
      }
      return 'skipped'
    }
    return 'noop'
  }

  const email = await latestSentDeliveryEmail(db, consult.id)
  if (!email) {
    // No address → no send; remain discoverable until open tail ends.
    return 'noop'
  }

  if (await isUnsubscribed(db, email, consult.user_id)) {
    if (!dryRun) {
      await db.from('libertymd_followup_checkins').insert({
        consultation_id: consult.id,
        user_id: consult.user_id,
        contact_email: email,
        due_at: new Date(clock.dueAtMs).toISOString(),
        open_until: new Date(clock.openUntilMs).toISOString(),
        status: 'skipped',
        skip_reason: 'unsubscribed',
      })
    }
    return 'skipped'
  }

  const recent = await recentSendsForCap(db, email, consult.user_id)
  if (exceedsGlobalSendCap({ recentSendAts: recent, nowMs })) {
    if (!dryRun) {
      await db.from('libertymd_followup_checkins').insert({
        consultation_id: consult.id,
        user_id: consult.user_id,
        contact_email: email,
        due_at: new Date(clock.dueAtMs).toISOString(),
        open_until: new Date(clock.openUntilMs).toISOString(),
        status: 'skipped',
        skip_reason: 'global_cap',
      })
    }
    return 'skipped'
  }

  if (dryRun) return 'sent'

  const { data: checkin, error: insertError } = await db
    .from('libertymd_followup_checkins')
    .insert({
      consultation_id: consult.id,
      user_id: consult.user_id,
      contact_email: email,
      due_at: new Date(clock.dueAtMs).toISOString(),
      open_until: new Date(clock.openUntilMs).toISOString(),
      status: 'pending',
    })
    .select('id')
    .single()
  if (insertError) {
    // Unique consult → concurrent sweeper; treat as idempotent noop.
    if ((insertError as { code?: string }).code === '23505') return 'noop'
    throw insertError
  }

  const tokens = await mintAndStoreTokens(db, {
    checkinId: checkin.id,
    consultationId: consult.id,
    email,
    userId: consult.user_id,
    nowMs,
  })
  return sendAndMaybeMarkSent(db, {
    checkinId: checkin.id,
    email,
    respondRaw: tokens.respondRaw,
    unsubRaw: tokens.unsubRaw,
    nowMs,
  })
}

export async function processCandidate(
  db: SweepDb,
  consult: ConsultCandidate,
  nowMs: number,
  dryRun: boolean,
): Promise<'sent' | 'skipped' | 'noop'> {
  const existing = await getExistingCheckin(db, consult.id)
  const action = resolveExistingCheckinAction(existing)
  if (action === 'noop') return 'noop'
  if (action === 'retry_pending') {
    return retryPendingCheckin(db, existing!, consult, nowMs, dryRun)
  }
  return enqueueNewCheckin(db, consult, nowMs, dryRun)
}
