// Shared QA capture for the LibertyMD phase stack (P4-11).
// Uses puppeteer + real Chrome against the running vite dev server.
// Outputs: screenshots + JSON evidence bundle + console error log.
//
//   node scratch/qa-capture.mjs [outDir]
//
// Captures, per viewport:
//   1. all four settled phases (screenshot + full DOM state)
//   2. high-frequency trajectories across the 3 forward boundaries
//   3. one reverse boundary
//   4. page-level assertions (no horizontal overflow, single lit plate, gradients)
//   5. reduced-motion fallback (emulated media)
//   6. console / page errors
// Also writes a human-readable summary to stdout.
import { launch } from 'puppeteer';
import fs from 'fs';
import path from 'path';

const BASE = process.env.APP_URL || 'http://localhost:5199/liberty-md';
const OUT = process.argv[2] || '/var/folders/9y/hsblstmx4wbcjsshglhyb8980000gn/T/opencode/qa-out';
fs.mkdirSync(OUT, { recursive: true });

const HAS_REDUCED = process.env.QA_REDUCED === '1';

async function openPage(browser, width, height, reduced = false) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  page.on('pageerror', (e) => console.log(`[${width}x${height}] PAGEERROR:`, e.message.slice(0, 250)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${width}x${height}] CONSOLE ${m.type()}:`, m.text().slice(0, 250)); });
  if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  for (let i = 0; i < 4; i++) {
    try { await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 }); break; }
    catch { await new Promise((r) => setTimeout(r, 2000)); }
  }
  await new Promise((r) => setTimeout(r, 4000));
  return page;
}

async function geo(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('svg[viewBox^="0 -48"]');
    if (!svg) return null;
    const w = svg.closest('div[style*="vh"]');
    return { range: w.offsetHeight - innerHeight, absTop: w.getBoundingClientRect().top + scrollY, scrollY, vh: w.offsetHeight / innerHeight };
  });
}

async function snap(page, label) {
  return page.evaluate((label) => {
    const svg = document.querySelector('svg[viewBox^="0 -48"]');
    if (!svg) return { label, missing: true };
    const w = svg.closest('div[style*="vh"]');
    const range = w.offsetHeight - innerHeight;
    const progress = Math.min(1, Math.max(0, -w.getBoundingClientRect().top / range));
    const groups = [...svg.querySelectorAll('g')].filter((g) => g.style.transform);
    const plates = groups.map((g, gi) => {
      const cs = getComputedStyle(g);
      const m = /matrix\(1, 0, 0, 1, 0, (-?\d+(\.\d+)?)\)/.exec(cs.transform);
      const litGroup = g.children[1];
      const restGroup = g.children[0];
      const litOp = litGroup ? +getComputedStyle(litGroup).opacity : null;
      const restOp = restGroup ? +getComputedStyle(restGroup).opacity : null;
      const litSlab = litGroup?.children[1];
      const litFace = litGroup?.children[2];
      return {
        gi,
        lift: m ? +m[1] : 0,
        litOp,
        restOp,
        litFaceFill: litFace ? (litFace.getAttribute('fill') || null) : null,
        litFaceStroke: litFace ? (litFace.getAttribute('stroke') || null) : null,
        litSlabFill: litSlab ? (litSlab.getAttribute('fill') || null) : null,
      };
    });
    const labels = [...document.querySelectorAll('h3')]
      .filter((h) => /Share your symptoms|Focussed Follow-up|Doctor Ready Report|Doctor Consultation/.test(h.textContent))
      .map((h) => {
        const block = h.closest('div[class*="text-left"]');
        const rule = block?.querySelector('span[style*="scaleX"]');
        const rm = rule && /scaleX\(([\d.]+)\)/.exec(rule.style.transform);
        const cta = block?.querySelector('button[data-libertymd-sample-report-entry="how-it-works"]');
        return {
          title: h.textContent.trim(),
          op: block ? +getComputedStyle(block).opacity : null,
          rule: rm ? +rm[1] : null,
          ctaVisible: cta ? getComputedStyle(cta).visibility : null,
        };
      });
    const doc = {
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
    return { label, progress: +progress.toFixed(4), plates, labels, doc, scrollY: window.scrollY };
  }, label);
}

const all = { desktop: {}, mobile: {}, reduced: {} };
const browser = await launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  pipe: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  protocolTimeout: 60000,
});

async function captureViewport(width, height, key, reduced = false) {
  const page = await openPage(browser, width, height, reduced);
  const g = await geo(page);
  if (!g) { console.log(`[${key}] phase stack NOT FOUND`); await page.close(); return; }
  const log = [];
  const outDir = path.join(OUT, key);
  fs.mkdirSync(outDir, { recursive: true });

  const scrollToP = (p) => page.evaluate((y) => window.scrollTo(0, y), Math.round(g.absTop + p * g.range));
  const PHASES = [0.12, 0.375, 0.625, 0.875];
  const scanTraj = (traj) => {
    let prev = traj[0]?.lifts;
    for (let i = 1; i < traj.length; i++) {
      if (traj[i].lifts.some((v, j) => Math.abs(v - prev[j]) > 0.5)) return i;
    }
    return -1;
  };

  // settled phases
  const shots = {};
  for (let p = 0; p < 4; p++) {
    await scrollToP(PHASES[p]);
    await new Promise((r) => setTimeout(r, 1000));
    const s = await snap(page, `phase${p + 1}`);
    shots[`phase${p + 1}`] = s;
    await page.screenshot({ path: path.join(outDir, `phase${p + 1}.png`) });
    const lit = s.plates.filter((x) => x.litOp > 0.5);
    log.push(`phase${p + 1}: p=${s.progress} lit=[${lit.map((x) => x.gi).join(',')}] lift=[${s.plates.map((x) => x.lift).join(',')}] labels=[${s.labels.map((l) => `${l.op.toFixed(2)}:${l.rule === null ? '-' : l.rule.toFixed(1)}`).join(' ')}] hScroll=${s.doc.hScroll}`);
  }

  // trajectories across forward boundaries + one reverse
  const trajs = {};
  const BOUNDS = [['A', 0.14, 0.36], ['B', 0.40, 0.62], ['C', 0.64, 0.86], ['D', 0.90, 0.99], ['Rev', 0.96, 0.68]];
  for (const [name, a, b] of BOUNDS) {
    await scrollToP(a);
    await new Promise((r) => setTimeout(r, 700));
    const traj = [];
    const steps = Math.max(8, Math.round((b - a) * 1500));
    const delta = (b - a) / steps;
    for (let i = 0; i <= steps; i++) {
      await scrollToP(a + i * delta);
      await new Promise((r) => setTimeout(r, 20));
      const s = await snap(page, name);
      traj.push({ d: i, p: s.progress, lifts: s.plates.map((x) => x.lift), litOps: s.plates.map((x) => x.litOp), restOps: s.plates.map((x) => x.restOp), labelOps: s.labels.map((l) => l.op) });
    }
    await new Promise((r) => setTimeout(r, 700));
    trajs[name] = traj;
    log.push(`traj ${name}: ${traj.length} samples, first lift change at sample ${scanTraj(traj)}`);
  }
  // final settled state
  await scrollToP(0.875);
  await new Promise((r) => setTimeout(r, 600));
  const final = await snap(page, 'final');
  fs.writeFileSync(path.join(outDir, 'shots.json'), JSON.stringify(shots, null, 1));
  fs.writeFileSync(path.join(outDir, 'trajectories.json'), JSON.stringify(trajs, null, 1));
  fs.writeFileSync(path.join(outDir, 'summary.log'), log.join('\n'));
  console.log(`== ${key} (${width}x${height}${reduced ? ', reduced-motion' : ''}) ==`);
  console.log(log.join('\n'));
  await page.close();
  return { shots, trajs, log };
}

all.desktop = await captureViewport(1440, 900, 'desktop');
if (HAS_REDUCED) {
  // reduced-motion: the stack is a static list — no SVG, no pin
  const page = await openPage(browser, 1440, 900, true);
  const info = await page.evaluate(() => {
    const head = [...document.querySelectorAll('h2')].find((h) => /How LibertyMD works|how it works/i.test(h.textContent));
    const labels = [...document.querySelectorAll('h3')].filter((h) => /Share your symptoms|Focussed Follow-up|Doctor Ready Report|Doctor Consultation/.test(h.textContent));
    const svgPresent = !!document.querySelector('svg[viewBox^="0 -48"]');
    const stuck = [...document.querySelectorAll('div')].some((d) => getComputedStyle(d).position === 'sticky');
    const bodies = labels.map((h) => h.parentElement.querySelector('p:last-of-type')?.textContent.trim().slice(0, 100));
    return { hadHeading: !!head, headText: head?.textContent.trim().slice(0, 80), labelCount: labels.length, svgPresent, stickyPresent: stuck, bodies };
  });
  fs.mkdirSync(path.join(OUT, 'reduced'), { recursive: true });
  // static list needs a scroll to be visible; screenshot the section area
  await page.evaluate(() => {
    const h = document.body.innerHeight;
    if (h > 1200) window.scrollTo(0, 0);
  });
  await page.screenshot({ path: path.join(OUT, 'reduced/reduced.png') });
  fs.writeFileSync(path.join(OUT, 'reduced/summary.json'), JSON.stringify(info, null, 1));
  console.log('== reduced-motion ==');
  console.log(JSON.stringify(info));
  await page.close();
}
all.mobile = await captureViewport(390, 844, 'mobile');

fs.writeFileSync(path.join(OUT, 'bundle.json'), JSON.stringify(all, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v), 1));
console.log('bundle written ->', path.join(OUT, 'bundle.json'));
await browser.close();