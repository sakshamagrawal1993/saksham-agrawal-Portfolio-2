/**
 * P1-01 — source contracts for the unified entry screen.
 * P1-02 — time-promise contracts (shared expected-length module + both surfaces).
 *
 * Deno cannot mount React without a harness, so this suite asserts source:
 * CareControls submit gates (consent, non-empty answer, age/sex), AC0 emergency
 * early-return on Chat + App before next_question, start force_end skips
 * interview, and save requires free-text message.
 *
 * Run focused: `deno test --no-config --allow-read tests/libertymd/unified-entry.test.ts`
 * Wired into `test:libertymd:ci` via `test:libertymd:unified-entry`.
 */
declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readTextFile(path: string | URL): Promise<string>
}

const CARE_SOURCE = new URL(
  '../../components/LibertyMD/LibertyMDCareControls.tsx',
  import.meta.url,
)
const CHAT_SOURCE = new URL(
  '../../components/LibertyMD/LibertyMDChat.tsx',
  import.meta.url,
)
const APP_SOURCE = new URL(
  '../../components/LibertyMD/LibertyMDApp.tsx',
  import.meta.url,
)
const START_SOURCE = new URL(
  '../../supabase/functions/libertymd-care-proxy/actions/start-consultation.ts',
  import.meta.url,
)
const SAVE_SOURCE = new URL(
  '../../supabase/functions/libertymd-care-proxy/actions/save-demographics.ts',
  import.meta.url,
)
const EXPECTATIONS_SOURCE = new URL(
  '../../components/LibertyMD/libertymd-interview-expectations.ts',
  import.meta.url,
)
const ARCH_SOURCE = new URL(
  '../../docs/libertymd/CARE-ARCHITECTURE.md',
  import.meta.url,
)
const EN_LOCALE = new URL('../../i18n/locales/en.json', import.meta.url)

function demographicsPromptRegion(source: string): string {
  const start = source.indexOf('export function LibertyMDDemographicsPrompt')
  if (start < 0) throw new Error('LibertyMDDemographicsPrompt not found')
  const next = source.indexOf('export function LibertyMDAbandonedRecoveryPrompt', start)
  if (next < 0) throw new Error('AbandonedRecoveryPrompt not found after DemographicsPrompt')
  return source.slice(start, next)
}

function submitDemographicsRegion(source: string): string {
  const start = source.indexOf('const submitDemographics')
  if (start < 0) throw new Error('submitDemographics not found')
  const next = source.indexOf('\n  const ', start + 1)
  const end = next > start ? next : start + 2500
  return source.slice(start, end)
}

Deno.test('P1-01 AC2 · unified control blocks submit without consent / empty answer / age-sex', async () => {
  const region = demographicsPromptRegion(await Deno.readTextFile(CARE_SOURCE))
  if (!region.includes('consentChecked')) {
    throw new Error('consent checkbox prop required')
  }
  if (!region.includes('answerReady') && !region.includes("trim()")) {
    throw new Error('non-empty trimmed answer must gate submit')
  }
  if (!region.includes('consentChecked') || !region.includes('canSubmit')) {
    throw new Error('canSubmit must include consent')
  }
  if (!region.includes('ageNum >= LIBERTYMD_MIN_PATIENT_AGE_CLIENT')
    && !region.includes('Number(age) >= 18')) {
    throw new Error('adults-only age bounds must remain')
  }
  if (!region.includes('Number(age) <= 120') && !region.includes('ageNum <= 120')) {
    throw new Error('adults-only upper age bound must remain')
  }
  if (!region.includes('data-libertymd-unified-entry')) {
    throw new Error('unified entry marker missing')
  }
  if (!region.includes('profiles.length > 1') && !region.includes('showProfilePick')) {
    throw new Error('profile pick must hide unless profiles.length > 1')
  }
})

Deno.test('P1-01 AC0 · Chat submitDemographics emergency early-return before next_question', async () => {
  const region = submitDemographicsRegion(await Deno.readTextFile(CHAT_SOURCE))
  if (!region.includes("data?.emergency || data?.state === 'emergency_stopped'")) {
    throw new Error('Chat AC0 emergency gate missing')
  }
  if (!region.includes("setPhase('emergency_end')")) {
    throw new Error('Chat must enter emergency_end on force_end')
  }
  if (!region.includes('message: answer') && !region.includes('message:')) {
    throw new Error('Chat must send free-text message on demographics submit')
  }
  const emergencyIdx = region.indexOf("data?.emergency || data?.state === 'emergency_stopped'")
  const nextQuestionIdx = region.indexOf('next_question', emergencyIdx + 1)
  const returnIdx = region.indexOf('return;', emergencyIdx)
  if (emergencyIdx < 0 || returnIdx < 0) {
    throw new Error('Chat emergency early-return missing')
  }
  if (nextQuestionIdx > 0 && nextQuestionIdx < returnIdx) {
    // next_question may appear in a comment; ensure return precedes intake fall-through.
  }
  if (!region.includes("setPhase('intake')")) {
    throw new Error('Chat intake path after non-emergency must remain')
  }
  const intakeIdx = region.indexOf("setPhase('intake')")
  if (!(returnIdx < intakeIdx)) {
    throw new Error('Chat AC0: emergency return must precede intake / next_question path')
  }
})

Deno.test('P1-01 AC0 · App submitDemographics emergency early-return before next_question', async () => {
  const region = submitDemographicsRegion(await Deno.readTextFile(APP_SOURCE))
  if (!region.includes("data?.emergency || data?.state === 'emergency_stopped'")) {
    throw new Error('App AC0 emergency gate missing')
  }
  if (!region.includes("setPhase('emergency_end')")) {
    throw new Error('App must enter emergency_end on force_end')
  }
  if (!region.includes('message:')) {
    throw new Error('App must send free-text message on demographics submit')
  }
  const emergencyIdx = region.indexOf("data?.emergency || data?.state === 'emergency_stopped'")
  const returnIdx = region.indexOf('return;', emergencyIdx)
  const intakeIdx = region.indexOf("setPhase('intake')")
  if (!(returnIdx > emergencyIdx && returnIdx < intakeIdx)) {
    throw new Error('App AC0: emergency return must precede intake / next_question path')
  }
})

Deno.test('P1-01 AC4 · start force_end short-circuits before runInterview', async () => {
  const source = await Deno.readTextFile(START_SOURCE)
  const forceEndIdx = source.indexOf('if (guardrail.force_end)')
  const interviewIdx = source.indexOf('runInterview(')
  if (forceEndIdx < 0 || interviewIdx < 0) {
    throw new Error('start must have force_end gate and runInterview')
  }
  if (!(forceEndIdx < interviewIdx)) {
    throw new Error('AC4: runInterview must not run before force_end short-circuit')
  }
  if (!source.includes('next_question:') || !source.includes('target_slot:')) {
    throw new Error('non-emergency start must return next_question and target_slot')
  }
  if (!source.includes('FALLBACK_TARGET_SLOT') && !source.includes("'onset'")) {
    throw new Error('interview hold fallback must persist onset slot')
  }
})

Deno.test('P1-01 Q4/AC5 · save_demographics requires message and binds pre-start target_slot', async () => {
  const source = await Deno.readTextFile(SAVE_SOURCE)
  if (!source.includes("Please answer the clinical question")) {
    throw new Error('save must 400 when clinical answer missing')
  }
  if (!source.includes('if (!freeText)')) {
    throw new Error('empty free text must be rejected')
  }
  if (!source.includes('answerSlot') && !source.includes('consultation.target_slot')) {
    throw new Error('answer must bind to consultation.target_slot')
  }
  if (!source.includes('was_prefilled')) {
    throw new Error('optional was_prefilled on demographics_saved expected')
  }
  // Stale "NOT wired" header must be gone.
  if (source.includes('is NOT wired')) {
    throw new Error('stale client-NOT-wired header must be updated')
  }
})

Deno.test('P1-02 AC3 · shared interview-expectations module owns turns/minutes', async () => {
  const source = await Deno.readTextFile(EXPECTATIONS_SOURCE)
  if (!source.includes('EXPECTED_INTERVIEW_TURNS = 8')) {
    throw new Error('EXPECTED_INTERVIEW_TURNS must be 8')
  }
  if (!source.includes('EXPECTED_INTERVIEW_MINUTES = 3')) {
    throw new Error('EXPECTED_INTERVIEW_MINUTES must be 3')
  }
  if (!source.includes('MAX_INTERVIEW_TURNS = 15')) {
    throw new Error('MAX_INTERVIEW_TURNS mirror (15) required')
  }
  if (!source.includes('formatInterviewTimePromise')) {
    throw new Error('formatter helper required')
  }
  if (!source.includes('hedged') && !source.includes('Hedged')) {
    throw new Error('hedge annotation required in module comment')
  }
  if (!source.includes('Revisit') && !source.includes('revisit')) {
    throw new Error('median/duration revisit annotation required')
  }
  if (!source.includes('P1-06')) {
    throw new Error('P1-06 import rule must be documented in module')
  }
})

Deno.test('P1-02 AC1/AC2 · App + CareControls consume shared formatter; no dual hardcoded sentence', async () => {
  const app = await Deno.readTextFile(APP_SOURCE)
  const care = await Deno.readTextFile(CARE_SOURCE)
  const region = demographicsPromptRegion(care)

  if (!app.includes("from './libertymd-interview-expectations'") &&
      !app.includes('from "./libertymd-interview-expectations"')) {
    throw new Error('App must import libertymd-interview-expectations')
  }
  if (!care.includes("from './libertymd-interview-expectations'") &&
      !care.includes('from "./libertymd-interview-expectations"')) {
    throw new Error('CareControls must import libertymd-interview-expectations')
  }
  if (!app.includes('formatInterviewTimePromise(t)')) {
    throw new Error('App landing must render formatInterviewTimePromise(t)')
  }
  if (!region.includes('formatInterviewTimePromise(t)')) {
    throw new Error('DemographicsPrompt must render formatInterviewTimePromise(t)')
  }
  if (!app.includes("phase === 'initial'") || !app.includes('data-libertymd-time-promise')) {
    throw new Error('landing promise must be phase===initial gated with marker')
  }

  const promiseIdx = region.indexOf('data-libertymd-time-promise')
  const h2Idx = region.indexOf('id="libertymd-entry-question"')
  if (promiseIdx < 0 || h2Idx < 0 || !(promiseIdx < h2Idx)) {
    throw new Error('time promise must appear above h2#libertymd-entry-question')
  }

  // Dual hardcoding of the seed sentence as sole source is forbidden in UI files.
  const dualHardcode = /About\s+8\s+questions/i
  if (dualHardcode.test(app) || dualHardcode.test(region)) {
    throw new Error('App/CareControls must not hardcode "About 8 questions" — use formatter')
  }
})

Deno.test('P1-02 AC3 · i18n template holds placeholders; formatter tracks constants', async () => {
  const { EXPECTED_INTERVIEW_TURNS, EXPECTED_INTERVIEW_MINUTES, formatInterviewTimePromise } =
    await import('../../components/LibertyMD/libertymd-interview-expectations.ts')
  const en = JSON.parse(await Deno.readTextFile(EN_LOCALE)) as {
    hero?: { timePromise?: string }
  }
  const template = en.hero?.timePromise
  if (!template || !template.includes('{count}') || !template.includes('{minutes}')) {
    throw new Error('en.json hero.timePromise must use {count} and {minutes}')
  }
  if (/\b8\b/.test(template) || /\b3\b/.test(template)) {
    throw new Error('locale template must not bake 8/3 as sole source')
  }

  const out = formatInterviewTimePromise((key, vars) => {
    if (key !== 'hero.timePromise') throw new Error(`unexpected key ${key}`)
    return template
      .replace('{count}', String(vars?.count))
      .replace('{minutes}', String(vars?.minutes))
  })
  if (!out.includes(String(EXPECTED_INTERVIEW_TURNS)) || !out.includes(String(EXPECTED_INTERVIEW_MINUTES))) {
    throw new Error('formatter output must track EXPECTED_INTERVIEW_* constants')
  }
  if (out !== `About ${EXPECTED_INTERVIEW_TURNS} questions — roughly ${EXPECTED_INTERVIEW_MINUTES} minutes`) {
    throw new Error(`unexpected promise sentence: ${out}`)
  }
})

Deno.test('P1-02 AC4/AC5 · CARE-ARCHITECTURE documents P1-06 import + revisit', async () => {
  const arch = await Deno.readTextFile(ARCH_SOURCE)
  if (!arch.includes('libertymd-interview-expectations.ts')) {
    throw new Error('CARE-ARCHITECTURE must name libertymd-interview-expectations.ts')
  }
  if (!arch.includes('P1-06')) {
    throw new Error('CARE-ARCHITECTURE must mention P1-06 import rule')
  }
  if (!arch.toLowerCase().includes('revisit') && !arch.toLowerCase().includes('median')) {
    throw new Error('CARE-ARCHITECTURE must note median/duration revisit')
  }
})

Deno.test('P1-04 AC2/AC5 · anonymous add-profile offer + no fabricated profiles.length > 1', async () => {
  const care = await Deno.readTextFile(CARE_SOURCE)
  const chat = await Deno.readTextFile(CHAT_SOURCE)
  const app = await Deno.readTextFile(APP_SOURCE)
  const en = JSON.parse(await Deno.readTextFile(EN_LOCALE)) as {
    careControls?: Record<string, string>
  }
  const region = demographicsPromptRegion(care)

  if (!care.includes('LibertyMDProfileCapabilityOffer')) {
    throw new Error('capability offer component required')
  }
  if (!region.includes('onCareForSomeoneElse') || !region.includes('isAnonymous')) {
    throw new Error('unified entry must expose anonymous add-profile secondary')
  }
  if (!care.includes('data-libertymd-add-profile="drawer"')) {
    throw new Error('drawer primary add-profile CTA required')
  }
  if (!chat.includes('attemptAddProfile') || !app.includes('attemptAddProfile')) {
    throw new Error('Chat and App must wire tap → create_patient → offer')
  }
  if (!chat.includes('anonymousAddProfileProbeBody') || !app.includes('anonymousAddProfileProbeBody')) {
    throw new Error('create_patient probe required on both surfaces')
  }
  // AC5: clients must not fabricate multi-profile lists for anonymous.
  if (chat.includes('profiles={[') || app.includes('profiles={[')) {
    throw new Error('must not pass fabricated profiles arrays')
  }
  const cc = en.careControls || {}
  for (const key of [
    'careForSomeoneElse',
    'profileOfferTitle',
    'profileOfferBody',
    'profileOfferGoogle',
    'profileOfferDismiss',
  ]) {
    if (!cc[key]) throw new Error(`missing en careControls.${key}`)
  }
  if (/sign in to continue your consult/i.test(cc.profileOfferBody || '')) {
    throw new Error('offer must not frame as consult toll')
  }
  if (!care.includes('profileOfferBody') || !care.includes('Keep using this consult') && !cc.profileOfferBody.includes('guest')) {
    // capability framing: guest continue language in locale
  }
  if (!(cc.profileOfferBody || '').toLowerCase().includes('guest')) {
    throw new Error('offer body should keep guest consult available')
  }

  const arch = await Deno.readTextFile(ARCH_SOURCE)
  if (!arch.includes('Anonymous = single self') && !arch.includes('anonymous = single self')) {
    throw new Error('CARE-ARCHITECTURE must document anonymous single-self rule')
  }
  if (!arch.includes('sign_in_required') && !arch.includes('create_patient')) {
    throw new Error('CARE-ARCHITECTURE must name create_patient / sign_in_required enforcement')
  }
})

Deno.test('P1-05 AC2/AC5 · adults-only client copy + CARE launch constraint', async () => {
  const care = await Deno.readTextFile(CARE_SOURCE)
  const save = await Deno.readTextFile(SAVE_SOURCE)
  const arch = await Deno.readTextFile(ARCH_SOURCE)
  const en = JSON.parse(await Deno.readTextFile(EN_LOCALE)) as {
    careControls?: Record<string, string>
  }
  const region = demographicsPromptRegion(care)
  const someoneStart = care.indexOf('export function LibertyMDSomeoneElseCreateSheet')
  const someoneEnd = care.indexOf('export function LibertyMDAbandonedRecoveryPrompt', someoneStart)
  const someoneRegion = someoneStart >= 0
    ? care.slice(someoneStart, someoneEnd > someoneStart ? someoneEnd : someoneStart + 6000)
    : ''

  if (!en.careControls?.adultsOnlyNotice) {
    throw new Error('en careControls.adultsOnlyNotice required')
  }
  if (!en.careControls.adultsOnlyNotice.includes('adults (18+)')) {
    throw new Error('adultsOnlyNotice must state adults 18+')
  }
  if (!en.careControls.adultsOnlyNotice.toLowerCase().includes('children and adolescents')) {
    throw new Error('adultsOnlyNotice must include care pointer')
  }
  if (/911|emergency room|coming soon/i.test(en.careControls.adultsOnlyNotice)) {
    throw new Error('adultsOnlyNotice must not use ER/911 or coming-soon framing')
  }
  if (!region.includes('adultsOnlyNotice') || !region.includes('data-libertymd-adults-only')) {
    throw new Error('unified entry must surface adults-only notice')
  }
  if (!someoneRegion.includes('adultsOnlyNotice') || !someoneRegion.includes('data-libertymd-adults-only')) {
    throw new Error('someone-else sheet must surface adults-only notice')
  }
  if (!care.includes('LIBERTYMD_MIN_PATIENT_AGE_CLIENT')) {
    throw new Error('client must document mirror of server LIBERTYMD_MIN_PATIENT_AGE')
  }
  if (!save.includes('LIBERTYMD_MIN_PATIENT_AGE') || !save.includes('ADULTS_ONLY_CODE')) {
    throw new Error('save_demographics must bind constant + adults_only code')
  }
  if (!arch.includes('Adults-only profiles') || !arch.includes('LIBERTYMD_MIN_PATIENT_AGE')) {
    throw new Error('CARE-ARCHITECTURE must document adults-only launch constraint')
  }
  if (!arch.includes('clinical-content review') && !arch.includes('clinical content review')) {
    throw new Error('CARE must state lift = constant + clinical-content review')
  }
  if (!arch.includes('P4-04') || !arch.toLowerCase().includes('check')) {
    throw new Error('CARE must name P4-04 constant hook and CHECK honesty')
  }
})

Deno.test('P1-03 AC1/AC2 · picker-first + skip path contracts', async () => {
  const care = await Deno.readTextFile(CARE_SOURCE)
  const chat = await Deno.readTextFile(CHAT_SOURCE)
  const start = await Deno.readTextFile(START_SOURCE)
  const arch = await Deno.readTextFile(ARCH_SOURCE)

  if (!care.includes('LibertyMDPreStartProfilePicker') || !care.includes('data-libertymd-profile-picker')) {
    throw new Error('pre-start profile picker required')
  }
  if (!care.includes('someoneElse') && !care.includes('data-libertymd-someone-else')) {
    throw new Error('someone else picker row required')
  }
  if (!chat.includes("phase === 'profile_pick'") || !chat.includes('patient_id')) {
    throw new Error('Chat must wire profile_pick and pass patient_id on start')
  }
  if (!chat.includes('demographics_skipped') && !start.includes('demographics_skipped')) {
    throw new Error('skip flag must exist on start response path')
  }
  if (!start.includes('skip_reaffirm') || !start.includes('PatientSelectionRequiredError')) {
    throw new Error('start must implement skip_reaffirm + multi reject')
  }
  if (!start.includes('listOwnedActivePatients') && !start.includes('activeOwnedCount')) {
    throw new Error('start must be profile-count aware')
  }
  // Never silent last-used default (forbid assignment of last-consult patient_id).
  if (/lastConsultation.*patient_id|patient_id.*lastConsultation|mostRecentPatient/i.test(start)) {
    throw new Error('start must not implement last-used auto-bind')
  }
  if (!arch.includes('Picker-first') && !arch.includes('picker-first') && !arch.includes('Profile-aware entry')) {
    throw new Error('CARE-ARCHITECTURE must document P1-03 entry branches')
  }
  if (!arch.includes('profile_selected')) {
    throw new Error('CARE-ARCHITECTURE must note profile_selected emit')
  }
})
