#!/usr/bin/env node
/**
 * L0-7 / P0-02a — keep the LibertyMD hive-off cheap.
 *
 * Decision 2026-07-30: LibertyMD and Dr. Jivi stay two products, and LibertyMD
 * will be hived off. Coupling is cheap to add and expensive to remove, so this
 * asserts the boundary rather than trusting convention.
 *
 * Checks:
 *   1. Zero foreign keys from libertymd_* tables to non-libertymd tables.
 *      (Verified zero on 2026-07-30 — this asserts it stays zero.)
 *   2. libertymd-care-proxy imports nothing from ai-care-proxy, and vice versa.
 *   3. The LibertyMD proxy calls only libertymd-* n8n webhooks.
 *
 * Usage:
 *   node scripts/libertymd-separability-check.mjs            # static checks only
 *   node scripts/libertymd-separability-check.mjs --with-db  # adds the FK check
 *
 * The FK check needs SUPABASE_DB_URL. Without --with-db it is reported as
 * SKIPPED rather than silently passing — a check that quietly checks nothing is
 * worse than no check.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const withDb = process.argv.includes('--with-db')
const failures = []
const results = []

async function readIfExists(p) {
  try { return await fs.readFile(p, 'utf8') } catch { return null }
}

async function walk(dir) {
  const out = []
  let entries
  try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...await walk(full))
    else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) out.push(full)
  }
  return out
}

// ---------------------------------------------------------------- check 1: FKs
const FK_QUERY = `
select tc.table_name as from_table, kcu.column_name, ccu.table_name as to_table
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
join information_schema.constraint_column_usage ccu on tc.constraint_name = ccu.constraint_name
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_name like 'libertymd%'
  and ccu.table_name not like 'libertymd%';`

if (!withDb) {
  results.push({ check: 'cross_product_foreign_keys', status: 'SKIPPED', note: 'run with --with-db and SUPABASE_DB_URL' })
} else if (!process.env.SUPABASE_DB_URL) {
  failures.push('--with-db was passed but SUPABASE_DB_URL is not set')
  results.push({ check: 'cross_product_foreign_keys', status: 'FAIL', note: 'SUPABASE_DB_URL missing' })
} else {
  const { default: pg } = await import('pg')
  const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
  await client.connect()
  const { rows } = await client.query(FK_QUERY)
  await client.end()
  if (rows.length > 0) {
    failures.push(`${rows.length} cross-product foreign key(s) found: `
      + rows.map((r) => `${r.from_table}.${r.column_name} -> ${r.to_table}`).join(', '))
  }
  results.push({ check: 'cross_product_foreign_keys', status: rows.length === 0 ? 'PASS' : 'FAIL', found: rows })
}

// ------------------------------------------------ check 2: no proxy cross-imports
const proxies = [
  ['libertymd-care-proxy', 'ai-care-proxy'],
  ['ai-care-proxy', 'libertymd-care-proxy'],
]
const crossImports = []
for (const [self, other] of proxies) {
  const files = await walk(path.join(root, 'supabase', 'functions', self))
  for (const file of files) {
    const src = await fs.readFile(file, 'utf8')
    const hits = [...src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)]
      .map((m) => m[1])
      .filter((spec) => spec.includes(other))
    if (hits.length) crossImports.push({ file: path.relative(root, file), imports: hits })
  }
}
if (crossImports.length) {
  failures.push(`proxy cross-imports found: ${crossImports.map((c) => c.file).join(', ')}`)
}
results.push({
  check: 'no_proxy_cross_imports',
  status: crossImports.length === 0 ? 'PASS' : 'FAIL',
  found: crossImports,
})

// --------------------------------------- check 3: LibertyMD calls only its own n8n
// Webhook URLs are env-configured, so scanning for inline URLs proves nothing.
// The real mechanism is the env var name, so that is what we assert.
// Verified 2026-07-30: LibertyMD uses LIBERTYMD_*_WEBHOOK, ai-care uses N8N_*_WEBHOOK.
// Zero overlap. A LibertyMD file reading an N8N_* webhook var means the products
// have been wired together.
const proxyFiles = await walk(path.join(root, 'supabase', 'functions', 'libertymd-care-proxy'))
const foreignWebhooks = []
const webhookVars = new Set()
for (const file of proxyFiles) {
  const src = await fs.readFile(file, 'utf8')
  for (const m of src.matchAll(/Deno\.env\.get\(\s*['"]([A-Z0-9_]+)['"]\s*\)/g)) {
    const name = m[1]
    if (!/WEBHOOK/.test(name)) continue
    webhookVars.add(name)
    if (!name.startsWith('LIBERTYMD_')) {
      foreignWebhooks.push({ file: path.relative(root, file), env: name, reason: 'webhook var not LIBERTYMD_-prefixed' })
    }
  }
  // Any hardcoded non-libertymd webhook URL is also a violation.
  for (const m of src.matchAll(/['"`]([^'"`]*\/(?:webhook|webhook-test)\/[^'"`]+)['"`]/g)) {
    if (!m[1].includes('libertymd')) {
      foreignWebhooks.push({ file: path.relative(root, file), url: m[1], reason: 'hardcoded foreign webhook URL' })
    }
  }
}
if (webhookVars.size === 0) {
  failures.push('no webhook env vars found in the LibertyMD proxy — the check found nothing to verify, '
    + 'which means either the wiring moved or this check is now blind')
}
if (foreignWebhooks.length) {
  failures.push(`LibertyMD proxy references non-libertymd n8n endpoints: ${JSON.stringify(foreignWebhooks)}`)
}
results.push({
  check: 'libertymd_calls_own_workflows_only',
  status: foreignWebhooks.length === 0 && webhookVars.size > 0 ? 'PASS' : 'FAIL',
  webhookVarsFound: [...webhookVars].sort(),
  found: foreignWebhooks,
})

// ------------------------------------------------------------------------ report
const checksRun = results.filter((r) => r.status !== 'SKIPPED').length
console.log(JSON.stringify({ results, checksRun, failures, passed: failures.length === 0 }, null, 2))

if (checksRun === 0) {
  console.error('FAIL: no checks actually ran — a check that checks nothing is worse than no check')
  process.exit(1)
}
if (failures.length) {
  console.error(`\nFAIL: ${failures.length} separability violation(s). `
    + 'These make the future LibertyMD hive-off more expensive — see tickets/DECISIONS.md.')
  process.exit(1)
}
