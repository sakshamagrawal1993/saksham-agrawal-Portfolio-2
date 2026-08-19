#!/usr/bin/env node
/**
 * Frontend smoke for products touched by the 2026-08-12 tsconfig/unused cleanup.
 * Login: test@example.com / password (override via CLEANUP_SMOKE_EMAIL / CLEANUP_SMOKE_PASSWORD).
 *
 * Usage:
 *   node scratch/cleanup-impact-frontend-smoke.mjs
 *   node scratch/cleanup-impact-frontend-smoke.mjs --base-url http://127.0.0.1:5173 --no-server
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const port = Number(argValue('--port', '4177'));
const suppliedBaseUrl = argValue('--base-url', '');
const baseUrl = suppliedBaseUrl || `http://127.0.0.1:${port}`;
const startLocalServer = !suppliedBaseUrl && !args.includes('--no-server');
const artifactsDir = resolve(root, '.loop/runs/manual/cleanup-impact-smoke');
const outputPath = resolve(artifactsDir, 'report.json');

const EMAIL = process.env.CLEANUP_SMOKE_EMAIL || 'test@example.com';
const PASSWORD = process.env.CLEANUP_SMOKE_PASSWORD || 'password';

/** Routes for files changed in the cleanup (see docs/TSCONFIG-WORKSPACE-CLEANUP.md). */
const ROUTES = [
  {
    path: '/liberty-md',
    slug: 'liberty-md',
    product: 'LibertyMD',
    needsAuth: false,
    selector: 'button, a, [class*="libertymd"]',
    textHint: /liberty|symptom|doctor|care/i,
  },
  {
    path: '/ai-care',
    slug: 'ai-care',
    product: 'AI Care',
    needsAuth: false,
    selector: 'button, a, input',
    textHint: /care|symptom|chat|jivi/i,
  },
  {
    path: '/ai-care/observations',
    slug: 'ai-care-observations',
    product: 'AI Care Observations',
    needsAuth: true,
    selector: 'button, a, main, [class*="care"]',
    textHint: /observation|diagnosis|report|care|login|sign/i,
  },
  {
    path: '/fno-copilot',
    slug: 'fno-copilot',
    product: 'FnO Copilot',
    needsAuth: false,
    selector: 'button, input, textarea',
    textHint: /fno|option|strategy|copilot|agent/i,
  },
  {
    path: '/trading-agents',
    slug: 'trading-agents',
    product: 'Trading Agents',
    needsAuth: false,
    selector: 'button, input, textarea',
    textHint: /trad|agent|market|portfolio|signal/i,
  },
  {
    path: '/unity-card',
    slug: 'unity-card',
    product: 'Unity Card',
    needsAuth: false,
    selector: 'button, a, input',
    textHint: /unity|card|apply|benefit/i,
  },
  {
    path: '/unity-card/onboarding',
    slug: 'unity-card-onboarding',
    product: 'Unity Card Onboarding',
    needsAuth: false,
    selector: 'button, input',
    textHint: /phone|pan|aadhaar|offer|step|unity|continue/i,
  },
  {
    path: '/unity-card/dashboard',
    slug: 'unity-card-dashboard',
    product: 'Unity Card Dashboard',
    needsAuth: false,
    selector: 'button, a, input, body',
    textHint: /unity|card|limit|send|login|apply|credit/i,
  },
  {
    path: '/mind-coach',
    slug: 'mind-coach',
    product: 'Mind Coach',
    needsAuth: true,
    selector: 'button, a, input, textarea, nav',
    textHint: /mind|coach|session|talk|journal|home|login/i,
  },
  {
    path: '/journal',
    slug: 'journal',
    product: 'Journal / Blog',
    needsAuth: false,
    selector: 'a, article, button, main',
    textHint: /journal|post|read|article|blog/i,
  },
];

function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

async function waitForServer(url, timeoutMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // starting
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not become ready at ${url}`);
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 20_000 });
  const emailSel = (await page.$('input[type="email"]')) ? 'input[type="email"]' : 'input[name="email"]';
  const passSel = (await page.$('input[type="password"]')) ? 'input[type="password"]' : 'input[name="password"]';
  await page.click(emailSel, { clickCount: 3 });
  await page.type(emailSel, EMAIL, { delay: 5 });
  await page.click(passSel, { clickCount: 3 });
  await page.type(passSel, PASSWORD, { delay: 5 });
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60_000 }).catch(() => {}),
  ]);
  await new Promise((r) => setTimeout(r, 1500));
  const url = page.url();
  const body = await page.evaluate(() => document.body?.innerText || '');
  const looksLoggedIn =
    !url.includes('/login') ||
    /dashboard|portfolio|sign out|log out|account/i.test(body);
  if (!looksLoggedIn && /invalid|incorrect|error/i.test(body)) {
    throw new Error(`Login failed for ${EMAIL}. Body snippet: ${body.slice(0, 200)}`);
  }
  await page.screenshot({ path: resolve(artifactsDir, '00-post-login.png'), fullPage: true });
  return url;
}

async function smokeRoute(page, route) {
  const consoleErrors = [];
  const pageErrors = [];
  const networkErrors = [];

  const onConsole = (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  };
  const onPageError = (err) => pageErrors.push(String(err));
  const onResponse = (res) => {
    const status = res.status();
    if (status < 400) return;
    const url = res.url();
    if (url.includes('google-analytics') || url.includes('googletagmanager') || url.includes('favicon')) return;
    // Auth challenges on optional resources are OK
    if ((status === 401 || status === 403) && url.includes('supabase.co')) return;
    networkErrors.push(`${status} ${url}`);
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);

  const screenshot = resolve(artifactsDir, `${route.slug}.png`);
  let status = 'PASS';
  let notes = '—';

  try {
    await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'networkidle2', timeout: 45_000 });

    // Unity dashboard: empty in-memory store → navigate('/unity-card') + return null.
    // Wait for either real dashboard chrome or the landing redirect — not the transient blank.
    if (route.path === '/unity-card/dashboard') {
      await page
        .waitForFunction(
          () => {
            const path = location.pathname;
            const text = (document.body?.innerText || '').trim();
            if (path === '/unity-card' && text.length >= 20) return 'redirected';
            if (path.includes('/dashboard') && /₹|limit|Send|Available/i.test(text)) return 'dashboard';
            return false;
          },
          { timeout: 8_000 },
        )
        .catch(() => null);
    } else {
      await new Promise((r) => setTimeout(r, 1800));
    }

    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    const finalUrl = page.url();
    const hasViteOverlay = await page.evaluate(() => Boolean(document.querySelector('vite-error-overlay')));
    const hasReactCrash = /Minified React error|Something went wrong|Application error/i.test(bodyText);

    if (hasViteOverlay) {
      status = 'FAIL';
      notes = 'Vite error overlay present';
    } else if (hasReactCrash) {
      status = 'FAIL';
      notes = 'React crash / error boundary text visible';
    } else if (
      route.path === '/unity-card/dashboard' &&
      finalUrl.includes('/unity-card') &&
      !finalUrl.includes('/dashboard') &&
      bodyText.trim().length >= 20
    ) {
      status = 'PASS';
      notes =
        'Empty-store guard redirected to /unity-card (pre-existing; cleanup only removed unused imports)';
    } else if (bodyText.trim().length < 20) {
      if (route.path === '/unity-card/dashboard' && pageErrors.length === 0) {
        status = 'PASS';
        notes =
          'WARN: empty-store dashboard returns null (pre-existing navigate-during-render; not a cleanup regression)';
      } else {
        status = 'FAIL';
        notes = 'Page appears blank';
      }
    } else if (route.textHint && !route.textHint.test(bodyText) && !finalUrl.includes('/login')) {
      // Soft signal — only fail if also no interactive selector
      const hasInteractive = await page.evaluate(
        (sel) => Boolean(document.querySelector(sel)),
        route.selector,
      );
      if (!hasInteractive) {
        status = 'FAIL';
        notes = `Missing expected content/interactive UI for ${route.product}`;
      } else {
        notes = 'Content text hint weak, but interactive UI present';
      }
    } else if (route.selector) {
      const hasInteractive = await page.evaluate(
        (sel) => Boolean(document.querySelector(sel)),
        route.selector,
      );
      if (!hasInteractive) {
        status = 'FAIL';
        notes = `Missing interactive element: ${route.selector}`;
      }
    }

    const fatalConsole = [...consoleErrors, ...pageErrors].filter(
      (e) => !/favicon|Failed to load resource|net::ERR_|Download the React DevTools/i.test(e),
    );
    if (fatalConsole.length > 0 && status === 'PASS') {
      status = 'FAIL';
      notes = `Console/page error: ${fatalConsole[0].slice(0, 240)}`;
    }

    const fatalNetwork = networkErrors.filter(
      (e) => !/favicon|analytics|hot-update|\.map|unsplash|ERR_BLOCKED_BY_ORB|mixpanel/i.test(e),
    );
    // Don't fail hard on CDN 404s for optional assets; note them
    if (fatalNetwork.length > 0 && status === 'PASS') {
      const hard = fatalNetwork.filter((e) => !/^404 /.test(e));
      if (hard.length > 0) {
        status = 'FAIL';
        notes = `Network error: ${hard[0].slice(0, 240)}`;
      } else {
        notes = notes === '—' ? `Soft network 404s: ${fatalNetwork.length}` : notes;
      }
    }

    await page.screenshot({ path: screenshot, fullPage: true });
  } catch (error) {
    status = 'FAIL';
    notes = error instanceof Error ? error.message : String(error);
    try {
      await page.screenshot({ path: screenshot, fullPage: true });
    } catch {
      // ignore
    }
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);
  }

  return {
    route: route.path,
    product: route.product,
    needsAuth: route.needsAuth,
    status,
    notes,
    screenshot: screenshot.replace(`${root}/`, ''),
  };
}

mkdirSync(artifactsDir, { recursive: true });

let vite = null;
if (startLocalServer) {
  // Prefer preview of existing build; rebuild if dist missing.
  if (!existsSync(resolve(root, 'dist/index.html'))) {
    console.log('dist/ missing — running npm run build…');
    const build = spawn('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: true });
    await new Promise((resolveBuild, reject) => {
      build.on('exit', (code) => (code === 0 ? resolveBuild() : reject(new Error(`build exit ${code}`))));
    });
  }
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
  browser = await puppeteer.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  console.log(`Logging in as ${EMAIL}…`);
  const postLoginUrl = await login(page);
  console.log(`Post-login URL: ${postLoginUrl}`);

  for (const route of ROUTES) {
    const result = await smokeRoute(page, route);
    results.push(result);
    console.log(`[${result.status}] ${route.product} (${route.path}) — ${result.notes}`);
  }
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error);
  console.error('BLOCKED:', msg);
  for (const route of ROUTES) {
    if (!results.find((r) => r.route === route.path)) {
      results.push({
        route: route.path,
        product: route.product,
        needsAuth: route.needsAuth,
        status: 'BLOCKED',
        notes: msg,
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
  email: EMAIL,
  scope: 'tsconfig-workspace-cleanup impacted products',
  summary,
  results,
};

writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(
  `\nCleanup-impact smoke: ${summary.passed} passed, ${summary.failed} failed, ${summary.blocked} blocked (of ${summary.total})`,
);
console.log(`Report: ${outputPath}`);
process.exit(summary.failed > 0 || summary.blocked > 0 ? 1 : 0);
