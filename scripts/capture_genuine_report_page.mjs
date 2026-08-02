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

(async () => {
  console.log("=== CAPTURING GENUINE LIVE CLINICAL REPORT PAGE ===");
  const sessionPath = path.join(process.cwd(), 'scratch/report_session.json');
  if (!fs.existsSync(sessionPath)) {
    throw new Error("scratch/report_session.json not found! Run generate_genuine_report.mjs first.");
  }

  const { consultationId, session } = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  console.log("Loaded consultationId:", consultationId);

  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  // Desktop Capture
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1200 });

    // Set auth session in localStorage before loading
    await page.goto('http://localhost:5173/liberty-md', { waitUntil: 'domcontentloaded' });
    await page.evaluate((sess, cid) => {
      localStorage.setItem('sb-ralhkmpbslsdkwnqzqen-auth-token', JSON.stringify(sess));
      localStorage.setItem('libertymd_active_consultation_id', cid);
    }, session, consultationId);

    // Navigate to report page
    const reportUrl = `http://localhost:5173/liberty-md/report/${consultationId}`;
    console.log("Navigating desktop to:", reportUrl);
    await page.goto(reportUrl, { waitUntil: 'domcontentloaded' });
    await delay(6000); // Wait for report fetch & paint

    const reportDesktopPath = path.join(screenshotsDir, '3_report_desktop.png');
    const startupDesktopPath = path.join(startupScreenshotsDir, '3_report_desktop.png');

    await page.screenshot({ path: reportDesktopPath, fullPage: true });
    fs.copyFileSync(reportDesktopPath, startupDesktopPath);
    console.log("Saved Desktop Report Screenshot to:", reportDesktopPath);
    await page.close();
  }

  // Mobile Capture
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

    await page.goto('http://localhost:5173/liberty-md', { waitUntil: 'domcontentloaded' });
    await page.evaluate((sess, cid) => {
      localStorage.setItem('sb-ralhkmpbslsdkwnqzqen-auth-token', JSON.stringify(sess));
      localStorage.setItem('libertymd_active_consultation_id', cid);
    }, session, consultationId);

    const reportUrl = `http://localhost:5173/liberty-md/report/${consultationId}`;
    console.log("Navigating mobile to:", reportUrl);
    await page.goto(reportUrl, { waitUntil: 'domcontentloaded' });
    await delay(6000);

    const reportMobilePath = path.join(screenshotsDir, '3_report_mobile.png');
    const startupMobilePath = path.join(startupScreenshotsDir, '3_report_mobile.png');

    await page.screenshot({ path: reportMobilePath, fullPage: true });
    fs.copyFileSync(reportMobilePath, startupMobilePath);
    console.log("Saved Mobile Report Screenshot to:", reportMobilePath);
    await page.close();
  }

  await browser.close();
  console.log("GENUINE REPORT PAGE CAPTURED SUCCESSFULLY!");
})();
