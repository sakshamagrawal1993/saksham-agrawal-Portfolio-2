#!/usr/bin/env node

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

/**
 * Each check has:
 *   id, description, files, patterns – standard source-contract check
 *   evidenceLevel – 'source' | 'source+unit' | 'browser' | 'api' | 'rls' | 'edge'
 *
 * Source-level checks: PASS means pattern exists in code (necessary, insufficient).
 * Criteria requiring browser/api/rls/edge evidence are labeled NOT_TESTED until
 * an external test run provides that evidence.
 */
const checks = [
  // ── Authentication and twin lifecycle ──────────────────────────────────────
  {
    id: 'HT-001',
    description: 'Unauthenticated users are redirected to login on all three routes',
    evidenceLevel: 'browser',
    files: ['components/HealthTwin/TwinLanding.tsx', 'components/HealthTwin/DashboardLayout.tsx'],
    patterns: ["getSession()", "navigate('/login?redirect=/health-twin')"],
  },
  {
    id: 'HT-002',
    description: 'Authenticated users can create a twin and it is owner-linked',
    evidenceLevel: 'browser+api',
    files: ['components/HealthTwin/TwinLanding.tsx'],
    patterns: [".from('health_twins')", '.insert([', 'user_id: user.id'],
  },
  {
    id: 'HT-003',
    description: 'Users can select and reopen their twins across sessions',
    evidenceLevel: 'browser',
    files: ['components/HealthTwin/TwinLanding.tsx', 'components/HealthTwin/DashboardLayout.tsx'],
    patterns: ['health_twins', 'setActiveTwin'],
  },
  {
    id: 'HT-004',
    description: 'Users cannot access another user\'s private twin (UI+API+Edge)',
    evidenceLevel: 'rls+edge',
    files: [
      'supabase/functions/chat-completion/index.ts',
      'supabase/functions/process-lab-report/index.ts',
      'supabase/functions/generate-wellness/index.ts',
    ],
    patterns: ['verifyTwinOwner', 'Forbidden: twin not found or not owned by caller'],
  },
  {
    id: 'HT-005',
    description: 'Featured twins are visible according to RLS policy',
    evidenceLevel: 'browser+rls',
    files: ['components/HealthTwin/TwinLanding.tsx'],
    patterns: ['featured'],
  },

  // ── Profile ────────────────────────────────────────────────────────────────
  {
    id: 'HT-010',
    description: 'Profile upsert is implemented',
    evidenceLevel: 'browser+api',
    files: ['components/HealthTwin/LeftPanel.tsx'],
    patterns: [".from('health_personal_details')", '.upsert(payload', "onConflict: 'twin_id'"],
  },
  {
    id: 'HT-011',
    description: 'Valid height and weight create a BMI reading',
    evidenceLevel: 'browser+api',
    files: ['components/HealthTwin/LeftPanel.tsx'],
    patterns: ['weight / Math.pow(height / 100, 2)', "parameter_name: 'Body Mass Index (BMI)'"],
  },
  {
    id: 'HT-012',
    description: 'Profile data survives reload',
    evidenceLevel: 'browser+api',
    files: ['components/HealthTwin/DashboardLayout.tsx'],
    patterns: ["from('health_personal_details')", 'setPersonalDetails'],
  },

  // ── Manual health data ─────────────────────────────────────────────────────
  {
    id: 'HT-020',
    description: 'Manual lab and wearable parameter insertion exists',
    evidenceLevel: 'browser+api',
    files: ['components/HealthTwin/LeftPanel.tsx'],
    patterns: ["let targetTable = isWearableCategory ? 'health_wearable_parameters' : 'health_lab_parameters'", '.insert(rowsToInsert)'],
  },
  {
    id: 'HT-021',
    description: 'Users can add vitals and symptoms',
    evidenceLevel: 'browser+api',
    files: ['components/HealthTwin/LeftPanel.tsx'],
    patterns: ['vitals', 'symptoms', 'health_wearable_parameters'],
  },
  {
    id: 'HT-022',
    description: 'Grouped blood pressure input exists',
    evidenceLevel: 'browser+api',
    files: ['components/HealthTwin/LeftPanel.tsx'],
    patterns: ["paramForm.name === 'group_bp'", "'Blood Pressure Systolic'", "'Blood Pressure Diastolic'"],
  },
  {
    id: 'HT-023',
    description: 'Grouped sleep, exercise, and meal input exists',
    evidenceLevel: 'browser+api',
    files: ['components/HealthTwin/LeftPanel.tsx'],
    patterns: ["paramForm.name === 'group_sleep'", "paramForm.name === 'group_exercise'", "paramForm.name === 'group_meal'"],
  },
  {
    id: 'HT-024',
    description: 'New readings trigger score recalculation',
    evidenceLevel: 'source',
    files: ['components/HealthTwin/LeftPanel.tsx'],
    patterns: ['calculateLiveScores()'],
  },

  // ── Wearables ──────────────────────────────────────────────────────────────
  {
    id: 'HT-030',
    description: 'Wearable CSV parsing and preview exist',
    evidenceLevel: 'browser',
    files: ['components/HealthTwin/LeftPanel.tsx'],
    patterns: ['const parseCsv =', 'setWearableCsvPreview(parsed.slice(0, 5))'],
  },
  {
    id: 'HT-031',
    description: 'Wearable CSV rows are persisted',
    evidenceLevel: 'browser+api',
    files: ['components/HealthTwin/LeftPanel.tsx'],
    patterns: [".from('health_wearable_parameters').insert(rows).select()"],
  },
  {
    id: 'HT-032',
    description: 'Invalid CSV produces a user-visible error',
    evidenceLevel: 'source',
    files: ['components/HealthTwin/LeftPanel.tsx'],
    patterns: ['REQUIRED_CSV_COLUMNS', 'missing required columns', 'parameter_name is blank'],
  },
  {
    id: 'HT-033',
    description: 'Imported wearable data survives reload',
    evidenceLevel: 'browser+api',
    files: ['components/HealthTwin/DashboardLayout.tsx'],
    patterns: ["from('health_wearable_parameters')", 'setWearableParameters'],
  },

  // ── Lab-report processing ──────────────────────────────────────────────────
  {
    id: 'HT-040',
    description: 'Lab documents upload to health_documents storage',
    evidenceLevel: 'browser+api',
    files: ['components/HealthTwin/LeftPanel.tsx'],
    patterns: [".storage.from('health_documents').upload", '.createSignedUrl('],
  },
  {
    id: 'HT-041',
    description: 'Upload creates a health_sources processing record',
    evidenceLevel: 'browser+api',
    files: ['components/HealthTwin/LeftPanel.tsx'],
    patterns: ["from('health_sources')", "status: 'processing'"],
  },
  {
    id: 'HT-042',
    description: 'process-lab-report validates JWT and twin/source ownership before n8n call',
    evidenceLevel: 'edge',
    files: ['components/HealthTwin/LeftPanel.tsx', 'supabase/functions/process-lab-report/index.ts'],
    patterns: ["functions.invoke('process-lab-report'", 'verifyTwinOwner', 'verifySourceOwner'],
  },
  {
    id: 'HT-043',
    description: 'Lab response unwrapping handles all documented wrappers',
    evidenceLevel: 'source+unit',
    files: ['components/HealthTwin/LeftPanel.tsx'],
    patterns: ["typeof result === 'string'", 'Array.isArray(parsedResult)', 'inner?.body', 'inner?.output', 'inner?.parameters'],
  },
  {
    id: 'HT-044',
    description: 'Extracted biomarkers are persisted to health_lab_parameters',
    evidenceLevel: 'browser+api',
    files: ['components/HealthTwin/LeftPanel.tsx'],
    patterns: ["from('health_lab_parameters')", '.insert(paramRows)', 'source_id: sourceData.id'],
  },
  {
    id: 'HT-045',
    description: 'Lab processing failures mark the source failed with error',
    evidenceLevel: 'source',
    files: ['components/HealthTwin/LeftPanel.tsx'],
    patterns: ["status: 'failed'", 'processing_error: processingError'],
  },
  {
    id: 'HT-046',
    description: 'Lab re-upload uses unique immutable path — no overwrite semantics',
    evidenceLevel: 'source',
    files: ['components/HealthTwin/LeftPanel.tsx'],
    patterns: ['uploadId', 'upsert: false'],
  },

  // ── Scores and visualizations ──────────────────────────────────────────────
  {
    id: 'HT-050',
    description: 'Parameter definitions and ranges load with dashboard data',
    evidenceLevel: 'browser+api',
    files: ['components/HealthTwin/DashboardLayout.tsx'],
    patterns: [".from('health_parameter_definitions')", ".from('health_parameter_ranges')"],
  },
  {
    id: 'HT-051',
    description: 'Live score calculation is invoked',
    evidenceLevel: 'source+unit',
    files: ['components/HealthTwin/DashboardLayout.tsx', 'store/healthTwin.ts'],
    patterns: ['calculateLiveScores()', 'calculateAxesScores'],
  },
  {
    id: 'HT-052',
    description: 'Overall and category scores render',
    evidenceLevel: 'browser',
    files: ['components/HealthTwin/RightPanel.tsx'],
    patterns: ['scores', 'score'],
  },
  {
    id: 'HT-053',
    description: 'Charts render for all supported health categories',
    evidenceLevel: 'browser',
    files: ['components/HealthTwin/Charts.tsx'],
    patterns: ['ActivityChart', 'VitalsChart', 'SleepChart', 'NutritionChart', 'LabReportsChart'],
  },
  {
    id: 'HT-054',
    description: 'Chart edit modal targets correct table for lab vs wearable rows',
    evidenceLevel: 'source',
    files: ['components/HealthTwin/Charts.tsx'],
    patterns: ['useLabTable', 'tableName', 'health_lab_parameters'],
  },
  {
    id: 'HT-055',
    description: 'Chart delete targets correct table and recalculates scores',
    evidenceLevel: 'source',
    files: ['components/HealthTwin/Charts.tsx'],
    patterns: ['supabase.from(tableName).delete()', 'calculateLiveScores()'],
  },

  // ── Health assistant ───────────────────────────────────────────────────────
  {
    id: 'HT-060',
    description: 'Chat creates or reuses a session ID',
    evidenceLevel: 'browser+api',
    files: ['components/HealthTwin/CenterPanel.tsx'],
    patterns: ['activeChatSessionId || crypto.randomUUID()', 'setActiveChatSessionId(sessionIdToUse)'],
  },
  {
    id: 'HT-061',
    description: 'Chat edge function awaits and persists both user and assistant messages',
    evidenceLevel: 'edge',
    files: ['supabase/functions/chat-completion/index.ts'],
    patterns: ["role: 'user'", "role: 'assistant'", 'health_chat_messages', 'await supabaseAdmin'],
  },
  {
    id: 'HT-062',
    description: 'Chat function validates JWT and twin ownership before n8n call',
    evidenceLevel: 'edge',
    files: ['supabase/functions/chat-completion/index.ts'],
    patterns: ['requireAuth', 'verifyTwinOwner', 'twin_id'],
  },
  {
    id: 'HT-063',
    description: 'Chat response wrappers are normalized',
    evidenceLevel: 'source+unit',
    files: ['supabase/functions/chat-completion/index.ts'],
    patterns: ['Array.isArray(parsedResult)', 'assistant_reply', 'output', 'JSON.parse(trimmed)'],
  },
  {
    id: 'HT-064',
    description: 'Service failure produces a safe user-visible error in the chat UI',
    evidenceLevel: 'browser',
    files: ['components/HealthTwin/CenterPanel.tsx'],
    patterns: ['system', 'error', 'isChatLoading'],
  },
  {
    id: 'HT-065',
    description: 'Chat session isolation: session cannot be reused across twins',
    evidenceLevel: 'edge+rls',
    files: ['supabase/functions/chat-completion/index.ts'],
    patterns: ['verifySessionOwner', 'Forbidden: session belongs to a different twin'],
  },

  // ── Wellness ───────────────────────────────────────────────────────────────
  {
    id: 'HT-070',
    description: 'Valid cached programs load without regeneration',
    evidenceLevel: 'browser+api',
    files: ['components/HealthTwin/DashboardLayout.tsx'],
    patterns: [".from('health_wellness_programs')", ".gt('expires_at'"],
  },
  {
    id: 'HT-071',
    description: 'Missing programs trigger generation; function uses correct column names',
    evidenceLevel: 'source',
    files: ['components/HealthTwin/DashboardLayout.tsx', 'supabase/functions/generate-wellness/index.ts'],
    patterns: ["functions/v1/generate-wellness", 'wellnessData.data.length === 0', 'parameter_value,unit,recorded_at'],
  },
  {
    id: 'HT-072',
    description: 'Refresh regenerates programs via force_refresh flag',
    evidenceLevel: 'source',
    files: ['components/HealthTwin/WellnessPrograms.tsx', 'supabase/functions/generate-wellness/index.ts'],
    patterns: ['force_refresh: true', 'force_refresh'],
  },
  {
    id: 'HT-073',
    description: 'Wellness generation failure does not crash the dashboard',
    evidenceLevel: 'browser',
    files: ['components/HealthTwin/DashboardLayout.tsx', 'components/HealthTwin/WellnessPrograms.tsx'],
    patterns: ['catch', 'setIsLoadingWellness(false)'],
  },

  // ── Playground ─────────────────────────────────────────────────────────────
  {
    id: 'HT-080',
    description: 'Playground initializes from active twin real data',
    evidenceLevel: 'browser',
    files: ['components/HealthTwin/Playground/PlaygroundLayout.tsx'],
    patterns: ['initializeBaseline(baseline, baselineScores)', 'labParameters', 'wearableParameters', 'personalDetails'],
  },
  {
    id: 'HT-081',
    description: 'Parameter changes recalculate simulated scores',
    evidenceLevel: 'source+unit',
    files: ['components/HealthTwin/Playground/PlaygroundLayout.tsx'],
    patterns: ['recalculateScores(parameterDefinitions, parameterRanges)', '[parameters, parameterDefinitions, parameterRanges'],
  },
  {
    id: 'HT-082',
    description: 'Reset restores baseline and clears simulation wellness state',
    evidenceLevel: 'source',
    files: ['store/playgroundStore.ts', 'components/HealthTwin/Playground/PlaygroundLayout.tsx'],
    patterns: ['onClick={resetToBaseline}', "wellnessPrograms: []", "simulationSummary: ''"],
  },
  {
    id: 'HT-083',
    description: 'Simulation does not mutate real health data; playground function requires auth',
    evidenceLevel: 'source',
    files: ['supabase/functions/generate-wellness-playground/index.ts', 'supabase/functions/playground-wellness/index.ts'],
    patterns: ['requireAuth', 'isAuthError'],
  },
  {
    id: 'HT-084',
    description: 'Simulated inputs update wellness guidance via playground edge function',
    evidenceLevel: 'browser',
    files: ['store/playgroundStore.ts'],
    patterns: ['generate-wellness-playground', 'playground_state', 'computed_scores'],
  },
  {
    id: 'HT-085',
    description: 'No nonfunctional save-scenario controls are presented',
    evidenceLevel: 'source',
    files: [
      'components/HealthTwin/Playground/PlaygroundLayout.tsx',
      'components/HealthTwin/Playground/PlaygroundWellnessPanel.tsx',
      'components/HealthTwin/Playground/PlaygroundInputPanel.tsx',
    ],
    patterns: ['Recalculate Scores'],
    absentPatterns: ['Save Scenario', 'Save this Simulation Profile', 'Save & Recalculate'],
  },

  // ── Security and reliability ───────────────────────────────────────────────
  {
    id: 'HT-090',
    description: 'RLS policies and service-role auth exist for all Health Twin tables',
    evidenceLevel: 'rls',
    files: ['scripts/rls_e2e_smoke.sql', 'supabase/migrations/20260529090000_rls_e2e_regression_fixes.sql'],
    patterns: ['smoke_twin', 'featured_health_details_visible_to_other_user', 'health_daily_aggregates'],
  },
  {
    id: 'HT-091',
    description: 'Storage objects are owner-scoped with auth.uid() paths',
    evidenceLevel: 'rls',
    files: ['components/HealthTwin/LeftPanel.tsx'],
    patterns: ['userName', 'activeTwinId', 'uploadId'],
  },
  {
    id: 'HT-092',
    description: 'Edge-function secrets never reach the browser bundle',
    evidenceLevel: 'source',
    files: ['supabase/functions/_shared/healthTwinAuth.ts'],
    patterns: ["Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')"],
  },
  {
    id: 'HT-093',
    description: 'Production build passes',
    evidenceLevel: 'build',
    files: ['package.json'],
    patterns: ['"build": "vite build"'],
  },
  {
    id: 'HT-094',
    description: 'Tested flows produce no unexpected browser console/network errors',
    evidenceLevel: 'browser',
    files: ['scripts/health_twin_browser_smoke.mjs'],
    patterns: ['consoleErrors', 'networkErrors', 'base-url'],
  },
  {
    id: 'HT-095',
    description: 'Publication occurs only after completion; no GitHub push/PR/merge',
    evidenceLevel: 'source',
    files: ['AGENTS.md'],
    patterns: ['git push', 'gh pr create', 'Deploy the five Health Twin Supabase Edge Functions', 'GitHub publication remains prohibited'],
  },
];

// Evidence levels that require more than source-code presence to achieve PASS.
// These are reported as NOT_TESTED when the relevant external test hasn't run.
const BROWSER_EVIDENCE_LEVELS = new Set(['browser', 'browser+api', 'browser+rls', 'rls', 'rls+edge', 'edge', 'edge+rls', 'build']);

const results = checks.map((check) => {
  const missingFiles = (check.files || []).filter((file) => !existsSync(resolve(root, file)));
  const combined = missingFiles.length === 0
    ? (check.files || []).map((file) => read(file)).join('\n')
    : '';
  const missingPatterns = (check.patterns || []).filter((pattern) => !combined.includes(pattern));
  const foundAbsentPatterns = (check.absentPatterns || []).filter((p) => combined.includes(p));

  const sourceOk = missingFiles.length === 0 && missingPatterns.length === 0 && foundAbsentPatterns.length === 0;

  let status;
  if (!sourceOk) {
    status = 'FAIL';
  } else if (BROWSER_EVIDENCE_LEVELS.has(check.evidenceLevel)) {
    // Source wiring is present but the evidence level requires browser/API/RLS proof.
    status = 'NOT_TESTED';
  } else {
    status = 'PASS';
  }

  return {
    id: check.id,
    description: check.description,
    evidenceLevel: check.evidenceLevel,
    status,
    missingFiles,
    missingPatterns,
    foundAbsentPatterns,
    evidenceType: 'source-contract',
  };
});

const report = {
  product: 'health-twin',
  generatedAt: new Date().toISOString(),
  testType: 'source-contract',
  summary: {
    passed: results.filter((r) => r.status === 'PASS').length,
    notTested: results.filter((r) => r.status === 'NOT_TESTED').length,
    failed: results.filter((r) => r.status === 'FAIL').length,
    total: results.length,
  },
  caveat: 'PASS = source wiring + unit/contract evidence. NOT_TESTED = source wiring present but browser/API/RLS evidence is required and has not run this iteration (EPERM sandbox). FAIL = source wiring is missing or broken.',
  results,
};

const output = argValue('--output', '');
if (output) {
  const outputPath = resolve(root, output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(report, null, 2));
}

for (const result of results) {
  const icon = result.status === 'PASS' ? '✓' : result.status === 'NOT_TESTED' ? '?' : '✗';
  console.log(`[${result.status}] ${icon} ${result.id}  ${result.description}`);
  if (result.missingFiles.length) console.log(`  Missing files: ${result.missingFiles.join(', ')}`);
  if (result.missingPatterns.length) console.log(`  Missing patterns: ${result.missingPatterns.join(', ')}`);
  if (result.foundAbsentPatterns.length) console.log(`  Should-be-absent patterns found: ${result.foundAbsentPatterns.join(', ')}`);
}

console.log(`\nContract summary: ${report.summary.passed} PASS / ${report.summary.notTested} NOT_TESTED / ${report.summary.failed} FAIL  (${report.summary.total} total)`);
process.exit(report.summary.failed === 0 ? 0 : 1);
