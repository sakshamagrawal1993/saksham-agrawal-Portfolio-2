#!/usr/bin/env node
/**
 * Design-token guard (Layer 4 of DESIGN-SYSTEM-BLUEPRINT.md).
 *
 * Fails when source code hardcodes a raw hex color or px value instead of a
 * design token. Zero dependencies — runs in CI, pre-commit, or `npm run`.
 *
 *   node design-system/scripts/check-design-tokens.mjs               # strict: exit 1 on ANY violation
 *   node design-system/scripts/check-design-tokens.mjs --warn        # report but always exit 0
 *   node design-system/scripts/check-design-tokens.mjs --ratchet     # brownfield: fail only if count > baseline
 *   node design-system/scripts/check-design-tokens.mjs --update-baseline  # freeze current count as the new ceiling
 *
 * Brownfield repos (thousands of existing raw values) should adopt --ratchet:
 * run --update-baseline once to freeze today's count, wire CI to --ratchet, and the
 * number can only go DOWN. New hardcoded values fail the build; cleanup lowers the bar.
 *
 * Escape hatches (for legitimate raw values — gradients, canvas art, SVG logos):
 *   - add the file/glob to ALLOWLIST_GLOBS below, or
 *   - put `design-ok` in a comment on the same line: style={{fill:'#2563EB'}} // design-ok
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const WARN_ONLY = process.argv.includes('--warn');
const RATCHET = process.argv.includes('--ratchet');
const UPDATE_BASELINE = process.argv.includes('--update-baseline');
const BASELINE_FILE = join(ROOT, 'design-system', '.design-guard-baseline.json');

// Directories to scan for hand-written UI code.
const SCAN_DIRS = ['components', 'src', 'context'];
// Individual root files worth scanning.
const SCAN_FILES = ['App.tsx', 'constants.ts'];
const SCAN_EXT = new Set(['.tsx', '.ts', '.jsx', '.js']);

// Never scan these — they ARE the source of truth for raw values, or third-party.
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.next', 'coverage', 'ui']);
//                                                                              ^ components/ui = shadcn generated

// Files/patterns allowed to contain raw hex/px (logos, 3D/particle canvas, generated art).
const ALLOWLIST_GLOBS = [
  /components\/LibertyMD\/.*(Logo|Blob|Particle|Silhouette|Wave|Badge).*\.tsx$/i,
  /\.stories\.(t|j)sx?$/,
  /\.test\.(t|j)sx?$/,
];

// Patterns that are violations.
const HEX = /#[0-9a-fA-F]{3,8}\b/;                 // #fff, #2563EB, #2563EBff
const PX  = /(?<![\w.-])\d{1,4}px\b/;              // 13px, 240px  (not var names)

// Lines we should not flag even if they contain a match.
const IGNORE_LINE = [
  /design-ok/,                                     // explicit escape hatch
  /https?:\/\//,                                   // urls
  /^\s*\/\//,                                      // // line comment
  /^\s*\/?\*/,                                      // /* , /** , or * continuation (block/JSDoc)
];

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const full = join(dir, name);
    let s; try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      walk(full, out);
    } else if (SCAN_EXT.has(extname(name))) {
      out.push(full);
    }
  }
  return out;
}

function collectFiles() {
  const files = [];
  for (const d of SCAN_DIRS) walk(join(ROOT, d), files);
  for (const f of SCAN_FILES) {
    const full = join(ROOT, f);
    try { if (statSync(full).isFile()) files.push(full); } catch { /* missing, skip */ }
  }
  return files.filter((f) => {
    const rel = relative(ROOT, f).replace(/\\/g, '/');
    return !ALLOWLIST_GLOBS.some((re) => re.test(rel));
  });
}

function scanFile(file) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const lines = readFileSync(file, 'utf8').split('\n');
  const hits = [];
  lines.forEach((line, i) => {
    if (IGNORE_LINE.some((re) => re.test(line))) return;
    const hex = line.match(HEX);
    const px = line.match(PX);
    if (hex) hits.push({ rel, ln: i + 1, kind: 'hex', match: hex[0], line: line.trim() });
    if (px) hits.push({ rel, ln: i + 1, kind: 'px', match: px[0], line: line.trim() });
  });
  return hits;
}

const files = collectFiles();
const violations = files.flatMap(scanFile);
const count = violations.length;

// --update-baseline: freeze the current count and exit.
if (UPDATE_BASELINE) {
  writeFileSync(BASELINE_FILE, JSON.stringify({ count, updated: new Date().toISOString() }, null, 2) + '\n');
  console.log(`✓ design-guard: baseline frozen at ${count} violations → ${relative(ROOT, BASELINE_FILE)}`);
  console.log('  Wire CI to `--ratchet`; the number can now only go down.');
  process.exit(0);
}

if (count === 0) {
  console.log(`✓ design-guard: no raw hex/px found in ${files.length} scanned files.`);
  process.exit(0);
}

// Print the violations (capped so CI logs stay readable).
console.log(`\ndesign-guard found ${count} raw value(s) that should be tokens:\n`);
const byFile = {};
for (const v of violations) (byFile[v.rel] ??= []).push(v);
let shown = 0;
for (const [rel, hits] of Object.entries(byFile)) {
  if (shown >= 60) { console.log(`  … and more (${count - shown} additional).`); break; }
  console.log(`  ${rel}`);
  for (const h of hits) {
    if (shown++ >= 60) break;
    const snippet = h.line.length > 80 ? h.line.slice(0, 77) + '…' : h.line;
    console.log(`    ${h.ln}:  ${h.kind.toUpperCase()} ${h.match}   ${snippet}`);
  }
  console.log('');
}
console.log('Fix: replace with a token from design-system/design-tokens.json');
console.log('(Tailwind class or CSS var). Add the token first if it is missing.');
console.log('Legitimate raw value? add `design-ok` to the line or allowlist the file.\n');

// --ratchet: compare to baseline; fail only if the count went UP.
if (RATCHET) {
  const baseline = existsSync(BASELINE_FILE)
    ? JSON.parse(readFileSync(BASELINE_FILE, 'utf8')).count ?? Infinity
    : Infinity;
  if (count > baseline) {
    console.log(`✗ ratchet: ${count} > baseline ${baseline}. This change ADDS ${count - baseline} raw value(s). Use tokens instead.`);
    process.exit(1);
  }
  if (count < baseline) {
    console.log(`✓ ratchet: ${count} ≤ baseline ${baseline}. Nice — down ${baseline - count}. Run --update-baseline to lock in the gain.`);
  } else {
    console.log(`✓ ratchet: ${count} = baseline ${baseline}. No new violations.`);
  }
  process.exit(0);
}

process.exit(WARN_ONLY ? 0 : 1);
