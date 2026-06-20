#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const config = readJson(resolve(root, '.loop/config.json'));
const HARD_MAXIMUM_ITERATIONS = 3;
const requestedIterations = Number(argValue('--max-iterations', String(config.maximumIterations || HARD_MAXIMUM_ITERATIONS)));
const maximumIterations = Math.min(requestedIterations, HARD_MAXIMUM_ITERATIONS);
const runId = argValue('--run-id', new Date().toISOString().replace(/[:.]/g, '-'));
const runRootRelative = `.loop/runs/${runId}`;
const runRoot = resolve(root, runRootRelative);
const publicationAllowed = config.publishCommandsAllowed && !args.includes('--no-publish');
const implementerTimeoutMs = Number(
  process.env.HEALTH_TWIN_CLAUDE_TIMEOUT_MS
  || config.claudeTimeoutMs
  || 90 * 60 * 1000,
);
const statePath = resolve(root, '.loop/STATE.json');
const codexBin = process.env.CODEX_BIN
  || (existsSync('/Applications/Codex.app/Contents/Resources/codex')
    ? '/Applications/Codex.app/Contents/Resources/codex'
    : 'codex');
const claudeBin = process.env.CLAUDE_BIN || 'claude';

function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function updateState(patch) {
  const current = existsSync(statePath)
    ? readJson(statePath)
    : readJson(resolve(root, '.loop/STATE.example.json'));
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  writeJson(statePath, next);
  return next;
}

function addStateFailure(status, message) {
  const current = existsSync(statePath)
    ? readJson(statePath)
    : readJson(resolve(root, '.loop/STATE.example.json'));
  updateState({
    status,
    failedCriteria: [...new Set([...(current.failedCriteria || []), message])],
  });
}

function run(label, command, commandArgs, logPath, options = {}) {
  console.log(`\n=== ${label} ===`);
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    env: { ...process.env, CI: '1' },
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    timeout: options.timeoutMs || 45 * 60 * 1000,
  });
  const log = [
    `started_at=${startedAt}`,
    `command=${command} ${commandArgs.map(shellDisplay).join(' ')}`,
    `exit_code=${result.status ?? 'null'}`,
    '',
    '--- stdout ---',
    result.stdout || '',
    '',
    '--- stderr ---',
    result.stderr || '',
    result.error ? `\n--- process error ---\n${result.error.stack || result.error}` : '',
  ].join('\n');
  writeFileSync(logPath, log);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return { ok: result.status === 0, status: result.status, error: result.error };
}

function shellDisplay(value) {
  return /\s/.test(value) ? JSON.stringify(value) : value;
}

function safeReadJson(path, fallback) {
  try {
    return readJson(path);
  } catch {
    return fallback;
  }
}

function isNonEmptyFile(path) {
  return existsSync(path) && readFileSync(path, 'utf8').trim().length > 0;
}

function validJsonArtifact(path, validator) {
  if (!isNonEmptyFile(path)) return false;
  try {
    return validator(readJson(path));
  } catch {
    return false;
  }
}

function validEvidenceReport(path, expectedTotal = null) {
  return validJsonArtifact(path, (report) => (
    report
    && Array.isArray(report.results)
    && report.results.length > 0
    && (!expectedTotal || report.results.length === expectedTotal)
    && report.summary
    && Number(report.summary.total) === report.results.length
  ));
}

function validReview(path) {
  return validJsonArtifact(path, (review) => (
    typeof review.blocking === 'boolean'
    && typeof review.summary === 'string'
    && Array.isArray(review.findings)
  ));
}

function validCompletion(path) {
  return validJsonArtifact(path, (completion) => (
    typeof completion.complete === 'boolean'
    && ['COMPLETE', 'ITERATE', 'STOP_INCOMPLETE'].includes(completion.decision)
    && typeof completion.summary === 'string'
    && Array.isArray(completion.failedCriteria)
    && Array.isArray(completion.blockedCriteria)
    && Array.isArray(completion.nextActions)
  ));
}

function iterationContext(iteration) {
  const priorDirectories = [];
  for (let number = 1; number < iteration; number += 1) {
    priorDirectories.push(resolve(runRoot, `iteration-${number}`));
  }
  return priorDirectories.filter(existsSync);
}

if (!Number.isInteger(requestedIterations) || requestedIterations < 1) {
  throw new Error('--max-iterations must be a positive integer');
}

mkdirSync(runRoot, { recursive: true });
updateState({
  runId,
  runRoot: runRootRelative,
  maximumIterations,
  hardMaximumIterations: HARD_MAXIMUM_ITERATIONS,
  status: 'STARTING',
  completion: false,
  failedCriteria: [],
});

let finalDecision = 'STOP_INCOMPLETE';

for (let iteration = 1; iteration <= maximumIterations; iteration += 1) {
  const relativeIterationDir = `${runRootRelative}/iteration-${iteration}`;
  const iterationDir = resolve(root, relativeIterationDir);
  mkdirSync(iterationDir, { recursive: true });
  const previous = iterationContext(iteration);

  updateState({
    iteration,
    status: 'PLANNING',
    lastArtifactDirectory: relativeIterationDir,
  });

  const planPath = resolve(iterationDir, 'plan.md');
  const plannerLastPath = resolve(iterationDir, 'planner-last.md');
  const plannerPrompt = [
    read('.loop/prompts/plan.md'),
    '',
    `This is iteration ${iteration} of ${maximumIterations}.`,
    `Write the plan to: ${planPath}`,
    previous.length ? `Prior artifact directories:\n${previous.join('\n')}` : 'There are no prior iterations.',
  ].join('\n');
  const planner = run(
    'Codex planner',
    codexBin,
    [
      '--ask-for-approval', 'never',
      '--cd', root,
      '--add-dir', config.n8nRepository,
      'exec',
      '--sandbox', 'workspace-write',
      '--output-last-message', plannerLastPath,
      plannerPrompt,
    ],
    resolve(iterationDir, 'planner.log'),
  );
  if (!planner.ok || !isNonEmptyFile(planPath)) {
    writeJson(resolve(iterationDir, 'failure.json'), {
      stage: 'PLANNING',
      exitCode: planner.status,
      reason: 'Planner failed or did not produce a non-empty plan.',
    });
    addStateFailure('PLANNER_FAILED', 'Planner failed or did not produce a non-empty plan.');
    continue;
  }

  updateState({ status: 'IMPLEMENTING' });
  const implementationPath = resolve(iterationDir, 'implementation.md');
  const latestReview = previous.map((directory) => resolve(directory, 'review.json')).filter(existsSync).at(-1);
  const latestCompletion = previous.map((directory) => resolve(directory, 'completion.json')).filter(existsSync).at(-1);
  const latestQa = previous.map((directory) => resolve(directory, 'browser-qa.json')).filter(existsSync).at(-1);
  const implementPrompt = [
    read('.loop/prompts/implement.md'),
    '',
    `Current plan: ${planPath}`,
    latestReview ? `Latest review: ${latestReview}` : 'No prior review exists.',
    latestCompletion ? `Latest completion report: ${latestCompletion}` : 'No prior completion report exists.',
    latestQa ? `Latest browser QA: ${latestQa}` : 'No prior browser QA exists.',
    `Health Twin n8n definitions are limited to:\n${resolve(config.n8nRepository, 'definitions/health-twin-chat__QmbwB8UJcN8PNbrd.json')}\n${resolve(config.n8nRepository, 'definitions/lab-report-processing__9GaGrmxlOtPD3PDm.json')}`,
    `Write the implementation report to: ${implementationPath}`,
  ].join('\n');
  const implementer = run(
    'Claude implementer',
    claudeBin,
    [
      '--print',
      '--add-dir', config.n8nRepository,
      '--permission-mode', 'auto',
      '--max-budget-usd', String(process.env.HEALTH_TWIN_CLAUDE_BUDGET_USD || config.claudeBudgetUsdPerIteration || 20),
      implementPrompt,
    ],
    resolve(iterationDir, 'implementer.log'),
    { timeoutMs: implementerTimeoutMs },
  );
  if (!isNonEmptyFile(implementationPath)) {
    writeFileSync(
      implementationPath,
      `# Implementation process result\n\nClaude exit code: ${implementer.status}\n\nSee implementer.log.\n`,
    );
  }
  if (!implementer.ok) {
    writeJson(resolve(iterationDir, 'failure.json'), {
      stage: 'IMPLEMENTING',
      exitCode: implementer.status,
      reason: 'Claude implementer failed.',
    });
    addStateFailure('IMPLEMENTER_FAILED', 'Claude implementer failed.');
    continue;
  }

  updateState({ status: 'REVIEWING' });
  const reviewPath = resolve(iterationDir, 'review.json');
  const reviewer = run(
    'Codex independent review',
    codexBin,
    [
      '--ask-for-approval', 'never',
      '--cd', root,
      '--add-dir', config.n8nRepository,
      'exec', 'review',
      '--base', config.baseBranch || 'main',
      '--output-schema', resolve(root, '.loop/schemas/review.schema.json'),
      '--output-last-message', reviewPath,
    ],
    resolve(iterationDir, 'reviewer.log'),
  );
  if (!reviewer.ok || !validReview(reviewPath)) {
    writeJson(reviewPath, {
      blocking: true,
      summary: 'The independent review command failed or returned invalid structured output. See reviewer.log.',
      findings: [],
    });
  }

  updateState({ status: 'TESTING' });
  const build = run(
    'Production build',
    'npm',
    ['run', 'build'],
    resolve(iterationDir, 'build.log'),
    { timeoutMs: 20 * 60 * 1000 },
  );
  const contractPath = resolve(iterationDir, 'contract-qa.json');
  const contract = run(
    'Health Twin contract QA',
    'node',
    ['scripts/health_twin_contract_test.mjs', '--output', contractPath],
    resolve(iterationDir, 'contract-qa.log'),
    { timeoutMs: 10 * 60 * 1000 },
  );
  const contractArtifactValid = validEvidenceReport(contractPath, 52);
  const browserPath = resolve(iterationDir, 'browser-qa.json');
  const browserArtifacts = resolve(iterationDir, 'browser');
  const browser = run(
    'Health Twin browser QA',
    'node',
    [
      'scripts/health_twin_browser_smoke.mjs',
      '--output', browserPath,
      '--artifacts-dir', browserArtifacts,
      '--port', String(4174 + iteration),
    ],
    resolve(iterationDir, 'browser-qa.log'),
    { timeoutMs: 20 * 60 * 1000 },
  );
  const browserArtifactValid = validEvidenceReport(browserPath);
  writeJson(resolve(iterationDir, 'command-results.json'), {
    build: { ok: build.ok, exitCode: build.status },
    contract: {
      ok: contract.ok && contractArtifactValid,
      exitCode: contract.status,
      artifactValid: contractArtifactValid,
    },
    browser: {
      ok: browser.ok && browserArtifactValid,
      exitCode: browser.status,
      artifactValid: browserArtifactValid,
    },
  });

  updateState({ status: 'CHECKING_COMPLETION' });
  const completionPath = resolve(iterationDir, 'completion.json');
  const completionPrompt = [
    read('.loop/prompts/complete.md'),
    '',
    `Iteration: ${iteration} of ${maximumIterations}`,
    `Plan: ${planPath}`,
    `Implementation report: ${implementationPath}`,
    `Review: ${reviewPath}`,
    `Build log: ${resolve(iterationDir, 'build.log')}`,
    `Contract QA: ${contractPath}`,
    `Browser QA: ${browserPath}`,
    `Command results: ${resolve(iterationDir, 'command-results.json')}`,
    `Health Twin n8n definitions:\n${resolve(config.n8nRepository, 'definitions/health-twin-chat__QmbwB8UJcN8PNbrd.json')}\n${resolve(config.n8nRepository, 'definitions/lab-report-processing__9GaGrmxlOtPD3PDm.json')}`,
  ].join('\n');
  const checker = run(
    'Codex completion checker',
    codexBin,
    [
      '--ask-for-approval', 'never',
      '--cd', root,
      '--add-dir', config.n8nRepository,
      'exec',
      '--sandbox', 'read-only',
      '--output-schema', resolve(root, '.loop/schemas/completion.schema.json'),
      '--output-last-message', completionPath,
      completionPrompt,
    ],
    resolve(iterationDir, 'completion.log'),
  );
  const completionOutputValid = checker.ok && validCompletion(completionPath);
  const completion = completionOutputValid
    ? readJson(completionPath)
    : {
      complete: false,
      decision: iteration === maximumIterations ? 'STOP_INCOMPLETE' : 'ITERATE',
      summary: 'Completion checker failed or returned invalid structured output.',
      failedCriteria: [],
      blockedCriteria: ['No valid independent completion decision was produced.'],
      nextActions: ['Inspect completion.log and rerun within the three-iteration cap.'],
    };
  if (!completionOutputValid) writeJson(completionPath, completion);

  updateState({
    status: completion.complete ? 'COMPLETE' : completion.decision,
    completion: Boolean(completion.complete),
    failedCriteria: [...(completion.failedCriteria || []), ...(completion.blockedCriteria || [])],
  });

  console.log(`\nCompletion decision: ${completion.decision}`);
  console.log(completion.summary);

  if (completion.complete || completion.decision === 'COMPLETE') {
    finalDecision = 'COMPLETE';
    break;
  }
  if (completion.decision === 'STOP_INCOMPLETE') {
    finalDecision = 'STOP_INCOMPLETE';
    break;
  }
  finalDecision = iteration === maximumIterations ? 'STOP_INCOMPLETE' : 'ITERATE';
}

if (finalDecision !== 'COMPLETE') {
  updateState({ status: 'STOP_INCOMPLETE', completion: false });
} else if (publicationAllowed) {
  updateState({ status: 'PUBLISHING', completion: true });
  const publicationDir = resolve(root, '.loop/runs/publication');
  mkdirSync(publicationDir, { recursive: true });
  const publication = run(
    'Vercel, Supabase, and n8n publication',
    'node',
    ['scripts/health_twin_publish.mjs', '--output', resolve(publicationDir, 'publication.json')],
    resolve(publicationDir, 'publication.log'),
    { timeoutMs: 60 * 60 * 1000 },
  );
  updateState({
    status: publication.ok ? 'PUBLISHED' : 'PUBLICATION_FAILED',
    publicationComplete: publication.ok,
  });
  finalDecision = publication.ok ? 'PUBLISHED' : 'PUBLICATION_FAILED';
}

console.log(`\nHealth Twin loop finished: ${finalDecision}`);
console.log(`Run artifacts: ${runRootRelative}`);
if (config.publishCommandsAllowed && !publicationAllowed) {
  console.log('Publication was disabled for this run.');
}
console.log('No commit, git push, pull request, or merge was performed.');
process.exit(['COMPLETE', 'PUBLISHED'].includes(finalDecision) ? 0 : 2);
