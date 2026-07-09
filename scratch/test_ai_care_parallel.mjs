/**
 * Local smoke test for ai-care-proxy parallel guardrail + optional SSE.
 * Usage:
 *   node --env-file=.env.local scratch/test_ai_care_parallel.mjs
 *   AI_CARE_FN_URL=http://127.0.0.1:54321/functions/v1/ai-care-proxy node --env-file=.env.local scratch/test_ai_care_parallel.mjs
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const fnUrl =
  process.env.AI_CARE_FN_URL ||
  `${supabaseUrl}/functions/v1/ai-care-proxy`;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
}

const EMAIL = process.env.AI_CARE_TEST_EMAIL || 'test@example.com';
const PASSWORD = process.env.AI_CARE_TEST_PASSWORD || 'password';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

function parseSse(text) {
  const events = [];
  for (const block of text.split('\n\n')) {
    if (!block.trim()) continue;
    let event = 'message';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (!data) continue;
    try {
      events.push({ event, data: JSON.parse(data) });
    } catch {
      events.push({ event, data });
    }
  }
  return events;
}

async function invoke(token, body, { stream = false } = {}) {
  const t0 = Date.now();
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ ...body, stream }),
  });
  const ttfbMs = Date.now() - t0;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/event-stream')) {
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      ms: Date.now() - t0,
      ttfb_ms: ttfbMs,
      stream: true,
      events: parseSse(text),
      raw: text,
    };
  }
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, ms: Date.now() - t0, ttfb_ms: ttfbMs, stream: false, json };
}

async function main() {
  console.log('=== AI Care parallel/stream smoke ===');
  console.log('fnUrl:', fnUrl);
  console.log('auth as:', EMAIL);

  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (authError || !auth.session) {
    console.error('Login failed:', authError);
    process.exit(1);
  }
  const token = auth.session.access_token;
  console.log('logged in user:', auth.user.id);

  // Close any active sessions so start_session is clean for FE later
  await supabase
    .from('jivi_chat_sessions')
    .update({ status: 'completed' })
    .eq('user_id', auth.user.id)
    .eq('status', 'active');

  console.log('\n--- start_session ---');
  const start = await invoke(token, { action: 'start_session', user_id: auth.user.id });
  console.log(JSON.stringify({ ok: start.ok, status: start.status, ms: start.ms, json: start.json }, null, 2));
  if (!start.ok || !start.json?.session_id) {
    process.exit(1);
  }
  const sessionId = start.json.session_id;

  console.log('\n--- send_message JSON (normal headache) ---');
  const normal = await invoke(token, {
    action: 'send_message',
    session_id: sessionId,
    message: 'I have a mild headache for two days, no fever',
  });
  console.log(
    JSON.stringify(
      {
        ok: normal.ok,
        status: normal.status,
        ms: normal.ms,
        emergency: normal.json?.emergency,
        next_question: normal.json?.next_question?.slice?.(0, 120),
        options_count: normal.json?.options?.length,
        parallel: normal.json?.parallel,
        timing: normal.json?.timing,
        error: normal.json?.error,
      },
      null,
      2,
    ),
  );

  console.log('\n--- send_message SSE (knee pain) ---');
  const streamed = await invoke(
    token,
    {
      action: 'send_message',
      session_id: sessionId,
      message: 'My right knee hurts a bit after jogging yesterday',
    },
    { stream: true },
  );
  const finals = (streamed.events || []).filter((e) => e.event === 'final');
  const statuses = (streamed.events || []).filter((e) => e.event === 'status').map((e) => e.data?.state);
  const tokens = (streamed.events || []).filter((e) => e.event === 'token').length;
  console.log(
    JSON.stringify(
      {
        ok: streamed.ok,
        status: streamed.status,
        ms: streamed.ms,
        stream: streamed.stream,
        status_events: statuses,
        token_events: tokens,
        final: finals[0]?.data
          ? {
              state: finals[0].data.state,
              emergency: finals[0].data.emergency,
              next_question: finals[0].data.next_question?.slice?.(0, 120),
              parallel: finals[0].data.parallel,
              timing: finals[0].data.timing,
              guardrail_source: finals[0].data.guardrail_source,
            }
          : null,
      },
      null,
      2,
    ),
  );

  // Fresh session for emergency so prior messages don't confuse
  console.log('\n--- start_session (emergency case) ---');
  await supabase
    .from('jivi_chat_sessions')
    .update({ status: 'completed' })
    .eq('id', sessionId);
  const start2 = await invoke(token, { action: 'start_session', user_id: auth.user.id });
  const session2 = start2.json?.session_id;
  if (!session2) {
    console.error('Failed to start emergency session', start2);
    process.exit(1);
  }

  console.log('\n--- send_message JSON (deterministic emergency: chest pain) ---');
  const emg = await invoke(token, {
    action: 'send_message',
    session_id: session2,
    message: 'I have severe chest pain and cannot breathe',
  });
  console.log(
    JSON.stringify(
      {
        ok: emg.ok,
        status: emg.status,
        ms: emg.ms,
        emergency: emg.json?.emergency,
        message: emg.json?.message?.slice?.(0, 160),
        guardrail_source: emg.json?.guardrail_source,
        timing: emg.json?.timing,
      },
      null,
      2,
    ),
  );

  console.log('\n--- send_message SSE (deterministic emergency) ---');
  const start3 = await invoke(token, { action: 'start_session', user_id: auth.user.id });
  const session3 = start3.json?.session_id;
  const emgStream = await invoke(
    token,
    {
      action: 'send_message',
      session_id: session3,
      message: 'Sudden worst headache of my life',
    },
    { stream: true },
  );
  const emgFinal = (emgStream.events || []).find((e) => e.event === 'final')?.data;
  console.log(
    JSON.stringify(
      {
        ok: emgStream.ok,
        ms: emgStream.ms,
        stream: emgStream.stream,
        final: emgFinal
          ? {
              state: emgFinal.state,
              emergency: emgFinal.emergency,
              guardrail_source: emgFinal.guardrail_source,
              message: emgFinal.message?.slice?.(0, 160),
            }
          : null,
      },
      null,
      2,
    ),
  );

  const pass =
    normal.ok &&
    !!normal.json?.next_question &&
    streamed.ok &&
    streamed.stream &&
    finals[0]?.data?.state === 'asking_question' &&
    emg.ok &&
    emg.json?.emergency === true &&
    emg.json?.guardrail_source === 'deterministic' &&
    emg.ms < 4000 && // network + DB writes; deterministic path skips n8n
    emgStream.ok &&
    emgFinal?.emergency === true &&
    emgFinal?.guardrail_source === 'deterministic';

  console.log('\n=== RESULT:', pass ? 'PASS' : 'FAIL', '===');
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
