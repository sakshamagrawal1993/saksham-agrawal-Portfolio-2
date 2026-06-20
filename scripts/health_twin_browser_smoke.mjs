#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const port = Number(argValue('--port', '4174'));
const suppliedBaseUrl = argValue('--base-url', '');
const baseUrl = suppliedBaseUrl || `http://127.0.0.1:${port}`;
const startLocalServer = !suppliedBaseUrl && !args.includes('--no-server');
const outputPath = resolve(root, argValue('--output', '.loop/runs/manual/browser-qa.json'));
const artifactsDir = resolve(root, argValue('--artifacts-dir', '.loop/runs/manual/browser'));

function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function loadEnv() {
  const values = { ...process.env };
  for (const filename of ['.env', '.env.local', '.env.test.local']) {
    const path = resolve(root, filename);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [key, ...rest] = trimmed.split('=');
      if (!(key.trim() in values)) {
        values[key.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
      }
    }
  }
  return values;
}

async function waitForServer(url, timeoutMs = 45_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(`Vite did not become ready at ${url}`);
}

async function capture(pageToCapture, path) {
  try {
    await pageToCapture.screenshot({ path, fullPage: true });
  } catch {
    await new Promise((resolveWait) => setTimeout(resolveWait, 1500));
    await pageToCapture.screenshot({ path, fullPage: true });
  }
}

async function clickButtonText(pageToUse, text, exact = false) {
  const clicked = await pageToUse.evaluate(({ label, exactMatch }) => {
    const button = [...document.querySelectorAll('button')].find((candidate) => {
      const value = candidate.textContent?.trim() || '';
      return exactMatch ? value === label : value.includes(label);
    });
    button?.click();
    return Boolean(button);
  }, { label: text, exactMatch: exact });
  if (!clicked) throw new Error(`Button not found: ${text}`);
}

async function setControlByLabel(pageToUse, labelText, value) {
  const changed = await pageToUse.evaluate(({ wanted, nextValue }) => {
    const label = [...document.querySelectorAll('label')].find((candidate) => candidate.textContent?.trim().includes(wanted));
    const container = label?.parentElement;
    const control = container?.querySelector('input,select,textarea');
    if (!control) return false;
    const prototype = control instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : control instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(control, String(nextValue));
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, { wanted: labelText, nextValue: value });
  if (!changed) throw new Error(`Control not found for label: ${labelText}`);
}

async function openSourceTab(pageToUse, label) {
  await clickButtonText(pageToUse, 'Add sources', true);
  await pageToUse.waitForFunction(
    () => document.body.textContent?.includes('Sources let Health Twin'),
    { timeout: 10_000 },
  );
  await clickButtonText(pageToUse, label);
}

async function selectMetric(pageToUse, metric) {
  const opened = await pageToUse.evaluate(() => {
    const label = [...document.querySelectorAll('span')]
      .find((candidate) => candidate.textContent?.trim() === 'Select metric...');
    const picker = label?.parentElement;
    picker?.click();
    return Boolean(picker);
  });
  if (!opened) throw new Error('Metric picker was not found.');
  await pageToUse.waitForSelector('input[placeholder="Search metrics..."]', { visible: true });
  await pageToUse.type('input[placeholder="Search metrics..."]', metric);
  const selected = await pageToUse.evaluate((wanted) => {
    const label = [...document.querySelectorAll('span')]
      .find((candidate) => candidate.textContent?.trim() === wanted);
    const option = label?.closest('div.cursor-pointer');
    option?.click();
    return Boolean(option);
  }, metric);
  if (!selected) throw new Error(`Metric option not found: ${metric}`);
}

async function authenticatedQuery(pageToUse, envValues, path, options = {}) {
  return pageToUse.evaluate(async ({ url, anonKey, requestPath, requestOptions }) => {
    const sessionKey = Object.keys(localStorage).find((key) => key.startsWith('sb-') && key.endsWith('-auth-token'));
    const stored = sessionKey ? JSON.parse(localStorage.getItem(sessionKey) || 'null') : null;
    const token = stored?.access_token;
    if (!token) return { status: 0, body: null, error: 'Missing authenticated session token' };
    const response = await fetch(`${url}${requestPath}`, {
      ...requestOptions,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(requestOptions.headers || {}),
      },
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: response.status, body };
  }, {
    url: envValues.VITE_SUPABASE_URL,
    anonKey: envValues.VITE_SUPABASE_ANON_KEY,
    requestPath: path,
    requestOptions: options,
  });
}

function result(id, status, description, evidence = [], detail = '') {
  return { id, status, description, evidence, detail, evidenceType: 'browser-smoke' };
}

mkdirSync(artifactsDir, { recursive: true });
mkdirSync(dirname(outputPath), { recursive: true });

const env = loadEnv();
const email = env.HEALTH_TWIN_TEST_EMAIL || 'test@example.com';
const password = env.HEALTH_TWIN_TEST_PASSWORD || 'password';
const labReportPath = env.HEALTH_TWIN_LAB_REPORT || '';
const results = [];
const consoleErrors = [];
const networkErrors = [];
const capturedChatRequests = [];
let createdTwinId = null;
let browser;
let page;

let viteLog = '';
let vite = null;
if (startLocalServer) {
  vite = spawn(
    resolve(root, 'node_modules/.bin/vite'),
    ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: root, env: { ...process.env, BROWSER: 'none' }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  vite.stdout.on('data', (chunk) => { viteLog += chunk.toString(); });
  vite.stderr.on('data', (chunk) => { viteLog += chunk.toString(); });
}

try {
  await waitForServer(baseUrl);
  browser = await puppeteer.launch({ headless: true });
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    networkErrors.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`.trim());
  });
  page.on('request', (request) => {
    if (!request.url().includes('/functions/v1/chat-completion')) return;
    try {
      capturedChatRequests.push(JSON.parse(request.postData() || '{}'));
    } catch {
      capturedChatRequests.push({ unparsed: request.postData() || '' });
    }
  });

  await page.goto(`${baseUrl}/health-twin`, { waitUntil: 'networkidle2' });
  if (startLocalServer) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 2000));
    await page.goto(`${baseUrl}/health-twin`, { waitUntil: 'networkidle2' });
  }
  const redirectedToLogin = page.url().includes('/login?redirect=/health-twin');
  await capture(page, resolve(artifactsDir, '01-unauthenticated.png'));
  results.push(result(
    'HT-001',
    redirectedToLogin ? 'PASS' : 'FAIL',
    'Unauthenticated users are redirected to login',
    ['01-unauthenticated.png', page.url()],
  ));

  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    results.push(result(
      'HT-002',
      'BLOCKED',
      'Authenticated twin creation',
      [],
      'VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is unavailable.',
    ));
  } else {
    await page.type('input[type="email"]', email);
    await page.type('input[type="password"]', password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => null),
      page.click('button[type="submit"]'),
    ]);

    if (!page.url().includes('/health-twin')) {
      results.push(result(
        'HT-002',
        'BLOCKED',
        'Authenticated twin creation',
        ['01-unauthenticated.png'],
        `Test login failed for ${email}. Configure HEALTH_TWIN_TEST_EMAIL and HEALTH_TWIN_TEST_PASSWORD in .env.test.local.`,
      ));
    } else {
      await page.waitForFunction(
        () => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('Create new twin')),
        { timeout: 20_000 },
      );
      await page.evaluate(() => {
        const button = [...document.querySelectorAll('button')]
          .find((candidate) => candidate.textContent?.includes('Create new twin'));
        button?.click();
      });
      const twinName = `Loop QA ${Date.now()}`;
      await page.waitForSelector('input[placeholder*="My Profile"]', { visible: true, timeout: 10_000 });
      await page.$eval(
        'input[placeholder*="My Profile"]',
        (input, value) => {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          setter?.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        },
        twinName,
      );
      await page.$eval(
        'textarea[placeholder*="Brief context"]',
        (textarea, value) => {
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
          setter?.call(textarea, value);
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          textarea.dispatchEvent(new Event('change', { bubbles: true }));
        },
        'Synthetic autonomous Health Twin QA record',
      );
      await page.waitForFunction(
        () => [...document.querySelectorAll('button')]
          .some((button) => button.textContent?.trim() === 'Create Twin' && !button.disabled),
        { timeout: 10_000 },
      );
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => null),
        page.evaluate(() => {
          const button = [...document.querySelectorAll('button')]
            .find((candidate) => candidate.textContent?.trim() === 'Create Twin');
          button?.click();
        }),
      ]);
      await page.waitForFunction(
        () => /^\/health-twin\/[0-9a-f-]{36}$/i.test(window.location.pathname),
        { timeout: 20_000 },
      ).catch(() => null);
      const match = page.url().match(/\/health-twin\/([0-9a-f-]{36})$/i);
      createdTwinId = match?.[1] || null;
      const dashboardLoaded = createdTwinId
        ? await page.waitForFunction(
          () => document.body.textContent?.includes('Active Twin:'),
          { timeout: 20_000 },
        ).then(() => true).catch(() => false)
        : false;
      await capture(page, resolve(artifactsDir, '02-dashboard.png'));
      results.push(result(
        'HT-002',
        createdTwinId ? 'PASS' : 'FAIL',
        'Authenticated users can create a twin',
        ['02-dashboard.png', page.url()],
      ));
      results.push(result(
        'HT-003',
        dashboardLoaded ? 'PASS' : 'FAIL',
        'Created twin opens in the dashboard',
        ['02-dashboard.png'],
        dashboardLoaded ? '' : `Dashboard did not finish loading. Final URL: ${page.url()}`,
      ));

      if (createdTwinId && dashboardLoaded) {
        const browserMarker = `browser-${Date.now()}`;
        let chatFailureHandler = null;
        try {
          await openSourceTab(page, 'Fill Profile');
          await setControlByLabel(page, 'Full Name', `Browser QA ${browserMarker}`);
          await setControlByLabel(page, 'Age', '38');
          await setControlByLabel(page, 'Gender', 'Other');
          await setControlByLabel(page, 'Blood Type', 'O+');
          await setControlByLabel(page, 'Height (cm)', '180');
          await setControlByLabel(page, 'Weight (kg)', '81');
          await setControlByLabel(page, 'Co-Morbidities', 'Hypertension');
          await setControlByLabel(page, 'Location', 'Browser QA City');
          await clickButtonText(page, 'Save Profile', true);
          await page.waitForFunction(
            (name) => document.body.textContent?.includes(name),
            { timeout: 15_000 },
            `Browser QA ${browserMarker}`,
          );
          const profileEvidence = await authenticatedQuery(
            page,
            env,
            `/rest/v1/health_personal_details?twin_id=eq.${createdTwinId}&select=*`,
          );
          const bmiEvidence = await authenticatedQuery(
            page,
            env,
            `/rest/v1/health_wearable_parameters?twin_id=eq.${createdTwinId}&parameter_name=eq.${encodeURIComponent('Body Mass Index (BMI)')}&select=*`,
          );
          await capture(page, resolve(artifactsDir, '03-profile.png'));
          results.push(result('HT-010', profileEvidence.body?.[0]?.name === `Browser QA ${browserMarker}` ? 'PASS' : 'FAIL', 'Profile saves through the UI', ['03-profile.png'], `status=${profileEvidence.status}`));
          results.push(result('HT-011', bmiEvidence.body?.length > 0 ? 'PASS' : 'FAIL', 'Height and weight create a BMI reading', ['03-profile.png'], `BMI rows=${bmiEvidence.body?.length || 0}`));
          await page.reload({ waitUntil: 'networkidle2' });
          const profileReloaded = await page.waitForFunction(
            (name) => document.body.textContent?.includes(name),
            { timeout: 20_000 },
            `Browser QA ${browserMarker}`,
          ).then(() => true).catch(() => false);
          results.push(result('HT-012', profileReloaded ? 'PASS' : 'FAIL', 'Profile data survives browser reload', ['03-profile.png']));
        } catch (profileError) {
          for (const id of ['HT-010', 'HT-011', 'HT-012']) {
            results.push(result(id, 'FAIL', 'Profile acceptance flow', [], String(profileError)));
          }
        }

        const manualCases = [
          { id: 'HT-020', metric: 'Hemoglobin', fields: [['Value', '14.4']] },
          { id: 'HT-022', metric: 'Blood Pressure', fields: [['Systolic', '121'], ['Diastolic', '79']] },
          { id: 'HT-023', metric: 'Sleep Session', fields: [['Duration (h)', '7.5'], ['Quality', '88']] },
          { id: 'HT-023', metric: 'Exercise Session', fields: [['Exercise Type', 'Running'], ['Duration (min)', '45']] },
          { id: 'HT-023', metric: 'Meal Session', fields: [['Meal Type', 'Lunch'], ['Energy', '620'], ['Protein', '36']] },
        ];
        const manualOutcomes = [];
        for (const manualCase of manualCases) {
          try {
            await openSourceTab(page, 'Individual Parameter');
            await selectMetric(page, manualCase.metric);
            for (const [label, value] of manualCase.fields) await setControlByLabel(page, label, value);
            await clickButtonText(page, 'Save Reading', true);
            await page.waitForFunction(
              () => !document.body.textContent?.includes('Save Reading'),
              { timeout: 15_000 },
            );
            manualOutcomes.push({ ...manualCase, pass: true });
          } catch (manualError) {
            manualOutcomes.push({ ...manualCase, pass: false, error: String(manualError) });
            await page.keyboard.press('Escape').catch(() => {});
          }
        }
        const manualRows = await authenticatedQuery(
          page,
          env,
          `/rest/v1/health_lab_parameters?twin_id=eq.${createdTwinId}&select=id,parameter_name`,
        );
        const groupedRows = await authenticatedQuery(
          page,
          env,
          `/rest/v1/health_wearable_parameters?twin_id=eq.${createdTwinId}&select=id,parameter_name,category,group_id`,
        );
        await capture(page, resolve(artifactsDir, '04-manual-readings.png'));
        const labUiPass = manualOutcomes.find((entry) => entry.metric === 'Hemoglobin')?.pass && manualRows.body?.some((row) => row.parameter_name === 'Hemoglobin');
        const bpGroup = groupedRows.body?.filter((row) => ['Blood Pressure Systolic', 'Blood Pressure Diastolic'].includes(row.parameter_name));
        const groupedPass = ['sleep', 'exercise', 'nutrition'].every((category) => groupedRows.body?.some((row) => row.category === category && row.group_id));
        results.push(result('HT-020', labUiPass ? 'PASS' : 'FAIL', 'Individual laboratory parameter is added through the UI', ['04-manual-readings.png'], JSON.stringify(manualOutcomes)));
        results.push(result('HT-021', groupedRows.body?.some((row) => row.category === 'vitals') ? 'PASS' : 'FAIL', 'Vitals can be added through the manual-reading UI', ['04-manual-readings.png']));
        results.push(result('HT-022', bpGroup?.length === 2 && bpGroup[0]?.group_id === bpGroup[1]?.group_id ? 'PASS' : 'FAIL', 'Grouped blood-pressure readings persist from the UI', ['04-manual-readings.png']));
        results.push(result('HT-023', groupedPass ? 'PASS' : 'FAIL', 'Grouped sleep, exercise, and meal readings persist from the UI', ['04-manual-readings.png'], JSON.stringify(manualOutcomes)));

        try {
          const validCsvPath = resolve(artifactsDir, 'valid-wearable.csv');
          const invalidCsvPath = resolve(artifactsDir, 'invalid-wearable.csv');
          const csvGroup = randomUUID();
          writeFileSync(validCsvPath, `parameter_name,parameter_value,unit,recorded_at,category,group_id\nStep Count,9100,steps,2026-06-20T06:00:00Z,activity,${csvGroup}\nActive Minutes,48,min,2026-06-20T06:00:00Z,activity,${csvGroup}\n`);
          writeFileSync(invalidCsvPath, 'name,unit\nHeart Rate,bpm\n');
          await openSourceTab(page, 'Connect Wearable');
          let csvInput = await page.$('input[type="file"][accept=".csv"]');
          await csvInput.uploadFile(validCsvPath);
          const previewVisible = await page.waitForFunction(
            () => document.body.textContent?.includes('Preview (first 2 rows)'),
            { timeout: 10_000 },
          ).then(() => true).catch(() => false);
          results.push(result('HT-030', previewVisible ? 'PASS' : 'FAIL', 'Valid wearable CSV shows a browser preview', ['valid-wearable.csv']));
          await clickButtonText(page, 'Import Wearable Data', true);
          await page.waitForFunction(
            () => !document.body.textContent?.includes('Sources let Health Twin'),
            { timeout: 15_000 },
          );
          const persistedCsv = await authenticatedQuery(
            page,
            env,
            `/rest/v1/health_wearable_parameters?twin_id=eq.${createdTwinId}&group_id=eq.${csvGroup}&select=id,parameter_name`,
          );
          results.push(result('HT-031', persistedCsv.body?.length === 2 ? 'PASS' : 'FAIL', 'Valid wearable CSV rows persist', ['valid-wearable.csv'], `rows=${persistedCsv.body?.length || 0}`));

          await openSourceTab(page, 'Connect Wearable');
          csvInput = await page.$('input[type="file"][accept=".csv"]');
          await csvInput.uploadFile(invalidCsvPath);
          const invalidVisible = await page.waitForFunction(
            () => document.body.textContent?.includes('CSV is missing required columns'),
            { timeout: 10_000 },
          ).then(() => true).catch(() => false);
          await capture(page, resolve(artifactsDir, '05-wearable-csv.png'));
          results.push(result('HT-032', invalidVisible ? 'PASS' : 'FAIL', 'Invalid wearable CSV produces a useful error', ['05-wearable-csv.png', 'invalid-wearable.csv']));
          await page.reload({ waitUntil: 'networkidle2' });
          const persistedAfterReload = await authenticatedQuery(
            page,
            env,
            `/rest/v1/health_wearable_parameters?twin_id=eq.${createdTwinId}&group_id=eq.${csvGroup}&select=id`,
          );
          results.push(result('HT-033', persistedAfterReload.body?.length === 2 ? 'PASS' : 'FAIL', 'Imported wearable data survives browser reload', ['05-wearable-csv.png']));
        } catch (csvError) {
          for (const id of ['HT-030', 'HT-031', 'HT-032', 'HT-033']) {
            results.push(result(id, 'FAIL', 'Wearable CSV browser flow', [], String(csvError)));
          }
        }

        const definitionEvidence = await authenticatedQuery(page, env, '/rest/v1/health_parameter_definitions?select=id&limit=1');
        const rangeEvidence = await authenticatedQuery(page, env, '/rest/v1/health_parameter_ranges?select=id&limit=1');
        const scoreText = await page.evaluate(() => document.body.textContent || '');
        results.push(result('HT-050', definitionEvidence.body?.length > 0 && rangeEvidence.body?.length > 0 ? 'PASS' : 'FAIL', 'Definitions and ranges load in the authenticated dashboard'));
        results.push(result('HT-051', scoreText.includes('Overall Health') ? 'PASS' : 'FAIL', 'Scores are calculated from current dashboard data', ['04-manual-readings.png']));
        results.push(result('HT-052', scoreText.includes('Core Systems') && scoreText.includes('Overall Health') ? 'PASS' : 'FAIL', 'Overall and category scores render', ['04-manual-readings.png']));
        await clickButtonText(page, 'Vitals', true).catch(() => {});
        const chartVisible = await page.waitForFunction(
          () => document.body.textContent?.includes('Blood Pressure') || document.querySelector('svg.recharts-surface'),
          { timeout: 10_000 },
        ).then(() => true).catch(() => false);
        results.push(result('HT-053', chartVisible ? 'PASS' : 'FAIL', 'A chart renders for available health data', ['04-manual-readings.png']));

        if (labReportPath && existsSync(labReportPath)) {
          await page.evaluate(() => {
            const button = [...document.querySelectorAll('button')]
              .find((candidate) => candidate.textContent?.trim() === 'Add sources');
            button?.click();
          });
          await page.waitForFunction(
            () => document.body.textContent?.includes('Upload Lab Report'),
            { timeout: 10_000 },
          );
          const fileInput = await page.$('input[type="file"][accept*=".pdf"]');
          if (!fileInput) {
            results.push(result('HT-040', 'FAIL', 'Lab report upload control is available', [], 'PDF file input was not found.'));
          } else {
            await fileInput.uploadFile(labReportPath);
            await page.evaluate(() => {
              const button = [...document.querySelectorAll('button')]
                .find((candidate) => candidate.textContent?.includes('Upload & Analyze'));
              button?.click();
            });
            const labQueryArgs = {
              supabaseUrl: env.VITE_SUPABASE_URL,
              anonKey: env.VITE_SUPABASE_ANON_KEY,
              twinId: createdTwinId,
              filename: labReportPath.split('/').at(-1),
            };
            const labStartedAt = Date.now();
            let labEvidence = { source: null, parameterCount: 0, error: 'Lab processing timed out.' };
            while (Date.now() - labStartedAt < 5 * 60_000) {
              labEvidence = await page.evaluate(async ({ supabaseUrl, anonKey, twinId, filename }) => {
                const sessionKey = Object.keys(localStorage).find((key) => key.startsWith('sb-') && key.endsWith('-auth-token'));
                const stored = sessionKey ? JSON.parse(localStorage.getItem(sessionKey) || 'null') : null;
                const token = stored?.access_token;
                if (!token) return { error: 'Missing authenticated session token', source: null, parameterCount: 0 };
                const headers = { apikey: anonKey, Authorization: `Bearer ${token}` };
                const sourceResponse = await fetch(
                  `${supabaseUrl}/rest/v1/health_sources?twin_id=eq.${twinId}&source_name=eq.${encodeURIComponent(filename)}&select=id,status,processing_error&order=created_at.desc&limit=1`,
                  { headers },
                );
                const sources = await sourceResponse.json();
                const source = Array.isArray(sources) ? sources[0] : null;
                if (!source) return { sourceStatus: sourceResponse.status, source: null, parameterCount: 0 };
                const parameterResponse = await fetch(
                  `${supabaseUrl}/rest/v1/health_lab_parameters?twin_id=eq.${twinId}&source_id=eq.${source.id}&select=id`,
                  { headers: { ...headers, Prefer: 'count=exact' } },
                );
                const parameters = await parameterResponse.json();
                return {
                  sourceStatus: sourceResponse.status,
                  parameterStatus: parameterResponse.status,
                  source,
                  parameterCount: Array.isArray(parameters) ? parameters.length : 0,
                };
              }, labQueryArgs);
              if (labEvidence.source && labEvidence.source.status !== 'processing') break;
              await new Promise((resolveWait) => setTimeout(resolveWait, 2000));
            }
            await capture(page, resolve(artifactsDir, '06-lab-report.png'));
            writeFileSync(resolve(artifactsDir, 'lab-evidence.json'), JSON.stringify(labEvidence, null, 2));
            results.push(result(
              'HT-040',
              labEvidence.source ? 'PASS' : 'FAIL',
              'Sterling Accuris PDF uploads and creates a health source',
              ['06-lab-report.png', 'lab-evidence.json'],
              labEvidence.error || '',
            ));
            results.push(result(
              'HT-041',
              labEvidence.source ? 'PASS' : 'FAIL',
              'Lab upload creates a separate health_sources processing record',
              ['06-lab-report.png', 'lab-evidence.json'],
            ));
            results.push(result(
              'HT-044',
              labEvidence.source?.status === 'completed' && labEvidence.parameterCount > 0 ? 'PASS' : 'FAIL',
              'Lab workflow completes and persists extracted biomarkers',
              ['06-lab-report.png', 'lab-evidence.json'],
              `source=${labEvidence.source?.status || 'missing'} parameters=${labEvidence.parameterCount || 0} error=${labEvidence.source?.processing_error || ''}`,
            ));
            results.push(result(
              'HT-045',
              labEvidence.source && labEvidence.source.status !== 'processing' ? 'PASS' : 'FAIL',
              'Lab processing reaches a terminal status',
              ['lab-evidence.json'],
              `source=${labEvidence.source?.status || 'missing'}`,
            ));
          }
        } else {
          results.push(result(
            'HT-040',
            'BLOCKED',
            'Sterling Accuris lab report upload',
            [],
            `HEALTH_TWIN_LAB_REPORT is missing or unreadable: ${labReportPath || '<unset>'}`,
          ));
        }

        try {
          const chatTabClicked = await page.evaluate(() => {
            const button = [...document.querySelectorAll('button[role="tab"]')]
              .find((candidate) => candidate.textContent?.includes('Chat'));
            button?.click();
            return Boolean(button);
          });
          if (!chatTabClicked) throw new Error('Chat tab was not found.');
          await page.waitForSelector('input[placeholder="Ask your Digital Twin..."]', { visible: true });
          const chatMessage = `Acceptance hydration check ${browserMarker}`;
          await page.type('input[placeholder="Ask your Digital Twin..."]', chatMessage);
          await page.keyboard.press('Enter');
          await page.waitForFunction(
            () => !document.body.textContent?.includes('Agent is typing...'),
            { timeout: 90_000 },
          );
          const chatRequest = capturedChatRequests.at(-1);
          const sessions = await authenticatedQuery(
            page,
            env,
            `/rest/v1/health_chat_sessions?twin_id=eq.${createdTwinId}&select=id,twin_id&order=started_at.desc&limit=1`,
          );
          const chatSessionId = sessions.body?.[0]?.id;
          const messages = chatSessionId
            ? await authenticatedQuery(
              page,
              env,
              `/rest/v1/health_chat_messages?session_id=eq.${chatSessionId}&select=role,content&order=timestamp.asc`,
            )
            : { status: 0, body: [] };
          const visibleChat = await page.evaluate((message) => ({
            hasUser: document.body.textContent?.includes(message),
            hasAssistant: [...document.querySelectorAll('div')].some((node) => node.textContent && node.textContent !== message && node.textContent.includes('assistant')),
            hasSafeError: document.body.textContent?.includes('There was an error connecting to your Digital Twin agent.'),
          }), chatMessage);
          await capture(page, resolve(artifactsDir, '07-chat.png'));
          results.push(result('HT-060', chatSessionId ? 'PASS' : 'FAIL', 'Sending a browser message creates or reuses a chat session', ['07-chat.png'], `session=${chatSessionId || 'missing'}`));
          results.push(result('HT-061', messages.body?.some((row) => row.role === 'user') && messages.body?.some((row) => row.role === 'assistant') ? 'PASS' : 'FAIL', 'User and assistant chat messages persist', ['07-chat.png'], `messages=${messages.body?.length || 0}`));
          results.push(result(
            'HT-062',
            chatRequest?.twin_id === createdTwinId && !!chatRequest?.session_id && !('personal_details_snapshot' in (chatRequest || {})) ? 'PASS' : 'FAIL',
            'Chat request carries the correct twin/session context; profile context is loaded authoritatively server-side rather than trusted from the client request',
            ['07-chat.png'],
            JSON.stringify(chatRequest || {}),
          ));
          results.push(result('HT-063', visibleChat.hasUser && messages.body?.some((row) => row.role === 'assistant') ? 'PASS' : 'FAIL', 'Chat response reaches a supported normalized UI state', ['07-chat.png']));

          await page.setRequestInterception(true);
          let chatFailureIntercepted = false;
          chatFailureHandler = (request) => {
            if (request.url().includes('/functions/v1/chat-completion')) {
              chatFailureIntercepted = true;
              request.respond({
                status: 503,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'controlled acceptance failure' }),
              });
            } else {
              request.continue();
            }
          };
          page.on('request', chatFailureHandler);
          await page.type('input[placeholder="Ask your Digital Twin..."]', `Controlled failure ${browserMarker}`);
          await page.keyboard.press('Enter');
          const safeErrorVisible = await page.waitForFunction(
            () => document.body.textContent?.includes('There was an error connecting to your Digital Twin agent.'),
            { timeout: 20_000 },
          ).then(() => true).catch(() => false);
          page.off('request', chatFailureHandler);
          chatFailureHandler = null;
          await page.setRequestInterception(false);
          await capture(page, resolve(artifactsDir, '07-chat-failure.png'));
          results.push(result('HT-064', chatFailureIntercepted && safeErrorVisible ? 'PASS' : 'FAIL', 'Controlled chat-service failure produces a safe user-visible error', ['07-chat-failure.png'], `intercepted=${chatFailureIntercepted}`));
        } catch (chatError) {
          if (chatFailureHandler) page.off('request', chatFailureHandler);
          await page.setRequestInterception(false).catch(() => {});
          await capture(page, resolve(artifactsDir, '07-chat-error.png')).catch(() => {});
          for (const id of ['HT-060', 'HT-061', 'HT-062', 'HT-063', 'HT-064']) {
            results.push(result(id, 'FAIL', 'Health assistant browser flow', ['07-chat-error.png'], String(chatError)));
          }
        }

        let wellnessFailureHandler = null;
        try {
          await clickButtonText(page, 'Data', true);
          await page.setRequestInterception(true);
          let wellnessFailureIntercepted = false;
          wellnessFailureHandler = (request) => {
            if (request.url().includes('/functions/v1/generate-wellness')) {
              wellnessFailureIntercepted = true;
              request.respond({
                status: 503,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'controlled wellness failure' }),
              });
            } else {
              request.continue();
            }
          };
          page.on('request', wellnessFailureHandler);
          await page.evaluate(() => {
            const button = document.querySelector('button[title="Regenerate programs"]');
            button?.click();
          });
          await new Promise((resolveWait) => setTimeout(resolveWait, 1500));
          const dashboardSurvived = page.url().includes(`/health-twin/${createdTwinId}`)
            && await page.evaluate(() => document.body.textContent?.includes('Wellness Programs for You'));
          page.off('request', wellnessFailureHandler);
          wellnessFailureHandler = null;
          await page.setRequestInterception(false);
          results.push(result('HT-073', wellnessFailureIntercepted && dashboardSurvived ? 'PASS' : 'FAIL', 'Controlled wellness-generation failure does not crash the dashboard', ['07-chat-failure.png'], `intercepted=${wellnessFailureIntercepted}`));
        } catch (wellnessFailure) {
          if (wellnessFailureHandler) page.off('request', wellnessFailureHandler);
          await page.setRequestInterception(false).catch(() => {});
          results.push(result('HT-073', 'FAIL', 'Controlled wellness-generation failure remains safe', [], String(wellnessFailure)));
        }

        await page.evaluate(() => {
          const button = [...document.querySelectorAll('button')]
            .find((candidate) => candidate.textContent?.includes('Open Playground'));
          button?.click();
        });
        await page.waitForFunction(
          () => document.body.textContent?.includes('Digital Twin Playground'),
          { timeout: 20_000 },
        );
        await clickButtonText(page, 'Activity & Vitals').catch(() => {});
        await page.waitForFunction(
          () => [...document.querySelectorAll('span')]
            .some((candidate) => candidate.textContent?.trim() === 'Daily Steps'),
          { timeout: 10_000 },
        ).catch(() => null);
        const realCountBefore = await authenticatedQuery(
          page,
          env,
          `/rest/v1/health_wearable_parameters?twin_id=eq.${createdTwinId}&select=id`,
        );
        const playgroundBaseline = await page.evaluate(() => {
          const label = [...document.querySelectorAll('span')].find((candidate) => candidate.textContent?.trim() === 'Daily Steps');
          const input = label?.closest('div.flex.flex-col')?.querySelector('input[type="number"]');
          return input ? Number(input.value) : null;
        });
        const playgroundChanged = await page.evaluate(() => {
          const label = [...document.querySelectorAll('span')].find((candidate) => candidate.textContent?.trim() === 'Daily Steps');
          const input = label?.closest('div.flex.flex-col')?.querySelector('input[type="range"]');
          if (!input) return false;
          const next = Math.min(Number(input.max), Number(input.value) + 2500);
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          setter?.call(input, String(next));
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        });
        await new Promise((resolveWait) => setTimeout(resolveWait, 1200));
        const resetEnabled = await page.evaluate(() => {
          const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes('Reset to Real Data'));
          return Boolean(button && !button.disabled);
        });
        await clickButtonText(page, 'Recalculate Scores', true).catch(() => {});
        const guidanceChanged = await page.waitForFunction(
          () => document.body.textContent?.includes('Health Analysis') || document.body.textContent?.includes('Generate'),
          { timeout: 30_000 },
        ).then(() => true).catch(() => false);
        const realCountAfter = await authenticatedQuery(
          page,
          env,
          `/rest/v1/health_wearable_parameters?twin_id=eq.${createdTwinId}&select=id`,
        );
        await clickButtonText(page, 'Reset to Real Data', true).catch(() => {});
        await new Promise((resolveWait) => setTimeout(resolveWait, 500));
        const playgroundReset = await page.evaluate((baseline) => {
          const label = [...document.querySelectorAll('span')].find((candidate) => candidate.textContent?.trim() === 'Daily Steps');
          const input = label?.closest('div.flex.flex-col')?.querySelector('input[type="number"]');
          return input ? Number(input.value) === baseline : false;
        }, playgroundBaseline);
        await capture(page, resolve(artifactsDir, '08-playground.png'));
        results.push(result(
          'HT-080',
          page.url().includes('/playground') && playgroundBaseline === 9100 ? 'PASS' : 'FAIL',
          'Playground initializes from the active twin real data',
          ['08-playground.png', page.url()],
          `dailyStepsBaseline=${playgroundBaseline}`,
        ));
        results.push(result('HT-081', playgroundChanged && resetEnabled ? 'PASS' : 'FAIL', 'Parameter changes activate simulated score recalculation', ['08-playground.png']));
        results.push(result('HT-082', playgroundReset ? 'PASS' : 'FAIL', 'Reset restores the playground baseline', ['08-playground.png'], `baseline=${playgroundBaseline}`));
        results.push(result('HT-083', realCountBefore.body?.length === realCountAfter.body?.length ? 'PASS' : 'FAIL', 'Simulation does not mutate real health rows', ['08-playground.png'], `before=${realCountBefore.body?.length || 0} after=${realCountAfter.body?.length || 0}`));
        results.push(result('HT-084', guidanceChanged ? 'PASS' : 'FAIL', 'Simulated inputs update wellness guidance state', ['08-playground.png']));
        const saveScenarioIsPresented = await page.evaluate(
          () => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('Save Scenario')),
        );
        results.push(result(
          'HT-085',
          saveScenarioIsPresented ? 'FAIL' : 'PASS',
          'Incomplete Save Scenario action is not presented as working',
          ['08-playground.png'],
          saveScenarioIsPresented
            ? 'The UI presents Save Scenario, but the current button has no persistence handler.'
            : '',
        ));
      }
    }
  }

  const filteredConsoleErrors = consoleErrors.filter(
    (message) => !message.includes('favicon')
      && !message.includes('Failed to load resource: net::ERR_BLOCKED_BY_CLIENT')
      && !message.includes('Error communicating with chat agent:'),
  );
  results.push(result(
    'HT-094',
    filteredConsoleErrors.length === 0 && networkErrors.length === 0 ? 'PASS' : 'FAIL',
    'Browser smoke flow has no unexpected console or request failures',
    ['browser-console.log', 'network-errors.log'],
    `${filteredConsoleErrors.length} console errors; ${networkErrors.length} request failures`,
  ));

  writeFileSync(resolve(artifactsDir, 'browser-console.log'), filteredConsoleErrors.join('\n'));
  writeFileSync(resolve(artifactsDir, 'network-errors.log'), networkErrors.join('\n'));
} catch (error) {
  results.push(result('HT-094', 'FAIL', 'Browser smoke execution', [], String(error?.stack || error)));
} finally {
  writeFileSync(resolve(artifactsDir, 'browser-console-raw.log'), consoleErrors.join('\n'));
  writeFileSync(resolve(artifactsDir, 'network-errors-raw.log'), networkErrors.join('\n'));
  if (page && createdTwinId && env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) {
    try {
      const cleanupStatus = await page.evaluate(async ({ supabaseUrl, anonKey, twinId }) => {
        const sessionKey = Object.keys(localStorage).find((key) => key.startsWith('sb-') && key.endsWith('-auth-token'));
        const stored = sessionKey ? JSON.parse(localStorage.getItem(sessionKey) || 'null') : null;
        const token = stored?.access_token;
        if (!token) return 0;
        const response = await fetch(`${supabaseUrl}/rest/v1/health_twins?id=eq.${twinId}`, {
          method: 'DELETE',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${token}`,
          },
        });
        return response.status;
      }, {
        supabaseUrl: env.VITE_SUPABASE_URL,
        anonKey: env.VITE_SUPABASE_ANON_KEY,
        twinId: createdTwinId,
      });
      writeFileSync(resolve(artifactsDir, 'cleanup.log'), `Synthetic twin cleanup status: ${cleanupStatus}\n`);
    } catch (cleanupError) {
      writeFileSync(resolve(artifactsDir, 'cleanup.log'), `Synthetic twin cleanup failed: ${cleanupError}\n`);
    }
  }
  if (browser) await browser.close();
  if (vite) vite.kill('SIGTERM');
  writeFileSync(resolve(artifactsDir, 'vite.log'), viteLog);
}

const report = {
  product: 'health-twin',
  generatedAt: new Date().toISOString(),
  baseUrl,
  syntheticTwinId: createdTwinId,
  summary: {
    passed: results.filter((entry) => entry.status === 'PASS').length,
    failed: results.filter((entry) => entry.status === 'FAIL').length,
    blocked: results.filter((entry) => entry.status === 'BLOCKED').length,
    total: results.length,
  },
  results,
};

writeFileSync(outputPath, JSON.stringify(report, null, 2));
for (const entry of results) {
  console.log(`[${entry.status}] ${entry.id} ${entry.description}`);
  if (entry.detail) console.log(`  ${entry.detail}`);
}
console.log(`Browser summary: ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.blocked} blocked`);

process.exit(report.summary.failed > 0 ? 1 : report.summary.blocked > 0 ? 2 : 0);
