import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const artifactsDir = '/Users/sakshamagrawal/.gemini/antigravity-ide/brain/244ecf32-e60d-4e69-86c5-821399670273';
const screenshotsDir = path.join(artifactsDir, 'screenshots');

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

const scenariosFile = path.join(process.cwd(), 'tests/libertymd/clinical-scenarios.v0.1.json');
const rawData = fs.readFileSync(scenariosFile, 'utf8');
const suite = JSON.parse(rawData);
const scenarios = suite.scenarios;

console.log(`Loaded ${scenarios.length} clinical scenarios.`);

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
  });

  const results = [];

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    const scenarioNum = String(i + 1).padStart(2, '0');
    console.log(`\n--------------------------------------------------`);
    console.log(`Running Scenario [${scenarioNum}/32]: ${scenario.id} (${scenario.category})`);
    console.log(`Title: ${scenario.title}`);
    console.log(`Message: "${scenario.message}"`);

    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    try {
      await page.goto('http://localhost:5173/liberty-md', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await delay(2000); // Wait for React app mount & Supabase auth bootstrap

      // Set React controlled textarea input using native value setter
      const textareaFound = await page.evaluate((msg) => {
        const textarea = document.querySelector('#libertymd-hero-symptoms') || document.querySelector('textarea');
        if (!textarea) return false;
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        valueSetter.call(textarea, msg);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }, scenario.message);

      if (textareaFound) {
        await delay(500);
        const submitClicked = await page.evaluate(() => {
          const btn = document.querySelector('.libertymd-start-chat-cta') || document.querySelector('button[type="submit"]');
          if (btn && !btn.disabled) {
            btn.click();
            return true;
          }
          return false;
        });

        if (!submitClicked) {
          await page.keyboard.press('Enter');
        }
      } else {
        console.warn(`[${scenario.id}] Could not find hero textarea.`);
      }

      // Wait for backend response (emergency detection / demographics / interview)
      await delay(5000);

      // Check if demographics modal/prompt is present
      const demographicsAge = await page.$('input[type="number"], #libertymd-patient-age');
      if (demographicsAge) {
        console.log(`Demographics prompt detected. Filling age: ${scenario.patient.age || 35}...`);
        await page.evaluate((ageVal) => {
          const ageInput = document.querySelector('input[type="number"], #libertymd-patient-age');
          if (ageInput) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(ageInput, String(ageVal));
            ageInput.dispatchEvent(new Event('input', { bubbles: true }));
            ageInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, scenario.patient.age || 35);

        await delay(300);

        await page.evaluate(() => {
          const form = document.querySelector('form[data-libertymd-unified-entry="true"]') || document.querySelector('form');
          if (form) form.requestSubmit();
        });

        await delay(3500);
      }

      // Read UI content to classify state
      const bodyText = await page.evaluate(() => document.body.innerText);

      const hasEmergencyBanner = bodyText.includes('forced to end') || bodyText.includes('emergency') || bodyText.includes('EMERGENCY') || bodyText.includes('911') || bodyText.includes('112') || bodyText.includes('988') || bodyText.includes('Crisis') || bodyText.includes('Seek Immediate');
      const hasInterviewTurn = bodyText.includes('Question') || bodyText.includes('Tell me more') || bodyText.includes('When did') || bodyText.includes('severity') || bodyText.includes('LibertyMD Care') || bodyText.includes('demographics') || bodyText.includes('for someone else');
      const hasReportReady = bodyText.includes('Clinical Report') || bodyText.includes('Doctor-Ready Report') || bodyText.includes('Assessment & Plan');

      let observedState = 'standard_intake';
      if (hasEmergencyBanner) {
        observedState = 'emergency_force_end';
      } else if (hasReportReady) {
        observedState = 'report_ready';
      } else if (hasInterviewTurn) {
        observedState = 'interview_turn';
      }

      const isPass = (scenario.expected.emergency_action === 'force_end' && hasEmergencyBanner) || (scenario.expected.emergency_action === 'continue' && !hasEmergencyBanner);

      const screenshotFilename = `scenario_${scenarioNum}_${scenario.id}.png`;
      const screenshotPath = path.join(screenshotsDir, screenshotFilename);
      await page.screenshot({ path: screenshotPath, fullPage: false });

      console.log(`-> Observed UI State: ${observedState}`);
      console.log(`-> Pass: ${isPass ? 'YES' : 'NO'}`);
      console.log(`-> Screenshot saved: ${screenshotFilename}`);

      results.push({
        index: i + 1,
        id: scenario.id,
        title: scenario.title,
        category: scenario.category,
        expected_action: scenario.expected.emergency_action,
        observed_state: observedState,
        passed: isPass,
        screenshot_filename: screenshotFilename,
        screenshot_path: screenshotPath
      });

    } catch (err) {
      console.error(`Error running scenario ${scenario.id}:`, err.message);
      results.push({
        index: i + 1,
        id: scenario.id,
        title: scenario.title,
        category: scenario.category,
        expected_action: scenario.expected.emergency_action,
        observed_state: 'error',
        error: err.message,
        passed: false
      });
    } finally {
      await page.close();
      await context.close();
    }
  }

  await browser.close();

  const reportPath = path.join(artifactsDir, 'e2e_32_scenarios_results.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n==================================================`);
  console.log(`E2E Execution completed. Report written to ${reportPath}`);
  const passCount = results.filter((r) => r.passed).length;
  console.log(`Passed: ${passCount} / ${results.length}`);
})();
