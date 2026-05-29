#!/usr/bin/env node
/**
 * RLS post-hardening E2E smoke tests for portfolio products.
 * Usage: node scripts/product_rls_e2e_test.mjs [--email test@example.com] [--password password]
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(resolve(root, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const [k, ...rest] = t.split('=');
      env[k.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    /* no .env */
  }
  return env;
}

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const env = loadEnv();
const BASE = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const email = getArg('--email', 'test@example.com');
const password = getArg('--password', 'password');

const results = [];

function log(section, ok, detail) {
  results.push({ section, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${section}: ${detail}`);
}

async function req(path, { method = 'GET', body, token, prefer = 'return=representation' } = {}) {
  const headers = {
    apikey: ANON,
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (prefer && (method === 'POST' || method === 'PATCH')) headers.Prefer = prefer;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function invokeFunction(name, token, body) {
  const res = await fetch(`${BASE}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function main() {
  if (!BASE || !ANON) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
    process.exit(1);
  }

  // Auth
  let auth = await req('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  });
  if (auth.status !== 200) {
    // try signup
    const signup = await req('/auth/v1/signup', {
      method: 'POST',
      body: { email, password },
    });
    if (signup.status >= 400) {
      log('Auth', false, `login ${auth.status}, signup ${signup.status}: ${JSON.stringify(signup.data)}`);
      printSummary();
      process.exit(1);
    }
    auth = await req('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email, password },
    });
  }
  const token = auth.data?.access_token;
  const userId = auth.data?.user?.id;
  if (!token || !userId) {
    log('Auth', false, 'No access token');
    printSummary();
    process.exit(1);
  }
  log('Auth', true, `Signed in as ${email} (${userId.slice(0, 8)}…)`);

  // --- Health Twin ---
  let twinId;
  {
    const twins = await req('/rest/v1/health_twins?select=id&user_id=eq.' + userId + '&limit=1', { token });
    if (twins.status === 200 && twins.data?.length) {
      twinId = twins.data[0].id;
    } else {
      const created = await req('/rest/v1/health_twins', {
        method: 'POST',
        token,
        body: { user_id: userId, name: 'RLS E2E Twin', featured: false },
      });
      twinId = Array.isArray(created.data) ? created.data[0]?.id : created.data?.id;
    }
    log('Health Twin — create/read twin', !!twinId, twinId ? `twin ${twinId}` : JSON.stringify(created?.data ?? twins.data));

    if (twinId) {
      const sessionId = randomUUID();
      const sess = await req('/rest/v1/health_chat_sessions', {
        method: 'POST',
        token,
        body: { id: sessionId, twin_id: twinId, active: true },
      });
      const sessOk = sess.status >= 200 && sess.status < 300;
      log('Health Twin — chat session insert', sessOk, sessOk ? sessionId : JSON.stringify(sess.data));

      if (sessOk) {
        const msg = await req('/rest/v1/health_chat_messages', {
          method: 'POST',
          token,
          body: { session_id: sessionId, role: 'user', content: 'RLS e2e ping' },
        });
        log('Health Twin — chat message insert', msg.status >= 200 && msg.status < 300, JSON.stringify(msg.data)?.slice(0, 120));
      }

      const src = await req('/rest/v1/health_sources', {
        method: 'POST',
        token,
        body: {
          twin_id: twinId,
          source_type: 'lab_report',
          source_name: 'e2e-test.pdf',
          file_url: 'https://example.com/e2e-test.pdf',
          status: 'processing',
        },
      });
      log('Health Twin — lab source insert', src.status >= 200 && src.status < 300, JSON.stringify(src.data)?.slice(0, 120));

      // Storage upsert (health_documents)
      const storagePath = `e2e/${twinId}/test.txt`;
      const blob = new Blob(['health twin e2e'], { type: 'text/plain' });
      const up1 = await fetch(`${BASE}/storage/v1/object/health_documents/${storagePath}`, {
        method: 'POST',
        headers: {
          apikey: ANON,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/plain',
          'x-upsert': 'true',
        },
        body: blob,
      });
      const up2 = await fetch(`${BASE}/storage/v1/object/health_documents/${storagePath}`, {
        method: 'POST',
        headers: {
          apikey: ANON,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/plain',
          'x-upsert': 'true',
        },
        body: new Blob(['health twin e2e v2'], { type: 'text/plain' }),
      });
      log('Health Twin — storage upsert (initial)', up1.status >= 200 && up1.status < 300, String(up1.status));
      log('Health Twin — storage upsert (replace)', up2.status >= 200 && up2.status < 300, String(up2.status));

      const chatFn = await invokeFunction('chat-completion', token, {
        twin_id: twinId,
        session_id: sessionId,
        message_text: 'Hello from RLS e2e test',
        personal_details_snapshot: {},
      });
      log(
        'Health Twin — chat-completion edge fn',
        chatFn.status === 200,
        `status ${chatFn.status} ${JSON.stringify(chatFn.data)?.slice(0, 100)}`,
      );

      const playgroundFn = await invokeFunction('generate-wellness-playground', token, {
        playground_state: { age: 30, gender: 'M' },
        computed_scores: { overall: 75 },
      });
      log(
        'Health Twin — playground edge fn',
        playgroundFn.status === 200,
        `status ${playgroundFn.status}`,
      );
    }
  }

  // --- Trading Agents ---
  {
    const quote = await invokeFunction('trading-agents-proxy', token, { action: 'quote', ticker: 'AAPL' });
    log('Trading Agents — quote', quote.status === 200, `status ${quote.status}`);

    const lessons = await invokeFunction('trading-agents-proxy', token, {
      action: 'lessons_context',
      ticker: 'AAPL',
      market: 'us',
      limit: 3,
    });
    log('Trading Agents — lessons_context', lessons.status === 200, `status ${lessons.status}`);
  }

  // --- Mind Coach ---
  {
    let profileId;
    const prof = await req('/rest/v1/mind_coach_profiles?select=id&user_id=eq.' + userId + '&limit=1', { token });
    if (prof.status === 200 && prof.data?.length) {
      profileId = prof.data[0].id;
      log('Mind Coach — profile read', true, profileId);
    } else {
      const created = await req('/rest/v1/mind_coach_profiles', {
        method: 'POST',
        token,
        body: {
          user_id: userId,
          name: 'E2E User',
          age: 28,
          gender: 'other',
          concerns: ['stress'],
          therapist_persona: 'supportive',
        },
      });
      profileId = Array.isArray(created.data) ? created.data[0]?.id : created.data?.id;
      log('Mind Coach — profile create', !!profileId, profileId || JSON.stringify(created.data));
    }

    if (profileId) {
      const journey = await req('/rest/v1/mind_coach_journeys', {
        method: 'POST',
        token,
        body: { profile_id: profileId, pathway: 'engagement_rapport_and_assessment', status: 'active' },
      });
      const journeyId = Array.isArray(journey.data) ? journey.data[0]?.id : journey.data?.id;
      log('Mind Coach — journey insert', !!journeyId, journeyId || JSON.stringify(journey.data));

      const session = await req('/rest/v1/mind_coach_sessions', {
        method: 'POST',
        token,
        body: {
          profile_id: profileId,
          journey_id: journeyId,
          phase_number: 1,
          session_number: 1,
          pathway: 'engagement_rapport_and_assessment',
          session_state: 'intake',
          message_count: 0,
        },
      });
      const sessionId = Array.isArray(session.data) ? session.data[0]?.id : session.data?.id;
      log('Mind Coach — session insert', !!sessionId, sessionId || JSON.stringify(session.data));

      if (sessionId) {
        const msg = await req('/rest/v1/mind_coach_messages', {
          method: 'POST',
          token,
          body: {
            session_id: sessionId,
            profile_id: profileId,
            role: 'user',
            content: 'E2E test message',
          },
        });
        log('Mind Coach — message insert', msg.status >= 200 && msg.status < 300, JSON.stringify(msg.data)?.slice(0, 100));

        const personas = await req('/rest/v1/mind_coach_personas?select=id&limit=1', { token });
        log('Mind Coach — personas read', personas.status === 200, `count ${personas.data?.length ?? 0}`);

        const startFn = await invokeFunction('mind-coach-session-start', token, { profile_id: profileId });
        log('Mind Coach — session-start fn', startFn.status === 200, `status ${startFn.status}`);
      }
    }
  }

  // --- Ticketflow ---
  {
    const ticket = await req('/rest/v1/tickets', {
      method: 'POST',
      token,
      body: {
        title: 'RLS E2E Ticket',
        description: 'Automated test ticket',
        status: 'Open',
        priority: 'Medium',
        category: 'Bug',
        reporter: email,
      },
    });
    const ticketId = Array.isArray(ticket.data) ? ticket.data[0]?.id : ticket.data?.id;
    log('Ticketflow — ticket insert', !!ticketId, ticketId || JSON.stringify(ticket.data));

    if (ticketId) {
      const remark = await req('/rest/v1/remarks', {
        method: 'POST',
        token,
        body: {
          ticket_id: ticketId,
          author: email,
          text: 'E2E remark',
          type: 'remark',
          timestamp: Date.now(),
        },
      });
      log('Ticketflow — remark insert', remark.status >= 200 && remark.status < 300, JSON.stringify(remark.data)?.slice(0, 80));

      const list = await req('/rest/v1/tickets?select=*,remarks(*)&limit=3', { token });
      log('Ticketflow — tickets+remarks read', list.status === 200, `rows ${list.data?.length ?? 0}`);
    }
  }

  // --- InsightsLM ---
  {
    const nb = await req('/rest/v1/notebooks', {
      method: 'POST',
      token,
      body: { title: 'RLS E2E Notebook', user_id: userId },
    });
    const notebookId = Array.isArray(nb.data) ? nb.data[0]?.id : nb.data?.id;
    log('InsightsLM — notebook insert', !!notebookId, notebookId || JSON.stringify(nb.data));

    if (notebookId) {
      const src = await req('/rest/v1/sources', {
        method: 'POST',
        token,
        body: {
          notebook_id: notebookId,
          type: 'text',
          title: 'E2E pasted text',
          extracted_text: 'Sample content for RLS test',
        },
      });
      const sourceId = Array.isArray(src.data) ? src.data[0]?.id : src.data?.id;
      log('InsightsLM — source insert', !!sourceId, sourceId || JSON.stringify(src.data));

      const storagePath = `${userId}/${notebookId}/e2e-test.txt`;
      const up1 = await fetch(`${BASE}/storage/v1/object/InsightsLM/${storagePath}`, {
        method: 'POST',
        headers: {
          apikey: ANON,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/plain',
          'x-upsert': 'true',
        },
        body: new Blob(['insights e2e v1'], { type: 'text/plain' }),
      });
      const up2 = await fetch(`${BASE}/storage/v1/object/InsightsLM/${storagePath}`, {
        method: 'POST',
        headers: {
          apikey: ANON,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/plain',
          'x-upsert': 'true',
        },
        body: new Blob(['insights e2e v2'], { type: 'text/plain' }),
      });
      log('InsightsLM — storage upload', up1.status >= 200 && up1.status < 300, String(up1.status));
      log('InsightsLM — storage upsert replace', up2.status >= 200 && up2.status < 300, String(up2.status));

      if (sourceId) {
        const chatFn = await invokeFunction('chat-notebook', token, {
          message: 'Summarize the sources briefly',
          notebook_id: notebookId,
        });
        log('InsightsLM — chat-notebook fn', chatFn.status === 200, `status ${chatFn.status}`);
      }
    }
  }

  // --- AI Gating Lab ---
  {
    const history = await req('/rest/v1/ai_gate_assessments?select=id,status&limit=5', { token });
    log('AI Gating Lab — history read', history.status === 200, `rows ${history.data?.length ?? 0}`);

    const evalFn = await invokeFunction('ai-gating-evaluate', token, {
      title: 'RLS E2E Idea',
      idea_text: 'Build an internal tool to triage support tickets using deterministic rules first, then optional AI assist.',
      source: 'manual',
      preset_id: 'general',
    });
    log(
      'AI Gating Lab — evaluate fn',
      evalFn.status === 200,
      `status ${evalFn.status} ${JSON.stringify(evalFn.data)?.slice(0, 120)}`,
    );

    if (evalFn.status === 200) {
      const after = await req('/rest/v1/ai_gate_assessments?select=id,status&order=created_at.desc&limit=1', { token });
      log('AI Gating Lab — assessment persisted', after.status === 200 && after.data?.length > 0, JSON.stringify(after.data?.[0]));
    }
  }

  printSummary();
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}

function printSummary() {
  const failed = results.filter((r) => !r.ok);
  console.log('\n=== SUMMARY ===');
  console.log(`Total: ${results.length}, Passed: ${results.length - failed.length}, Failed: ${failed.length}`);
  if (failed.length) {
    console.log('\nFailures:');
    for (const f of failed) console.log(`  - ${f.section}: ${f.detail}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
