// P4-11 visual polish Cycle 2 captures.
// Desktop viewport + lit-tight crop + floor-focused crop per phase.
import { launch } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sharp = (() => {
  try { return require('sharp'); } catch { return null; }
})();

const BASE = process.env.APP_URL || 'http://127.0.0.1:5173/liberty-md';
const OUT =
  process.argv[2] ||
  '/Users/sakshamagrawal/Documents/Startups/Startups/LibertyMD/Execution Files/tickets/P4-11/qa-captures/cycle-2';
fs.mkdirSync(OUT, { recursive: true });

const PHASES = [
  { index: 0, progress: 0.12 },
  { index: 1, progress: 0.375 },
  { index: 2, progress: 0.625 },
  { index: 3, progress: 0.875 },
];

const browser = await launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  pipe: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--force-device-scale-factor=2'],
  protocolTimeout: 90000,
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 200)));

// Hard-bust cache
await page.setCacheEnabled(false);
for (let i = 0; i < 5; i++) {
  try {
    await page.goto(`${BASE}?v=c2-${Date.now()}`, { waitUntil: 'networkidle2', timeout: 90000 });
    break;
  } catch (e) {
    console.log('goto retry', i, e.message.slice(0, 120));
    await new Promise((r) => setTimeout(r, 2000));
  }
}
await new Promise((r) => setTimeout(r, 2500));

const geo = await page.evaluate(() => {
  const svg = document.querySelector('svg[viewBox^="0 -48"]');
  if (!svg) return null;
  const w = svg.closest('div[style*="vh"]');
  return {
    range: w.offsetHeight - innerHeight,
    absTop: w.getBoundingClientRect().top + scrollY,
    viewBox: svg.getAttribute('viewBox'),
    vh: w.offsetHeight / innerHeight,
  };
});
if (!geo) {
  console.error('Phase stack not found');
  await browser.close();
  process.exit(1);
}
console.log('geo', geo);

async function scrollToP(p) {
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(geo.absTop + p * geo.range));
}

for (const phase of PHASES) {
  await scrollToP(phase.progress);
  await new Promise((r) => setTimeout(r, 1100));

  const meta = await page.evaluate((expectedIndex) => {
    const svg = document.querySelector('svg[viewBox^="0 -48"]');
    const w = svg.closest('div[style*="vh"]');
    const range = w.offsetHeight - innerHeight;
    const progress = Math.min(1, Math.max(0, -w.getBoundingClientRect().top / range));
    const r = svg.getBoundingClientRect();
    // Plate lit group: look for opacity ~1 lit layers
    const groups = [...svg.querySelectorAll(':scope > g')];
    const lifts = groups.map((g) => {
      const cs = getComputedStyle(g);
      const m = /matrix\(1, 0, 0, 1, 0, (-?\d+(\.\d+)?)\)/.exec(cs.transform);
      return m ? +m[1] : 0;
    });
    // Floor halo ellipse near bottom of SVG
    const floorEllipses = [...svg.querySelectorAll('ellipse')].map((el) => {
      const b = el.getBoundingClientRect();
      return { cy: +el.getAttribute('cy'), rx: +el.getAttribute('rx'), ry: +el.getAttribute('ry'), top: b.top, bottom: b.bottom, left: b.left, right: b.right, opacity: +getComputedStyle(el).opacity };
    });
    return {
      progressGuess: progress,
      activeIndexGuess: Math.min(3, Math.floor(progress * 4)),
      expectedIndex,
      lifts,
      viewBox: svg.getAttribute('viewBox'),
      svg: { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom },
      floorEllipses,
      floorProbe: { x: (r.left + r.right) / 2, y: r.bottom - 8 },
      centerProbe: { x: (r.left + r.right) / 2, y: r.top + r.height * 0.35 },
      bgProbe: { x: r.left - 60, y: r.top + r.height * 0.55 },
    };
  }, phase.index);

  const desktopPath = path.join(OUT, `phase-${phase.index}-desktop.png`);
  await page.screenshot({ path: desktopPath, type: 'png' });
  fs.writeFileSync(path.join(OUT, `phase-${phase.index}-meta.json`), JSON.stringify(meta, null, 2));
  console.log(`phase ${phase.index}: p=${meta.progressGuess.toFixed(4)} lifts=${JSON.stringify(meta.lifts)} vb=${meta.viewBox}`);

  // Crop helpers using clip screenshot + optional sharp
  const s = meta.svg;
  const dpr = 2;

  // Lit plate tight crop: estimate plate band from index within SVG
  // plates cy at FIRST_CY + i*GAP in viewBox; VIEW_MIN_Y=-48, VIEW_H=620 now
  const vbParts = (meta.viewBox || '0 -48 320 620').split(/\s+/).map(Number);
  const vbMinY = vbParts[1];
  const vbH = vbParts[3];
  const FIRST_CY = 58;
  const GAP = 110;
  const RY = 32; // approx half-height of flat plate
  const lift = Math.abs(meta.lifts[phase.index] || 0);
  const plateCy = FIRST_CY + phase.index * GAP - lift; // lift is negative in matrix
  // Actually lift from matrix is negative when lifted; cy visual = plateCy + lift (lift already negative)
  const cyCss = ((plateCy - vbMinY) / vbH) * s.height + s.top;
  const plateHalfH = (90 / vbH) * s.height; // generous
  const plateHalfW = (140 / 320) * s.width;

  const litClip = {
    x: Math.max(0, Math.round(s.left + s.width / 2 - plateHalfW)),
    y: Math.max(0, Math.round(cyCss - plateHalfH)),
    width: Math.round(plateHalfW * 2),
    height: Math.round(plateHalfH * 2),
  };
  const litPath = path.join(OUT, `phase-${phase.index}-lit-tight.png`);
  await page.screenshot({ path: litPath, type: 'png', clip: litClip });

  // Floor-focused: under stack bottom, excluding chat bar (~y>860 in 900 viewport)
  const floorY = Math.min(s.bottom + 4, 840);
  const floorClip = {
    x: Math.max(0, Math.round(s.left + s.width * 0.15)),
    y: Math.max(0, Math.round(s.bottom - 70)),
    width: Math.round(s.width * 0.7),
    height: Math.round(Math.min(90, floorY - (s.bottom - 70) + 20)),
  };
  // Ensure floor crop doesn't include chat bar (typically ~860+)
  if (floorClip.y + floorClip.height > 850) {
    floorClip.height = Math.max(40, 850 - floorClip.y);
  }
  const floorPath = path.join(OUT, `phase-${phase.index}-floor-true.png`);
  await page.screenshot({ path: floorPath, type: 'png', clip: floorClip });

  // Full stack crop for context
  const stackClip = {
    x: Math.max(0, Math.round(s.left - 20)),
    y: Math.max(0, Math.round(s.top - 10)),
    width: Math.round(s.width + 40),
    height: Math.round(Math.min(s.height + 40, 850 - (s.top - 10))),
  };
  await page.screenshot({
    path: path.join(OUT, `phase-${phase.index}-stack-crop.png`),
    type: 'png',
    clip: stackClip,
  });

  console.log(`  litClip`, litClip, `floorClip`, floorClip);

  // RGB probes for halo / glass (sample pixels from desktop PNG via sharp if available)
  if (sharp) {
    const img = sharp(desktopPath);
    const { data, info } = await img.raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    const sample = (cssX, cssY) => {
      const x = Math.min(info.width - 1, Math.max(0, Math.round(cssX * dpr)));
      const y = Math.min(info.height - 1, Math.max(0, Math.round(cssY * dpr)));
      const i = (y * info.width + x) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    };
    // floor center under stack vs side bg
    const floorC = sample(meta.floorProbe.x, Math.min(s.bottom + 12, 845));
    const floorC2 = sample(meta.floorProbe.x, Math.min(s.bottom - 20, 830));
    const bg = sample(meta.bgProbe.x, meta.bgProbe.y);
    // lit face center vs edge
    const faceC = sample(s.left + s.width / 2, cyCss);
    const faceE = sample(s.left + s.width / 2 + plateHalfW * 0.55, cyCss);
    const probes = { floorC, floorC2, bg, faceC, faceE, litClip, floorClip };
    fs.writeFileSync(path.join(OUT, `phase-${phase.index}-probes.json`), JSON.stringify(probes, null, 2));
    console.log(`  probes floorC=${floorC} floorC2=${floorC2} bg=${bg} faceC=${faceC} faceE=${faceE}`);
  }
}

await browser.close();
console.log('done →', OUT);
