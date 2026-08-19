import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const baseUrl = process.env.LIBERTYMD_E2E_BASE_URL || 'http://127.0.0.1:5173/liberty-md';
const round = process.env.LIBERTYMD_E2E_ROUND || '1';
const artifactsDir = path.resolve(
  process.env.LIBERTYMD_E2E_ARTIFACTS_DIR || `artifacts/libertymd/e2e-32/round-${round}`,
);
const screenshotsDir = path.join(artifactsDir, 'screenshots');
fs.mkdirSync(screenshotsDir, { recursive: true });

const suite = JSON.parse(fs.readFileSync(
  path.resolve('tests/libertymd/clinical-scenarios.v0.1.json'),
  'utf8',
));
const scenarioFilter = String(process.env.LIBERTYMD_E2E_SCENARIO || '').trim();
const scenarios = scenarioFilter
  ? suite.scenarios.filter((scenario) => scenario.id === scenarioFilter)
  : suite.scenarios;
const chromePath = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const timeout = Number(process.env.LIBERTYMD_E2E_TIMEOUT_MS || 45_000);
const scenarioDeadlineMs = Number(
  process.env.LIBERTYMD_E2E_SCENARIO_DEADLINE_MS || Math.max(timeout * 2, 90_000),
);

const waitForEither = async (page, selectors) => {
  await page.waitForFunction(
    (candidateSelectors) => candidateSelectors.some((selector) => document.querySelector(selector)),
    { timeout },
    selectors,
  );
};
const visibleText = async (page, selector) => page.$eval(selector, (element) => element.innerText || '');

console.log(`Loaded ${scenarios.length} clinical scenarios. Round ${round}; target ${baseUrl}`);

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: 'new',
  protocolTimeout: timeout,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
});
// Keep one anonymous identity for the suite. Creating 32 isolated browser
// contexts also creates 32 Supabase anonymous sign-ins from one IP, which hits
// auth throttling and measures test setup rather than LibertyMD behavior.
const context = await browser.createBrowserContext();

const reportPath = path.join(artifactsDir, 'e2e_32_scenarios_results.json');
const results = [];
for (let index = 0; index < scenarios.length; index += 1) {
  const scenario = scenarios[index];
  const scenarioNum = String(index + 1).padStart(2, '0');
  const page = await context.newPage();
  page.setDefaultTimeout(timeout);
  page.setDefaultNavigationTimeout(timeout);
  await page.setViewport({ width: 1280, height: 900 });
  const pageErrors = [];
  const failedRequests = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => failedRequests.push({
    url: request.url(),
    error: request.failure()?.errorText || 'request failed',
  }));
  const startedAt = Date.now();
  let hitScenarioDeadline = false;
  const scenarioWatchdog = setTimeout(() => {
    hitScenarioDeadline = true;
    void page.close({ runBeforeUnload: false }).catch(() => {});
  }, scenarioDeadlineMs);

  console.log(`[${scenarioNum}/${scenarios.length}] ${scenario.id} (${scenario.category})`);
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForSelector('#libertymd-hero-symptoms', { visible: true, timeout });
    await page.type('#libertymd-hero-symptoms', scenario.message);
    await page.click('.libertymd-start-chat-cta');

    await waitForEither(page, [
      '[data-libertymd-unified-entry="true"]',
      '[role="progressbar"]',
      '[role="alert"]',
    ]);

    const forcedHeading = 'For safety reasons we have been forced to end this consultation.';
    let bodyText = await visibleText(page, 'body');
    const shouldCompleteDemographics = process.env.LIBERTYMD_E2E_COMPLETE_DEMOGRAPHICS === '1';
    if (!bodyText.includes(forcedHeading) && shouldCompleteDemographics) {
      const demographicsForm = await page.$('[data-libertymd-unified-entry="true"]');
      if (demographicsForm) {
        const sex = String(scenario.patient?.sex || 'female').toLowerCase();
        let demographicsSubmitted = false;
        for (let attempt = 0; attempt < 5 && !demographicsSubmitted; attempt += 1) {
          await page.evaluate(({ age, expectedSex }) => {
            const ageInput = document.querySelector('#libertymd-age');
            const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(ageInput, age);
            ageInput?.dispatchEvent(new Event('input', { bubbles: true }));
            ageInput?.dispatchEvent(new Event('change', { bubbles: true }));
            const sexButton = Array.from(document.querySelectorAll('fieldset button')).find((button) => (
              button.textContent?.trim().toLowerCase() === expectedSex
            ));
            sexButton?.click();
            const consent = document.querySelector('[data-libertymd-unified-entry="true"] input[type="checkbox"]');
            if (consent && !consent.checked) consent.click();
          }, { age: String(scenario.patient?.age || 35), expectedSex: sex });
          await new Promise((resolve) => setTimeout(resolve, 300));
          const submitEnabled = await page.$eval(
            '[data-libertymd-unified-entry="true"] button[type="submit"]',
            (button) => !button.disabled,
          ).catch(() => false);
          if (submitEnabled) {
            await page.click('[data-libertymd-unified-entry="true"] button[type="submit"]');
            const formBecameHidden = await page.waitForSelector(
              '[data-libertymd-unified-entry="true"]',
              { hidden: true, timeout: 8_000 },
            ).then(() => true).catch(() => false);
            if (formBecameHidden) {
              // A late anonymous-session rehydrate can briefly hide and then
              // recreate the form. Only accept the submission after that race
              // window has passed.
              await new Promise((resolve) => setTimeout(resolve, 2_000));
              demographicsSubmitted = await page.$('[data-libertymd-unified-entry="true"]') === null;
            }
          }
          if (!demographicsSubmitted) await new Promise((resolve) => setTimeout(resolve, 1_000));
        }
        if (!demographicsSubmitted) throw new Error('Demographics form did not submit after rehydration retries');
      }
      await page.waitForFunction(
        (heading) => document.body.innerText.includes(heading)
          || (
            !document.querySelector('[data-libertymd-unified-entry="true"]')
            && Boolean(document.querySelector('[role="progressbar"]'))
          )
          || Boolean(document.querySelector('[role="alert"]')),
        { timeout },
        forcedHeading,
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
      bodyText = await visibleText(page, 'body');
    }

    const emergency = bodyText.includes(forcedHeading);
    const demographicsVisible = await page.$('[data-libertymd-unified-entry="true"]') !== null;
    const interviewVisible = await page.$('[role="progressbar"]') !== null;
    const expectedEmergency = scenario.expected.emergency_action === 'force_end';
    const passed = expectedEmergency ? emergency : !emergency && (demographicsVisible || interviewVisible);
    const observedState = emergency
      ? 'emergency_force_end'
      : interviewVisible
        ? 'interview_turn'
        : demographicsVisible
          ? 'demographics_required'
          : 'unknown';
    const screenshotFilename = `scenario_${scenarioNum}_${scenario.id}.png`;
    await page.screenshot({ path: path.join(screenshotsDir, screenshotFilename), fullPage: false });

    results.push({
      index: index + 1,
      id: scenario.id,
      title: scenario.title,
      category: scenario.category,
      expected_action: scenario.expected.emergency_action,
      expected_crisis_type: scenario.expected.crisis_type || null,
      observed_state: observedState,
      passed,
      duration_ms: Date.now() - startedAt,
      page_errors: pageErrors,
      failed_requests: failedRequests.filter(({ url }) => !url.includes('mixpanel')),
      screenshot_filename: screenshotFilename,
    });
    console.log(`  ${passed ? 'PASS' : 'FAIL'} ${observedState} (${Date.now() - startedAt} ms)`);
  } catch (error) {
    const screenshotFilename = `scenario_${scenarioNum}_${scenario.id}_error.png`;
    await page.screenshot({ path: path.join(screenshotsDir, screenshotFilename), fullPage: false }).catch(() => {});
    results.push({
      index: index + 1,
      id: scenario.id,
      title: scenario.title,
      category: scenario.category,
      expected_action: scenario.expected.emergency_action,
      observed_state: 'error',
      passed: false,
      duration_ms: Date.now() - startedAt,
      error: hitScenarioDeadline
        ? `Scenario hard timeout after ${scenarioDeadlineMs} ms`
        : error.message,
      page_errors: pageErrors,
      failed_requests: failedRequests.filter(({ url }) => !url.includes('mixpanel')),
      screenshot_filename: screenshotFilename,
    });
    console.error(`  FAIL ${hitScenarioDeadline ? `hard timeout after ${scenarioDeadlineMs} ms` : error.message}`);
  } finally {
    clearTimeout(scenarioWatchdog);
    await page.close({ runBeforeUnload: false }).catch(() => {});
    // Persist after every scenario so an interrupted production run still has
    // a complete diagnostic record up to the interruption point.
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  }
}

await context.close();
await browser.close();
fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
const passed = results.filter((result) => result.passed).length;
console.log(`Round ${round}: ${passed}/${results.length} passed. Report: ${reportPath}`);
if (passed !== results.length) process.exitCode = 1;
