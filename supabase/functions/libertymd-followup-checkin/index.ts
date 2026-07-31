/**
 * P4-01 · libertymd-followup-checkin
 *
 * Dedicated Edge cron: enqueue + send ~72h feeling check-in emails.
 * Auth: service_role Bearer (P1-24 pattern). Never piggybacks cleanup deletes.
 * Address SoT: latest libertymd_report_delivery_tokens row with sent_at IS NOT NULL.
 * Never send for emergency_stopped. No clinical blobs on ledger.
 * Failed send leaves status=pending; subsequent cron retries via processCandidate.
 *
 * Schedule: see scripts/sql/libertymd-checkin-cron-runbook.sql
 * Dry-run: ?dry_run=1
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { processCandidate, type ConsultCandidate } from './sweep.ts'

const BATCH_LIMIT = 50

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function authorize(req: Request, serviceRoleKey: string): boolean {
  const auth = req.headers.get('Authorization') || ''
  return auth === `Bearer ${serviceRoleKey}`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Follow-up check-in is not configured' }, 503)
  }
  if (!authorize(req, serviceRoleKey)) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dry_run') === '1' ||
    url.searchParams.get('dry_run') === 'true'
  const nowMs = Date.now()

  try {
    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Candidate window: report-ready statuses updated in last ~14d (due+tail+slack).
    const sinceIso = new Date(nowMs - 14 * 24 * 60 * 60 * 1000).toISOString()
    const { data: consults, error } = await db
      .from('libertymd_consultations')
      .select('id,user_id,status,completed_at,updated_at')
      .in('status', ['completed', 'report_pending_auth'])
      .gte('updated_at', sinceIso)
      .order('updated_at', { ascending: true })
      .limit(BATCH_LIMIT)
    if (error) throw error

    let sent = 0
    let skipped = 0
    let noop = 0
    for (const row of consults || []) {
      const consult = row as ConsultCandidate
      // Hard exclusion — never enqueue emergency (status filter already excludes).
      if (consult.status === 'emergency_stopped') {
        skipped += 1
        continue
      }
      const result = await processCandidate(db, consult, nowMs, dryRun)
      if (result === 'sent') sent += 1
      else if (result === 'skipped') skipped += 1
      else noop += 1
    }

    console.log(
      `libertymd followup checkin: sent=${sent} skipped=${skipped} noop=${noop} dry_run=${dryRun ? 1 : 0}`,
    )

    return jsonResponse({
      ok: true,
      dry_run: dryRun,
      sent,
      skipped,
      noop,
      scanned: (consults || []).length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'checkin failed'
    console.error(`libertymd followup checkin error: ${message}`)
    return jsonResponse({ ok: false, error: 'checkin failed' }, 500)
  }
})
