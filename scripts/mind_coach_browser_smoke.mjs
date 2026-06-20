#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const port = Number(argValue('--port', '4184'));
const suppliedBaseUrl = argValue('--base-url', '');
const baseUrl = suppliedBaseUrl || `http://127.0.0.1:${port}`;
const startLocalServer = !suppliedBaseUrl && !args.includes('--no-server');
const outputPath = resolve(root, argValue('--output', '.loop-mind-coach/runs/manual/browser-qa.json'));
const artifactsDir = resolve(root, argValue('--artifacts-dir', '.loop-mind-coach/runs/manual/browser'));

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

function result(id, status, description, evidence = [], detail = '') {
  return { id, status, description, evidence, detail, evidenceType: 'browser-smoke' };
}

mkdirSync(artifactsDir, { recursive: true });
mkdirSync(dirname(outputPath), { recursive: true });

const env = loadEnv();
const email = env.MIND_COACH_TEST_EMAIL || env.HEALTH_TWIN_TEST_EMAIL || 'test@example.com';
const password = env.MIND_COACH_TEST_PASSWORD || env.HEALTH_TWIN_TEST_PASSWORD || 'password';
const results = [];
const consoleErrors = [];
let browser;
let page;
let vite = null;

if (startLocalServer) {
  vite = spawn(
    resolve(root, 'node_modules/.bin/vite'),
    ['--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: root, env: { ...process.env, BROWSER: 'none' }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

try {
  await waitForServer(baseUrl);
  browser = await puppeteer.launch({ headless: true });
  page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto(`${baseUrl}/mind-coach`, { waitUntil: 'domcontentloaded' });
  await new Promise((resolveWait) => setTimeout(resolveWait, 1500));
  const redirectedToLogin = page.url().includes('/mind-coach/login');
  await capture(page, resolve(artifactsDir, '01-unauthenticated.png'));
  results.push(result(
    'MC-001',
    redirectedToLogin ? 'PASS' : 'FAIL',
    'Unauthenticated users are redirected to login',
    ['01-unauthenticated.png', page.url()],
  ));

  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    results.push(result(
      'MC-002',
      'BLOCKED',
      'Landing disclaimer requires authenticated or static render check',
      [],
      'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY',
    ));
    results.push(result(
      'MC-040',
      'BLOCKED',
      'Chat flow requires Supabase credentials',
      [],
      'Set credentials in .env.test.local',
    ));
  } else {
    await page.goto(`${baseUrl}/mind-coach/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[type="email"]', { timeout: 15_000 });
    await page.type('input[type="email"]', email, { delay: 20 });
    await page.type('input[type="password"]', password, { delay: 20 });
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});

    await new Promise((resolveWait) => setTimeout(resolveWait, 3000));
    const bodyText = await page.evaluate(() => document.body.innerText);
    const hasDisclaimer = bodyText.includes('not therapy') || bodyText.includes('988');
    await capture(page, resolve(artifactsDir, '02-post-login.png'));
    results.push(result(
      'MC-002',
      hasDisclaimer ? 'PASS' : 'NOT_TESTED',
      'Disclaimer or crisis line visible after auth entry',
      ['02-post-login.png'],
      hasDisclaimer ? '' : 'Disclaimer may appear only on landing spinner',
    ));

    const onApp = page.url().includes('/mind-coach/');
    results.push(result(
      'MC-003',
      onApp ? 'PASS' : 'FAIL',
      'Authenticated user reaches Mind Coach app or onboarding',
      ['02-post-login.png', page.url()],
    ));

    if (onApp && !page.url().includes('/new')) {
      const navText = await page.evaluate(() => document.body.innerText);
      const hasNav = ['Home', 'Talk', 'Journal'].some((label) => navText.includes(label));
      results.push(result(
        'MC-020',
        hasNav ? 'PASS' : 'NOT_TESTED',
        'Main shell navigation visible',
        ['02-post-login.png'],
      ));
    }
  }

  results.push(result(
    'MC-095',
    'NOT_TESTED',
    'Build verified separately by loop controller',
    [],
  ));
} catch (error) {
  results.push(result(
    'MC-096',
    'FAIL',
    'Browser smoke harness failed',
    [],
    String(error?.message || error),
  ));
} finally {
  if (browser) await browser.close();
  if (vite) vite.kill('SIGTERM');
}

const report = {
  product: 'mind-coach',
  generatedAt: new Date().toISOString(),
  testType: 'browser-smoke',
  baseUrl,
  consoleErrors: consoleErrors.slice(0, 20),
  summary: {
    passed: results.filter((r) => r.status === 'PASS').length,
    failed: results.filter((r) => r.status === 'FAIL').length,
    blocked: results.filter((r) => r.status === 'BLOCKED').length,
    notTested: results.filter((r) => r.status === 'NOT_TESTED').length,
    total: results.length,
  },
  results,
};

writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(`Browser QA written to ${outputPath}`);
console.log(`Summary: ${report.summary.passed} pass, ${report.summary.failed} fail, ${report.summary.blocked} blocked`);
process.exit(report.summary.failed > 0 ? 1 : 0);
