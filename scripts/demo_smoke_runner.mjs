#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const port = Number(argValue('--port', '4175'));
const suppliedBaseUrl = argValue('--base-url', '');
const baseUrl = suppliedBaseUrl || `http://127.0.0.1:${port}`;
const startLocalServer = !suppliedBaseUrl && !args.includes('--no-server');
const outputPath = resolve(root, argValue('--output', '.loop/runs/manual/demo-smoke/report.json'));
const artifactsDir = resolve(root, argValue('--artifacts-dir', '.loop/runs/manual/demo-smoke'));

const ROUTES = [
  { path: '/', tier: 'B', slug: 'home' },
  { path: '/portfolio', tier: 'B', slug: 'portfolio' },
  { path: '/ticketflow', tier: 'A', slug: 'ticketflow', selector: 'button, input, canvas' },
  { path: '/insightslm', tier: 'A', slug: 'insightslm', selector: 'input, textarea, button' },
  { path: '/runner', tier: 'A', slug: 'runner', selector: 'canvas, button' },
  { path: '/health-twin', tier: 'C', slug: 'health-twin', authHint: 'login|sign in|health twin' },
  { path: '/mind-coach', tier: 'C', slug: 'mind-coach', authHint: 'login|sign in|mind coach|get started' },
  { path: '/mind-coach/login', tier: 'C', slug: 'mind-coach-login', authHint: 'login|password|email' },
  { path: '/medical-benchmark', tier: 'A', slug: 'medical-benchmark', selector: 'button, input' },
  { path: '/ai-gate', tier: 'A', slug: 'ai-gate', selector: 'button, input, textarea' },
  { path: '/unity-card', tier: 'A', slug: 'unity-card', selector: 'button, input' },
  { path: '/trading-agents', tier: 'A', slug: 'trading-agents', selector: 'button, input, textarea' },
  { path: '/fno-copilot', tier: 'A', slug: 'fno-copilot', selector: 'button, input, textarea' },
  { path: '/ai-care', tier: 'A', slug: 'ai-care', selector: 'button, a, input' },
  { path: '/project/jivi-orchestrator', tier: 'B', slug: 'project-jivi-orchestrator' },
  { path: '/project/postpe-cc', tier: 'B', slug: 'project-postpe-cc' },
  { path: '/project/p5', tier: 'B', slug: 'project-p5' },
  { path: '/project/p6', tier: 'B', slug: 'project-p6' },
  { path: '/project/p7', tier: 'B', slug: 'project-p7' },
  { path: '/project/p8', tier: 'B', slug: 'project-p8' },
];

function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

async function waitForServer(url, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // still starting
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not become ready at ${url}`);
}

function isExpectedAuthFailure(url, status, route) {
  if (route.tier !== 'C') return false;
  if (status === 401 || status === 403) return true;
  return url.includes('supabase.co') && (status === 401 || status === 403);
}

async function smokeRoute(page, route) {
  const consoleErrors = [];
  const networkErrors = [];
  const onConsole = (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  };
  const onRequestFailed = (req) => {
    networkErrors.push(`${req.method()} ${req.url()} ${req.failure()?.errorText || ''}`.trim());
  };
  const onResponse = (res) => {
    const status = res.status();
    if (status < 400) return;
    const url = res.url();
    if (isExpectedAuthFailure(url, status, route)) return;
    if (url.includes('google-analytics') || url.includes('googletagmanager')) return;
    networkErrors.push(`${status} ${url}`);
  };

  page.on('console', onConsole);
  page.on('requestfailed', onRequestFailed);
  page.on('response', onResponse);

  const screenshot = resolve(artifactsDir, `${route.slug}.png`);
  let status = 'PASS';
  let notes = '';

  try {
    await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'networkidle2', timeout: 20_000 });
    await new Promise((r) => setTimeout(r, 1500));

    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    const hasViteOverlay = await page.evaluate(() => Boolean(document.querySelector('vite-error-overlay')));
    if (hasViteOverlay) {
      status = 'FAIL';
      notes = 'Vite error overlay present';
    } else if (bodyText.trim().length < 20) {
      status = 'FAIL';
      notes = 'Page appears blank';
    }

    if (route.tier === 'C' && status === 'PASS') {
      const authPattern = new RegExp(route.authHint || 'login|sign in', 'i');
      if (!authPattern.test(bodyText) && !page.url().includes('/login')) {
        status = 'FAIL';
        notes = 'Expected auth prompt on Tier C route';
      }
    }

    if (route.tier === 'A' && status === 'PASS' && route.selector) {
      const hasInteractive = await page.evaluate((sel) => Boolean(document.querySelector(sel)), route.selector);
      if (!hasInteractive) {
        status = 'FAIL';
        notes = `Missing interactive element: ${route.selector}`;
      }
    }

    const fatalConsole = consoleErrors.filter(
      (e) => !/favicon|404|Failed to load resource/i.test(e),
    );
    if (fatalConsole.length > 0 && status === 'PASS') {
      status = 'FAIL';
      notes = `Console error: ${fatalConsole[0]}`;
    }

    const fatalNetwork = networkErrors.filter(
      (e) => !/favicon|analytics|hot-update|\.map|unsplash\.com|ERR_BLOCKED_BY_ORB/i.test(e),
    );
    if (fatalNetwork.length > 0 && status === 'PASS') {
      status = 'FAIL';
      notes = `Network error: ${fatalNetwork[0]}`;
    }

    await page.screenshot({ path: screenshot, fullPage: true });
  } catch (error) {
    status = 'FAIL';
    notes = error instanceof Error ? error.message : String(error);
    try {
      await page.screenshot({ path: screenshot, fullPage: true });
    } catch {
      // ignore screenshot failure
    }
  } finally {
    page.off('console', onConsole);
    page.off('requestfailed', onRequestFailed);
    page.off('response', onResponse);
  }

  return {
    route: route.path,
    tier: route.tier,
    status,
    notes: notes || '—',
    screenshot: screenshot.replace(`${root}/`, ''),
  };
}

mkdirSync(artifactsDir, { recursive: true });
mkdirSync(dirname(outputPath), { recursive: true });

let vite = null;
if (startLocalServer) {
  vite = spawn(
    resolve(root, 'node_modules/.bin/vite'),
    ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: root, env: { ...process.env, BROWSER: 'none' }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

let browser;
const results = [];

try {
  await waitForServer(baseUrl);
  browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  for (const route of ROUTES) {
    results.push(await smokeRoute(page, route));
    console.log(`[${results.at(-1).status}] ${route.path}`);
  }
} catch (error) {
  for (const route of ROUTES) {
    if (!results.find((r) => r.route === route.path)) {
      results.push({
        route: route.path,
        tier: route.tier,
        status: 'BLOCKED',
        notes: error instanceof Error ? error.message : String(error),
        screenshot: '',
      });
    }
  }
} finally {
  if (browser) await browser.close();
  if (vite) {
    vite.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 500));
  }
}

const summary = {
  passed: results.filter((r) => r.status === 'PASS').length,
  failed: results.filter((r) => r.status === 'FAIL').length,
  blocked: results.filter((r) => r.status === 'BLOCKED').length,
  total: results.length,
};

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  summary,
  results,
};

writeFileSync(outputPath, JSON.stringify(report, null, 2));

console.log(`\nDemo smoke summary: ${summary.passed} passed, ${summary.failed} failed, ${summary.blocked} blocked (of ${summary.total})`);
process.exit(summary.failed > 0 ? 1 : 0);
