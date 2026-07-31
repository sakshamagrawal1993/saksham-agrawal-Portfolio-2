#!/usr/bin/env node
/**
 * P0-09 — ban native browser dialogs on LibertyMD live UI sources.
 *
 * Fails non-zero when a forbidden call site appears under
 * components/LibertyMD/ (live .ts / .tsx sources only).
 *
 * Call sites only (never bare substring "alert" — preserve role="alert"):
 *   alert(  confirm(  prompt(
 *   window.alert(  window.confirm(  window.prompt(
 *
 * Skips: path segments starting with ".", "*.bak" / "*pre-*.bak", "/backup/".
 *
 * Usage:
 *   node scripts/libertymd-no-native-dialogs.mjs
 *   npm run test:libertymd:no-native-dialogs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SCAN_ROOT = join(ROOT, 'components', 'LibertyMD')
const SCAN_EXT = new Set(['.ts', '.tsx'])

/** Call-site patterns only — no space before `(`; preserves role="alert" and English "prompt (". */
const FORBIDDEN = /(?<![A-Za-z.$])(?:window\.)?(?:alert|confirm|prompt)\(/g

function shouldSkipPath(relPosix) {
  const parts = relPosix.split('/')
  if (parts.some((p) => p.startsWith('.'))) return true
  if (relPosix.includes('/backup/')) return true
  const base = parts[parts.length - 1] || ''
  if (base.endsWith('.bak')) return true
  if (/pre-.*\.bak$/i.test(base) || /\.pre-.*\.bak$/i.test(base)) return true
  return false
}

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    const rel = relative(ROOT, full).replace(/\\/g, '/')
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.')) continue
      if (entry.name === 'backup') continue
      walk(full, out)
      continue
    }
    if (!SCAN_EXT.has(extname(entry.name))) continue
    if (shouldSkipPath(rel)) continue
    out.push(full)
  }
  return out
}

function scanFile(file) {
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  const lines = readFileSync(file, 'utf8').split('\n')
  const hits = []
  lines.forEach((line, i) => {
    FORBIDDEN.lastIndex = 0
    let m
    while ((m = FORBIDDEN.exec(line)) !== null) {
      hits.push({
        rel,
        ln: i + 1,
        match: m[0].trim(),
        line: line.trim(),
      })
    }
  })
  return hits
}

let scanRootOk = false
try {
  scanRootOk = statSync(SCAN_ROOT).isDirectory()
} catch {
  scanRootOk = false
}

if (!scanRootOk) {
  console.error(`✗ libertymd-no-native-dialogs: missing scan root ${relative(ROOT, SCAN_ROOT)}`)
  process.exit(1)
}

const files = walk(SCAN_ROOT)
const violations = files.flatMap(scanFile)

if (violations.length === 0) {
  console.log(
    `✓ libertymd-no-native-dialogs: no native dialog call sites in ${files.length} LibertyMD live sources.`,
  )
  process.exit(0)
}

console.error(
  `✗ libertymd-no-native-dialogs: ${violations.length} forbidden native-dialog call site(s):`,
)
for (const v of violations) {
  console.error(`  ${v.rel}:${v.ln}  ${v.match}  →  ${v.line.slice(0, 120)}`)
}
console.error(
  'LibertyMD UI must use inline technical chrome (P0-16), not alert/confirm/prompt.',
)
process.exit(1)
