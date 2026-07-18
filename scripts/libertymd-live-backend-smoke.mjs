import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required')
}

const createTestClient = () => createClient(url, anonKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
})

async function createAnonymousSession() {
  const client = createTestClient()
  const { data, error } = await client.auth.signInAnonymously()
  if (error || !data.session) {
    const message = error?.message || 'Anonymous session was not created'
    if (/anonymous sign-ins are disabled/i.test(message)) {
      console.error(JSON.stringify({
        passed: false,
        blocked: true,
        blocker: 'Supabase anonymous sign-ins are disabled for the shared project',
      }, null, 2))
      process.exit(2)
    }
    throw error || new Error(message)
  }
  return { client, session: data.session }
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

const primary = await createAnonymousSession()
const checks = []

const bootstrap = await invoke(primary.session, { action: 'bootstrap' })
assert(bootstrap.data.is_anonymous === true, 'bootstrap must identify the new user as anonymous')
assert(Array.isArray(bootstrap.data.history) && bootstrap.data.history.length === 0, 'anonymous history must be empty')
checks.push('anonymous bootstrap')

const emergency = await invoke(primary.session, {
  action: 'start_consultation',
  message: 'I have crushing chest pain and pain radiating to my left arm.',
})
assert(emergency.data.emergency === true, 'heart attack symptoms must stop the consultation')
assert(emergency.data.safety?.force_end === true, 'emergency response must force_end')
checks.push('deterministic emergency stop')

const started = await invoke(primary.session, {
  action: 'start_consultation',
  message: 'I have had a low fever and mild tiredness.',
})
const consultationId = started.data.consultation_id
assert(consultationId && started.data.state === 'awaiting_demographics', 'normal intake must request demographics')
assert(/age/i.test(started.data.acknowledgement) && /sex/i.test(started.data.acknowledgement), 'first reply must acknowledge and request age and sex')
checks.push('acknowledgement and demographics gate')

const demographics = await invoke(primary.session, {
  action: 'save_demographics',
  consultation_id: consultationId,
  age: 34,
  sex_at_birth: 'male',
})
assert(demographics.data.next_question, 'demographics submission must continue the interview')
checks.push('demographics persistence')

const clientMessageId = crypto.randomUUID()
const firstTurn = await invoke(primary.session, {
  action: 'send_message',
  consultation_id: consultationId,
  client_message_id: clientMessageId,
  message: 'It began yesterday evening and the highest temperature was 100.4 F.',
})
assert(firstTurn.data.next_question || firstTurn.data.report_ready, 'first patient answer must advance the consultation')

const replay = await invoke(primary.session, {
  action: 'send_message',
  consultation_id: consultationId,
  client_message_id: clientMessageId,
  message: 'It began yesterday evening and the highest temperature was 100.4 F.',
})
assert(replay.data.replayed === true, 'a completed client message id must replay')

const afterReplay = await invoke(primary.session, {
  action: 'get_consultation',
  consultation_id: consultationId,
})
const duplicateCount = afterReplay.data.messages.filter((message) =>
  message.role === 'user' && message.content === 'It began yesterday evening and the highest temperature was 100.4 F.'
).length
assert(duplicateCount === 1, 'a retry must not duplicate the patient message')
checks.push('idempotent retry replay')

const concurrentBodies = [
  {
    action: 'send_message',
    consultation_id: consultationId,
    client_message_id: crypto.randomUUID(),
    message: 'I also have a mild dry cough.',
  },
  {
    action: 'send_message',
    consultation_id: consultationId,
    client_message_id: crypto.randomUUID(),
    message: 'I do not have shortness of breath.',
  },
]
const concurrent = await Promise.all(concurrentBodies.map((body) => invoke(primary.session, body, [200, 409])))
assert(concurrent.filter((result) => result.status === 200).length === 1, 'only one concurrent turn may be accepted')
assert(concurrent.filter((result) => result.status === 409 && result.data.retryable === true).length === 1, 'the competing turn must be retryable')
checks.push('concurrent turn rejection')

const secondary = await createAnonymousSession()
const crossUser = await invoke(secondary.session, {
  action: 'get_consultation',
  consultation_id: consultationId,
}, [404])
assert(crossUser.status === 404, 'another user must not read the consultation')
checks.push('cross-user consultation isolation')

console.log(JSON.stringify({
  passed: true,
  checks,
  note: 'The smoke uses synthetic health data and creates short-lived anonymous test records.',
}, null, 2))
