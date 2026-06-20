#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  acceptanceIds,
  argValue,
  reportSummary,
  root,
  writeJson,
} from './health_twin_acceptance_lib.mjs';

const args = process.argv.slice(2);
const output = argValue(args, '--output', '');

const checks = new Map([
  ['HT-024', {
    files: ['components/HealthTwin/LeftPanel.tsx'],
    patterns: ['calculateLiveScores()'],
  }],
  ['HT-032', {
    files: ['components/HealthTwin/LeftPanel.tsx'],
    patterns: ['REQUIRED_CSV_COLUMNS', 'recorded_at or timestamp', 'parameter_name is blank'],
  }],
  ['HT-043', {
    files: ['components/HealthTwin/LeftPanel.tsx', 'lib/healthTwin/labExtraction.ts'],
    patterns: ['normalizeLabParameterRows', 'extractLabParameterCandidates'],
  }],
  ['HT-045', {
    files: ['components/HealthTwin/LeftPanel.tsx', 'lib/healthTwin/labExtraction.ts'],
    patterns: ["status: 'failed'", 'processing_error: processingError', 'returned no biomarkers'],
  }],
  ['HT-046', {
    files: ['components/HealthTwin/LeftPanel.tsx'],
    patterns: ['uploadId', 'upsert: false'],
  }],
  ['HT-051', {
    files: ['store/healthTwin.ts', 'utils/scoreCalculator.ts'],
    patterns: ['calculateLiveScores', 'calculateAxesScores'],
  }],
  ['HT-054', {
    files: ['components/HealthTwin/Charts.tsx'],
    patterns: ['useLabTable', 'tableName', 'health_lab_parameters'],
  }],
  ['HT-055', {
    files: ['components/HealthTwin/Charts.tsx'],
    patterns: ['supabase.from(tableName).delete()', 'calculateLiveScores()'],
  }],
  ['HT-061', {
    files: ['supabase/functions/chat-completion/index.ts'],
    patterns: ['assistantMsgErr', 'Failed to persist assistant message', 'status: 500'],
  }],
  ['HT-062', {
    files: ['supabase/functions/chat-completion/index.ts'],
    patterns: ['requireAuth', 'verifyTwinOwner', 'personal_details_snapshot: personalDetails'],
  }],
  ['HT-063', {
    files: [
      'supabase/functions/chat-completion/index.ts',
      'supabase/functions/_shared/healthTwinChatResponse.ts',
    ],
    patterns: ['normalizeHealthTwinChatResponse', 'assistant_reply'],
  }],
  ['HT-065', {
    files: [
      'supabase/functions/chat-completion/index.ts',
      '../n8n-workflows/definitions/health-twin-chat__QmbwB8UJcN8PNbrd.json',
    ],
    patterns: [
      'verifySessionOwner',
      'N8N_HEALTH_TWIN_CHAT_WEBHOOK_SECRET',
      '"authentication": "headerAuth"',
    ],
  }],
  ['HT-071', {
    files: ['supabase/functions/generate-wellness/index.ts'],
    patterns: ['parameter_value,unit,recorded_at'],
  }],
  ['HT-072', {
    files: [
      'components/HealthTwin/WellnessPrograms.tsx',
      'supabase/functions/generate-wellness/index.ts',
    ],
    patterns: ['force_refresh: true', 'force_refresh'],
  }],
  ['HT-080', {
    files: [
      'components/HealthTwin/Playground/PlaygroundLayout.tsx',
      'components/HealthTwin/Playground/playgroundBaselineMapper.ts',
    ],
    patterns: ['mapRealDataToPlaygroundBaseline', 'latestByKey'],
  }],
  ['HT-081', {
    files: ['components/HealthTwin/Playground/PlaygroundLayout.tsx'],
    patterns: ['recalculateScores(parameterDefinitions, parameterRanges)'],
  }],
  ['HT-082', {
    files: ['store/playgroundStore.ts'],
    patterns: ["wellnessPrograms: []", "simulationSummary: ''"],
  }],
  ['HT-083', {
    files: [
      'supabase/functions/generate-wellness-playground/index.ts',
      'supabase/functions/playground-wellness/index.ts',
    ],
    patterns: ['requireAuth', 'isAuthError'],
  }],
  ['HT-085', {
    files: [
      'components/HealthTwin/Playground/PlaygroundLayout.tsx',
      'components/HealthTwin/Playground/PlaygroundWellnessPanel.tsx',
      'components/HealthTwin/Playground/PlaygroundInputPanel.tsx',
    ],
    patterns: ['Recalculate Scores'],
    absentPatterns: ['Save Scenario', 'Save this Simulation Profile', 'Save & Recalculate'],
  }],
  ['HT-092', {
    files: ['supabase/functions/_shared/healthTwinAuth.ts'],
    patterns: ["Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')"],
  }],
  ['HT-095', {
    files: ['AGENTS.md', 'scripts/health_twin_loop.mjs'],
    patterns: ['GitHub publication remains prohibited', 'No commit, git push, pull request, or merge was performed.'],
  }],
]);

function evaluate(id) {
  const check = checks.get(id);
  if (!check) {
    return {
      id,
      status: 'NOT_TESTED',
      description: 'This criterion requires browser, API, RLS, storage, build, or live Edge evidence.',
      evidenceType: 'source-contract',
      evidence: [],
      detail: 'No source-only PASS is permitted for this criterion.',
    };
  }

  const missingFiles = check.files.filter((file) => !existsSync(resolve(root, file)));
  const source = missingFiles.length
    ? ''
    : check.files.map((file) => readFileSync(resolve(root, file), 'utf8')).join('\n');
  const missingPatterns = check.patterns.filter((pattern) => !source.includes(pattern));
  const forbiddenPatterns = (check.absentPatterns || []).filter((pattern) => source.includes(pattern));
  const passed = missingFiles.length === 0
    && missingPatterns.length === 0
    && forbiddenPatterns.length === 0;

  return {
    id,
    status: passed ? 'PASS' : 'FAIL',
    description: passed
      ? 'Required source wiring is present.'
      : 'Required source wiring is missing or contradicted.',
    evidenceType: 'source-contract',
    evidence: check.files,
    detail: JSON.stringify({ missingFiles, missingPatterns, forbiddenPatterns }),
  };
}

const results = acceptanceIds.map(evaluate);
const report = {
  product: 'health-twin',
  generatedAt: new Date().toISOString(),
  testType: 'source-contract',
  summary: reportSummary(results),
  results,
};

if (output) writeJson(output, report);
for (const result of results) {
  console.log(`[${result.status}] ${result.id} ${result.description}`);
}
console.log(`Contract coverage: ${report.summary.passed}/${report.summary.total} PASS; ${report.summary.failed} FAIL; ${report.summary.notTested} NOT_TESTED`);
process.exit(report.summary.failed > 0 ? 1 : 0);
