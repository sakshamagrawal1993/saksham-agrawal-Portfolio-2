#!/usr/bin/env node
// i18n CI check: fails if locale bundles diverge from en.json (keys or placeholders),
// or if the safety catalog seed is missing any language for any message_key.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = join(root, 'i18n', 'locales');
const LANGS = ['en', 'es', 'pt', 'hi', 'fr', 'de'];
let failures = 0;
const fail = msg => { failures++; console.error(`✗ ${msg}`); };

// --- 1. Locale bundle parity ---------------------------------------------------
function flatten(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) => {
    if (k === '_meta') return [];
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'object' && v !== null ? flatten(v, key) : [[key, String(v)]];
  });
}
const placeholders = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');

const files = readdirSync(localesDir).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
for (const lang of LANGS) if (!files.includes(lang)) fail(`missing locale file: ${lang}.json`);

// Variant deltas (e.g. es-ES): keys must be a SUBSET of en with matching placeholders; completeness not required.
const variants = files.filter(f => f.includes('-'));

const en = Object.fromEntries(flatten(JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf8'))));
const enKeys = Object.keys(en);

for (const lang of LANGS.filter(l => l !== 'en' && files.includes(l))) {
  const bundle = JSON.parse(readFileSync(join(localesDir, `${lang}.json`), 'utf8'));
  if (!bundle._meta?.status) fail(`${lang}.json: missing _meta.status`);
  const flat = Object.fromEntries(flatten(bundle));
  for (const key of enKeys) {
    if (!(key in flat)) fail(`${lang}.json: missing key "${key}"`);
    else if (placeholders(en[key]) !== placeholders(flat[key]))
      fail(`${lang}.json: placeholder mismatch on "${key}" (en: [${placeholders(en[key])}] vs ${lang}: [${placeholders(flat[key])}])`);
  }
  for (const key of Object.keys(flat)) if (!(key in en)) fail(`${lang}.json: orphan key "${key}" not in en.json`);
}

for (const variant of variants) {
  const bundle = JSON.parse(readFileSync(join(localesDir, `${variant}.json`), 'utf8'));
  const base = variant.split('-')[0];
  if (!files.includes(base)) fail(`variant ${variant}.json has no base locale ${base}.json`);
  if (bundle._meta?.variant_of !== base) fail(`${variant}.json: _meta.variant_of must be "${base}"`);
  const flat = Object.fromEntries(flatten(bundle));
  for (const [key, val] of Object.entries(flat)) {
    if (!(key in en)) fail(`${variant}.json: orphan key "${key}" not in en.json`);
    else if (placeholders(en[key]) !== placeholders(val))
      fail(`${variant}.json: placeholder mismatch on "${key}"`);
  }
  console.log(`  variant ${variant}: ${Object.keys(flat).length} delta key(s) over ${base}`);
}

// --- 2. Safety catalog seed completeness --------------------------------------
const migration = readFileSync(
  join(root, 'supabase', 'migrations', '20260720100000_libertymd_i18n.sql'), 'utf8');
const keyRows = [...migration.matchAll(/\('((?:emergency|safety)\.\w+)','(\w{2})'/g)];
const byKey = {};
for (const [, key, lang] of keyRows) (byKey[key] ??= new Set()).add(lang);
for (const [key, langs] of Object.entries(byKey))
  for (const lang of LANGS)
    if (!langs.has(lang)) fail(`catalog seed: "${key}" missing language "${lang}"`);
if (Object.keys(byKey).length === 0) fail('catalog seed: no message rows found in migration');

// --- Result --------------------------------------------------------------------
if (failures) {
  console.error(`\ni18n check FAILED with ${failures} problem(s).`);
  process.exit(1);
}
console.log(`✓ i18n check passed: ${enKeys.length} keys × ${LANGS.length} languages, ${Object.keys(byKey).length} catalog message keys complete.`);
