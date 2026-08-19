import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sharp = require('sharp');

const OUT =
  '/Users/sakshamagrawal/Documents/Startups/Startups/LibertyMD/Execution Files/tickets/P4-11/qa-captures/cycle-2';
const dpr = 2;
const FIRST_CY = 58;
const GAP = 110;
const RX = 104;
const RY = 32;
const DEPTH = 17;
const CX = 160;
const vbMinY = -48;
const vbW = 320;
const vbH = 620;

function sampleRaw(data, info, cssX, cssY) {
  const x = Math.min(info.width - 1, Math.max(0, Math.round(cssX * dpr)));
  const y = Math.min(info.height - 1, Math.max(0, Math.round(cssY * dpr)));
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
}

const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

for (let i = 0; i < 4; i += 1) {
  const meta = JSON.parse(fs.readFileSync(path.join(OUT, `phase-${i}-meta.json`), 'utf8'));
  const s = meta.svg;
  const desktop = path.join(OUT, `phase-${i}-desktop.png`);
  const { data, info } = await sharp(desktop).raw().ensureAlpha().toBuffer({ resolveWithObject: true });

  const plateLift = meta.lifts[i + 1] || 0;
  const plateCy = FIRST_CY + i * GAP + plateLift;
  const toCssX = (vx) => s.left + (vx / vbW) * s.width;
  const toCssY = (vy) => s.top + ((vy - vbMinY) / vbH) * s.height;

  const litLeft = Math.max(0, Math.round(toCssX(CX - RX - 12) * dpr));
  const litTop = Math.max(0, Math.round(toCssY(plateCy - RY - 20) * dpr));
  const litRight = Math.min(info.width, Math.round(toCssX(CX + RX + 12) * dpr));
  const litBottom = Math.min(info.height, Math.round(toCssY(plateCy + RY + DEPTH + 28) * dpr));
  const litW = litRight - litLeft;
  const litH = litBottom - litTop;
  await sharp(desktop)
    .extract({ left: litLeft, top: litTop, width: litW, height: litH })
    .png()
    .toFile(path.join(OUT, `phase-${i}-lit-tight.png`));

  // Bottom of stack geometry + halo band in extra viewBox headroom (exclude chat ~y>850)
  const stackFloorVy = FIRST_CY + 3 * GAP + RY + DEPTH + 8;
  const floorTopCss = Math.min(toCssY(stackFloorVy), 820);
  const floorBotCss = Math.min(toCssY(stackFloorVy + 100), 848);
  const floorLeft = Math.max(0, Math.round(toCssX(CX - RX - 30) * dpr));
  const floorTop = Math.max(0, Math.round(floorTopCss * dpr));
  const floorW = Math.min(info.width - floorLeft, Math.round((toCssX(CX + RX + 30) - toCssX(CX - RX - 30)) * dpr));
  const floorH = Math.max(40, Math.min(info.height - floorTop, Math.round((floorBotCss - floorTopCss) * dpr)));
  await sharp(desktop)
    .extract({ left: floorLeft, top: floorTop, width: floorW, height: floorH })
    .png()
    .toFile(path.join(OUT, `phase-${i}-floor-true.png`));

  const stackLeft = Math.max(0, Math.round((s.left - 10) * dpr));
  const stackTop = Math.max(0, Math.round((s.top - 5) * dpr));
  const stackW = Math.min(info.width - stackLeft, Math.round((s.width + 20) * dpr));
  const stackH = Math.min(info.height - stackTop, Math.round(Math.min(s.height + 10, 848 - s.top) * dpr));
  await sharp(desktop)
    .extract({ left: stackLeft, top: stackTop, width: stackW, height: stackH })
    .png()
    .toFile(path.join(OUT, `phase-${i}-stack-crop.png`));

  // Also a corner zoom on east vertex of lit plate
  const eX = toCssX(CX + RX);
  const eY = toCssY(plateCy);
  const z = 56;
  const zL = Math.max(0, Math.round((eX - z / 2) * dpr));
  const zT = Math.max(0, Math.round((eY - z / 2) * dpr));
  await sharp(desktop)
    .extract({ left: zL, top: zT, width: z * dpr, height: z * dpr })
    .png()
    .toFile(path.join(OUT, `phase-${i}-corner-east.png`));

  const faceC = sampleRaw(data, info, toCssX(CX), toCssY(plateCy));
  const faceE = sampleRaw(data, info, toCssX(CX + RX * 0.72), toCssY(plateCy));
  const wall = sampleRaw(data, info, toCssX(CX + RX * 0.45), toCssY(plateCy + RY + DEPTH * 0.55));
  const floorC = sampleRaw(data, info, toCssX(CX), Math.min(toCssY(stackFloorVy + 40), 845));
  const floorNear = sampleRaw(data, info, toCssX(CX), toCssY(stackFloorVy + 20));
  const bg = sampleRaw(data, info, s.left - 80, s.top + s.height * 0.45);
  let idleThrough = null;
  if (i < 3) {
    const idleCy = FIRST_CY + (i + 1) * GAP;
    idleThrough = sampleRaw(data, info, toCssX(CX), toCssY(idleCy));
  }
  const dFace = Math.hypot(faceC[0] - faceE[0], faceC[1] - faceE[1], faceC[2] - faceE[2]);
  const floorTint = Math.hypot(floorNear[0] - bg[0], floorNear[1] - bg[1], floorNear[2] - bg[2]);
  const probes = {
    faceC,
    faceE,
    wall,
    floorC,
    floorNear,
    bg,
    idleThrough,
    dFace,
    floorTint,
    lumFace: lum(faceC),
    lumWall: lum(wall),
    wallDarker: lum(wall) < lum(faceC) - 8,
  };
  fs.writeFileSync(path.join(OUT, `phase-${i}-probes.json`), JSON.stringify(probes, null, 2));
  console.log(
    `phase ${i}: faceC=${faceC} faceE=${faceE} dFace=${dFace.toFixed(1)} wall=${wall} lumF=${lum(faceC).toFixed(0)} lumW=${lum(wall).toFixed(0)} wallDarker=${probes.wallDarker} floorNear=${floorNear} floorTint=${floorTint.toFixed(1)} bg=${bg}`,
  );
}
