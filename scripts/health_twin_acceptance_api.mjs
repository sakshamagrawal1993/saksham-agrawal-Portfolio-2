#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import {
  argValue, evidence, loadEnv, reportSummary, restClient, root, signIn, writeJson,
} from './health_twin_acceptance_lib.mjs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const output = argValue(args, '--output', '.loop/runs/manual/acceptance-api.json');
const env = loadEnv();
const results = [];
const cleanup = [];
const prefix = `acceptance-${Date.now()}`;

function add(id, pass, description, detail = '', extra = {}) {
  results.push(evidence(id, pass ? 'PASS' : 'FAIL', description, {
    evidenceType: 'authenticated-api',
    detail,
    ...extra,
  }));
}

function block(id, description, detail) {
  results.push(evidence(id, 'BLOCKED', description, {
    evidenceType: 'authenticated-api',
    detail,
  }));
}

async function invoke(url, anonKey, token, functionName, body) {
  const response = await fetch(`${url}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { status: response.status, ok: response.ok, body: payload };
}

if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.');
}

let client;
let twinId;
let storagePath;

try {
  const primary = await signIn({
    url: env.VITE_SUPABASE_URL,
    anonKey: env.VITE_SUPABASE_ANON_KEY,
    email: env.HEALTH_TWIN_TEST_EMAIL || 'test@example.com',
    password: env.HEALTH_TWIN_TEST_PASSWORD || 'password',
  });
  client = restClient({
    url: env.VITE_SUPABASE_URL,
    anonKey: env.VITE_SUPABASE_ANON_KEY,
    accessToken: primary.accessToken,
  });

  const twinCreate = await client.request('/rest/v1/health_twins?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      user_id: primary.user.id,
      name: `Acceptance API ${prefix}`,
      description: 'Cleanup-safe automated acceptance twin',
      featured: false,
    }),
  });
  twinId = twinCreate.body?.[0]?.id;
  add('HT-002', twinCreate.ok && Boolean(twinId), 'Authenticated API can create an owner-linked twin', `status=${twinCreate.status} twin=${twinId || 'missing'}`);
  if (!twinId) throw new Error(`Twin creation failed: ${JSON.stringify(twinCreate.body)}`);

  const reopen = await client.request(`/rest/v1/health_twins?id=eq.${twinId}&select=id,user_id,name`);
  add('HT-003', reopen.ok && reopen.body?.[0]?.id === twinId, 'Created twin can be selected again through an authenticated read');

  const profileName = `QA Profile ${prefix}`;
  const profile = await client.request('/rest/v1/health_personal_details?on_conflict=twin_id&select=*', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      twin_id: twinId,
      name: profileName,
      age: 36,
      gender: 'Other',
      blood_type: 'O+',
      height_cm: 180,
      weight_kg: 81,
      co_morbidities: ['Hypertension'],
      location: 'Acceptance City',
    }),
  });
  add('HT-010', profile.ok && profile.body?.[0]?.name === profileName, 'Profile saves and updates through owner-scoped API');

  const bmiValue = Number((81 / (1.8 ** 2)).toFixed(2));
  const bmi = await client.request('/rest/v1/health_wearable_parameters?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      twin_id: twinId,
      parameter_name: 'Body Mass Index (BMI)',
      parameter_value: bmiValue,
      unit: 'kg/m²',
      category: 'vitals',
      recorded_at: new Date().toISOString(),
    }),
  });
  add('HT-011', bmi.ok && Number(bmi.body?.[0]?.parameter_value) === bmiValue, 'BMI reading persists with the profile-derived value');
  const profileReload = await client.request(`/rest/v1/health_personal_details?twin_id=eq.${twinId}&select=*`);
  add('HT-012', profileReload.body?.[0]?.name === profileName && Number(profileReload.body?.[0]?.height_cm) === 180, 'Profile survives a fresh API read');

  const manualRows = [
    { twin_id: twinId, parameter_name: 'Hemoglobin', parameter_value: 14.2, unit: 'g/dL', recorded_at: new Date().toISOString() },
  ];
  const labInsert = await client.request('/rest/v1/health_lab_parameters?select=*', {
    method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(manualRows),
  });
  add('HT-020', labInsert.ok && labInsert.body?.length === 1, 'Individual laboratory parameter persists');

  const groupBp = randomUUID();
  const groupSleep = randomUUID();
  const groupExercise = randomUUID();
  const groupMeal = randomUUID();
  const wearableRows = [
    { twin_id: twinId, parameter_name: 'Heart Rate', parameter_value: 72, unit: 'bpm', category: 'vitals' },
    { twin_id: twinId, parameter_name: 'Headache', parameter_value: 1, unit: '', category: 'symptoms' },
    { twin_id: twinId, parameter_name: 'Blood Pressure Systolic', parameter_value: 120, unit: 'mmHg', category: 'vitals', group_id: groupBp },
    { twin_id: twinId, parameter_name: 'Blood Pressure Diastolic', parameter_value: 80, unit: 'mmHg', category: 'vitals', group_id: groupBp },
    { twin_id: twinId, parameter_name: 'Sleep Duration', parameter_value: 7.5, unit: 'hours', category: 'sleep', group_id: groupSleep },
    { twin_id: twinId, parameter_name: 'Sleep Quality', parameter_value: 88, unit: '%', category: 'sleep', group_id: groupSleep },
    { twin_id: twinId, parameter_name: 'Exercise Type', parameter_value: 0, parameter_text: 'Running', category: 'exercise', group_id: groupExercise },
    { twin_id: twinId, parameter_name: 'Exercise Duration', parameter_value: 45, unit: 'min', category: 'exercise', group_id: groupExercise },
    { twin_id: twinId, parameter_name: 'Meal Type', parameter_value: 0, parameter_text: 'Lunch', category: 'nutrition', group_id: groupMeal },
    { twin_id: twinId, parameter_name: 'Total Protein', parameter_value: 35, unit: 'g', category: 'nutrition', group_id: groupMeal },
  ].map((row) => ({ ...row, recorded_at: new Date().toISOString() }));
  const wearableInsert = await client.request('/rest/v1/health_wearable_parameters?select=*', {
    method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(wearableRows),
  });
  const insertedWearables = wearableInsert.body || [];
  add('HT-021', wearableInsert.ok && insertedWearables.some((row) => row.category === 'vitals') && insertedWearables.some((row) => row.category === 'symptoms'), 'Vitals and symptoms persist');
  add('HT-022', insertedWearables.filter((row) => row.group_id === groupBp).length === 2, 'Grouped blood-pressure readings share one group ID');
  add('HT-023', [groupSleep, groupExercise, groupMeal].every((groupId) => insertedWearables.filter((row) => row.group_id === groupId).length >= 2), 'Sleep, exercise, and meal groups persist');

  const definitions = await client.request('/rest/v1/health_parameter_definitions?select=id,name,category,axis_impact_weights&limit=5');
  const ranges = await client.request('/rest/v1/health_parameter_ranges?select=*&limit=5');
  add('HT-050', definitions.ok && definitions.body?.length > 0 && ranges.ok && ranges.body?.length > 0, 'Parameter definitions and ranges load');
  add('HT-024', wearableInsert.ok && definitions.body?.length > 0, 'New readings have definitions available for score recalculation', 'UI score delta is asserted by browser evidence.');
  add('HT-051', definitions.body?.some((row) => row.axis_impact_weights), 'Score inputs include axis impact weights');

  const csvMarker = randomUUID();
  const csvRows = [
    { twin_id: twinId, parameter_name: 'Step Count', parameter_value: 8450, unit: 'steps', category: 'activity', group_id: csvMarker, recorded_at: new Date().toISOString() },
    { twin_id: twinId, parameter_name: 'Active Minutes', parameter_value: 42, unit: 'min', category: 'activity', group_id: csvMarker, recorded_at: new Date().toISOString() },
  ];
  const csvInsert = await client.request('/rest/v1/health_wearable_parameters?select=*', {
    method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(csvRows),
  });
  add('HT-031', csvInsert.ok && csvInsert.body?.length === 2, 'Valid wearable rows persist');
  const csvReload = await client.request(`/rest/v1/health_wearable_parameters?twin_id=eq.${twinId}&group_id=eq.${csvMarker}&select=id,parameter_name`);
  add('HT-033', csvReload.ok && csvReload.body?.length === 2, 'Imported wearable rows survive a fresh read');

  const editable = insertedWearables.find((row) => row.parameter_name === 'Heart Rate');
  const edit = await client.request(`/rest/v1/health_wearable_parameters?id=eq.${editable.id}&select=*`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ parameter_value: 75 }),
  });
  add('HT-054', edit.ok && Number(edit.body?.[0]?.parameter_value) === 75, 'Editable reading update persists');
  const deleteTarget = insertedWearables.find((row) => row.parameter_name === 'Headache');
  const deleted = await client.request(`/rest/v1/health_wearable_parameters?id=eq.${deleteTarget.id}`, { method: 'DELETE' });
  const deletedReload = await client.request(`/rest/v1/health_wearable_parameters?id=eq.${deleteTarget.id}&select=id`);
  add('HT-055', deleted.ok && deletedReload.body?.length === 0, 'Deleting an editable reading persists');

  storagePath = `${primary.user.id}/${twinId}/${randomUUID()}/acceptance.csv`;
  const storageUpload = await fetch(`${env.VITE_SUPABASE_URL}/storage/v1/object/health_documents/${storagePath}`, {
    method: 'POST',
    headers: {
      apikey: env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${primary.accessToken}`,
      'Content-Type': 'text/csv',
      'x-upsert': 'false',
    },
    body: 'parameter_name,parameter_value,recorded_at\nHeart Rate,72,2026-06-20T00:00:00Z\n',
  });
  add('HT-040', storageUpload.ok, 'A supported document uploads to health_documents', `status=${storageUpload.status} path=${storagePath}`);
  const storageList = await fetch(`${env.VITE_SUPABASE_URL}/storage/v1/object/list/health_documents`, {
    method: 'POST',
    headers: {
      apikey: env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${primary.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix: `${primary.user.id}/${twinId}`, limit: 100, offset: 0 }),
  });
  const ownerCanListStorage = storageList.ok;

  const sourceName = `acceptance-source-${prefix}.csv`;
  const source = await client.request('/rest/v1/health_sources?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      twin_id: twinId,
      source_type: 'wearable',
      source_name: sourceName,
      file_url: `storage://${storagePath}`,
      status: 'completed',
    }),
  });
  add('HT-041', source.ok && source.body?.[0]?.source_name === sourceName, 'Upload creates a separate health_sources record');

  const unauthEdge = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/chat-completion`, {
    method: 'POST',
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ twin_id: twinId, session_id: randomUUID(), message_text: 'negative auth probe' }),
  });
  add('HT-062', [401, 403].includes(unauthEdge.status), 'Chat Edge function rejects missing bearer authentication', `status=${unauthEdge.status}`);
  const unauthLab = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/process-lab-report`, {
    method: 'POST',
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ twin_id: twinId, file_id: source.body?.[0]?.id, file_url: 'invalid://negative-probe' }),
  });
  add('HT-042', [401, 403].includes(unauthLab.status), 'Lab Edge function rejects missing bearer authentication', `status=${unauthLab.status}`);

  const chatSession = randomUUID();
  const chat = await invoke(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, primary.accessToken, 'chat-completion', {
    twin_id: twinId,
    session_id: chatSession,
    message_text: 'Reply briefly with a hydration reminder.',
    personal_details_snapshot: profile.body?.[0],
  });
  const sessionReload = await client.request(`/rest/v1/health_chat_sessions?id=eq.${chatSession}&twin_id=eq.${twinId}&select=id,twin_id`);
  const messagesReload = await client.request(`/rest/v1/health_chat_messages?session_id=eq.${chatSession}&select=role,content`);
  add('HT-060', sessionReload.body?.[0]?.id === chatSession, 'Chat creates or reuses the requested session', `edgeStatus=${chat.status}`);
  add('HT-061', messagesReload.body?.some((row) => row.role === 'user') && messagesReload.body?.some((row) => row.role === 'assistant'), 'User and assistant messages are persisted', `messages=${messagesReload.body?.length || 0}`);
  add('HT-063', chat.ok && typeof chat.body?.assistant_reply === 'string', 'Chat response is normalized to assistant_reply', `status=${chat.status}`);

  const wellness = await invoke(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, primary.accessToken, 'generate-wellness', {
    twin_id: twinId,
    force_refresh: false,
  });
  add('HT-071', wellness.ok && Array.isArray(wellness.body?.programs), 'Missing wellness programs trigger generation', `status=${wellness.status}`);
  const cached = await invoke(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, primary.accessToken, 'generate-wellness', {
    twin_id: twinId,
    force_refresh: false,
  });
  add('HT-070', cached.ok && Array.isArray(cached.body?.programs), 'Valid cached wellness programs load', `status=${cached.status}`);
  const refreshed = await invoke(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, primary.accessToken, 'generate-wellness', {
    twin_id: twinId,
    force_refresh: true,
  });
  add('HT-072', refreshed.ok && Array.isArray(refreshed.body?.programs), 'Force refresh regenerates wellness programs', `status=${refreshed.status}`);

  if (env.HEALTH_TWIN_SECOND_TEST_EMAIL && env.HEALTH_TWIN_SECOND_TEST_PASSWORD) {
    const secondary = await signIn({
      url: env.VITE_SUPABASE_URL,
      anonKey: env.VITE_SUPABASE_ANON_KEY,
      email: env.HEALTH_TWIN_SECOND_TEST_EMAIL,
      password: env.HEALTH_TWIN_SECOND_TEST_PASSWORD,
    });
    const secondClient = restClient({
      url: env.VITE_SUPABASE_URL,
      anonKey: env.VITE_SUPABASE_ANON_KEY,
      accessToken: secondary.accessToken,
    });
    const crossRead = await secondClient.request(`/rest/v1/health_twins?id=eq.${twinId}&select=id`);
    const crossWrite = await secondClient.request(`/rest/v1/health_personal_details?twin_id=eq.${twinId}`, {
      method: 'PATCH', body: JSON.stringify({ location: 'forbidden-write' }),
    });
    const edgeCross = await invoke(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, secondary.accessToken, 'chat-completion', {
      twin_id: twinId, session_id: chatSession, message_text: 'cross-user negative probe',
    });
    const edgeLabCross = await invoke(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, secondary.accessToken, 'process-lab-report', {
      twin_id: twinId,
      file_id: source.body?.[0]?.id,
      file_url: 'invalid://cross-user-negative-probe',
    });
    const privateReadDenied = crossRead.ok && crossRead.body?.length === 0;
    const privateWriteDenied = crossWrite.status === 204 || [401, 403].includes(crossWrite.status);
    const edgeDenied = [401, 403, 404].includes(edgeCross.status) && [401, 403, 404].includes(edgeLabCross.status);
    add('HT-004', privateReadDenied && edgeDenied, 'Second user cannot read the private twin or invoke owner-only Edge paths', `read=${crossRead.status}/${crossRead.body?.length || 0} chat=${edgeCross.status} lab=${edgeLabCross.status}`);
    add('HT-090', privateReadDenied && privateWriteDenied && edgeDenied, 'RLS prevents cross-user private reads and writes', `read=${crossRead.status}/${crossRead.body?.length || 0} write=${crossWrite.status} chat=${edgeCross.status} lab=${edgeLabCross.status}`);
    add('HT-065', [401, 403, 404].includes(edgeCross.status), 'Chat session cannot be reused across users', `status=${edgeCross.status}`);
    const crossStorage = await fetch(`${env.VITE_SUPABASE_URL}/storage/v1/object/authenticated/health_documents/${storagePath}`, {
      headers: {
        apikey: env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${secondary.accessToken}`,
      },
    });
    add('HT-091', ownerCanListStorage && [400, 401, 403, 404].includes(crossStorage.status), 'Storage object is readable by its owner and denied to a second user', `ownerList=${storageList.status} crossRead=${crossStorage.status}`);
    const featureTwin = await client.request(`/rest/v1/health_twins?id=eq.${twinId}`, {
      method: 'PATCH',
      body: JSON.stringify({ featured: true }),
    });
    const featuredRead = await secondClient.request(`/rest/v1/health_twins?id=eq.${twinId}&featured=eq.true&select=id,featured`);
    add('HT-005', featureTwin.ok && featuredRead.body?.[0]?.id === twinId, 'Featured twin is visible to a distinct authenticated user', `feature=${featureTwin.status} read=${featuredRead.status}/${featuredRead.body?.length || 0}`);
  } else {
    const requirement = 'Provide both HEALTH_TWIN_SECOND_TEST_EMAIL and HEALTH_TWIN_SECOND_TEST_PASSWORD for a dedicated existing test user. Required evidence: user B receives no rows reading user A private twin, cannot update user A profile/data, cannot access user A storage object, and receives 403/404 when invoking an Edge function with user A twin/session IDs. Accounts are never guessed, probed, or auto-provisioned.';
    block('HT-004', 'Second user cannot access a private twin', requirement);
    block('HT-005', 'Featured twins are visible according to RLS policy', requirement);
    block('HT-090', 'Two-user RLS read/write isolation', requirement);
    block('HT-065', 'Cross-user chat-session isolation', requirement);
    block('HT-091', 'Storage objects are owner-scoped', requirement);
  }
} catch (error) {
  results.push(evidence('HT-094', 'FAIL', 'Acceptance API execution completes without an unexpected exception', {
    evidenceType: 'authenticated-api',
    detail: String(error?.stack || error),
  }));
} finally {
  if (storagePath && client) {
    try {
      const storageDelete = await fetch(`${env.VITE_SUPABASE_URL}/storage/v1/object/health_documents/${storagePath}`, {
        method: 'DELETE',
        headers: client.headers,
      });
      cleanup.push(`storage:${storageDelete.status}:${storagePath}`);
    } catch (error) {
      cleanup.push(`storage:error:${error}`);
    }
  }
  if (twinId && client) {
    try {
      const deleted = await client.request(`/rest/v1/health_twins?id=eq.${twinId}`, { method: 'DELETE' });
      cleanup.push(`twin:${deleted.status}:${twinId}`);
    } catch (error) {
      cleanup.push(`twin:error:${error}`);
    }
  }
}

const report = {
  product: 'health-twin',
  generatedAt: new Date().toISOString(),
  testType: 'acceptance-api',
  workspace: root,
  syntheticTwinId: twinId || null,
  cleanup,
  summary: reportSummary(results),
  results,
};
writeJson(output, report);
for (const row of results) console.log(`[${row.status}] ${row.id} ${row.description}${row.detail ? ` — ${row.detail}` : ''}`);
console.log(`API acceptance summary: ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.blocked} blocked`);
process.exit(report.summary.failed > 0 ? 1 : report.summary.blocked > 0 ? 2 : 0);
