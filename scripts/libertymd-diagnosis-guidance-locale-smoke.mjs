/**
 * P5-GUIDE locale matrix — hits the live guidance webhook once per clinical
 * language and checks the contract that actually matters cross-locale:
 *
 *   1. three blocks come back
 *   2. `full_name` is echoed VERBATIM in canonical English (the join key; if a
 *      locale translates it the guidance silently detaches from its card)
 *   3. bullets are actually in the target language (not English passthrough)
 *   4. the three blocks are distinct from each other (the whole point)
 *   5. no dosing survives
 */
const URL_BASE = process.env.N8N_BASE || 'https://n8n.saksham-experiments.com'
const ENDPOINT = `${URL_BASE}/webhook/libertymd-diagnosis-guidance`

const DIFFERENTIALS = [
  { rank: 1, full_name: 'Acute viral pharyngitis', common_name: 'Common cold', confidence: '55%',
    description: 'A respiratory-virus infection of the nose and throat.',
    reason: 'Short-duration sore throat, mild cough and congestion.' },
  { rank: 2, full_name: 'COVID-19', common_name: 'COVID-19', confidence: '25%',
    description: 'Contagious respiratory infection caused by SARS-CoV-2.',
    reason: 'Early symptoms can resemble a common cold; testing unavailable.' },
  { rank: 3, full_name: 'Streptococcal pharyngitis', common_name: 'Strep throat', confidence: '15%',
    description: 'Bacterial throat infection caused by Streptococcus pyogenes.',
    reason: 'Considered due to sore throat, but no fever or swollen glands.' },
]

const CANONICAL = DIFFERENTIALS.map((d) => d.full_name)

const LOCALES = ['en', 'es', 'es-ES', 'pt', 'fr', 'de', 'hi', 'hi-Latn']

const DOSING = /\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|units?)\b|\b(?:every|q)\s*\d+\s*(?:h|hr|hrs|hours|days?)\b/i
const DEVANAGARI = /[ऀ-ॿ]/

// Cheap language signal: a few stopwords that are near-impossible in English.
const HINTS = {
  es: /\b(de|para|con|los|las|el|y|si|una|agua)\b/i,
  'es-ES': /\b(de|para|con|los|las|el|y|si|una|agua)\b/i,
  pt: /\b(de|para|com|os|as|e|se|uma|água|líquidos)\b/i,
  fr: /\b(de|pour|avec|les|des|et|si|une|eau|gorge)\b/i,
  de: /\b(und|mit|bei|der|die|das|ein|eine|wasser|hals)\b/i,
}

function bulletsOf(block) {
  return [
    ...(block.supportive_treatment || []),
    ...(block.symptomatic_treatment || []),
    ...(block.further_investigations || []),
  ]
}

async function runLocale(locale) {
  const body = {
    consultation_id: `00000000-0000-0000-0000-0000000000${String(LOCALES.indexOf(locale) + 10)}`,
    language: locale,
    differential_diagnosis: DIFFERENTIALS,
    assessment_and_plan: {
      assessment: 'Viral URI most likely.',
      plan: ['Consider an at-home COVID-19 antigen test.'],
      self_care: ['Rest and drink adequate fluids.'],
      diagnostic_investigations: ['At-home COVID-19 antigen test'],
    },
    clinical_context: {
      chief_complaint: 'sore throat and mild cough for 3 days',
      severity: '4-6/10',
      red_flag_negatives: 'no difficulty breathing',
    },
  }

  const started = Date.now()
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const ms = Date.now() - started
  const json = await res.json().catch(() => null)
  const guidance = json?.guidance || []

  const failures = []

  if (guidance.length !== 3) failures.push(`expected 3 blocks, got ${guidance.length}`)

  // (2) canonical join key preserved exactly
  const names = guidance.map((g) => g.full_name)
  for (const expected of CANONICAL) {
    if (!names.includes(expected)) {
      failures.push(`join key lost: "${expected}" not echoed (got ${JSON.stringify(names)})`)
    }
  }

  // (3) bullets translated
  const allBullets = guidance.flatMap(bulletsOf)
  const sample = allBullets.join(' ')
  if (locale === 'hi') {
    if (!DEVANAGARI.test(sample)) failures.push('hi: expected Devanagari script, got none')
  } else if (locale === 'hi-Latn') {
    if (DEVANAGARI.test(sample)) failures.push('hi-Latn: expected Roman script, found Devanagari')
  } else if (HINTS[locale]) {
    if (!HINTS[locale].test(sample)) failures.push(`${locale}: no target-language markers found`)
  }

  // (4) blocks distinct — compare the investigation lists, the most
  // condition-specific field.
  const invs = guidance.map((g) => JSON.stringify(g.further_investigations || []))
  if (new Set(invs).size !== invs.length) {
    failures.push('investigations identical across conditions (not per-diagnosis)')
  }
  const sup = guidance.map((g) => JSON.stringify(g.supportive_treatment || []))
  if (new Set(sup).size !== sup.length) {
    failures.push('supportive lists identical across conditions')
  }

  // (5) no dosing
  const dosed = allBullets.filter((b) => DOSING.test(b))
  if (dosed.length) failures.push(`dosing leaked: ${JSON.stringify(dosed)}`)

  return { locale, ms, http: res.status, blocks: guidance.length, failures, guidance }
}

const results = []
for (const locale of LOCALES) {
  process.stdout.write(`… ${locale} `)
  try {
    const r = await runLocale(locale)
    results.push(r)
    console.log(r.failures.length ? `FAIL (${r.ms}ms)` : `ok (${r.ms}ms)`)
  } catch (err) {
    results.push({ locale, failures: [`request threw: ${err.message}`], guidance: [] })
    console.log(`ERROR ${err.message}`)
  }
}

console.log('\n================ SUMMARY ================')
let pass = 0
for (const r of results) {
  if (!r.failures.length) { pass++; console.log(`PASS  ${r.locale.padEnd(8)} ${r.blocks} blocks, ${r.ms}ms`) }
  else console.log(`FAIL  ${r.locale.padEnd(8)} ${r.failures.join(' | ')}`)
}
console.log(`\n${pass}/${results.length} locales passed`)

// Dump one non-English sample so the translation is inspectable, not just asserted.
const de = results.find((r) => r.locale === 'de')
if (de?.guidance?.length) {
  console.log('\n--- de sample (per-condition investigations) ---')
  for (const g of de.guidance) {
    console.log(`${g.full_name}: ${JSON.stringify(g.further_investigations, null, 0)}`)
  }
}
const hi = results.find((r) => r.locale === 'hi')
if (hi?.guidance?.length) {
  console.log('\n--- hi sample (per-condition investigations) ---')
  for (const g of hi.guidance) {
    console.log(`${g.full_name}: ${JSON.stringify(g.further_investigations, null, 0)}`)
  }
}

process.exit(results.every((r) => !r.failures.length) ? 0 : 1)
