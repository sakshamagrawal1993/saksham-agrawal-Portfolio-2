import puppeteer from 'puppeteer'
import fs from 'node:fs'

const OUT = process.argv[2]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox'],
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })
await page.goto('http://localhost:5182/liberty-md', { waitUntil: 'networkidle2' })

await page.waitForSelector('textarea, input[type="text"]')
await page.type('textarea, input[type="text"]', 'I have fever')
await sleep(400)
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /start chat/i.test(b.innerText))?.click())

await page.waitForSelector('[data-libertymd-unified-entry]', { timeout: 90000 })
await sleep(1500)

const probe = await page.evaluate(() => {
  const form = document.querySelector('[data-libertymd-unified-entry]')
  const cs = getComputedStyle(form)
  const card = form.parentElement
  const cardCs = card ? getComputedStyle(card) : null
  return {
    formClass: form.className,
    formBorderTopWidth: cs.borderTopWidth,
    formPaddingTop: cs.paddingTop,
    cardClass: card?.className || null,
    cardBorderWidth: cardCs?.borderTopWidth || null,
  }
})
console.log(JSON.stringify(probe, null, 2))

await page.screenshot({ path: OUT })
console.log('screenshot ->', OUT)
await browser.close()
