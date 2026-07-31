/**
 * Product + identity event emission.
 *
 * Moved verbatim from index.ts in L0-5 (pure structural refactor).
 * Lane E owns this module.
 *
 * Two sinks, one emit point (CONTEXT.md §5): `libertymd_product_events` is the
 * auditable source of truth. The Mixpanel fan-out is not wired here yet — that
 * is P1-16, and it lands in this module.
 *
 * No PHI in properties. Bucket numerics, never pass raw symptom text.
 */
import type { ProxyContext } from './context.ts'
import type { JsonObject } from './types.ts'

export async function addProductEvent(
  ctx: ProxyContext,
  eventName: string,
  consultationId: string | null = null,
  properties: JsonObject = {},
) {
  const { error } = await ctx.db.from('libertymd_product_events').insert({
    user_id: ctx.user.id,
    consultation_id: consultationId,
    event_name: eventName,
    properties,
  })
  if (error) throw error
}

export async function addIdentityEvent(
  ctx: ProxyContext,
  eventType: string,
  consultationId: string | null = null,
  metadata: JsonObject = {},
) {
  const { error } = await ctx.db.from('libertymd_identity_events').insert({
    user_id: ctx.user.id,
    consultation_id: consultationId,
    event_type: eventType,
    provider: ctx.isAnonymous ? 'anonymous' : String(ctx.user.app_metadata?.provider || 'google'),
    metadata,
  })
  if (error) throw error
}
