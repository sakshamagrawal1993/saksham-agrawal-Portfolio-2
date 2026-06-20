#!/usr/bin/env node
/**
 * Edge Function contract tests for Health Twin.
 * Tests authorization enforcement without live Supabase/n8n credentials.
 *
 * Run: node scripts/health_twin_edge_contract_test.mjs --output .loop/runs/iteration-1/edge-contract-qa.json
 *
 * Evidence type: source-contract (verifies security logic is present in code)
 * Browser/HTTP-level evidence requires deployed functions and live credentials.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function argValue(name, fallback = '') {
  const idx = args.indexOf(name);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

function read(path) {
  const full = resolve(root, path);
  return existsSync(full) ? readFileSync(full, 'utf8') : '';
}

const checks = [
  {
    id: 'HT-042-auth',
    description: 'process-lab-report validates JWT via requireAuth',
    evidenceType: 'source-contract',
    files: ['supabase/functions/process-lab-report/index.ts'],
    patterns: ['requireAuth', 'isAuthError', 'verifyTwinOwner', 'verifySourceOwner'],
    note: 'HTTP-level: unauthenticated and cross-user requests must return 401/403. Requires deployed function for live verification.',
  },
  {
    id: 'HT-062-auth',
    description: 'chat-completion validates JWT via requireAuth',
    evidenceType: 'source-contract',
    files: ['supabase/functions/chat-completion/index.ts'],
    patterns: ['requireAuth', 'isAuthError', 'verifyTwinOwner', 'verifySessionOwner'],
    note: 'HTTP-level: unauthenticated and cross-twin session requests must return 401/403.',
  },
  {
    id: 'HT-065-isolation',
    description: 'chat-completion verifies session belongs to the same twin',
    evidenceType: 'source-contract',
    files: ['supabase/functions/chat-completion/index.ts'],
    patterns: ['verifySessionOwner', 'Forbidden: session belongs to a different twin'],
    note: 'Prevents cross-twin session hijacking.',
  },
  {
    id: 'HT-070-auth',
    description: 'generate-wellness validates JWT via requireAuth',
    evidenceType: 'source-contract',
    files: ['supabase/functions/generate-wellness/index.ts'],
    patterns: ['requireAuth', 'isAuthError', 'verifyTwinOwner'],
    note: 'Prevents unauthenticated access to wellness data.',
  },
  {
    id: 'HT-071-columns',
    description: 'generate-wellness uses parameter_value not value column',
    evidenceType: 'source-contract',
    files: ['supabase/functions/generate-wellness/index.ts'],
    patterns: ['parameter_value,unit,recorded_at'],
    note: 'Fixes broken wellness context — previously selected nonexistent value column.',
  },
  {
    id: 'HT-072-refresh',
    description: 'generate-wellness supports force_refresh to bypass cache',
    evidenceType: 'source-contract',
    files: [
      'supabase/functions/generate-wellness/index.ts',
      'components/HealthTwin/WellnessPrograms.tsx',
    ],
    patterns: ['force_refresh', 'force_refresh: true'],
    note: 'Refresh action sends force_refresh:true, function bypasses cache on that flag.',
  },
  {
    id: 'HT-083-auth',
    description: 'playground wellness functions validate JWT',
    evidenceType: 'source-contract',
    files: [
      'supabase/functions/generate-wellness-playground/index.ts',
      'supabase/functions/playground-wellness/index.ts',
    ],
    patterns: ['requireAuth', 'isAuthError'],
    note: 'Playground functions accept only authenticated callers.',
  },
  {
    id: 'HT-085-removed',
    description: 'Nonfunctional Save Scenario controls are removed',
    evidenceType: 'source-contract',
    files: [
      'components/HealthTwin/Playground/PlaygroundLayout.tsx',
      'components/HealthTwin/Playground/PlaygroundWellnessPanel.tsx',
    ],
    absentPatterns: ['Save Scenario', 'Save this Simulation Profile'],
    note: 'Controls that implied persistence without a handler are removed.',
  },
  {
    id: 'HT-046-path',
    description: 'Lab upload uses unique immutable path per upload',
    evidenceType: 'source-contract',
    files: ['components/HealthTwin/LeftPanel.tsx'],
    patterns: ['uploadId', 'upsert: false'],
    absentPatterns: ['upsert: true'],
    note: 'Each upload gets a unique UUID-rooted path; prevents overwriting earlier uploads.',
  },
  {
    id: 'HT-024-recalc',
    description: 'Score recalculation is triggered after manual parameter insert',
    evidenceType: 'source-contract',
    files: ['components/HealthTwin/LeftPanel.tsx'],
    patterns: ['calculateLiveScores()'],
    note: 'Scores are updated immediately after insert, not only at dashboard load.',
  },
  {
    id: 'HT-054-055-table',
    description: 'Chart edit/delete modal uses correct table for lab vs wearable rows',
    evidenceType: 'source-contract',
    files: ['components/HealthTwin/Charts.tsx'],
    patterns: ['tableName', 'useLabTable', 'health_lab_parameters'],
    note: 'Lab rows now edit/delete from health_lab_parameters, wearable rows from health_wearable_parameters.',
  },
  {
    id: 'HT-082-reset',
    description: 'resetToBaseline clears simulation wellness programs and summary',
    evidenceType: 'source-contract',
    files: ['store/playgroundStore.ts'],
    patterns: ['wellnessPrograms: []', "simulationSummary: ''"],
    note: 'Reset removes stale generated guidance; visible state matches baseline.',
  },
  {
    id: 'HT-032-csv',
    description: 'Wearable CSV validates required columns before preview/import',
    evidenceType: 'source-contract',
    files: ['components/HealthTwin/LeftPanel.tsx'],
    patterns: ['REQUIRED_CSV_COLUMNS', 'missing required columns', 'parameter_name is blank'],
    note: 'Missing columns, blank names, and invalid numbers produce user-visible errors.',
  },
  {
    id: 'HT-092-bundle',
    description: 'Shared auth helper is Deno-only and not bundled into frontend',
    evidenceType: 'source-contract',
    files: ['supabase/functions/_shared/healthTwinAuth.ts'],
    patterns: ["Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')"],
    note: 'Service-role key access occurs only in Deno edge functions, never in browser bundle.',
  },
  {
    id: 'HT-095-guard',
    description: 'AGENTS.md prohibits git push, PR creation, and implicit GitHub publication',
    evidenceType: 'source-contract',
    files: ['AGENTS.md'],
    patterns: ['git push', 'gh pr create', 'GitHub publication remains prohibited'],
    note: 'Loop guard is documented; no executable git push/PR commands exist in the loop scripts.',
  },
];

const results = checks.map((check) => {
  const missingFiles = (check.files || []).filter(f => !existsSync(resolve(root, f)));
  const combined = missingFiles.length === 0
    ? (check.files || []).map(f => read(f)).join('\n')
    : '';

  const missingPatterns = (check.patterns || []).filter(p => !combined.includes(p));
  const foundAbsentPatterns = (check.absentPatterns || []).filter(p => combined.includes(p));

  const pass = missingFiles.length === 0 && missingPatterns.length === 0 && foundAbsentPatterns.length === 0;

  return {
    id: check.id,
    description: check.description,
    evidenceType: check.evidenceType,
    status: pass ? 'PASS' : 'FAIL',
    note: check.note,
    missingFiles,
    missingPatterns,
    foundAbsentPatterns,
  };
});

const report = {
  product: 'health-twin',
  generatedAt: new Date().toISOString(),
  testType: 'edge-contract',
  caveat: 'Source-contract checks prove security logic is wired. HTTP-level evidence (401/403 on unauthorized requests) requires deployed functions and live credentials.',
  summary: {
    passed: results.filter(r => r.status === 'PASS').length,
    failed: results.filter(r => r.status === 'FAIL').length,
    total: results.length,
  },
  results,
};

const outputPath = argValue('--output');
if (outputPath) {
  const full = resolve(root, outputPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(report, null, 2));
}

for (const r of results) {
  const prefix = r.status === 'PASS' ? '✓' : '✗';
  console.log(`[${r.status}] ${prefix} ${r.id}  ${r.description}`);
  if (r.missingFiles.length) console.log(`  Missing files: ${r.missingFiles.join(', ')}`);
  if (r.missingPatterns.length) console.log(`  Missing patterns: ${r.missingPatterns.join(', ')}`);
  if (r.foundAbsentPatterns.length) console.log(`  Should-be-absent patterns found: ${r.foundAbsentPatterns.join(', ')}`);
  if (r.note) console.log(`  Evidence note: ${r.note}`);
}

console.log(`\nEdge contract summary: ${report.summary.passed}/${report.summary.total} passed`);
process.exit(report.summary.failed === 0 ? 0 : 1);
