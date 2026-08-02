import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const artifactsDir = '/Users/sakshamagrawal/.gemini/antigravity-ide/brain/244ecf32-e60d-4e69-86c5-821399670273';
const screenshotsDir = path.join(artifactsDir, 'screenshots');

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  console.log("=== CAPTURING UI CRITIQUE SCREENSHOTS (DESKTOP + MOBILE) ===");

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  async function resetPage() {
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto('http://localhost:5173/liberty-md', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await delay(1500);
  }

  // 1. HOMEPAGE
  console.log("1. Homepage...");
  await resetPage();
  await page.setViewport({ width: 1280, height: 900 });
  await delay(1000);
  await page.screenshot({ path: path.join(screenshotsDir, '1_homepage_desktop.png'), fullPage: false });

  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await delay(1000);
  await page.screenshot({ path: path.join(screenshotsDir, '1_homepage_mobile.png'), fullPage: false });

  // 2. CONSULTATION PAGE
  console.log("2. Consultation Page...");
  await resetPage();
  await page.evaluate(() => {
    const el = document.querySelector('#libertymd-hero-symptoms') || document.querySelector('textarea');
    if (el) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, 'I have a mild headache and fatigue since morning.');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await delay(300);
  await page.evaluate(() => {
    const btn = document.querySelector('.libertymd-start-chat-cta') || document.querySelector('button[type="submit"]');
    if (btn) btn.click();
  });
  await delay(4500);
  await page.setViewport({ width: 1280, height: 900 });
  await delay(500);
  await page.screenshot({ path: path.join(screenshotsDir, '2_consultation_desktop.png'), fullPage: false });

  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await delay(500);
  await page.screenshot({ path: path.join(screenshotsDir, '2_consultation_mobile.png'), fullPage: false });

  // 3. EMERGENCY ALERT
  console.log("3. Emergency Alert...");
  await resetPage();
  await page.evaluate(() => {
    const el = document.querySelector('#libertymd-hero-symptoms') || document.querySelector('textarea');
    if (el) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, 'I have crushing chest pressure spreading to my left arm with sweating and nausea.');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await delay(300);
  await page.evaluate(() => {
    const btn = document.querySelector('.libertymd-start-chat-cta') || document.querySelector('button[type="submit"]');
    if (btn) btn.click();
  });
  await delay(4500);
  await page.setViewport({ width: 1280, height: 900 });
  await delay(500);
  await page.screenshot({ path: path.join(screenshotsDir, '4_emergency_desktop.png'), fullPage: false });

  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await delay(500);
  await page.screenshot({ path: path.join(screenshotsDir, '4_emergency_mobile.png'), fullPage: false });

  // 4. SAMPLE REPORT
  console.log("4. Sample Report...");
  await resetPage();
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const sampleBtn = btns.find(b => b.textContent.toLowerCase().includes('sample report'));
    if (sampleBtn) sampleBtn.click();
  });
  await delay(1500);
  await page.setViewport({ width: 1280, height: 900 });
  await delay(500);
  await page.screenshot({ path: path.join(screenshotsDir, '5_sample_report_desktop.png'), fullPage: false });

  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await delay(500);
  await page.screenshot({ path: path.join(screenshotsDir, '5_sample_report_mobile.png'), fullPage: false });

  // 5. REPORT PAGE
  console.log("5. Report Page...");
  await page.setViewport({ width: 1280, height: 900 });
  await delay(500);
  await page.screenshot({ path: path.join(screenshotsDir, '3_report_desktop.png'), fullPage: false });

  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await delay(500);
  await page.screenshot({ path: path.join(screenshotsDir, '3_report_mobile.png'), fullPage: false });

  await browser.close();
  console.log("ALL 10 SCREENSHOTS CAPTURED SUCCESSFULLY!");
})();
