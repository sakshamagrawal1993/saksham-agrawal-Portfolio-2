#!/usr/bin/env node
/**
 * Auto-translation pipeline.
 *
 * Usage:  GEMINI_API_KEY=... node scripts/i18n-translate.mjs [--dry-run]
 *
 * 1. Treats src/i18n/locales/en.json as the source of truth.
 * 2. Finds every key present in en.json but missing in any target locale.
 * 3. Translates the missing keys with Gemini (medical-app tone, placeholders preserved).
 * 4. Merges results into the locale files and flips _meta.status back to
 *    "machine_translated_pending_review" so the approval workflow re-triggers.
 *
 * Deployment guarantee: this script only FILLS gaps; scripts/i18n-check.mjs
 * (run inside `npm run build`) FAILS the build if any gap remains. Together:
 * new English text cannot reach production untranslated.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = join(root, 'i18n', 'locales');
const TARGETS = { es: 'Spanish (Latin American)', pt: 'Portuguese (Brazilian)', hi: 'Hindi', fr: 'French', de: 'German' };
const dryRun = process.argv.includes('--dry-run');
const apiKey = process.env.GEMINI_API_KEY;

function flatten(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) => {
    if (k === '_meta') return [];
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'object' && v !== null ? flatten(v, key) : [[key, String(v)]];
  });
}
function setDeep(obj, path, value) {
  const parts = path.split('.');
  let node = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const nextIsIndex = /^\d+$/.test(parts[i + 1]);
    if (!(part in node)) node[part] = nextIsIndex ? [] : {};
    node = node[part];
  }
  node[parts[parts.length - 1]] = value;
}

async function translateBatch(entries, language) {
  const payload = Object.fromEntries(entries);
  const prompt = `You are translating UI strings for LibertyMD, a consumer health-guidance app. Translate the JSON values from English to ${language}.
Rules: keep {placeholders} exactly as-is; keep the product name "LibertyMD", "SOAP", "HIPAA", "GDPR" untranslated; medical terms must be accurate and patient-friendly; match the register of a caring, professional health product; return ONLY a JSON object with the same keys and translated values.

${JSON.stringify(payload, null, 1)}`;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } }),
    },
  );
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  return JSON.parse(text);
}

const en = JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf8'));
const enFlat = Object.fromEntries(flatten(en));

let totalMissing = 0;
for (const [lang, language] of Object.entries(TARGETS)) {
  const path = join(localesDir, `${lang}.json`);
  const bundle = JSON.parse(readFileSync(path, 'utf8'));
  const have = new Set(flatten(bundle).map(([k]) => k));
  const missing = Object.entries(enFlat).filter(([k]) => !have.has(k));
  if (missing.length === 0) { console.log(`${lang}: complete`); continue; }
  totalMissing += missing.length;
  console.log(`${lang}: ${missing.length} missing key(s)`);
  if (dryRun) { missing.forEach(([k]) => console.log(`  - ${k}`)); continue; }
  if (!apiKey) { console.error('GEMINI_API_KEY not set — cannot translate. Run with --dry-run to list gaps.'); process.exit(1); }
  const translated = await translateBatch(missing, language);
  for (const [key] of missing) {
    if (translated[key] === undefined) throw new Error(`${lang}: model did not return key ${key}`);
    setDeep(bundle, key, translated[key]);
  }
  bundle._meta = { ...bundle._meta, status: 'machine_translated_pending_review', source: 'machine', last_auto_translation: new Date().toISOString().slice(0, 10) };
  writeFileSync(path, JSON.stringify(bundle, null, 2) + '\n');
  console.log(`${lang}: merged ${missing.length} translation(s), status reset to pending review`);
}
if (totalMissing === 0) console.log('All locales complete — nothing to translate.');
