/**
 * LibertyMD report verification (browser + backend).
 * 1) Sample report overlay on homepage
 * 2) Generate a real report via care-proxy, open report page, screenshot
 */
import puppeteer from 'puppeteer'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
// Prefer `node --env-file=.env`; also fall back to reading .env manually.
if (!process.env.VITE_SUPABASE_URL) {
  try {
    const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
    for (const line of envText.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  } catch {
    // ignore
  }
}

const OUT = __dirname
const BASE = process.env.LIBERTYMD_BASE_URL || 'http://localhost:5173'
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SUMMARY = []

function log(step, data = {}) {
  const row = { at: new Date().toISOString(), step, ...data }
  SUMMARY.push(row)
  console.log(JSON.stringify(row))
}

async function shot(page, name) {
  const file = path.join(OUT, name)
  await page.screenshot({ path: file, fullPage: false })
  log('screenshot', { file })
  return file
}

const waitMs = (ms) => new Promise((r) => setTimeout(r, ms))

async function invokeProxy(session, body, { allowHolding = false } = {}) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/libertymd-care-proxy`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ region: 'US', ...body }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (allowHolding && response.status === 503 && data?.holding) {
      return { ...data, __holding: true }
    }
    throw new Error(`${body.action} HTTP ${response.status}: ${JSON.stringify(data)}`)
  }
  return data
}

async function generateReportViaBackend() {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  }
  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  })
  const { data: authData, error: authError } = await supabase.auth.signInAnonymously()
  if (authError || !authData.session) {
    throw new Error(`Anonymous auth failed: ${authError?.message || 'no session'}`)
  }
  const session = authData.session
  log('backend_auth', { userId: session.user.id })

  await invokeProxy(session, { action: 'bootstrap' })
  const start = await invokeProxy(session, {
    action: 'start_consultation',
    message:
      'I have had a mild sore throat and runny nose for 3 days. No fever, no shortness of breath, no chest pain.',
  })
  const consultationId = start.consultation_id
  log('backend_start', { consultationId, state: start.state })

  let current = await invokeProxy(session, {
    action: 'save_demographics',
    consultation_id: consultationId,
    age: 32,
    sex_at_birth: 'male',
    message: 'I am 32 years old, male.',
  })
  log('backend_demographics', {
    state: current.state,
    hasQuestion: Boolean(current.next_question),
    comprehension: Boolean(current.comprehension_check),
  })

  const answerForQuestion = (question) => {
    const q = String(question || '').toLowerCase()
    if (/how many days|how long|days or hours|when exactly|when .*start|first started|2-3 days|felt this way|experiencing these symptoms/.test(q)) {
      return 'It started about 3 days ago and has lasted continuously since then.'
    }
    if (/scale of 1 to 10|severe|severity/.test(q)) {
      return 'About a 3 out of 10 — mild discomfort, not severe.'
    }
    if (/swallow|neck stiffness|swelling|neck/.test(q)) {
      return 'No difficulty swallowing, no neck stiffness, and no neck swelling.'
    }
    if (/cough|headache|body ache|aches|ear pain/.test(q)) {
      return 'No cough, no headache, no ear pain, and no body aches. Just mild sore throat and runny nose.'
    }
    if (/allerg/.test(q)) return 'No known medication allergies.'
    if (/medical history|asthma|diabetes|immune|chronic|condition|medications|taking any regular/.test(q)) {
      return 'No significant past medical history and I take no regular medications.'
    }
    if (/pregnant|pregnancy/.test(q)) return 'Not applicable.'
    if (/travel|sick contact|expos/.test(q)) return 'No recent travel and no known sick contacts.'
    if (/worsen|getting worse|stable|change/.test(q)) {
      return 'Symptoms are stable and not getting worse. Rest and fluids help a little.'
    }
    if (/fever|temperature/.test(q)) return 'No fever. Temperature has been normal.'
    if (/ready|summary|anything else|else you think/.test(q)) {
      return 'No, that covers it. I am ready for the summary.'
    }
    return 'Mild sore throat and congestion for about 3 days, no other concerning symptoms.'
  }

  // Up to turn cap (~15) + a couple buffer turns for comprehension ack / diagnosis.
  for (let i = 0; i < 18; i++) {
    if (current.report_ready || current.report) {
      log('backend_report_ready', { turn: i })
      break
    }
    if (current.emergency || current.clinical_review_needed) {
      log('backend_terminal_non_report', {
        turn: i,
        emergency: current.emergency,
        clinical_review_needed: current.clinical_review_needed,
      })
      break
    }

    // P1-14 comprehension gate — confirm to trigger diagnosis/report.
    if (current.comprehension_check || current.comprehension_pending) {
      log('backend_comprehension_ack', { turn: i })
      current = await invokeProxy(session, {
        action: 'send_message',
        consultation_id: consultationId,
        client_message_id: crypto.randomUUID(),
        message: 'Looks good',
        comprehension_ack: true,
      })
      log('backend_reply', {
        turn: i + 1,
        report_ready: Boolean(current.report_ready),
        hasReport: Boolean(current.report),
        state: current.state,
        auth_required: current.auth_required,
        comprehension: Boolean(current.comprehension_check),
        question: String(current.next_question || '').slice(0, 120),
      })
      continue
    }

    const answer = answerForQuestion(current.next_question)
    log('backend_send', { turn: i + 1, answer, question: String(current.next_question || '').slice(0, 100) })
    try {
      current = await invokeProxy(session, {
        action: 'send_message',
        consultation_id: consultationId,
        client_message_id: crypto.randomUUID(),
        message: answer,
      }, { allowHolding: true })
      if (current.__holding) {
        log('backend_holding_retry', { turn: i + 1 })
        await new Promise((r) => setTimeout(r, 3000))
        current = await invokeProxy(session, {
          action: 'send_message',
          consultation_id: consultationId,
          client_message_id: crypto.randomUUID(),
          message: answer,
        }, { allowHolding: true })
      }
    } catch (err) {
      const msg = String(err)
      if (/HTTP 503|holding|retryable/.test(msg)) {
        log('backend_holding_retry_error', { turn: i + 1, error: msg.slice(0, 240) })
        await new Promise((r) => setTimeout(r, 3000))
        current = await invokeProxy(session, {
          action: 'send_message',
          consultation_id: consultationId,
          client_message_id: crypto.randomUUID(),
          message: answer,
        })
      } else {
        throw err
      }
    }
    log('backend_reply', {
      turn: i + 1,
      report_ready: Boolean(current.report_ready),
      hasReport: Boolean(current.report),
      state: current.state,
      auth_required: current.auth_required,
      comprehension: Boolean(current.comprehension_check || current.comprehension_pending),
      question: String(current.next_question || current.message || '').slice(0, 120),
    })
  }

  const stored = await invokeProxy(session, {
    action: 'get_consultation',
    consultation_id: consultationId,
  })
  const reportBody = stored.report || current.report || null
  log('backend_stored', {
    consultationId,
    status: stored.consultation?.status,
    hasReportBody: Boolean(reportBody),
    retention_expires_at: stored.retention_expires_at || null,
    headline: reportBody?.headline || reportBody?.patient_summary?.slice?.(0, 80) || null,
  })

  return {
    session,
    consultationId,
    reportReady: Boolean(current.report_ready || reportBody),
    reportBody,
    accessToken: session.access_token,
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })

  const browser = await puppeteer.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
    defaultViewport: { width: 1280, height: 900 },
  })
  const page = await browser.newPage()
  page.setDefaultTimeout(60_000)
  const consoleErrors = []
  page.on('pageerror', (err) => consoleErrors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  // ─── 1) Sample report ─────────────────────────────────────────────────────
  log('open_homepage', { url: `${BASE}/liberty-md` })
  await page.goto(`${BASE}/liberty-md`, { waitUntil: 'networkidle2' })
  await waitMs(1800)
  await shot(page, 'libertymd-01-homepage.png')

  const geometry = await page.evaluate(() => {
    const btn = document.querySelector('[data-libertymd-sample-report-entry]')
    if (!btn) return { missing: true }
    const br = btn.getBoundingClientRect()
    const floating = document.querySelector('form.mx-auto.flex.h-16, form[class*="max-w-[64rem]"]')
      || [...document.querySelectorAll('form')].find((f) => f.querySelector('[name="floating-health-question"]'))
    const fr = floating?.getBoundingClientRect()
    const pe = floating ? getComputedStyle(floating).pointerEvents : null
    const centerEl = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2)
    return {
      btnText: btn.textContent,
      btnTop: br.top,
      floatingPe: pe,
      floatingTop: fr?.top ?? null,
      topTag: centerEl?.tagName || null,
      topIsSample: centerEl === btn || btn.contains(centerEl),
      coveredByFloating: pe === 'auto' && fr
        ? !(br.bottom < fr.top || br.top > fr.bottom || br.right < fr.left || br.left > fr.right)
        : false,
    }
  })
  log('sample_entry_geometry', geometry)

  // Click sample entry (should work after pointer-events fix)
  await page.evaluate(() => {
    const btn = document.querySelector('[data-libertymd-sample-report-entry]')
    btn?.scrollIntoView({ block: 'center' })
  })
  await waitMs(300)
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector('[data-libertymd-sample-report-entry]')
    if (!btn) return false
    btn.click()
    return true
  })
  log('sample_clicked', { clicked })
  await waitMs(900)

  let overlay = await page.evaluate(() => {
    const sample = document.querySelector('[data-libertymd-sample-report]')
    return {
      open: !!sample,
      text: (sample?.innerText || '').slice(0, 1400),
      hasHeadline: /viral upper respiratory|Likely a viral|Common cold/i.test(sample?.innerText || ''),
      hasBadge: /Example/i.test(sample?.innerText || ''),
    }
  })
  log('sample_overlay_state', overlay)
  await shot(page, 'libertymd-03-sample-overlay.png')

  if (overlay.open) {
    await page.evaluate(() => {
      const body = document.querySelector('[data-libertymd-overlay-body]')
      if (body) body.scrollTop = Math.min(500, body.scrollHeight)
    })
    await waitMs(300)
    await shot(page, 'libertymd-03b-sample-report-body.png')
    // close
    await page.evaluate(() => document.querySelector('[data-libertymd-sample-close]')?.click())
    await waitMs(400)
  }

  // ─── 2) Backend-complete consult + report page ────────────────────────────
  log('backend_generate_start')
  const generated = await generateReportViaBackend()
  log('backend_generate_done', {
    consultationId: generated.consultationId,
    reportReady: generated.reportReady,
    hasBody: Boolean(generated.reportBody),
  })

  if (!generated.reportReady) {
    log('backend_report_missing', { consultationId: generated.consultationId })
  } else {
    // Inject the anonymous session into the browser so get_consultation is authorized.
    await page.goto(`${BASE}/liberty-md`, { waitUntil: 'networkidle2' })
    const fullSession = generated.session
    await page.evaluate((sessionJson) => {
      const session = JSON.parse(sessionJson)
      const host = new URL(session.supabaseUrl).hostname.split('.')[0]
      const key = `sb-${host}-auth-token`
      const payload = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        token_type: 'bearer',
        expires_in: session.expires_in || 3600,
        expires_at: session.expires_at || Math.floor(Date.now() / 1000) + 3600,
        user: session.user,
      }
      localStorage.setItem(key, JSON.stringify(payload))
    }, JSON.stringify({
      supabaseUrl: SUPABASE_URL,
      access_token: fullSession.access_token,
      refresh_token: fullSession.refresh_token,
      expires_in: fullSession.expires_in,
      expires_at: fullSession.expires_at,
      user: fullSession.user,
    }))

    const reportUrl = `${BASE}/liberty-md/report/${encodeURIComponent(generated.consultationId)}`
    log('open_report_page', { reportUrl })
    await page.goto(reportUrl, { waitUntil: 'networkidle2' })
    await waitMs(2500)

    // Poll until ready / error / timeout
    const deadline = Date.now() + 90_000
    let reportPageState = null
    while (Date.now() < deadline) {
      reportPageState = await page.evaluate(() => {
        const text = document.body.innerText || ''
        return {
          url: location.href,
          hasReportBody: /differential|assessment|care plan|soap|Likely|triage|red flag|patient summary|headline/i.test(text),
          generating: /generating|preparing|loading/i.test(text.slice(0, 300)),
          error: /could not|failed to load|unable to/i.test(text.slice(0, 400)),
          snippet: text.slice(0, 1600),
        }
      })
      log('report_page_poll', {
        hasReportBody: reportPageState.hasReportBody,
        generating: reportPageState.generating,
        error: reportPageState.error,
      })
      if (reportPageState.hasReportBody || reportPageState.error) break
      await waitMs(3000)
      await page.reload({ waitUntil: 'networkidle2' }).catch(() => null)
      await waitMs(1500)
    }

    log('report_page_state', reportPageState)
    await shot(page, 'libertymd-07-report-page.png')
    await page.evaluate(() => window.scrollBy(0, 700))
    await waitMs(400)
    await shot(page, 'libertymd-07b-report-page-scrolled.png')
  }

  log('console_errors', { errors: consoleErrors.slice(0, 40) })
  fs.writeFileSync(path.join(OUT, 'libertymd-verify-summary.json'), JSON.stringify(SUMMARY, null, 2))
  await browser.close()
  console.log('DONE')
}

main().catch((err) => {
  console.error(err)
  fs.writeFileSync(
    path.join(OUT, 'libertymd-verify-summary.json'),
    JSON.stringify([...SUMMARY, { step: 'fatal', error: String(err) }], null, 2),
  )
  process.exit(1)
})
