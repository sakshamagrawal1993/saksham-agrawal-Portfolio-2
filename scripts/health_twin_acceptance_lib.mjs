import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const acceptanceIds = [
  'HT-001', 'HT-002', 'HT-003', 'HT-004', 'HT-005',
  'HT-010', 'HT-011', 'HT-012',
  'HT-020', 'HT-021', 'HT-022', 'HT-023', 'HT-024',
  'HT-030', 'HT-031', 'HT-032', 'HT-033',
  'HT-040', 'HT-041', 'HT-042', 'HT-043', 'HT-044', 'HT-045', 'HT-046',
  'HT-050', 'HT-051', 'HT-052', 'HT-053', 'HT-054', 'HT-055',
  'HT-060', 'HT-061', 'HT-062', 'HT-063', 'HT-064', 'HT-065',
  'HT-070', 'HT-071', 'HT-072', 'HT-073',
  'HT-080', 'HT-081', 'HT-082', 'HT-083', 'HT-084', 'HT-085',
  'HT-090', 'HT-091', 'HT-092', 'HT-093', 'HT-094', 'HT-095',
];

export function argValue(args, name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

export function loadEnv() {
  const values = { ...process.env };
  for (const filename of ['.env', '.env.local', '.env.test.local']) {
    const path = resolve(root, filename);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [key, ...rest] = trimmed.split('=');
      if (!(key.trim() in values)) {
        values[key.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
      }
    }
  }
  return values;
}

export function evidence(id, status, description, options = {}) {
  return {
    id,
    status,
    description,
    evidenceType: options.evidenceType || 'acceptance',
    evidence: options.evidence || [],
    detail: options.detail || '',
    cleanupSafe: options.cleanupSafe !== false,
  };
}

export function reportSummary(results) {
  return {
    passed: results.filter((entry) => entry.status === 'PASS').length,
    failed: results.filter((entry) => entry.status === 'FAIL').length,
    blocked: results.filter((entry) => entry.status === 'BLOCKED').length,
    notTested: results.filter((entry) => entry.status === 'NOT_TESTED').length,
    total: results.length,
  };
}

export function writeJson(path, value) {
  const absolute = resolve(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, JSON.stringify(value, null, 2));
  return absolute;
}

export function readJsonIfPresent(path) {
  const absolute = resolve(root, path);
  return existsSync(absolute) ? JSON.parse(readFileSync(absolute, 'utf8')) : null;
}

export function restClient({ url, anonKey, accessToken }) {
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  async function request(path, options = {}) {
    const response = await fetch(`${url}${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) },
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { ok: response.ok, status: response.status, body, headers: response.headers };
  }

  return { request, headers };
}

export async function signIn({ url, anonKey, email, password }) {
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token || !body.user?.id) {
    throw new Error(`Authentication failed (${response.status}): ${body.error_description || body.msg || body.message || 'unknown error'}`);
  }
  return { accessToken: body.access_token, user: body.user };
}

