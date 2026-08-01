import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required')
}

const clientForSmoke = () => createClient(url, anonKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
})

async function anonymousSession() {
  const client = clientForSmoke()
  const { data, error } = await client.auth.signInAnonymously()
  if (error || !data.session) throw error || new Error('Anonymous session was not created')
  return data.session
}

async function invoke(session, body, expectedStatuses = [200]) {
  const response = await fetch(`${url}/functions/v1/libertymd-care-proxy`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ region: 'US', ...body }),
  })
  const data = await response.json().catch(() => ({}))
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(`${body.action} returned HTTP ${response.status}: ${JSON.stringify(data)}`)
  }
  return { status: response.status, data }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

// One-pixel transparent PNG. Synthetic and deliberately contains no person or health data.
const transparentPixel =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/69lkWQAAAABJRU5ErkJggg=='

const owner = await anonymousSession()
const started = await invoke(owner, {
  action: 'start_consultation',
  message: 'This is a synthetic attachment storage test for a small mark on an arm.',
})
const consultationId = started.data.consultation_id
assert(typeof consultationId === 'string' && consultationId, 'test consultation was not created')

const uploaded = await invoke(owner, {
  action: 'upload_photo',
  consultation_id: consultationId,
  content_type: 'image/png',
  image_base64: transparentPixel,
})
const objectUuid = uploaded.data.object_uuid
assert(uploaded.data.ok === true, 'photo upload did not succeed')
assert(uploaded.data.raw_retained === true, 'proxy did not report private raw retention')
assert(
  uploaded.data.path === `${consultationId}/photo/${objectUuid}`,
  'private path did not match the locked consultation/photo/object contract',
)
assert(typeof uploaded.data.signed_url === 'string', 'signed URL was not returned')
assert(uploaded.data.expires_in === 900, 'signed URL TTL must be 900 seconds')

const signedFetch = await fetch(uploaded.data.signed_url)
assert(signedFetch.ok, `signed private object fetch returned HTTP ${signedFetch.status}`)
assert((await signedFetch.arrayBuffer()).byteLength > 0, 'signed private object was empty')

// The retry route is considered reachable even if the synthetic blank image is
// not analyzable by the model; either response proves the server-owned object
// was resolved without accepting a client-provided path.
const retried = await invoke(owner, {
  action: 'retry_photo_analysis',
  consultation_id: consultationId,
  object_uuid: objectUuid,
}, [200, 502])
assert(
  retried.status === 200 || (
    retried.data.code === 'analysis_failed'
    && retried.data.retry_available === true
  ),
  'retry route did not reach the stored-object analysis boundary',
)

const otherUser = await anonymousSession()
const isolated = await invoke(otherUser, {
  action: 'retry_photo_analysis',
  consultation_id: consultationId,
  object_uuid: objectUuid,
}, [404])
assert(isolated.status === 404, 'another user must not be able to retry the object')

console.log(JSON.stringify({
  passed: true,
  checks: [
    'private path contract',
    '900-second signed read',
    'stored-object retry route',
    'cross-user retry isolation',
  ],
  analysis_ready: uploaded.data.analysis_retry_available !== true,
  retry_completed: retried.status === 200,
  note: 'Synthetic one-pixel image only; raw object expires under the 30-day P1-24 policy.',
}, null, 2))
