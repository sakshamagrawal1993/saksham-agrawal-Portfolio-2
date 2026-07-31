/**
 * P1-16 — Mixpanel HTTP fan-out helper for LibertyMD product events.
 *
 * Called only from `lib/telemetry.ts` after a successful Postgres insert.
 * Missing/empty `MIXPANEL_TOKEN` ⇒ no-op. Soft-fail never throws to the caller.
 * Never log the token or PHI property bags.
 */
import { MIXPANEL_FETCH_TIMEOUT_MS } from './config.ts'

/** Central Mixpanel display-name prefix (never hand-type at call sites). */
export const LIBERTYMD_EVENT_PREFIX = 'LibertyMd '

export const MIXPANEL_TRACK_URL = 'https://api.mixpanel.com/track'

export type MixpanelSoftFailClass = 'timeout' | 'http_error' | 'missing_token' | 'network'

export type MixpanelPropertyValue = string | number | boolean

/** In-memory counters — Mixpanel loss must be detectable (AC5). */
export const mixpanelSoftFailCounts: Record<MixpanelSoftFailClass, number> = {
  timeout: 0,
  http_error: 0,
  missing_token: 0,
  network: 0,
}

const pendingFanOut: Promise<unknown>[] = []

function readMixpanelToken(): string {
  try {
    return (Deno.env.get('MIXPANEL_TOKEN') || '').trim()
  } catch {
    return ''
  }
}

function recordSoftFail(cls: MixpanelSoftFailClass) {
  mixpanelSoftFailCounts[cls] += 1
  // missing_token is the steady no-op rollback path — countable, not per-emit spam.
  if (cls === 'missing_token') return
  console.warn('LibertyMD mixpanel soft-fail', { class: cls })
}

/**
 * Fire-and-forget scheduling (P0-15a shape). Prefer `EdgeRuntime.waitUntil`
 * when present; otherwise detach with a swallowed rejection.
 */
export function scheduleDetached(task: Promise<unknown>) {
  const guarded = task.catch(() => {})
  pendingFanOut.push(guarded)
  const edgeRuntime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void }
  }).EdgeRuntime
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(guarded)
    return
  }
  void guarded
}

/** Test-only: drain detached Mixpanel work so spies can assert. */
export async function flushMixpanelFanOutForTests() {
  const batch = pendingFanOut.splice(0, pendingFanOut.length)
  await Promise.allSettled(batch)
}

/** Test-only: reset soft-fail counters between cases. */
export function resetMixpanelSoftFailCountsForTests() {
  mixpanelSoftFailCounts.timeout = 0
  mixpanelSoftFailCounts.http_error = 0
  mixpanelSoftFailCounts.missing_token = 0
  mixpanelSoftFailCounts.network = 0
}

/**
 * Best-effort Mixpanel `/track`. Never throws. Empty token ⇒ no-op soft path.
 */
export async function trackMixpanelEvent(input: {
  eventName: string
  distinctId: string
  properties: Record<string, MixpanelPropertyValue>
}): Promise<void> {
  const token = readMixpanelToken()
  if (!token) {
    recordSoftFail('missing_token')
    return
  }

  const payload = [{
    event: input.eventName,
    properties: {
      ...input.properties,
      token,
      distinct_id: input.distinctId,
      time: Math.floor(Date.now() / 1000),
    },
  }]

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MIXPANEL_FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(MIXPANEL_TRACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        data: JSON.stringify(payload),
        strict: '1',
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      recordSoftFail('http_error')
    }
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    if (name === 'AbortError' || name === 'TimeoutError') {
      recordSoftFail('timeout')
    } else {
      recordSoftFail('network')
    }
  } finally {
    clearTimeout(timer)
  }
}
