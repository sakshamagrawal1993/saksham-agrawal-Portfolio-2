/**
 * E2E evidence run: Fever + Photo (Covid.jpeg), anonymous consult.
 *
 * Drives the real UI against the real deployed proxy, uploads the real image
 * file through the real <input type=file>, and screenshots every step.
 * Nothing here is mocked — the point is evidence, not a green tick.
 */
import puppeteer from 'puppeteer'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE_URL || 'http://localhost:5182'
const PHOTO = '/Users/sakshamagrawal/Documents/Startups/Startups/LibertyMD/Photos and Lab reports/Covid.jpeg'
const OUT = process.argv[2] || './evidence'
const SHOTS = path.join(OUT, 'shots')
fs.mkdirSync(SHOTS, { recursive: true })

const steps = []
let shotN = 0
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function shot(page, label) {
  shotN += 1
  const file = `${String(shotN).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`
  await page.screenshot({ path: path.join(SHOTS, file) })
  return file
}

async function record(page, label, extra = {}) {
  const file = await shot(page, label)
  const state = await page.evaluate(() => ({
    url: location.pathname + location.search,
    chips: [...document.querySelectorAll('[data-libertymd-media-chip], [data-libertymd-photo-chip]')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
    mediaLabels: [...document.querySelectorAll('*')]
      .filter((e) => e.children.length === 0 && /About your (photo|lab report)/i.test(e.textContent || ''))
      .map((e) => e.textContent.trim()),
    bodyTail: document.body.innerText.replace(/\s+/g, ' ').slice(-360),
    reportLoader: !!document.querySelector('[data-libertymd-report-loader]'),
    dialog: !!document.querySelector('[role="dialog"]'),
  }))
  steps.push({ n: shotN, label, file, ...state, ...extra })
  console.log(`[${shotN}] ${label} :: ${state.url}${state.mediaLabels.length ? ' :: MEDIA-Q ' + JSON.stringify(state.mediaLabels) : ''}`)
  return state
}

const run = async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox'],
    // No bundled Chromium in this cache; drive the installed browser instead.
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })

  const calls = []
  await page.evaluateOnNewDocument(() => {
    window.__calls = []
    const of = window.fetch
    window.fetch = async function (...a) {
      const url = typeof a[0] === 'string' ? a[0] : (a[0] && a[0].url) || ''
      let body = null
      try { if (typeof a[1]?.body === 'string') body = JSON.parse(a[1].body) } catch {}
      const t0 = Date.now()
      const res = await of.apply(this, a)
      if (/libertymd-care-proxy/.test(url)) {
        let p = {}
        try { p = JSON.parse(await res.clone().text()) } catch {}
        window.__calls.push({
          action: body?.action, status: res.status, ms: Date.now() - t0,
          turn: p.turn_count ?? null, state: p.state ?? null,
          conf: p.diagnostic_confidence ?? null,
          media_evidence: Array.isArray(p.media_evidence) ? p.media_evidence.length : 'absent',
          media_followup: p.media_followup?.kind ?? null,
          comprehension: !!p.comprehension_check,
          report_ready: !!p.report_ready,
        })
      }
      return res
    }
  })

  await page.goto(`${BASE}/liberty-md`, { waitUntil: 'networkidle2' })
  await record(page, 'landing')

  // --- start the consult -----------------------------------------------
  await page.waitForSelector('textarea, input[type="text"]')
  await page.type('textarea, input[type="text"]', 'I have fever')
  await sleep(400)
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /start chat/i.test(b.innerText))?.click())
  await page.waitForFunction(() => location.pathname.includes('/chat'), { timeout: 30000 })
  await page.waitForFunction(() => window.__calls?.length >= 1, { timeout: 60000 })
  await sleep(3000)
  await record(page, 'consult-started')

  // --- demographics gate (fresh profile) --------------------------------
  // A first-time browser is asked for age + sex before the interview opens.
  // Fill it rather than treating it as a failure: it is the real entry path.
  // The gate paints only after the consultation row exists, and while it is up
  // the composer and attach control are inert — so settle it before anything
  // tries to attach a file.
  await page.waitForFunction(
    () => /consultationId=/.test(location.search)
      || !!document.querySelector('input[placeholder*="Age" i]'),
    { timeout: 90000 },
  ).catch(() => {})
  const needsDemographics = await page.waitForFunction(
    () => !!document.querySelector('input[placeholder*="Age" i]'),
    { timeout: 12000 },
  ).then(() => true).catch(() => false)
  if (needsDemographics) {
    await record(page, 'demographics-gate')
    await page.evaluate(() => {
      const age = document.querySelector('input[placeholder*="Age" i]')
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      set.call(age, '34')
      age.dispatchEvent(new Event('input', { bubbles: true }))
      const sex = [...document.querySelectorAll('button')].find((b) => /^female$/i.test(b.innerText.trim()))
      sex?.click()
    })
    await sleep(600)
    const before = await page.evaluate(() => window.__calls.length)
    await page.evaluate(() =>
      [...document.querySelectorAll('button')].find((b) => /^continue$/i.test(b.innerText.trim()))?.click())
    await page.waitForFunction((n) => window.__calls.length > n, { timeout: 60000 }, before).catch(() => {})
    await sleep(3500)
    await record(page, 'demographics-submitted')
  }

  // --- upload the photo -------------------------------------------------
  // Wait for a real consultation first. The product deliberately keeps attach
  // inert while the composer still reads "Opening consultation…", and writing
  // straight to the hidden input in that window drops the file on the floor —
  // so drive the actual chooser and only after the consult id exists.
  await page.waitForFunction(() => /consultationId=/.test(location.search), { timeout: 90000 })
  // Attach only once the composer is genuinely live: an interview question has
  // been served and the trigger is enabled.
  await page.waitForFunction(() => {
    const trigger = document.querySelector('[data-libertymd-attach-trigger]')
    return trigger && !trigger.disabled
      && !document.querySelector('input[placeholder*="Age" i]')
  }, { timeout: 90000 })
  await sleep(1200)

  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.evaluate(() => document.querySelector('[data-libertymd-attach-trigger]')?.click())
    const opened = await page.waitForSelector('[data-libertymd-attach-sheet]', { timeout: 8000 })
      .then(() => true).catch(() => false)
    if (opened) break
    if (attempt === 3) {
      await record(page, 'attach-sheet-would-not-open')
      throw new Error('attach sheet never opened with a live consultation')
    }
    await sleep(2500)
  }
  await record(page, 'attach-sheet-open')

  const input = await page.$('[data-libertymd-attach-photo-input]')
  if (!input) throw new Error('photo input not found')
  await input.uploadFile(PHOTO)
  await record(page, 'photo-submitted-immediately')

  // watch the card transition
  for (let i = 0; i < 8; i++) {
    await sleep(4000)
    const s = await record(page, `photo-poll-${i + 1}`)
    if (/processed and included|could not read|processing failed/i.test(s.bodyTail)) break
  }

  // --- drive the interview ---------------------------------------------
  const pickAnswer = async () => page.evaluate(() => {
    const chips = [...document.querySelectorAll('button')].filter((b) => {
      const t = b.innerText.trim()
      return t && t.length < 60 && !b.getAttribute('aria-label') && !/^(send|attach)$/i.test(t)
        && !b.closest('header') && !/looks good|something.s wrong/i.test(t)
        // never mistake chrome for an interview option
        && !/^(female|male|continue|care for someone else|dismiss|remove|try again)$/i.test(t)
    })
    if (!chips.length) return null
    // Prefer an explicit negative for danger questions so the run stays non-emergency.
    const no = chips.find((c) => /^no\b|^no,|^none\b/i.test(c.innerText.trim()))
    const chosen = no || chips[Math.min(1, chips.length - 1)]
    const text = chosen.innerText.trim()
    chosen.click()
    return text
  })

  const FREE_TEXT = [
    'It is around 101 F measured with a thermometer.',
    'I feel weak and tired but I can still walk around.',
    'No, nothing else to add.',
  ]
  let freeIdx = 0

  for (let turn = 0; turn < 16; turn++) {
    // comprehension gate?
    const gate = await page.evaluate(() =>
      !!([...document.querySelectorAll('button')].find((b) => /looks good/i.test(b.innerText))))
    if (gate) {
      await record(page, 'comprehension-check-summary')
      const before = await page.evaluate(() => window.__calls.length)
      await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /looks good/i.test(b.innerText)).click())
      // capture the transition window — this is where a loader should appear
      for (let i = 0; i < 6; i++) {
        await sleep(2500)
        await record(page, `after-continue-${i + 1}`)
        if (page.url().includes('/report/')) break
      }
      await page.waitForFunction((n) => window.__calls.length > n, { timeout: 90000 }, before).catch(() => {})
      await sleep(2000)
      await record(page, 'after-comprehension-settled')
      if (page.url().includes('/report/')) break
      continue
    }

    if (page.url().includes('/report/')) break

    const before = await page.evaluate(() => window.__calls.length)
    const picked = await pickAnswer()
    if (!picked) {
      const el = await page.$('input[type="text"], textarea')
      if (!el) break
      await el.type(FREE_TEXT[freeIdx % FREE_TEXT.length]); freeIdx++
      await sleep(300)
      await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Send message')?.click())
    }
    await page.waitForFunction((n) => window.__calls.length > n, { timeout: 95000 }, before).catch(() => {})
    await sleep(2500)
    await record(page, `turn-${turn + 1}`, { answered: picked || FREE_TEXT[(freeIdx - 1) % FREE_TEXT.length] })
  }

  await sleep(3000)
  await record(page, 'final-state')

  const finalCalls = await page.evaluate(() => window.__calls)
  calls.push(...finalCalls)

  fs.writeFileSync(path.join(OUT, 'run.json'), JSON.stringify({
    base: BASE, photo: PHOTO, finishedAt: new Date().toISOString(),
    reachedReport: page.url().includes('/report/'),
    finalUrl: page.url(),
    calls, steps,
  }, null, 2))

  await browser.close()
  console.log('\n=== SUMMARY ===')
  console.log('reached report page :', page.url().includes('/report/'))
  console.log('media_evidence seen :', [...new Set(calls.map((c) => c.media_evidence))].join(', '))
  console.log('media_followup seen :', calls.some((c) => c.media_followup) ? 'YES' : 'NO')
  console.log('About-your-photo Qs :', steps.some((s) => s.mediaLabels?.length) ? 'YES' : 'NO')
  console.log('report_ready        :', calls.some((c) => c.report_ready) ? 'YES' : 'NO')
  console.log('max turn            :', Math.max(0, ...calls.map((c) => c.turn || 0)))
}

run().catch((e) => { console.error('RUN FAILED:', e.message); process.exit(1) })
