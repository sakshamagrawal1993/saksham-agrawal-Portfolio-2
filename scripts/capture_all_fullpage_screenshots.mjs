import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const artifactsDir = '/Users/sakshamagrawal/.gemini/antigravity-ide/brain/244ecf32-e60d-4e69-86c5-821399670273';
const screenshotsDir = path.join(artifactsDir, 'screenshots');
const startupScreenshotsDir = '/Users/sakshamagrawal/Documents/Startups/Startups/LibertyMD/screenshots';

if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
if (!fs.existsSync(startupScreenshotsDir)) fs.mkdirSync(startupScreenshotsDir, { recursive: true });

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function copyToStartup(filename) {
  const src = path.join(screenshotsDir, filename);
  const dest = path.join(startupScreenshotsDir, filename);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
}

(async () => {
  console.log("=== CAPTURING MASTER FULL-PAGE DESKTOP & MOBILE SCREENSHOTS ===");

  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    pipe: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const iphoneUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';

  async function createPage(isMobile = false, width = 1280, height = 900) {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(90000);
    if (isMobile) {
      await page.setUserAgent(iphoneUserAgent);
      await page.setViewport({ width: 390, height, isMobile: true, hasTouch: true });
    } else {
      await page.setViewport({ width, height });
    }
    return page;
  }

  // -------------------------------------------------------------
  // 1. HOMEPAGE (FULL LENGTH DESKTOP + MOBILE)
  // -------------------------------------------------------------
  console.log("1. Capturing Homepage (Full Length)...");
  {
    // Desktop Full Length
    const page = await createPage(false, 1280, 3200);
    await page.goto('http://localhost:5173/liberty-md', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await delay(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '1_homepage_desktop.png'), fullPage: false });
    copyToStartup('1_homepage_desktop.png');
    console.log("Saved 1_homepage_desktop.png (Full Page 1280x3200)");
    await page.close();
  }
  {
    // Mobile Full Length
    const page = await createPage(true, 390, 4200);
    await page.goto('http://localhost:5173/liberty-md', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await delay(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '1_homepage_mobile.png'), fullPage: false });
    copyToStartup('1_homepage_mobile.png');
    console.log("Saved 1_homepage_mobile.png (Full Page Mobile 390x4200)");
    await page.close();
  }

  // -------------------------------------------------------------
  // 2. CONSULTATION / CHAT PAGE (DESKTOP + MOBILE)
  // -------------------------------------------------------------
  console.log("2. Capturing Consultation Chat Page...");
  {
    // Desktop
    const page = await createPage(false, 1280, 900);
    await page.goto('http://localhost:5173/liberty-md', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await delay(1000);

    await page.evaluate(() => {
      const el = document.querySelector('#libertymd-hero-symptoms') || document.querySelector('textarea');
      if (el) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(el, 'I have had a low fever of 100.2 F and a mild cough for 2 days.');
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await delay(300);
    await page.evaluate(() => {
      const btn = document.querySelector('.libertymd-start-chat-cta') || document.querySelector('button[type="submit"]');
      if (btn) btn.click();
    });
    await delay(4000);
    await page.screenshot({ path: path.join(screenshotsDir, '2_consultation_desktop.png'), fullPage: false });
    copyToStartup('2_consultation_desktop.png');
    console.log("Saved 2_consultation_desktop.png");
    await page.close();
  }
  {
    // Mobile
    const page = await createPage(true, 390, 844);
    await page.goto('http://localhost:5173/liberty-md', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await delay(1000);

    await page.evaluate(() => {
      const el = document.querySelector('#libertymd-hero-symptoms') || document.querySelector('textarea');
      if (el) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(el, 'I have had a low fever of 100.2 F and a mild cough for 2 days.');
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await delay(300);
    await page.evaluate(() => {
      const btn = document.querySelector('.libertymd-start-chat-cta') || document.querySelector('button[type="submit"]');
      if (btn) btn.click();
    });
    await delay(4000);
    await page.screenshot({ path: path.join(screenshotsDir, '2_consultation_mobile.png'), fullPage: false });
    copyToStartup('2_consultation_mobile.png');
    console.log("Saved 2_consultation_mobile.png");
    await page.close();
  }

  // -------------------------------------------------------------
  // 3. ATTACHMENT VIEW (PHOTO / LAB UPLOAD DRAWER)
  // -------------------------------------------------------------
  console.log("3. Capturing Attachment View...");
  {
    // Desktop Attachment View
    const page = await createPage(false, 1280, 900);
    await page.goto('http://localhost:5173/liberty-md', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await delay(1000);

    await page.evaluate(() => {
      const el = document.querySelector('#libertymd-hero-symptoms') || document.querySelector('textarea');
      if (el) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(el, 'I have a skin rash on my forearm.');
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await delay(300);
    await page.evaluate(() => {
      const btn = document.querySelector('.libertymd-start-chat-cta') || document.querySelector('button[type="submit"]');
      if (btn) btn.click();
    });
    await delay(4000);

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const attachBtn = btns.find(b => b.textContent.toLowerCase().includes('photo') || b.textContent.toLowerCase().includes('attach') || b.textContent.toLowerCase().includes('lab') || b.querySelector('svg'));
      if (attachBtn) attachBtn.click();
    });
    await delay(1000);

    await page.screenshot({ path: path.join(screenshotsDir, '3_attachment_view_desktop.png'), fullPage: false });
    copyToStartup('3_attachment_view_desktop.png');
    console.log("Saved 3_attachment_view_desktop.png");
    await page.close();
  }
  {
    // Mobile Attachment View
    const page = await createPage(true, 390, 844);
    await page.goto('http://localhost:5173/liberty-md', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await delay(1000);

    await page.evaluate(() => {
      const el = document.querySelector('#libertymd-hero-symptoms') || document.querySelector('textarea');
      if (el) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(el, 'I have a skin rash on my forearm.');
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await delay(300);
    await page.evaluate(() => {
      const btn = document.querySelector('.libertymd-start-chat-cta') || document.querySelector('button[type="submit"]');
      if (btn) btn.click();
    });
    await delay(4000);

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const attachBtn = btns.find(b => b.textContent.toLowerCase().includes('photo') || b.textContent.toLowerCase().includes('attach') || b.textContent.toLowerCase().includes('lab'));
      if (attachBtn) attachBtn.click();
    });
    await delay(1000);

    await page.screenshot({ path: path.join(screenshotsDir, '3_attachment_view_mobile.png'), fullPage: false });
    copyToStartup('3_attachment_view_mobile.png');
    console.log("Saved 3_attachment_view_mobile.png");
    await page.close();
  }

  // -------------------------------------------------------------
  // 4. GENUINE LIVE DOCTOR REPORT (DESKTOP + MOBILE)
  // -------------------------------------------------------------
  console.log("4. Capturing Genuine Live Doctor Report...");
  const sessionPath = path.join(process.cwd(), 'scratch/report_session.json');
  if (fs.existsSync(sessionPath)) {
    const { consultationId, session } = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    {
      // Desktop Report
      const page = await createPage(false, 1280, 2800);
      await page.goto('http://localhost:5173/liberty-md', { waitUntil: 'domcontentloaded' });
      await page.evaluate((sess, cid) => {
        localStorage.setItem('sb-ralhkmpbslsdkwnqzqen-auth-token', JSON.stringify(sess));
        localStorage.setItem('libertymd_active_consultation_id', cid);
      }, session, consultationId);

      await page.goto(`http://localhost:5173/liberty-md/report/${consultationId}`, { waitUntil: 'domcontentloaded' });
      await delay(6000);
      await page.screenshot({ path: path.join(screenshotsDir, '4_genuine_report_desktop.png'), fullPage: false });
      copyToStartup('4_genuine_report_desktop.png');
      console.log("Saved 4_genuine_report_desktop.png (2800px)");
      await page.close();
    }
    {
      // Mobile Report
      const page = await createPage(true, 390, 3600);
      await page.goto('http://localhost:5173/liberty-md', { waitUntil: 'domcontentloaded' });
      await page.evaluate((sess, cid) => {
        localStorage.setItem('sb-ralhkmpbslsdkwnqzqen-auth-token', JSON.stringify(sess));
        localStorage.setItem('libertymd_active_consultation_id', cid);
      }, session, consultationId);

      await page.goto(`http://localhost:5173/liberty-md/report/${consultationId}`, { waitUntil: 'domcontentloaded' });
      await delay(6000);
      await page.screenshot({ path: path.join(screenshotsDir, '4_genuine_report_mobile.png'), fullPage: false });
      copyToStartup('4_genuine_report_mobile.png');
      console.log("Saved 4_genuine_report_mobile.png (3600px)");
      await page.close();
    }
  }

  // -------------------------------------------------------------
  // 5. EMERGENCY ALERT (DESKTOP + MOBILE)
  // -------------------------------------------------------------
  console.log("5. Capturing Emergency Alert...");
  {
    // Desktop
    const page = await createPage(false, 1280, 900);
    await page.goto('http://localhost:5173/liberty-md', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await delay(1000);

    await page.evaluate(() => {
      const el = document.querySelector('#libertymd-hero-symptoms') || document.querySelector('textarea');
      if (el) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(el, 'I have crushing chest pressure spreading to my left arm with sweating and nausea.');
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await delay(300);
    await page.evaluate(() => {
      const btn = document.querySelector('.libertymd-start-chat-cta') || document.querySelector('button[type="submit"]');
      if (btn) btn.click();
    });
    await delay(4500);

    await page.screenshot({ path: path.join(screenshotsDir, '5_emergency_desktop.png'), fullPage: false });
    copyToStartup('5_emergency_desktop.png');
    console.log("Saved 5_emergency_desktop.png");
    await page.close();
  }
  {
    // Mobile
    const page = await createPage(true, 390, 844);
    await page.goto('http://localhost:5173/liberty-md', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await delay(1000);

    await page.evaluate(() => {
      const el = document.querySelector('#libertymd-hero-symptoms') || document.querySelector('textarea');
      if (el) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(el, 'I have crushing chest pressure spreading to my left arm with sweating and nausea.');
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await delay(300);
    await page.evaluate(() => {
      const btn = document.querySelector('.libertymd-start-chat-cta') || document.querySelector('button[type="submit"]');
      if (btn) btn.click();
    });
    await delay(4500);

    await page.screenshot({ path: path.join(screenshotsDir, '5_emergency_mobile.png'), fullPage: false });
    copyToStartup('5_emergency_mobile.png');
    console.log("Saved 5_emergency_mobile.png");
    await page.close();
  }

  // -------------------------------------------------------------
  // 6. SAMPLE REPORT OVERLAY (DESKTOP + MOBILE)
  // -------------------------------------------------------------
  console.log("6. Capturing Sample Report Overlay...");
  {
    // Desktop
    const page = await createPage(false, 1280, 1200);
    await page.goto('http://localhost:5173/liberty-md', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await delay(1000);

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const sampleBtn = btns.find(b => b.textContent.toLowerCase().includes('sample report'));
      if (sampleBtn) sampleBtn.click();
    });
    await delay(1500);

    await page.screenshot({ path: path.join(screenshotsDir, '6_sample_report_desktop.png'), fullPage: false });
    copyToStartup('6_sample_report_desktop.png');
    console.log("Saved 6_sample_report_desktop.png");
    await page.close();
  }
  {
    // Mobile
    const page = await createPage(true, 390, 1200);
    await page.goto('http://localhost:5173/liberty-md', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await delay(1000);

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const sampleBtn = btns.find(b => b.textContent.toLowerCase().includes('sample report'));
      if (sampleBtn) sampleBtn.click();
    });
    await delay(1500);

    await page.screenshot({ path: path.join(screenshotsDir, '6_sample_report_mobile.png'), fullPage: false });
    copyToStartup('6_sample_report_mobile.png');
    console.log("Saved 6_sample_report_mobile.png");
    await page.close();
  }

  await browser.close();
  console.log("\nALL MASTER SCREENSHOTS CAPTURED SUCCESSFULLY!");
})();
