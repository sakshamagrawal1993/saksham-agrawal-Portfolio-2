import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const artifactsDir = '/Users/sakshamagrawal/.gemini/antigravity-ide/brain/244ecf32-e60d-4e69-86c5-821399670273';
const screenshotsDir = path.join(artifactsDir, 'screenshots');

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: false, // visible for testing
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  await page.goto('http://localhost:5173/liberty-md', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  const msg = "I have crushing chest pressure spreading to my left arm with sweating and nausea.";

  // Type in textarea
  await page.evaluate((text) => {
    const textarea = document.querySelector('#libertymd-hero-symptoms') || document.querySelector('textarea');
    if (textarea) {
      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      valueSetter.call(textarea, text);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, msg);

  await new Promise(r => setTimeout(r, 1000));

  // Click start chat button
  await page.evaluate(() => {
    const btn = document.querySelector('.libertymd-start-chat-cta') || document.querySelector('button[type="submit"]');
    if (btn) btn.click();
  });

  console.log("Clicked start chat button. Waiting 6 seconds...");
  await new Promise(r => setTimeout(r, 6000));

  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log("BODY TEXT INCLUDES EMERGENCY:", bodyText.includes('911') || bodyText.includes('988') || bodyText.includes('Seek Immediate Medical Attention') || bodyText.includes('Emergency Medical Services') || bodyText.includes('emergency care') || bodyText.includes('CRISIS'));

  await page.screenshot({ path: path.join(screenshotsDir, 'test_single_01.png') });
  console.log("Saved test_single_01.png");

  await browser.close();
})();
