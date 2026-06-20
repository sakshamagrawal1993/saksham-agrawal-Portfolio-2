#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  argValue, evidence, reportSummary, root, writeJson,
} from './health_twin_acceptance_lib.mjs';

const args = process.argv.slice(2);
const runDir = resolve(root, argValue(args, '--run-dir', `.loop/runs/acceptance-${Date.now()}`));
const port = argValue(args, '--port', '4199');
mkdirSync(runDir, { recursive: true });

function run(name, command, commandArgs, options = {}) {
  const completed = spawnSync(command, commandArgs, {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    timeout: options.timeout || 12 * 60_000,
  });
  writeFileSync(resolve(runDir, `${name}.log`), `${completed.stdout || ''}${completed.stderr || ''}`);
  return completed.status ?? 1;
}

const buildStatus = run('build', 'npm', ['run', 'build']);
writeJson(resolve(runDir, 'build.json'), {
  product: 'health-twin',
  testType: 'build',
  summary: reportSummary([evidence('HT-093', buildStatus === 0 ? 'PASS' : 'FAIL', 'Production build passes')]),
  results: [evidence('HT-093', buildStatus === 0 ? 'PASS' : 'FAIL', 'Production build passes', {
    evidenceType: 'build',
    evidence: ['build.log'],
  })],
});

run('contract', 'node', ['scripts/health_twin_contract_test.mjs', '--output', resolve(runDir, 'contract.json')]);
run('edge-contract', 'node', ['scripts/health_twin_edge_contract_test.mjs', '--output', resolve(runDir, 'edge-contract.json')]);
run('acceptance-tests', 'node', ['--test', 'tests/health-twin/acceptance-manifest.test.mjs', 'tests/health-twin/acceptance-automation.test.mjs']);
const normalizerStatus = run('unit-normalizers', 'node', ['--test', 'tests/health-twin/response-normalizers.test.mjs']);
const scoreStatus = run('unit-scores', 'node', ['--test', 'tests/health-twin/score-calculator.test.mjs']);
const unitResults = [
  evidence('HT-043', normalizerStatus === 0 ? 'PASS' : 'FAIL', 'Documented lab response wrappers normalize', {
    evidenceType: 'unit-contract',
    evidence: ['unit-normalizers.log'],
  }),
  evidence('HT-063', normalizerStatus === 0 ? 'PASS' : 'FAIL', 'Documented chat response wrappers normalize', {
    evidenceType: 'unit-contract',
    evidence: ['unit-normalizers.log'],
  }),
  evidence('HT-051', scoreStatus === 0 ? 'PASS' : 'FAIL', 'Score calculator handles ranges and latest readings', {
    evidenceType: 'unit-contract',
    evidence: ['unit-scores.log'],
  }),
];
writeJson(resolve(runDir, 'unit.json'), {
  product: 'health-twin',
  testType: 'unit-contract',
  summary: reportSummary(unitResults),
  results: unitResults,
});
run('acceptance-api', 'node', ['scripts/health_twin_acceptance_api.mjs', '--output', resolve(runDir, 'acceptance-api.json')]);
run('browser', 'node', [
  'scripts/health_twin_browser_smoke.mjs',
  '--output', resolve(runDir, 'browser.json'),
  '--artifacts-dir', resolve(runDir, 'browser'),
  '--port', port,
], { timeout: 15 * 60_000 });

const mergeArgs = [
  'scripts/health_twin_acceptance_report.mjs',
  '--output', resolve(runDir, 'acceptance-complete.json'),
  '--input', resolve(runDir, 'build.json'),
  '--input', resolve(runDir, 'contract.json'),
  '--input', resolve(runDir, 'edge-contract.json'),
  '--input', resolve(runDir, 'unit.json'),
  '--input', resolve(runDir, 'acceptance-api.json'),
  '--input', resolve(runDir, 'browser.json'),
];
const mergeStatus = run('merge', 'node', mergeArgs);
console.log(`Health Twin acceptance evidence: ${resolve(runDir, 'acceptance-complete.json')}`);
process.exit(mergeStatus);
