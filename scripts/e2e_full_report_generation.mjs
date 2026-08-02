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
  console.log("=== STARTING MULTI-TURN REPORT GENERATION E2E TEST ===");

  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,1000'],
  });

  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1280, height: 1000 });

  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));

  try {
    // 1. Land on LibertyMD
    await page.goto('http://localhost:5173/liberty-md', { waitUntil: 'domcontentloaded' });
    await delay(2500);

    // 2. Submit initial non-emergency symptom
    const initialSymptom = "I have had a mild tension headache and neck stiffness for 2 days after long hours working at my desk.";
    console.log(`Submitting initial symptom: "${initialSymptom}"`);

    await page.evaluate((msg) => {
      const textarea = document.querySelector('#libertymd-hero-symptoms') || document.querySelector('textarea');
      if (textarea) {
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        valueSetter.call(textarea, msg);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, initialSymptom);

    await delay(500);
    await page.evaluate(() => {
      const btn = document.querySelector('.libertymd-start-chat-cta') || document.querySelector('button[type="submit"]');
      if (btn) btn.click();
    });

    await delay(5000);

    // 3. Handle demographics prompt if shown
    const demographicsAge = await page.$('input[type="number"], #libertymd-patient-age');
    if (demographicsAge) {
      console.log('Filling demographics form (Age: 32, Sex: female)...');
      await page.evaluate(() => {
        const ageInput = document.querySelector('input[type="number"], #libertymd-patient-age');
        if (ageInput) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(ageInput, '32');
          ageInput.dispatchEvent(new Event('input', { bubbles: true }));
          ageInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await delay(500);
      await page.evaluate(() => {
        const form = document.querySelector('form[data-libertymd-unified-entry="true"]') || document.querySelector('form');
        if (form) form.requestSubmit();
      });
      await delay(4000);
    }

    // 4. Drive interview turns (up to turn 6)
    const answers = [
      "The headache is constant, dull pressure on both sides of my forehead.",
      "No nausea, no visual changes, no sensitivity to light.",
      "Rest and drinking water helps slightly, but stress makes it worse.",
      "I take no regular medications and have no other chronic conditions.",
      "It started gradually on Monday afternoon."
    ];

    for (let turn = 0; turn < answers.length; turn++) {
      const currentUrl = await page.url();
      const bodyText = await page.evaluate(() => document.body.innerText);

      if (currentUrl.includes('/report') || bodyText.includes('Clinical Report') || bodyText.includes('Assessment & Plan')) {
        console.log('Report generation completed early!');
        break;
      }

      console.log(`Sending interview answer ${turn + 1}: "${answers[turn]}"`);

      // Find chat input box
      const chatInput = await page.$('input[type="text"], textarea');
      if (chatInput) {
        await page.evaluate((ans) => {
          const input = document.querySelector('input[type="text"], textarea');
          if (input) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, ans);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, answers[turn]);

        await delay(500);

        // Click send button or press enter
        const sendBtn = await page.$('button[type="submit"], button svg.lucide-send');
        if (sendBtn) {
          await sendBtn.click();
        } else {
          await page.keyboard.press('Enter');
        }

        await delay(6000); // Wait for turn processing / n8n workflow
      } else {
        console.log("Chat input not found, checking if report or gate reached...");
        break;
      }
    }

    // 5. Wait for report generation page
    console.log("Waiting for clinical report page to paint...");
    await delay(8000);

    const finalUrl = await page.url();
    const finalBodyText = await page.evaluate(() => document.body.innerText);

    console.log(`Final URL: ${finalUrl}`);
    console.log(`Report Page Detected: ${finalUrl.includes('/report') || finalBodyText.includes('Clinical Report') || finalBodyText.includes('Assessment & Plan')}`);

    // Take screenshot of the completed report page / consultation state
    const reportScreenshotPath = path.join(screenshotsDir, 'non_emergency_clinical_report_proof.png');
    await page.screenshot({ path: reportScreenshotPath, fullPage: true });
    console.log(`Saved screenshot to: ${reportScreenshotPath}`);

  } catch (err) {
    console.error('Error in multi-turn report test:', err);
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }
})();
