import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.LIBERTYMD_E2E_BASE_URL || 'https://saksham-experiments.com/liberty-md';
const round = process.env.LIBERTYMD_E2E_ROUND || '1';
const artifactsDir = path.resolve(
  process.env.LIBERTYMD_E2E_ARTIFACTS_DIR || `artifacts/libertymd/e2e-32-i18n/round-${round}`,
);
const screenshotsDir = path.join(artifactsDir, 'failures');
fs.mkdirSync(screenshotsDir, { recursive: true });

const suite = JSON.parse(fs.readFileSync(
  path.resolve('tests/libertymd/clinical-scenarios.v0.1.json'),
  'utf8',
));
const translations = JSON.parse(fs.readFileSync(
  path.resolve('tests/libertymd/clinical-scenarios.i18n.v0.1.json'),
  'utf8',
));

const allLocales = ['en', 'es', 'es-ES', 'pt', 'hi', 'hi-Latn', 'fr', 'de'];
const requestedLocales = String(process.env.LIBERTYMD_E2E_LANGUAGES || allLocales.join(','))
  .split(',')
  .map((locale) => locale.trim())
  .filter(Boolean);
const unknownLocales = requestedLocales.filter((locale) => !allLocales.includes(locale));
if (unknownLocales.length) throw new Error(`Unsupported locale(s): ${unknownLocales.join(', ')}`);

const scenarioFilter = String(process.env.LIBERTYMD_E2E_SCENARIO || '').trim();
const scenarios = scenarioFilter
  ? suite.scenarios.filter((scenario) => scenario.id === scenarioFilter)
  : suite.scenarios;
if (!scenarios.length) throw new Error(`No scenarios matched ${scenarioFilter || 'the fixture'}`);

const readLocale = (locale) => JSON.parse(fs.readFileSync(
  path.resolve(`i18n/locales/${locale}.json`),
  'utf8',
));
const deepMerge = (base, override, english) => {
  const out = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (key === '_meta') continue;
    out[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? deepMerge(out[key] || {}, value, english?.[key])
      : (value === english?.[key] && out[key] !== undefined ? out[key] : value);
  }
  return out;
};
const localeBundles = Object.fromEntries(allLocales.map((locale) => {
  if (locale === 'es-ES') return [locale, deepMerge(readLocale('es'), readLocale(locale), readLocale('en'))];
  return [locale, readLocale(locale)];
}));

const englishEmergencyHeading = 'For safety reasons we have been forced to end this consultation.';
const emergencyHeadings = {
  en: englishEmergencyHeading,
  es: translations.locales.es.emergencyHeading,
  'es-ES': translations.locales.es.emergencyHeading,
  pt: translations.locales.pt.emergencyHeading,
  hi: translations.locales.hi.emergencyHeading,
  'hi-Latn': translations.locales['hi-Latn'].emergencyHeading,
  fr: translations.locales.fr.emergencyHeading,
  de: translations.locales.de.emergencyHeading,
};

const numericTokens = (value) => (String(value).match(/\d+(?:\.\d+)?/g) || []).sort();
const sameTokens = (left, right) => JSON.stringify(numericTokens(left)) === JSON.stringify(numericTokens(right));
const localizedMessage = (locale, scenario) => {
  if (locale === 'en') return scenario.message;
  const clinicalLocale = locale === 'es-ES' ? 'es' : locale;
  const message = translations.locales[clinicalLocale]?.messages?.[scenario.id];
  if (!message) throw new Error(`${locale}/${scenario.id}: missing translated scenario message`);
  if (!sameTokens(scenario.message, message)) {
    throw new Error(`${locale}/${scenario.id}: numeric tokens changed (${numericTokens(scenario.message)} -> ${numericTokens(message)})`);
  }
  return message;
};

const chromePath = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const timeout = Number(process.env.LIBERTYMD_E2E_TIMEOUT_MS || 45_000);
const scenarioDeadlineMs = Number(
  process.env.LIBERTYMD_E2E_SCENARIO_DEADLINE_MS || Math.max(timeout * 2, 90_000),
);
const reportPath = path.join(artifactsDir, 'e2e_32_i18n_results.json');
const summaryPath = path.join(artifactsDir, 'e2e_32_i18n_summary.json');
const results = [];
const emergencyNumbersByScenario = new Map();
const persist = () => fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
const navigateWithRetry = async (page, url, attempts = 3) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      return attempt;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
    }
  }
  throw lastError;
};

console.log(
  `Loaded ${scenarios.length} scenarios × ${requestedLocales.length} locale(s) = `
  + `${scenarios.length * requestedLocales.length} frontend cases. Round ${round}; target ${baseUrl}`,
);

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: 'new',
  protocolTimeout: timeout,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
});
const context = await browser.createBrowserContext();

try {
  let caseIndex = 0;
  const totalCases = scenarios.length * requestedLocales.length;
  for (const locale of requestedLocales) {
    for (const scenario of scenarios) {
      caseIndex += 1;
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
      let navigationAttempts = 0;
      const watchdog = setTimeout(() => {
        hitScenarioDeadline = true;
        void page.close({ runBeforeUnload: false }).catch(() => {});
      }, scenarioDeadlineMs);

      console.log(`[${String(caseIndex).padStart(3, '0')}/${totalCases}] ${locale} · ${scenario.id}`);
      try {
        const url = new URL(baseUrl);
        if (locale !== 'en') url.searchParams.set('lang', locale);
        navigationAttempts = await navigateWithRetry(page, url.toString());
        await page.waitForFunction(
          ({ expectedLang, expectedTitle }) => {
            const input = document.querySelector('#libertymd-hero-symptoms');
            return document.documentElement.lang === expectedLang
              && Boolean(input)
              && document.body.innerText.includes(expectedTitle);
          },
          { timeout },
          { expectedLang: locale, expectedTitle: localeBundles[locale].hero.title },
        );

        const message = localizedMessage(locale, scenario);
        await page.type('#libertymd-hero-symptoms', message);
        await page.click('.libertymd-start-chat-cta');
        await page.waitForFunction(
          ({ expectedHeading, demographicsHeading }) => document.body.innerText.includes(expectedHeading)
            || document.body.innerText.includes(demographicsHeading)
            || Boolean(document.querySelector('[role="alert"]')),
          { timeout },
          {
            expectedHeading: emergencyHeadings[locale],
            demographicsHeading: localeBundles[locale].chat.demographicsHeading,
          },
        );

        const bodyText = await page.$eval('body', (element) => element.innerText || '');
        const expectedEmergency = scenario.expected.emergency_action === 'force_end';
        const localeHeading = emergencyHeadings[locale];
        const emergency = bodyText.includes(localeHeading);
        const demographicsVisible = bodyText.includes(localeBundles[locale].chat.demographicsHeading)
          && bodyText.includes(localeBundles[locale].chat.demographicsSubcopy);
        const requiredChromeValues = [
          localeBundles[locale].chatx.consultationTitle,
          localeBundles[locale].chatx.signIn,
          localeBundles[locale].chatx.footerDisclaimer,
          ...(expectedEmergency ? [
            localeBundles[locale].chatx.statusEmergency,
            localeBundles[locale].chatx.emergencyAcknowledge,
            localeBundles[locale].chatx.emergencyPersistence,
          ] : []),
        ];
        const missingRequiredChrome = requiredChromeValues.filter((value) => !bodyText.includes(value));
        const localizedRequiredChrome = missingRequiredChrome.length === 0;
        const emergencyNumbers = [...new Set(bodyText.match(/\b(?:112|911|988)\b/g) || [])].sort();
        if (expectedEmergency && locale === 'en') {
          emergencyNumbersByScenario.set(scenario.id, emergencyNumbers);
        }
        const baselineEmergencyNumbers = emergencyNumbersByScenario.get(scenario.id);
        const numberPreserved = !expectedEmergency
          || (baselineEmergencyNumbers
            ? JSON.stringify(emergencyNumbers) === JSON.stringify(baselineEmergencyNumbers)
            : emergencyNumbers.length > 0);
        const noEnglishEmergencyFallback = locale === 'en' || !bodyText.includes(englishEmergencyHeading);
        const noEnglishDemographicsFallback = locale === 'en'
          || !bodyText.includes(localeBundles.en.chat.demographicsHeading);
        const passed = expectedEmergency
          ? emergency && numberPreserved && noEnglishEmergencyFallback && localizedRequiredChrome
          : !emergency && demographicsVisible && noEnglishDemographicsFallback && localizedRequiredChrome;
        const observedState = emergency
          ? 'emergency_force_end'
          : demographicsVisible
            ? 'demographics_required'
            : 'unknown';

        let screenshotFilename = null;
        if (!passed || process.env.LIBERTYMD_E2E_SCREENSHOT_ALL === '1') {
          screenshotFilename = `${String(caseIndex).padStart(3, '0')}_${locale}_${scenario.id}.png`;
          await page.screenshot({ path: path.join(screenshotsDir, screenshotFilename), fullPage: false });
        }
        results.push({
          case_index: caseIndex,
          locale,
          clinical_locale: locale === 'es-ES' ? 'es' : locale,
          scenario_id: scenario.id,
          category: scenario.category,
          expected_action: scenario.expected.emergency_action,
          expected_crisis_type: scenario.expected.crisis_type || null,
          baseline_emergency_numbers: expectedEmergency ? (baselineEmergencyNumbers || emergencyNumbers) : [],
          observed_emergency_numbers: expectedEmergency ? emergencyNumbers : [],
          observed_state: observedState,
          localized_heading_present: expectedEmergency ? emergency : demographicsVisible,
          no_english_fallback: expectedEmergency ? noEnglishEmergencyFallback : noEnglishDemographicsFallback,
          localized_required_chrome: localizedRequiredChrome,
          missing_required_chrome: missingRequiredChrome,
          numeric_input_tokens_preserved: sameTokens(scenario.message, message),
          emergency_number_present: numberPreserved,
          passed,
          duration_ms: Date.now() - startedAt,
          navigation_attempts: navigationAttempts,
          page_errors: pageErrors,
          failed_requests: failedRequests.filter(({ url: failedUrl }) => !failedUrl.includes('mixpanel')),
          screenshot_filename: screenshotFilename,
        });
        console.log(`  ${passed ? 'PASS' : 'FAIL'} ${observedState} (${Date.now() - startedAt} ms)`);
      } catch (error) {
        const screenshotFilename = `${String(caseIndex).padStart(3, '0')}_${locale}_${scenario.id}_error.png`;
        await page.screenshot({ path: path.join(screenshotsDir, screenshotFilename), fullPage: false }).catch(() => {});
        results.push({
          case_index: caseIndex,
          locale,
          clinical_locale: locale === 'es-ES' ? 'es' : locale,
          scenario_id: scenario.id,
          category: scenario.category,
          expected_action: scenario.expected.emergency_action,
          expected_crisis_type: scenario.expected.crisis_type || null,
          observed_state: 'error',
          passed: false,
          duration_ms: Date.now() - startedAt,
          navigation_attempts: navigationAttempts,
          error: hitScenarioDeadline
            ? `Scenario hard timeout after ${scenarioDeadlineMs} ms`
            : error.message,
          page_errors: pageErrors,
          failed_requests: failedRequests.filter(({ url: failedUrl }) => !failedUrl.includes('mixpanel')),
          screenshot_filename: screenshotFilename,
        });
        console.error(`  FAIL ${results.at(-1).error}`);
      } finally {
        clearTimeout(watchdog);
        await page.close({ runBeforeUnload: false }).catch(() => {});
        persist();
      }
    }
  }
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

const byLocale = Object.fromEntries(requestedLocales.map((locale) => {
  const localeResults = results.filter((result) => result.locale === locale);
  return [locale, {
    passed: localeResults.filter((result) => result.passed).length,
    total: localeResults.length,
  }];
}));
const passed = results.filter((result) => result.passed).length;
const summary = {
  round,
  base_url: baseUrl,
  started_cases: results.length,
  expected_cases: scenarios.length * requestedLocales.length,
  passed,
  failed: results.length - passed,
  by_locale: byLocale,
  numeric_contract: 'Input digits and decimal values match the English fixture exactly.',
};
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
console.log(`Round ${round}: ${passed}/${results.length} passed. Summary: ${summaryPath}`);
if (passed !== results.length || results.length !== summary.expected_cases) process.exitCode = 1;
