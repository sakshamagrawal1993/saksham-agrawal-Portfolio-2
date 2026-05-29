#!/usr/bin/env node
/**
 * E2E test: InsightsLM PDF upload → signed URL → process-source → n8n
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const root = new URL('..', import.meta.url).pathname;
function loadEnv() {
  const env = {};
  for (const line of readFileSync(`${root}/.env`, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = loadEnv();
const BASE = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const N8N = 'https://n8n.saksham-experiments.com';
const SECRET = 'mTuhEe3JKWUxmUnG';

async function main() {
  const auth = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com', password: 'password' }),
  }).then((r) => r.json());
  const token = auth.access_token;
  const userId = auth.user.id;

  const nbRes = await fetch(`${BASE}/rest/v1/notebooks`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ title: 'Source E2E Notebook', user_id: userId }),
  });
  const notebook = (await nbRes.json())[0];
  console.log('notebook', notebook?.id, nbRes.status);

  const filePath = `${userId}/${notebook.id}/insightslm-e2e-test.pdf`;
  const pdfBytes = readFileSync('/tmp/insightslm-e2e-test.pdf');

  const up = await fetch(`${BASE}/storage/v1/object/InsightsLM/${filePath}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/pdf',
      'x-upsert': 'true',
    },
    body: pdfBytes,
  });
  console.log('upload', up.status, await up.text());

  const signed = await fetch(
    `${BASE}/storage/v1/object/sign/InsightsLM/${filePath}`,
    {
      method: 'POST',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: 3600 }),
    },
  ).then((r) => r.json());
  const fileUrl = signed.signedURL
    ? `${BASE}/storage/v1${signed.signedURL}`
    : signed.signedUrl;
  console.log('signed url ok', !!fileUrl);

  // verify n8n can fetch signed url
  const fetchProbe = await fetch(fileUrl);
  console.log('n8n-fetch probe', fetchProbe.status, fetchProbe.headers.get('content-type'));

  const sourceId = randomUUID();
  const srcIns = await fetch(`${BASE}/rest/v1/sources`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      id: sourceId,
      notebook_id: notebook.id,
      type: 'pdf',
      title: 'insightslm-e2e-test.pdf',
      storage_path: filePath,
    }),
  });
  console.log('source insert', srcIns.status, (await srcIns.text()).slice(0, 120));

  const n8nBody = {
    source_id: sourceId,
    notebook_id: notebook.id,
    file_url: fileUrl,
    source_type: 'pdf',
    file_name: 'insightslm-e2e-test.pdf',
  };

  const n8nDirect = await fetch(
    `${N8N}/webhook/7b9bb8e0-68fa-463f-87f2-2cf0bb1db4e6`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-n8n-secret': SECRET },
      body: JSON.stringify(n8nBody),
    },
  );
  console.log('n8n direct', n8nDirect.status, (await n8nDirect.text()).slice(0, 400));

  const edge = await fetch(`${BASE}/functions/v1/process-source`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(n8nBody),
  });
  console.log('process-source', edge.status, (await edge.text()).slice(0, 400));
}

main().catch(console.error);
