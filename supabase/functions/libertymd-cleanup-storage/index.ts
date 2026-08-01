/** P5-MEDIA — BO 2026-08-01: uploads live at most 30 days. Env-overridable. */
const MEDIA_MAX_AGE_DAYS = Number(Deno.env.get('LIBERTYMD_MEDIA_MAX_AGE_DAYS') || '30')

/**
 * P1-24 · libertymd-cleanup-storage
 *
 * Thin service_role Edge runner: after P1-23 Postgres cleanup, reconcile
 * orphan objects in private bucket `libertymd-care` via Storage API remove.
 * Never SQL DELETE FROM storage.objects as retention.
 * Never target libertymd-assets.
 * Logs numeric deleted_storage_objects only (no path/PHI prose).
 *
 * Schedule (runbook): same UTC family as P1-23 — prefer 0 7 * * * or +5m
 * (0 5 7 * * *). Do not enable destructive prod purge until dry-run counts recorded.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  LIBERTYMD_CARE_BUCKET,
  assertCleanupBucket,
  consultationIdFromCarePath,
} from './path.ts'

const REMOVE_BATCH = 100

type OrphanRow = {
  object_path: string
  consultation_id_text: string
}

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

async function listOrphanPaths(
  db: ReturnType<typeof createClient>,
): Promise<string[]> {
  const { data, error } = await db.rpc('list_libertymd_care_storage_orphans')
  if (error) {
    throw new Error(`orphan list failed: ${error.message}`)
  }
  const rows = (data || []) as OrphanRow[]
  const paths: string[] = []
  for (const row of rows) {
    const path = typeof row.object_path === 'string' ? row.object_path : ''
    if (!path) continue
    // Retention key: first segment must parse as consultation UUID.
    if (!consultationIdFromCarePath(path)) continue
    paths.push(path)
  }
  return paths
}

/**
 * P5-MEDIA — objects past the 30-day age limit, regardless of whether their
 * consultation still exists.
 *
 * Deliberately separate from orphan detection: an orphan is "the parent row is
 * gone", an expired object is "this file has simply lived long enough". A photo
 * on a live consult is never an orphan, so without this it would never be
 * deleted at all.
 */
async function listExpiredPaths(
  db: ReturnType<typeof createClient>,
  maxAgeDays: number,
): Promise<string[]> {
  // Cast: the generated Database types predate this function, and regenerating
  // them is a separate change. The row shape is pinned by the migration.
  const { data, error } = await (db.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: Array<{ object_path?: unknown }> | null; error: { message: string } | null }>)(
    'list_libertymd_care_storage_expired',
    { p_max_age_days: maxAgeDays },
  )
  if (error) {
    throw new Error(`expired list failed: ${error.message}`)
  }
  return (data || [])
    .map((row) => String(row.object_path || ''))
    .filter(Boolean)
}

async function removePaths(
  db: ReturnType<typeof createClient>,
  paths: string[],
): Promise<number> {
  assertCleanupBucket(LIBERTYMD_CARE_BUCKET)
  let deleted = 0
  for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
    const batch = paths.slice(i, i + REMOVE_BATCH)
    const { data, error } = await db.storage.from(LIBERTYMD_CARE_BUCKET).remove(batch)
    if (error) {
      throw new Error(`storage.remove failed: ${error.message}`)
    }
    deleted += Array.isArray(data) ? data.length : batch.length
  }
  return deleted
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
    return jsonResponse({ error: 'Storage cleanup is not configured' }, 503)
  }
  if (!authorize(req, serviceRoleKey)) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  // Dry-run query param: list/count only, zero Storage mutations.
  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dry_run') === '1' ||
    url.searchParams.get('dry_run') === 'true'

  try {
    assertCleanupBucket(LIBERTYMD_CARE_BUCKET)
    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const orphanPaths = await listOrphanPaths(db)
    const expiredPaths = await listExpiredPaths(db, MEDIA_MAX_AGE_DAYS)
    // Union, not concat: an object can be both orphaned and expired, and
    // deleting the same path twice would double-count the log figure.
    const orphanAndExpired = Array.from(new Set([...orphanPaths, ...expiredPaths]))
    const wouldDelete = orphanAndExpired.length

    if (dryRun) {
      console.log(
        `libertymd storage cleanup dry-run: would_delete_storage_objects=${wouldDelete}`,
      )
      return jsonResponse({
        ok: true,
        dry_run: true,
        deleted_storage_objects: 0,
        would_delete_storage_objects: wouldDelete,
        bucket: LIBERTYMD_CARE_BUCKET,
      })
    }

    // Must be the SAME set the dry-run counted. Deleting only orphans here while
    // the dry-run reported orphans+expired would make the dry-run a lie, which
    // is worse than having no dry-run at all.
    const deleted_storage_objects = await removePaths(db, orphanAndExpired)
    console.log(
      `libertymd storage cleanup: deleted_storage_objects=${deleted_storage_objects}`,
    )

    return jsonResponse({
      ok: true,
      dry_run: false,
      deleted_storage_objects,
      bucket: LIBERTYMD_CARE_BUCKET,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'cleanup failed'
    console.error(`libertymd storage cleanup error: ${message}`)
    return jsonResponse({ ok: false, error: 'cleanup failed' }, 500)
  }
})
