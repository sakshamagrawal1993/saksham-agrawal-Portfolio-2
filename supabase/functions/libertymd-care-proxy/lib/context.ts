/**
 * Per-request context: the authenticated identity and the service-role client.
 *
 * Extracted from the index.ts request closure in L0-5 (pure structural refactor).
 *
 * Architectural rules this module carries:
 *   - Identity comes from the JWT. `user` is resolved from the Authorization
 *     header via the anon client; a client-supplied user id is never trusted.
 *   - The proxy is the sole clinical writer. `db` is the only service-role
 *     client in the function, and it is created here once per request.
 */
import { createClient, type SupabaseClient, type User } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse } from './errors.ts'
import type { ClinicalLanguage } from './journey-locale.ts'

export interface ProxyContext {
  db: SupabaseClient
  user: User
  isAnonymous: boolean
  /** performance.now() captured before the request body was read. */
  requestStartedAt: number
  /**
   * P3-07 — clinical journey language for Mixpanel `locale` super.
   * Handlers set from consultations.language (or gated start result).
   */
  clinicalLocale?: ClinicalLanguage
}

export type ContextResult =
  | { ok: true; ctx: ProxyContext }
  | { ok: false; response: Response }

export async function createProxyContext(req: Request, requestStartedAt: number): Promise<ContextResult> {
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader) return { ok: false, response: jsonResponse({ error: 'Authentication required' }, 401) }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return { ok: false, response: jsonResponse({ error: 'LibertyMD backend is not configured' }, 503) }
  }

  const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: authError } = await authClient.auth.getUser()
  if (authError || !user) return { ok: false, response: jsonResponse({ error: 'Invalid session' }, 401) }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const isAnonymous = user.is_anonymous === true || (!user.email && user.app_metadata?.provider === 'anonymous')

  return { ok: true, ctx: { db, user, isAnonymous, requestStartedAt } }
}
