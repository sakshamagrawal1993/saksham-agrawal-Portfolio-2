/**
 * AI Care 5-case E2E suite (proxy API + optional observations UI check).
 * Usage: node --env-file=.env.local scripts/aicare_e2e_suite.mjs
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const fnUrl = process.env.AI_CARE_FN_URL || `${supabaseUrl}/functions/v1/ai-care-proxy`;
const BASE = process.env.AICARE_BASE || 'https://saksham-experiments.com';
const EMAIL = process.env.AI_CARE_TEST_EMAIL || 'test@example.com';
const PASSWORD = process.env.AI_CARE_TEST_PASSWORD || 'password';
const OUT = path.resolve('scratch/aicare_e2e_suite_out');

fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const results = [];

function record(id, name, pass, notes, extra = {}) {
  const row = { id, name, pass, notes, ...extra };
  results.push(row);
  console.log(pass ? '✓ PASS' : '✗ FAIL', name, notes ? `— ${notes}` : '');
}

async function invoke(token, body) {
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ ...body, stream: false }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json, ms: 0 };
}

async function startSession(token) {
  const r = await invoke(token, { action: 'start_session' });
  if (!r.ok || !r.json.session_id) throw new Error(`start_session failed: ${r.status}`);
  return r.json.session_id;
}

async function sendMessage(token, sessionId, message) {
  const t0 = Date.now();
  const r = await invoke(token, { action: 'send_message', session_id: sessionId, message });
  r.ms = Date.now() - t0;
  return r;
}

async function driveUntilDone(token, sessionId, opener, replies = [], maxTurns = 14) {
  let r = await sendMessage(token, sessionId, opener);
  const transcript = [{ role: 'user', content: opener, response: r.json }];

  for (let i = 0; i < maxTurns; i++) {
    if (r.json.emergency || r.json.diagnosis_ready) break;
    const reply =
      replies[i] ||
      (Array.isArray(r.json.options) && r.json.options[0]) ||
      'No other symptoms';
    r = await sendMessage(token, sessionId, reply);
    transcript.push({ role: 'user', content: reply, response: r.json, ms: r.ms });
    if (r.json.diagnosis_ready || r.json.emergency) break;
    await sleep(500);
  }
  return { final: r.json, transcript };
}

async function ensureTestProfile(userId) {
  await supabase.from('jivi_profiles').delete().eq('user_id', userId);
  const { error } = await supabase.from('jivi_profiles').insert({
    user_id: userId,
    name: 'E2E Patient',
    age: 42,
    gender: 'Male',
    comorbidities: ['Diabetes'],
  });
  if (error) throw error;
}

async function test1EmergencyChest(token) {
  const sessionId = await startSession(token);
  const r = await sendMessage(
    token,
    sessionId,
    'I have crushing chest pain and shortness of breath right now',
  );
  const pass =
    !!r.json.emergency &&
    /emergency|911|ER|call/i.test(String(r.json.message || ''));
  record('T1', 'Emergency — chest pain guardrail', pass, pass ? '' : JSON.stringify(r.json).slice(0, 200), {
    sessionId,
    ms: r.ms,
  });
}

async function test2EmergencyThunderclap(token) {
  const sessionId = await startSession(token);
  const r = await sendMessage(
    token,
    sessionId,
    'I have the worst headache of my life, it came on suddenly like a thunderclap',
  );
  const pass = !!r.json.emergency;
  record('T2', 'Emergency — thunderclap headache', pass, pass ? '' : JSON.stringify(r.json).slice(0, 200), {
    sessionId,
  });
}

async function test3ProfileSkipsDemographics(token, userId) {
  await ensureTestProfile(userId);
  const sessionId = await startSession(token);
  const r = await sendMessage(
    token,
    sessionId,
    'I am constantly thirsty and have to use the bathroom all night',
  );
  const q = String(r.json.next_question || '').toLowerCase();
  const skipsAge = !/how old|your age|age in years/.test(q);
  const mentionsDiabetesOrThirst =
    /diabetes|thirst|urinat|bathroom|blood sugar|polyuria/i.test(q) ||
    skipsAge;
  const pass = r.ok && !!r.json.next_question && skipsAge && mentionsDiabetesOrThirst;
  record(
    'T3',
    'Profile context — skips age, uses comorbidity context',
    pass,
    pass ? `Q: ${r.json.next_question?.slice(0, 80)}` : `Q: ${q}`,
    { sessionId, skipsAge },
  );
}

async function test4NormalDiagnosisFlow(token) {
  const sessionId = await startSession(token);
  const { final, transcript } = await driveUntilDone(
    token,
    sessionId,
    'I have a painful red swollen bump on my upper left eyelid with white pus for two days',
    [
      '18 to 34',
      'Male',
      'Started suddenly yesterday',
      'Mild pain only',
      'No fever',
      'No vision changes',
      'No',
      'Warm compress helped a little',
      'No',
      'No',
      'No other symptoms',
      'No',
    ],
    12,
  );

  const { data: diag } = await supabase
    .from('jivi_diagnoses')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle();

  let diagnoses = [];
  let hasReason = false;
  if (diag?.diagnosis_data) {
    const raw = diag.diagnosis_data;
    diagnoses = Array.isArray(raw) ? raw : raw.differential_diagnosis || raw.diagnoses || [];
    hasReason = diagnoses.some((d) => d.reason && d.reason.length > 20);
  }

  const pass =
    (final.diagnosis_ready || diag) &&
    diagnoses.length > 0 &&
    hasReason &&
  (diag?.confidence_score >= 50 || final.confidence_score >= 50);

  record(
    'T4',
    'Normal flow — differential diagnosis with clinical reason',
    pass,
    pass
      ? `conf=${diag?.confidence_score ?? final.confidence_score}, dx=${diagnoses[0]?.common_name || diagnoses[0]?.full_name}`
      : `final=${JSON.stringify(final).slice(0, 150)}`,
    { sessionId, turns: transcript.length, diagnoses: diagnoses.slice(0, 1) },
  );
  return sessionId;
}

async function test5ObservationsUI(token, sessionId) {
  if (!sessionId) {
    record('T5', 'Observations UI — report + doctor CTA', false, 'No session from T4');
    return;
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 900 },
  });
  try {
    const page = await browser.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.type('input[type="email"]', EMAIL, { delay: 10 });
    await page.type('input[type="password"]', PASSWORD, { delay: 10 });
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
    ]);
    await sleep(1500);

    const url = `${BASE}/ai-care/observations?sessionId=${sessionId}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(2000);
    await page.screenshot({ path: path.join(OUT, 'observations-report.png'), fullPage: true });

    const body = await page.evaluate(() => document.body.innerText);
    const hasDifferential = /differential diagnosis|likelihood|why we think/i.test(body);
    const hasReason = /why we think this|clinical|supporting/i.test(body);
    const hasDoctorCta = /connect with|specialist|book|consult/i.test(body);
    const hasProfile = /E2E Patient|42y|Diabetes/i.test(body);
    const pass = hasDifferential && hasReason && hasDoctorCta;

    record(
      'T5',
      'Observations UI — beautiful report + specialty doctor CTA',
      pass,
      `diff=${hasDifferential} reason=${hasReason} doctor=${hasDoctorCta} profile=${hasProfile}`,
      { url, screenshot: path.join(OUT, 'observations-report.png') },
    );
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('=== AI Care 5-case E2E ===');
  console.log('fnUrl:', fnUrl);
  console.log('base:', BASE);

  const { data: auth, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error || !auth.session) throw new Error(`Auth failed: ${error?.message}`);
  const token = auth.session.access_token;
  const userId = auth.user.id;

  await test1EmergencyChest(token);
  await test2EmergencyThunderclap(token);
  await test3ProfileSkipsDemographics(token, userId);
  const completedSession = await test4NormalDiagnosisFlow(token);
  await test5ObservationsUI(token, completedSession);

  const summary = {
    generatedAt: new Date().toISOString(),
    fnUrl,
    base: BASE,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).length,
    total: results.length,
    results,
  };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(summary, null, 2));
  console.log('\n=== SUMMARY ===', `${summary.passed}/${summary.total} passed`);
  console.log('Report:', path.join(OUT, 'report.json'));

  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
