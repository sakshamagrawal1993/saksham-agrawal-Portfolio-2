import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  EMERGENCY_PATTERNS,
  EMERGENCY_PATTERN_SET_VERSION,
} from '../supabase/functions/libertymd-care-proxy/emergency-patterns.ts'
import { detectDeterministicEmergency } from '../supabase/functions/libertymd-care-proxy/clinical-policy.ts'
import CASES from '../tests/libertymd/emergency-pattern-cases.json' with { type: 'json' }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const definitionsArg = process.argv.find((arg) => arg.startsWith('--definitions-dir='))
const definitionsDir = path.resolve(
  definitionsArg?.split('=')[1]
  ?? process.env.LIBERTYMD_N8N_DEFINITIONS_DIR
  ?? path.join(root, '..', 'n8n-workflows', 'definitions'),
)
const workflowPath = path.join(definitionsDir, 'libertymd-guardrail-workflow__9qeE6tUcEY74OYV8.json')

const generatedRules = EMERGENCY_PATTERNS.map((pattern) => ({
  id: pattern.id,
  crisis_type: pattern.crisisType,
  care_setting: pattern.careSetting,
  message: pattern.message,
  source: pattern.matcher.source,
  flags: pattern.matcher.flags,
}))

const GUARDRAIL_SYSTEM_MESSAGE = `You are LibertyMD's emergency triage guardrail for an AI primary-care chat.

Classify the LATEST patient message in context of history. Use only evidence the patient actually stated; never invent severity, persistence, duration, or associated symptoms.

Decision threshold:
- force_end only when there is a HIGH likelihood of an immediate emergency needing 911/ER now, or explicit current suicidal intent/plan needing crisis-line support.
- high_risk_continue when a symptom is concerning but the evidence is incomplete or ambiguous. Continue the interview and ask the missing severity/context questions.
- pass when symptoms are clearly mild, resolved, negated, historical, third-party, or routine.

Do NOT force_end for these by themselves:
- unspecified or mild shortness of breath with cough/fever when the person can speak normally and is not gasping;
- chest pain only with coughing, a deep breath, movement, twisting, or pressing the sore area;
- bare chest pain without pressure/heaviness, persistence, radiation, autonomic symptoms, fainting, or severe breathlessness;
- mild fever, URI symptoms, musculoskeletal pain, tension headache, or seasonal allergy.
These belong in high_risk_continue when more detail is needed, not force_end.

High-specificity force_end examples:
- crushing/squeezing/heavy central chest pressure; persistent/recurrent chest discomfort; or chest pain with spread to arm/jaw/back/neck, cold sweat, fainting/lightheadedness, or severe breathlessness. Nausea is supporting context, not sufficient by itself;
- gasping/choking, inability to speak a full sentence, blue/grey lips or skin, new confusion, collapse, oxygen saturation at or below 92, or severe breathing difficulty at rest;
- sudden FAST stroke signs, thunderclap/worst-of-life headache, airway-threatening allergic reaction, or other unmistakable immediate danger;
- explicit current suicidal intent or plan: crisis_line/988, never ER/911 framing.

Be negation-, temporality-, experiencer-, and context-aware. A symptom in family history, a resolved past episode, a quoted statement, or a denied symptom is not the patient's present emergency.

status: pass | high_risk_continue | force_end
risk_level: low | medium | high | emergency
crisis_type: none | acs_chest_pain | thunderclap_headache | anaphylaxis | surgical_abdomen | respiratory_distress | stroke_fast | suicidal_ideation | other_emergency
care_setting: home | telehealth | urgent_care | emergency_department | call_911 | crisis_line

Return JSON matching the schema only.`

const NORMALIZE_LLM_RESULT = `
const pre = $('Deterministic Prefilter').first().json;
const raw = $input.first().json || {};
const parsed = raw.output || raw;

const requestedStatus = String(parsed.status || (parsed.force_end ? 'force_end' : 'pass')).toLowerCase();
const requestedForceEnd = !!(parsed.force_end || requestedStatus === 'force_end');
const requestedCrisisType = String(parsed.crisis_type || (requestedForceEnd ? 'other_emergency' : 'none'));
const latest = String(pre.message_text || '').toLowerCase();

// A second deterministic boundary protects the two common false-positive
// families even when the model over-calls them. It does not mark them safe: it
// downgrades terminal force_end to high_risk_continue so the interview can ask
// severity, persistence, rest/exertion, radiation, and ability to speak.
const hasChestOrBreathingSymptom = /\\b(chest (?:only )?(?:pain|discomfort|tightness|hurts?|aches?)|short(?:ness)? of breath|short of breath|breathless|difficulty breathing)\\b/i.test(latest);
const highSpecificityAcs = /\\b(?:crushing|squeezing|heavy) (?:chest|pressure)\\b|\\bchest (?:pressure|squeezing|heaviness)\\b|\\bchest (?:pain|discomfort).{0,80}(?:radiat(?:es|ing)?|spread(?:s|ing)?).{0,35}(?:arm|jaw|back|neck)\\b|\\bchest (?:pain|discomfort).{0,80}(?:cold sweat|sweating|lightheaded|faint(?:ed|ing)?)\\b|\\b(?:cold sweat|sweating|lightheaded|faint(?:ed|ing)?).{0,80}chest (?:pain|discomfort)\\b|\\bchest (?:pain|discomfort).{0,60}(?:persistent|keeps returning|comes back|lasting (?:more than )?(?:a few|[5-9]|[1-9]\\d) minutes?)\\b/i.test(latest);
const highSpecificityBreathing = /\\b(?:cannot|can't|unable to) breathe\\b|\\bgasping(?: for air)?\\b|\\bchoking\\b|\\b(?:cannot|can't|unable to) (?:speak|talk|get words out)\\b|\\b(?:blue|grey|gray) (?:lips|skin|face)\\b|\\bnew confusion\\b|\\b(?:collapsed|passed out|unconscious)\\b|\\boxygen (?:sat|saturation)?[^.]{0,12}(?:[0-8]\\d|9[0-2])\\b|\\bsevere (?:shortness of breath|difficulty breathing)\\b|\\b(?:shortness of breath|difficulty breathing).{0,30}(?:at rest|while resting|sitting still)\\b/i.test(latest);
const cardioRespiratoryCall = ['acs_chest_pain', 'respiratory_distress', 'other_emergency'].includes(requestedCrisisType);
const needsClarification = requestedForceEnd
  && cardioRespiratoryCall
  && hasChestOrBreathingSymptom
  && !highSpecificityAcs
  && !highSpecificityBreathing;

const force_end = requestedForceEnd && !needsClarification;
const status = needsClarification
  ? 'high_risk_continue'
  : force_end
    ? 'force_end'
    : requestedStatus === 'high_risk_continue'
      ? 'high_risk_continue'
      : 'pass';
const risk_level = needsClarification
  ? 'high'
  : String(parsed.risk_level || (force_end ? 'emergency' : status === 'high_risk_continue' ? 'high' : 'low')).toLowerCase();
const crisis_type = needsClarification
  ? (requestedCrisisType === 'other_emergency'
    ? (/chest/.test(latest) ? 'acs_chest_pain' : 'respiratory_distress')
    : requestedCrisisType)
  : requestedCrisisType;
const care_setting = needsClarification
  ? 'urgent_care'
  : String(parsed.care_setting || (force_end ? 'call_911' : status === 'high_risk_continue' ? 'urgent_care' : 'home'));
const message = needsClarification
  ? 'I need a few more details to judge how urgent this is. Tell me whether it is severe, persistent or present at rest, and whether you can speak normally. If you become unable to breathe, faint, turn blue or grey, or develop heavy chest pressure that spreads, call 911 now.'
  : String(parsed.message || (force_end
    ? 'Please call emergency services immediately.'
    : 'No emergency detected.'));
const red_flags = Array.isArray(parsed.red_flags) ? parsed.red_flags : [];

return [{
  json: {
    status,
    risk_level,
    crisis_type,
    force_end,
    is_emergency: force_end,
    care_setting,
    message,
    red_flags,
    source: 'llm',
  }
}];
`

function renderPrefilter() {
  return `
// GENERATED by scripts/libertymd-emergency-pattern-sync.mjs.
// Source of truth: supabase/functions/libertymd-care-proxy/emergency-patterns.ts
const PATTERN_SET_VERSION = ${JSON.stringify(EMERGENCY_PATTERN_SET_VERSION)};
const rules = ${JSON.stringify(generatedRules, null, 2)};

const body = $('Webhook').first().json.body || $('Webhook').first().json || {};
const message = String(body.message || body.text || '').trim();
const history = Array.isArray(body.history) ? body.history : [];
const patient = body.patient && typeof body.patient === 'object' ? body.patient : {};
const msg = message.toLowerCase();

function firstUnnegatedMatch(rule) {
  const flags = rule.flags.includes('g') ? rule.flags : rule.flags + 'g';
  const matcher = new RegExp(rule.source, flags);
  let match;
  while ((match = matcher.exec(msg)) !== null) {
    const before = msg.slice(Math.max(0, match.index - 40), match.index);
    // Commas do not end a clause: "no lip swelling, tongue swelling, or X"
    // is one negated list. Adversatives do end a clause, preserving
    // "no chest pain but crushing chest pressure".
    const segment = before.split(/[;.!?]|\\bbut\\b|\\bhowever\\b|\\balthough\\b|\\bthough\\b/i).pop() || '';
    const negated = /\\b(no|not|without|denies|denied|never|don'?t have|doesn'?t have)\\b/.test(segment);
    const thirdPartyHistory =
      /\\b(my|his|her|their)\\s+\\w*\\s*(father|mother|dad|mum|mom|brother|sister|friend|husband|wife|son|daughter|uncle|aunt)\\s+(had|has had|used to have)\\b/.test(before)
      || /\\b(family history|history of|hx of)\\b/.test(before);
    if (!negated && !thirdPartyHistory) return match[0];
    if (match.index === matcher.lastIndex) matcher.lastIndex += 1;
  }
  return null;
}

// P0-15a: proxy shadow posts shadow_llm / skip_deterministic so ACS messages
// still reach Crisis Screening Agent (otherwise Deterministic Prefilter would
// short-circuit and the shadow would only measure prefilter↔edge agreement).
const skipDeterministic = body.shadow_llm === true || body.skip_deterministic === true;

let hit = null;
for (const rule of rules) {
  const matchedSpan = firstUnnegatedMatch(rule);
  if (matchedSpan !== null) {
    hit = rule;
    break;
  }
}

if (hit && !skipDeterministic) {
  return [{
    json: {
      route: 'force_end',
      status: 'force_end',
      risk_level: 'emergency',
      crisis_type: hit.crisis_type,
      force_end: true,
      is_emergency: true,
      care_setting: hit.care_setting,
      message: hit.message,
      red_flags: [hit.crisis_type],
      source: 'deterministic',
      pattern_id: hit.id,
      pattern_set_version: PATTERN_SET_VERSION,
      message_text: message,
      history,
      patient,
    }
  }];
}

return [{
  json: {
    route: 'llm',
    status: 'needs_llm',
    force_end: false,
    is_emergency: false,
    message_text: message,
    history,
    patient,
  }
}];
`
}

function runPrefilter(jsCode, message) {
  const webhook = { first: () => ({ json: { body: { message } } }) }
  const result = Function('$', jsCode)(() => webhook)
  return result[0].json
}

let workflow
try {
  workflow = JSON.parse(await fs.readFile(workflowPath, 'utf8'))
} catch (error) {
  console.error(`FAIL: unable to read guardrail workflow at ${workflowPath}`)
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

const nodeSets = [workflow.nodes, workflow.activeVersion?.nodes]
  .filter((nodes) => Array.isArray(nodes))
if (nodeSets.length === 0) {
  console.error('FAIL: workflow has no node sets')
  process.exit(1)
}

const managedNodes = nodeSets.map((nodes, index) => {
  const prefilter = nodes.find((node) => node.name === 'Deterministic Prefilter')
  const agent = nodes.find((node) => node.name === 'Crisis Screening Agent')
  const normalizer = nodes.find((node) => node.name === 'Normalize LLM Result')
  if (
    !prefilter || typeof prefilter.parameters?.jsCode !== 'string'
    || !agent || typeof agent.parameters?.options?.systemMessage !== 'string'
    || !normalizer || typeof normalizer.parameters?.jsCode !== 'string'
  ) {
    console.error(`FAIL: managed guardrail nodes were not found in node set ${index}`)
    process.exit(1)
  }
  return { prefilter, agent, normalizer }
})

const rendered = renderPrefilter()
if (process.argv.includes('--write')) {
  for (const { prefilter, agent, normalizer } of managedNodes) {
    prefilter.parameters.jsCode = rendered
    agent.parameters.options.systemMessage = GUARDRAIL_SYSTEM_MESSAGE
    normalizer.parameters.jsCode = NORMALIZE_LLM_RESULT
  }
  await fs.writeFile(workflowPath, `${JSON.stringify(workflow, null, 2)}\n`)
  console.log(`Updated ${workflowPath}`)
} else {
  for (const { prefilter, agent, normalizer } of managedNodes) {
    if (
      prefilter.parameters.jsCode !== rendered
      || agent.parameters.options.systemMessage !== GUARDRAIL_SYSTEM_MESSAGE
      || normalizer.parameters.jsCode !== NORMALIZE_LLM_RESULT
    ) {
      console.error('FAIL: n8n Guardrail managed nodes have drifted from the LibertyMD sync source')
      console.error('Run npm run sync:libertymd:patterns to regenerate them.')
      process.exit(1)
    }
  }
}

const parityFailures = []
for (const testCase of [...CASES.positives, ...CASES.negatives]) {
  const edge = detectDeterministicEmergency(testCase.message)
  const edgeCrisisType = edge?.crisisType ?? null
  const n8n = runPrefilter(rendered, testCase.message)
  const expectedCrisisType = 'crisis_type' in testCase ? testCase.crisis_type : null
  const n8nCrisisType = n8n.route === 'force_end' ? n8n.crisis_type : null
  if (
    edgeCrisisType !== expectedCrisisType
    || n8nCrisisType !== expectedCrisisType
    || edgeCrisisType !== n8nCrisisType
    || (expectedCrisisType && edge?.careSetting !== n8n.care_setting)
  ) {
    parityFailures.push({
      id: testCase.id,
      expected: expectedCrisisType,
      edge: edgeCrisisType,
      n8n: n8nCrisisType,
    })
  }
}

function runNormalizer(jsCode, message, parsed) {
  const input = { first: () => ({ json: { output: parsed } }) }
  const nodes = {
    'Deterministic Prefilter': { first: () => ({ json: { message_text: message } }) },
  }
  return Function('$input', '$', jsCode)(input, (name) => nodes[name])[0].json
}

for (const testCase of CASES.normalizer_downgrades || []) {
  const normalized = runNormalizer(NORMALIZE_LLM_RESULT, testCase.message, {
    status: 'force_end',
    risk_level: 'emergency',
    crisis_type: testCase.crisis_type,
    force_end: true,
    care_setting: 'call_911',
    message: 'Call emergency services now.',
    red_flags: [testCase.crisis_type],
  })
  if (normalized.status !== 'high_risk_continue' || normalized.force_end !== false) {
    parityFailures.push({
      id: testCase.id,
      expected: 'high_risk_continue',
      actual: normalized.status,
    })
  }
}

for (const testCase of CASES.normalizer_force_ends || []) {
  const normalized = runNormalizer(NORMALIZE_LLM_RESULT, testCase.message, {
    status: 'force_end',
    risk_level: 'emergency',
    crisis_type: testCase.crisis_type,
    force_end: true,
    care_setting: 'call_911',
    message: 'Call emergency services now.',
    red_flags: [testCase.crisis_type],
  })
  if (normalized.status !== 'force_end' || normalized.force_end !== true) {
    parityFailures.push({
      id: testCase.id,
      expected: 'force_end',
      actual: normalized.status,
    })
  }
}

if (CASES.pattern_set_version !== EMERGENCY_PATTERN_SET_VERSION) {
  parityFailures.push({
    id: 'pattern_set_version',
    expected: EMERGENCY_PATTERN_SET_VERSION,
    actual: CASES.pattern_set_version,
  })
}

console.log(JSON.stringify({
  patternSetVersion: EMERGENCY_PATTERN_SET_VERSION,
  presentations: EMERGENCY_PATTERNS.length,
  cases: CASES.positives.length
    + CASES.negatives.length
    + (CASES.normalizer_downgrades?.length || 0)
    + (CASES.normalizer_force_ends?.length || 0),
  disagreements: parityFailures,
  passed: parityFailures.length === 0,
}, null, 2))

if (parityFailures.length > 0) process.exit(1)
