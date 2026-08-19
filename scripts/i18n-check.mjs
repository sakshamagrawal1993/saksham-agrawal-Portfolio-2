#!/usr/bin/env node
// i18n CI check: fails if locale bundles diverge from en.json (keys or placeholders),
// or if the safety catalog seed is missing any language for any message_key.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = join(root, 'i18n', 'locales');

// The list of locales to check is the list the switcher actually offers — read
// from registry.json rather than hardcoded, so adding a locale to the UI cannot
// silently skip CI. (hi-Latn shipped at 31% coverage because it was offered in
// the registry but absent from a hardcoded allowlist here.)
let REGISTRY;
try {
  const parsed = JSON.parse(readFileSync(join(root, 'i18n', 'registry.json'), 'utf8'));
  if (!Array.isArray(parsed.locales)) throw new Error('registry.locales is not an array');
  REGISTRY = parsed.locales.map(l => l.code).filter(Boolean);
} catch (err) {
  // A malformed registry previously threw a raw stack trace. Exit non-zero with a
  // readable message instead — the gate is read by people fixing a broken build.
  console.error(`✗ i18n/registry.json is unreadable or malformed: ${err.message}`);
  process.exit(1);
}

// A region variant may lean on its base bundle for untranslated keys ONLY when
// both are written in the same script — es-ES → es is fine, hi-Latn → hi is not,
// because a reader who picks Hinglish cannot read Devanagari. Script-incompatible
// variants must be complete on their own.
const SCRIPT_COMPATIBLE_WITH_BASE = { 'es-ES': true, 'hi-Latn': false };

const LANGS = REGISTRY.filter(c => !c.includes('-'));
let failures = 0;
const fail = msg => { failures++; console.error(`✗ ${msg}`); };

// --- 0. Liveness -----------------------------------------------------------------
// A gate that checks nothing and exits 0 is a green light wired to nothing — worse
// than no gate. P5-04 QA proved this one could do exactly that: empty
// `registry.locales` and every downstream loop iterated zero times while the script
// still printed a pass. These assertions run BEFORE any content check.
//
// The floor is deliberately a constant, not `REGISTRY.length` — comparing the
// registry against itself is the tautology that let the hole exist.
const MIN_EXPECTED_LOCALES = 8;   // en, es, es-ES, pt, hi, hi-Latn, fr, de
if (REGISTRY.length === 0) fail('registry.json lists ZERO locales — the gate would check nothing');
if (!REGISTRY.includes('en')) fail('registry.json does not list "en" — no source of truth to check against');
if (REGISTRY.length < MIN_EXPECTED_LOCALES) {
  fail(`registry.json lists ${REGISTRY.length} locale(s); expected at least ${MIN_EXPECTED_LOCALES}. ` +
       `If a locale was deliberately removed, lower MIN_EXPECTED_LOCALES in this file in the same commit.`);
}
if (failures) {
  console.error(`\ni18n check FAILED with ${failures} problem(s) — gate liveness.`);
  process.exit(1);
}

// --- 1. Locale bundle parity ---------------------------------------------------
function flatten(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) => {
    if (k === '_meta') return [];
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'object' && v !== null ? flatten(v, key) : [[key, String(v)]];
  });
}
const placeholders = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
const numericTokens = s => [...s.matchAll(/\d+(?:\.\d+)?/g)].map(m => m[0]).sort().join(',');

// These surfaces are used during triage, comprehension, and report delivery.
// A key that merely copies the English source is not a translated key. A very
// small allowlist covers language-neutral technical labels and examples.
const REQUIRED_LOCALIZED_PREFIXES = [
  'hero.', 'chat.', 'demographics.', 'reportGate.', 'report.',
  'sampleReport.', 'safety.', 'chatx.',
];
const LANGUAGE_NEUTRAL_KEYS = new Set([
  'report.pdf.plan',
  'report.teasers.soapPlan',
  'report.meta.page',
  'report.emailDelivery.emailPlaceholder',
  'report.doctor.emailPlaceholder',
  'chatx.attachPhoto',
]);
const LANGUAGE_SPECIFIC_NEUTRAL_KEYS = {
  // Hinglish intentionally code-switches common product and clinical nouns.
  'hi-Latn': new Set([
    'hero.taglineFree',
    'hero.taglineAnonymous',
    'chatx.privateConsult',
    'chatx.carePlan',
    'chatx.redFlags',
    'chatx.soap',
    'chatx.clinical',
    'chatx.attachLab',
    'chatx.photoChip',
    'chatx.photoAttachedLabel',
    'chatx.labChip',
    'chatx.labAttachedLabel',
    'chatx.labAttributionCancel',
    'chatx.labAttributionProfile',
  ]),
};

const files = readdirSync(localesDir).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
for (const lang of LANGS) if (!files.includes(lang)) fail(`missing locale file: ${lang}.json`);

// Reconcile BOTH directions. Deriving the checked set from the registry alone left
// a file-on-disk-but-not-in-registry checked by nothing — the same registry/reality
// divergence as the original bug, just inverted.
for (const f of files) {
  if (!REGISTRY.includes(f)) {
    fail(`${f}.json exists on disk but is not listed in registry.json — it is checked by nothing. ` +
         `Add it to the registry or delete the file.`);
  }
}

// Every variant must declare its script relationship to its base. Declaring it is
// not the same as it being true, so state the consequence in the log rather than
// letting a one-character edit silently reopen the original defect.
for (const v of REGISTRY.filter(c => c.includes('-'))) {
  const declared = SCRIPT_COMPATIBLE_WITH_BASE[v];
  if (declared === true) {
    console.log(`  ${v}: declared SAME script as ${v.split('-')[0]} — base fallback allowed, delta bundle permitted`);
  } else if (declared === false) {
    console.log(`  ${v}: declared DIFFERENT script from ${v.split('-')[0]} — must be complete standalone`);
  }
}

// Variant deltas (e.g. es-ES): keys must be a SUBSET of en with matching placeholders; completeness not required.
const variants = REGISTRY.filter(f => f.includes('-'));

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
    else if (
      REQUIRED_LOCALIZED_PREFIXES.some(prefix => key.startsWith(prefix))
      && numericTokens(en[key]) !== numericTokens(flat[key])
    )
      fail(`${lang}.json: numeric token mismatch on "${key}" (en: [${numericTokens(en[key])}] vs ${lang}: [${numericTokens(flat[key])}])`);
    else if (
      REQUIRED_LOCALIZED_PREFIXES.some(prefix => key.startsWith(prefix))
      && !LANGUAGE_NEUTRAL_KEYS.has(key)
      && !LANGUAGE_SPECIFIC_NEUTRAL_KEYS[lang]?.has(key)
      && /[A-Za-z]{3}/.test(en[key])
      && flat[key] === en[key]
    ) {
      fail(`${lang}.json: required journey key "${key}" still contains the unchanged English source`);
    }
  }
  for (const key of Object.keys(flat)) if (!(key in en)) fail(`${lang}.json: orphan key "${key}" not in en.json`);
}

for (const variant of variants) {
  const bundle = JSON.parse(readFileSync(join(localesDir, `${variant}.json`), 'utf8'));
  const base = variant.split('-')[0];
  if (!files.includes(base)) fail(`variant ${variant}.json has no base locale ${base}.json`);
  const flat = Object.fromEntries(flatten(bundle));
  for (const [key, val] of Object.entries(flat)) {
    if (!(key in en)) fail(`${variant}.json: orphan key "${key}" not in en.json`);
    else if (placeholders(en[key]) !== placeholders(val))
      fail(`${variant}.json: placeholder mismatch on "${key}"`);
    else if (
      REQUIRED_LOCALIZED_PREFIXES.some(prefix => key.startsWith(prefix))
      && numericTokens(en[key]) !== numericTokens(val)
    )
      fail(`${variant}.json: numeric token mismatch on "${key}"`);
    else if (
      !SCRIPT_COMPATIBLE_WITH_BASE[variant]
      && REQUIRED_LOCALIZED_PREFIXES.some(prefix => key.startsWith(prefix))
      && !LANGUAGE_NEUTRAL_KEYS.has(key)
      && !LANGUAGE_SPECIFIC_NEUTRAL_KEYS[variant]?.has(key)
      && /[A-Za-z]{3}/.test(en[key])
      && val === en[key]
    ) {
      fail(`${variant}.json: required journey key "${key}" still contains the unchanged English source`);
    }
  }

  const inheritsFromBase = SCRIPT_COMPATIBLE_WITH_BASE[variant];
  if (inheritsFromBase === undefined) {
    fail(`${variant}.json: add "${variant}" to SCRIPT_COMPATIBLE_WITH_BASE in this script — ` +
         `state explicitly whether it may inherit untranslated keys from ${base}.`);
  } else if (inheritsFromBase) {
    // Delta bundle: only the keys that differ from the base need to exist here,
    // but _meta must declare the relationship so the fallback chain is intentional.
    if (bundle._meta?.variant_of !== base) fail(`${variant}.json: _meta.variant_of must be "${base}"`);
    console.log(`  variant ${variant}: ${Object.keys(flat).length} delta key(s) over ${base}`);
  } else {
    // Different script from its base — fallback would render an unreadable
    // language, so this bundle must stand alone at full coverage.
    const missing = enKeys.filter(k => !(k in flat));
    if (missing.length) {
      fail(`${variant}.json: ${missing.length} key(s) missing and it cannot fall back to ${base} ` +
           `(different script). First: ${missing.slice(0, 3).join(', ')}`);
    }
    console.log(`  variant ${variant}: standalone, ${Object.keys(flat).length} key(s)`);
  }
}

// --- 1b. Effective coverage for every locale the switcher offers ---------------
// Emits a line per locale on success as well as failure. A section that only speaks
// when it fails cannot be distinguished in CI logs from a section that never ran.
let coverageChecked = 0;
for (const code of REGISTRY) {
  if (code === 'en') continue;
  if (!files.includes(code)) { fail(`registry offers "${code}" but ${code}.json does not exist`); continue; }
  const own = Object.fromEntries(flatten(JSON.parse(readFileSync(join(localesDir, `${code}.json`), 'utf8'))));
  const base = code.includes('-') && SCRIPT_COMPATIBLE_WITH_BASE[code]
    ? Object.fromEntries(flatten(JSON.parse(readFileSync(join(localesDir, `${code.split('-')[0]}.json`), 'utf8'))))
    : {};
  coverageChecked++;
  const covered = enKeys.filter(k => k in own || k in base).length;
  // An empty string is a present key with no translation — it renders as nothing,
  // not as English, so count it as a gap rather than as coverage.
  const blank = enKeys.filter(k => (k in own && own[k].trim() === '' && en[k].trim() !== ''));
  if (blank.length) {
    fail(`${code}: ${blank.length} key(s) present but EMPTY — renders blank, not translated. ` +
         `First: ${blank.slice(0, 3).join(', ')}`);
  }
  console.log(`  coverage ${code}: ${(100 * covered / enKeys.length).toFixed(1)}% ` +
              `(${covered}/${enKeys.length})${base && Object.keys(base).length ? ` incl. base ${code.split('-')[0]}` : ''}`);
  if (covered < enKeys.length) {
    fail(`${code}: effective coverage ${(100 * covered / enKeys.length).toFixed(1)}% ` +
         `(${enKeys.length - covered} key(s) would render in English)`);
  }
}

// --- 2. Safety catalog seed completeness --------------------------------------
// The original draft migration is intentionally neutralized. Production copy is
// split across the canonical EN migration, the ES approval migration, and the
// approved multilingual bundle migration.
const migrationFiles = [
  '20260731270000_libertymd_i18n_p3_08.sql',
  '20260805090000_libertymd_open_es_gate.sql',
  '20260810110000_libertymd_approved_multilingual_emergency_copy.sql',
];
const migrations = migrationFiles.map(file => readFileSync(join(root, 'supabase', 'migrations', file), 'utf8'));
const keyRows = migrations.flatMap(migration => [
  ...migration.matchAll(/\(\s*'((?:emergency|safety)\.[^']+)'\s*,\s*'([A-Za-z-]+)'/g),
].map(match => [match[0], match[1], match[2]]));
const byKey = {};
for (const [, key, lang] of keyRows) (byKey[key] ??= new Set()).add(lang);
for (const migration of migrations) {
  for (const bundle of migration.matchAll(/\('([A-Za-z-]+)',\s*'(?:machine|human)',\s*jsonb_build_object\(([\s\S]*?)\)\s*\)/g)) {
    const [, lang, body] = bundle;
    for (const keyMatch of body.matchAll(/'((?:emergency|safety)\.[^']+)'\s*,/g)) {
      (byKey[keyMatch[1]] ??= new Set()).add(lang);
    }
  }
}
const CLINICAL_CATALOG_LANGS = REGISTRY.filter(code => code !== 'es-ES');
for (const [key, langs] of Object.entries(byKey))
  for (const lang of CLINICAL_CATALOG_LANGS)
    if (!langs.has(lang)) fail(`catalog seed: "${key}" missing language "${lang}"`);
if (Object.keys(byKey).length === 0) fail('catalog seed: no message rows found in migration');

// --- Result --------------------------------------------------------------------
// Final liveness assertion. Everything above can be individually correct and still
// have iterated zero times; assert the work actually happened before printing a pass.
if (enKeys.length === 0) fail('en.json flattened to ZERO keys — nothing was compared');
if (coverageChecked !== REGISTRY.length - 1) {
  fail(`coverage ran for ${coverageChecked} locale(s) but the registry offers ${REGISTRY.length - 1} non-English locale(s)`);
}

if (failures) {
  console.error(`\ni18n check FAILED with ${failures} problem(s).`);
  process.exit(1);
}
console.log(
  `✓ i18n check passed: ${enKeys.length} keys · ${REGISTRY.length} registry locales ` +
  `(${LANGS.length} base + ${REGISTRY.length - LANGS.length} variant) · ` +
  `${coverageChecked} coverage check(s) · ${Object.keys(byKey).length} catalog message keys complete.`
);
