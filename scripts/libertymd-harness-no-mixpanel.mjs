#!/usr/bin/env node
/**
 * P2-01 AC7 — clinical regression harness must not pollute Mixpanel /
 * production product events.
 *
 * Import / string ban only on evaluation / policy / simulations / contracts
 * entrypoints. Does not instantiate lib/mixpanel.ts, hit live Mixpanel, or
 * insert libertymd_product_events.
 *
 * Usage:
 *   node scripts/libertymd-harness-no-mixpanel.mjs
 *   npm run test:libertymd:harness-no-mixpanel
 */

import { readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')

/** Harness entrypoints only — not Mixpanel product tests or proxy telemetry. */
const ENTRYPOINTS = [
  'scripts/libertymd-clinical-evaluation.ts',
  'scripts/libertymd-contract-validation.mjs',
  'scripts/libertymd-run-simulations.mjs',
  'scripts/libertymd-flow-simulation.ts',
  'tests/libertymd/clinical-policy.test.ts',
]

/** Case-insensitive substring bans (import / HTTP / product-event fan-out). */
const FORBIDDEN = [
  { id: 'mixpanel', re: /mixpanel/i },
  { id: 'api.mixpanel.com', re: /api\.mixpanel\.com/i },
  { id: 'addProductEvent', re: /addProductEvent/ },
]

function scanFile(rel) {
  const full = join(ROOT, rel)
  let st
  try {
    st = statSync(full)
  } catch {
    return [{ rel, ln: 0, match: '(missing)', line: `entrypoint not found: ${rel}` }]
  }
  if (!st.isFile()) {
    return [{ rel, ln: 0, match: '(not a file)', line: rel }]
  }
  const lines = readFileSync(full, 'utf8').split('\n')
  const hits = []
  lines.forEach((line, i) => {
    for (const ban of FORBIDDEN) {
      if (ban.re.test(line)) {
        hits.push({
          rel,
          ln: i + 1,
          match: ban.id,
          line: line.trim().slice(0, 160),
        })
      }
    }
  })
  return hits
}

const violations = ENTRYPOINTS.flatMap(scanFile)

if (violations.length === 0) {
  console.log(
    `✓ libertymd-harness-no-mixpanel: no Mixpanel / addProductEvent references in ${ENTRYPOINTS.length} harness entrypoints.`,
  )
  process.exit(0)
}

console.error(
  `✗ libertymd-harness-no-mixpanel: ${violations.length} forbidden reference(s) in clinical harness:`,
)
for (const v of violations) {
  console.error(`  ${v.rel}:${v.ln}  [${v.match}]  →  ${v.line}`)
}
console.error(
  'Clinical evaluation / policy / simulations / contracts must not emit to Mixpanel or product events (P2-01 AC7).',
)
process.exit(1)
