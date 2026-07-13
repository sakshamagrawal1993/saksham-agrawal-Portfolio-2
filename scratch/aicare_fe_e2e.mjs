/**
 * Live FE E2E for AI Care chat on saksham-experiments.com
 * Usage: node scratch/aicare_fe_e2e.mjs
 */
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const BASE = process.env.AICARE_BASE || 'https://saksham-experiments.com';
const EMAIL = process.env.AICARE_EMAIL || 'test@example.com';
const PASSWORD = process.env.AICARE_PASSWORD || 'password';
const OUT = path.resolve('scratch/aicare_fe_e2e_out');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
    defaultViewport: { width: 1280, height: 900 },
  });
  const page = await browser.newPage();
  const network = [];
  const consoleLogs = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    const entry = { type: msg.type(), text: msg.text() };
    consoleLogs.push(entry);
    if (msg.type() === 'error') console.log('CONSOLE_ERROR:', msg.text());
  });
  page.on('pageerror', (err) => {
    pageErrors.push(String(err));
    console.log('PAGE_ERROR:', err.message);
  });
  page.on('response', async (res) => {
    const url = res.url();
    if (!/ai-care-proxy|supabase\.co\/functions|n8n\.saksham|auth\/v1/.test(url)) return;
    let bodyPreview = '';
    try {
      const ct = res.headers()['content-type'] || '';
      if (ct.includes('json') || ct.includes('event-stream') || ct.includes('text')) {
        bodyPreview = (await res.text()).slice(0, 400);
      }
    } catch {
      /* ignore */
    }
    network.push({
      url,
      status: res.status(),
      ct: res.headers()['content-type'] || '',
      bodyPreview,
    });
    console.log('NET', res.status(), url.split('?')[0], (res.headers()['content-type'] || '').slice(0, 40));
  });

  try {
    console.log('1) goto chat (expect login redirect)');
    await page.goto(`${BASE}/ai-care/chat`, { waitUntil: 'networkidle2', timeout: 90000 });
    await page.screenshot({ path: `${OUT}/01-initial.png`, fullPage: true });
    console.log('url', page.url());

    // If already logged in welcome screen
    const continueBtn = await page.$x("//button[contains(., 'Continue')]");
    if (continueBtn.length) {
      console.log('already logged in, continue');
      await continueBtn[0].click();
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    } else if (page.url().includes('/login')) {
      console.log('2) login');
      await page.waitForSelector('input[type="email"]', { timeout: 20000 });
      await page.type('input[type="email"]', EMAIL, { delay: 20 });
      await page.type('input[type="password"]', PASSWORD, { delay: 20 });
      await Promise.all([
        page.click('button[type="submit"]'),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
      ]);
      await sleep(1500);
      // if still on login with continue
      const cont2 = await page.$x("//button[contains(., 'Continue')]");
      if (cont2.length) await cont2[0].click();
      await sleep(2000);
    }

    // Ensure on chat
    if (!page.url().includes('/ai-care/chat')) {
      console.log('navigating to chat after auth, current=', page.url());
      await page.goto(`${BASE}/ai-care/chat`, { waitUntil: 'networkidle2', timeout: 90000 });
    }
    await sleep(2500);
    await page.screenshot({ path: `${OUT}/02-chat-loaded.png`, fullPage: true });
    console.log('chat url', page.url());

    // Wait for input
    await page.waitForSelector('input[placeholder*="Describe"], input[placeholder*="issue"], input[type="text"]', {
      timeout: 30000,
    });

    const beforeText = await page.evaluate(() => document.body.innerText.slice(0, 1500));
    console.log('body preview before send:\n', beforeText.slice(0, 500));

    const inputSel = 'input[placeholder*="Describe"], input[placeholder*="issue"]';
    await page.click(inputSel);
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) el.value = '';
    }, inputSel);
    const msg = 'I have a mild headache for two days, no fever';
    await page.type(inputSel, msg, { delay: 15 });

    // Click send (mic button) or press Enter
    const sendBtn = await page.$('button:not([disabled])');
    // Prefer Enter for reliability
    await page.focus(inputSel);
    await page.keyboard.press('Enter');
    console.log('3) sent message, waiting for assistant reply / network');

    // Wait up to 45s for either assistant bubble growth or proxy response
    const start = Date.now();
    let gotProxy = false;
    let assistantAppeared = false;
    while (Date.now() - start < 45000) {
      gotProxy = network.some((n) => n.url.includes('ai-care-proxy') && n.status >= 200);
      const texts = await page.$$eval('div', (nodes) =>
        nodes.map((n) => (n.textContent || '').trim()).filter((t) => t.length > 20 && t.length < 300),
      );
      assistantAppeared = texts.some(
        (t) =>
          /where|pain|head|how long|severity|throbbing|dull|options|tell me|fever|onset/i.test(t) &&
          !t.includes(msg),
      );
      if (gotProxy && assistantAppeared) break;
      // also detect alert dialogs
      const dialogs = [];
      page.once('dialog', async (d) => {
        dialogs.push(d.message());
        console.log('ALERT:', d.message());
        await d.dismiss();
      });
      await sleep(1000);
    }

    await page.screenshot({ path: `${OUT}/03-after-send.png`, fullPage: true });
    const afterText = await page.evaluate(() => document.body.innerText.slice(0, 2500));
    console.log('body preview after send:\n', afterText.slice(0, 800));

    const proxyCalls = network.filter((n) => n.url.includes('ai-care-proxy'));
    console.log('\n=== PROXY CALLS ===');
    for (const c of proxyCalls) {
      console.log(JSON.stringify({ status: c.status, ct: c.ct, body: c.bodyPreview.slice(0, 300) }, null, 2));
    }

    const result = {
      url: page.url(),
      gotProxy,
      assistantAppeared,
      proxyCount: proxyCalls.length,
      pageErrors,
      consoleErrors: consoleLogs.filter((c) => c.type === 'error').slice(0, 20),
      networkSummary: network.map((n) => ({ status: n.status, url: n.url.split('?')[0], ct: n.ct })),
    };
    fs.writeFileSync(`${OUT}/result.json`, JSON.stringify(result, null, 2));
    console.log('\n=== RESULT ===', JSON.stringify(result, null, 2));

    if (!gotProxy || !assistantAppeared) {
      console.error('E2E FAIL: no assistant response visible');
      process.exitCode = 1;
    } else {
      console.log('E2E PASS');
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
