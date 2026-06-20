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
const loopDir = '.loop-mind-coach';
const args = process.argv.slice(2);
const config = readJson(resolve(root, `${loopDir}/config.json`));
const statePath = resolve(root, `${loopDir}/STATE.json`);
const goalPlanDir = resolve(root, `${loopDir}/runs/goal-plan`);
const planningContractPath = resolve(goalPlanDir, 'planning-contract.json');
const claudeBin = process.env.CLAUDE_BIN || 'claude';
const agyBin = process.env.AGY_BIN
  || process.env.ANTIGRAVITY_BIN
  || (existsSync(`${process.env.HOME}/.local/bin/agy`)
    ? `${process.env.HOME}/.local/bin/agy`
    : 'agy');

function agyLoopEnv() {
  return {
    AGY_BIN: agyBin,
    PATH: `${process.env.HOME}/.local/bin:${process.env.PATH || ''}`,
  };
}

function runAntigravityAgent(label, promptFile, logPath, options = {}) {
  const agentArgs = [
    'scripts/mind_coach_antigravity_agent.mjs',
    '--prompt-file', promptFile,
    '--log', logPath,
  ];
  if (options.jsonOutput) {
    agentArgs.push('--json-output', options.jsonOutput);
  }
  return run(
    label,
    'node',
    agentArgs,
    logPath.replace(/\.log$/, '-wrapper.log'),
    {
      timeoutMs: options.timeoutMs || 50 * 60 * 1000,
      env: agyLoopEnv(),
    },
  );
}
const goalPlanOnly = args.includes('--goal-plan-only');
const approveGoalPlan = args.includes('--approve-goal-plan');
const maximumIterations = Number(argValue('--max-iterations', String(config.maximumIterations || 3)));

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
    : readJson(resolve(root, `${loopDir}/STATE.example.json`));
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  writeJson(statePath, next);
  return next;
}

function run(label, command, commandArgs, logPath, options = {}) {
  console.log(`\n=== ${label} ===`);
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    env: { ...process.env, CI: '1', ...(options.env || {}) },
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

function n8nFilesList() {
  return (config.n8nWorkflowFiles || []).map((file) => resolve(config.n8nRepository, file)).join('\n');
}

function iterationContext(iterationNumber) {
  const priorDirectories = [];
  for (let number = 1; number < iterationNumber; number += 1) {
    priorDirectories.push(resolve(root, `${loopDir}/runs/iteration-${number}`));
  }
  return priorDirectories.filter(existsSync);
}

function isGoalPlanApproved() {
  if (!existsSync(planningContractPath)) return false;
  const contract = safeReadJson(planningContractPath, { approved: false });
  const state = safeReadJson(statePath, { goalPlanApproved: false });
  return Boolean(contract.approved && state.goalPlanApproved);
}

async function runGoalPlanPhase() {
  mkdirSync(goalPlanDir, { recursive: true });
  updateState({ status: 'GOAL_PLANNING', goalPlanApproved: false });

  const goalPlanPath = resolve(goalPlanDir, 'goal-plan.md');
  const scopePath = resolve(goalPlanDir, 'scope.md');
  const baselinePath = resolve(goalPlanDir, 'baseline-qa.json');

  const contractBaseline = run(
    'Mind Coach contract baseline',
    'node',
    ['scripts/mind_coach_contract_test.mjs', '--output', baselinePath],
    resolve(goalPlanDir, 'contract-baseline.log'),
    { timeoutMs: 10 * 60 * 1000 },
  );

  const plannerPrompt = [
    read(`${loopDir}/prompts/goal-plan.md`),
    '',
    `Write goal-plan.md to: ${goalPlanPath}`,
    `Write scope.md to: ${scopePath}`,
    `Write planning-contract.json to: ${planningContractPath}`,
    `Baseline contract QA: ${baselinePath} (exit ${contractBaseline.status})`,
    `Mind Coach n8n definitions (read-only):\n${n8nFilesList()}`,
    `Maximum iterations for this run: ${maximumIterations}`,
  ].join('\n');

  const plannerPromptPath = resolve(goalPlanDir, 'planner-prompt.txt');
  writeFileSync(plannerPromptPath, plannerPrompt);

  const planner = runAntigravityAgent(
    'Antigravity goal planner',
    plannerPromptPath,
    resolve(goalPlanDir, 'planner.log'),
    { timeoutMs: 50 * 60 * 1000 },
  );

  if (!existsSync(planningContractPath)) {
    writeJson(planningContractPath, {
      approved: false,
      acceptanceIds: [
        'MC-050', 'MC-053', 'MC-052', 'MC-081', 'MC-040', 'MC-042',
      ],
      maxIterations: maximumIterations,
      n8nWorkflowIds: config.n8nWorkflowIds || [],
      edgeFunctions: config.supabaseFunctions || [],
      summary: planner.ok
        ? 'Antigravity did not write planning-contract.json; controller seeded defaults.'
        : 'Goal planner failed; inspect planner.log.',
    });
  }

  updateState({
    status: 'AWAITING_SCOPE_APPROVAL',
    goalPlanApproved: false,
    lastArtifactDirectory: `${loopDir}/runs/goal-plan`,
  });

  console.log('\nGoal plan phase finished.');
  console.log(`Review ${goalPlanPath} and ${scopePath}`);
  console.log('Approve with: npm run mind-coach:approve-goal-plan');
  process.exit(planner.ok ? 0 : 2);
}

if (approveGoalPlan) {
  if (!existsSync(planningContractPath)) {
    throw new Error('Missing planning-contract.json; run npm run mind-coach:goal-plan first.');
  }
  const contract = readJson(planningContractPath);
  contract.approved = true;
  writeJson(planningContractPath, contract);
  updateState({ status: 'GOAL_PLAN_APPROVED', goalPlanApproved: true });
  console.log('Goal plan approved. Run npm run mind-coach:loop to start iterations.');
  process.exit(0);
}

if (goalPlanOnly) {
  await runGoalPlanPhase();
}

if (!isGoalPlanApproved()) {
  console.log('Goal plan not approved. Running Phase 0 first...');
  await runGoalPlanPhase();
}

if (!Number.isInteger(maximumIterations) || maximumIterations < 1 || maximumIterations > 10) {
  throw new Error('--max-iterations must be an integer between 1 and 10');
}

const contract = readJson(planningContractPath);
const iterationCap = Math.min(maximumIterations, contract.maxIterations || maximumIterations);

updateState({
  maximumIterations: iterationCap,
  status: 'STARTING',
  completion: false,
  failedCriteria: [],
});

let finalDecision = 'STOP_INCOMPLETE';

for (let iteration = 1; iteration <= iterationCap; iteration += 1) {
  const relativeIterationDir = `${loopDir}/runs/iteration-${iteration}`;
  const iterationDir = resolve(root, relativeIterationDir);
  mkdirSync(iterationDir, { recursive: true });
  const previous = iterationContext(iteration);

  updateState({
    iteration,
    status: 'PLANNING',
    lastArtifactDirectory: relativeIterationDir,
  });

  const planPath = resolve(iterationDir, 'plan.md');
  const plannerPrompt = [
    read(`${loopDir}/prompts/plan.md`),
    '',
    `Approved planning contract: ${planningContractPath}`,
    `Target acceptance IDs: ${(contract.acceptanceIds || []).join(', ')}`,
    `This is iteration ${iteration} of ${iterationCap}.`,
    `Write the plan to: ${planPath}`,
    previous.length ? `Prior artifact directories:\n${previous.join('\n')}` : 'There are no prior iterations.',
  ].join('\n');
  const plannerPromptPath = resolve(iterationDir, 'planner-prompt.txt');
  writeFileSync(plannerPromptPath, plannerPrompt);
  const planner = runAntigravityAgent(
    'Antigravity planner',
    plannerPromptPath,
    resolve(iterationDir, 'planner.log'),
    { timeoutMs: 50 * 60 * 1000 },
  );
  if (!planner.ok || !existsSync(planPath)) {
    updateState({ status: 'PLANNER_FAILED' });
    continue;
  }

  updateState({ status: 'IMPLEMENTING' });
  const implementationPath = resolve(iterationDir, 'implementation.md');
  const implementPromptPath = resolve(iterationDir, 'implement-prompt.txt');
  const latestReview = previous.map((directory) => resolve(directory, 'review.json')).filter(existsSync).at(-1);
  const latestCompletion = previous.map((directory) => resolve(directory, 'completion.json')).filter(existsSync).at(-1);
  const latestBrowser = previous.map((directory) => resolve(directory, 'browser-qa.json')).filter(existsSync).at(-1);
  const implementPrompt = [
    read(`${loopDir}/prompts/implement.md`),
    '',
    `Current plan: ${planPath}`,
    latestReview ? `Latest review: ${latestReview}` : 'No prior review exists.',
    latestCompletion ? `Latest completion report: ${latestCompletion}` : 'No prior completion report exists.',
    latestBrowser ? `Latest browser QA: ${latestBrowser}` : 'No prior browser QA exists.',
    `Mind Coach n8n definitions are limited to:\n${n8nFilesList()}`,
    `Write the implementation report to: ${implementationPath}`,
  ].join('\n');
  writeFileSync(implementPromptPath, implementPrompt);

  const implementer = run(
    'Cursor implementer',
    'node',
    [
      'scripts/mind_coach_cursor_implement.mjs',
      '--prompt-file', implementPromptPath,
      '--output', implementationPath,
      '--log', resolve(iterationDir, 'implementer.log'),
    ],
    resolve(iterationDir, 'implementer-wrapper.log'),
  );
  if (!existsSync(implementationPath)) {
    writeFileSync(
      implementationPath,
      `# Implementation process result\n\nImplementer exit code: ${implementer.status}\n\nSee implementer.log.\n`,
    );
  }

  updateState({ status: 'REVIEWING' });
  const reviewPath = resolve(iterationDir, 'review.json');
  const reviewPromptPath = resolve(iterationDir, 'review-prompt.txt');
  const reviewPrompt = [
    read(`${loopDir}/prompts/review.md`),
    '',
    `Plan: ${planPath}`,
    `Implementation report: ${implementationPath}`,
    `Acceptance contract: docs/mind-coach/ACCEPTANCE.md`,
    `Planning contract: ${planningContractPath}`,
    `Write review JSON to: ${reviewPath}`,
    `Schema: ${resolve(root, `${loopDir}/schemas/review.schema.json`)}`,
  ].join('\n');
  writeFileSync(reviewPromptPath, reviewPrompt);

  const reviewer = run(
    'Claude independent review',
    claudeBin,
    [
      '--print',
      '--permission-mode', 'plan',
      '--add-dir', config.n8nRepository,
      '--max-budget-usd', String(process.env.MIND_COACH_CLAUDE_BUDGET_USD || config.claudeBudgetUsdPerIteration || 20),
      reviewPrompt,
    ],
    resolve(iterationDir, 'reviewer.log'),
  );
  if (!existsSync(reviewPath)) {
    const raw = readFileSync(resolve(iterationDir, 'reviewer.log'), 'utf8');
    const jsonMatch = raw.match(/\{[\s\S]*"findings"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        writeFileSync(reviewPath, JSON.stringify(JSON.parse(jsonMatch[0]), null, 2));
      } catch {
        writeJson(reviewPath, {
          blocking: true,
          summary: 'Claude review output was not valid JSON.',
          findings: [],
        });
      }
    } else if (!reviewer.ok) {
      writeJson(reviewPath, {
        blocking: true,
        summary: 'The independent review command failed. See reviewer.log.',
        findings: [],
      });
    }
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
  const contractQa = run(
    'Mind Coach contract QA',
    'node',
    ['scripts/mind_coach_contract_test.mjs', '--output', contractPath],
    resolve(iterationDir, 'contract-qa.log'),
    { timeoutMs: 10 * 60 * 1000 },
  );
  const browserPath = resolve(iterationDir, 'browser-qa.json');
  const browserArtifacts = resolve(iterationDir, 'browser');
  const browser = run(
    'Mind Coach browser QA',
    'node',
    [
      'scripts/mind_coach_browser_smoke.mjs',
      '--output', browserPath,
      '--artifacts-dir', browserArtifacts,
      '--port', String(4184 + iteration),
    ],
    resolve(iterationDir, 'browser-qa.log'),
    { timeoutMs: 20 * 60 * 1000 },
  );

  const antigravityPath = resolve(iterationDir, 'antigravity-qa.json');
  const browserQaPromptPath = resolve(iterationDir, 'browser-qa-prompt.txt');
  const browserQaPrompt = [
    read(`${loopDir}/prompts/browser-qa.md`),
    '',
    `Base URL: http://127.0.0.1:${4184 + iteration} (or start npm run preview on that port)`,
    `Artifacts directory: ${browserArtifacts}`,
    `Output JSON path: ${antigravityPath}`,
    `Target acceptance IDs: ${(contract.acceptanceIds || []).join(', ')}`,
    `Scope: ${resolve(goalPlanDir, 'scope.md')}`,
  ].join('\n');
  writeFileSync(browserQaPromptPath, browserQaPrompt);
  const antigravity = run(
    'Antigravity browser QA',
    'node',
    [
      'scripts/mind_coach_antigravity_qa.mjs',
      '--prompt-file', browserQaPromptPath,
      '--output', antigravityPath,
      '--log', resolve(iterationDir, 'antigravity-qa.log'),
    ],
    resolve(iterationDir, 'antigravity-wrapper.log'),
    { timeoutMs: 25 * 60 * 1000, env: { ...process.env, AGY_BIN: agyBin, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` } },
  );

  writeJson(resolve(iterationDir, 'command-results.json'), {
    build: { ok: build.ok, exitCode: build.status },
    contract: { ok: contractQa.ok, exitCode: contractQa.status },
    browser: { ok: browser.ok, exitCode: browser.status },
    antigravity: { ok: antigravity.ok, exitCode: antigravity.status },
  });

  updateState({ status: 'CHECKING_COMPLETION' });
  const completionPath = resolve(iterationDir, 'completion.json');
  const completionPrompt = [
    read(`${loopDir}/prompts/complete.md`),
    '',
    `Iteration: ${iteration} of ${iterationCap}`,
    `Approved acceptance IDs: ${(contract.acceptanceIds || []).join(', ')}`,
    `Plan: ${planPath}`,
    `Implementation report: ${implementationPath}`,
    `Review: ${reviewPath}`,
    `Build log: ${resolve(iterationDir, 'build.log')}`,
    `Contract QA: ${contractPath}`,
    `Browser QA: ${browserPath}`,
    `Antigravity QA: ${antigravityPath}`,
    `Command results: ${resolve(iterationDir, 'command-results.json')}`,
    `Completion schema: ${resolve(root, `${loopDir}/schemas/completion.schema.json`)}`,
    `Write completion JSON to: ${completionPath}`,
    `Mind Coach n8n definitions:\n${n8nFilesList()}`,
  ].join('\n');
  const completionPromptPath = resolve(iterationDir, 'completion-prompt.txt');
  writeFileSync(completionPromptPath, completionPrompt);
  const checker = runAntigravityAgent(
    'Antigravity completion checker',
    completionPromptPath,
    resolve(iterationDir, 'completion.log'),
    {
      timeoutMs: 50 * 60 * 1000,
      jsonOutput: completionPath,
    },
  );
  const completion = safeReadJson(completionPath, {
    complete: false,
    decision: 'ITERATE',
    summary: checker.ok ? 'Completion output was not valid JSON.' : 'Completion checker failed.',
    failedCriteria: [],
    blockedCriteria: [],
    nextActions: ['Inspect completion.log and rerun the loop.'],
  });

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
  finalDecision = iteration === iterationCap ? 'STOP_INCOMPLETE' : 'ITERATE';
}

if (finalDecision !== 'COMPLETE') {
  updateState({ status: 'STOP_INCOMPLETE', completion: false });
} else if (config.publishCommandsAllowed) {
  updateState({ status: 'PUBLISHING', completion: true });
  const publicationDir = resolve(root, `${loopDir}/runs/publication`);
  mkdirSync(publicationDir, { recursive: true });
  const publication = run(
    'Vercel, Supabase, and n8n publication',
    'node',
    ['scripts/mind_coach_publish.mjs', '--output', resolve(publicationDir, 'publication.json')],
    resolve(publicationDir, 'publication.log'),
    { timeoutMs: 60 * 60 * 1000 },
  );
  updateState({
    status: publication.ok ? 'PUBLISHED' : 'PUBLICATION_FAILED',
    publicationComplete: publication.ok,
  });
  finalDecision = publication.ok ? 'PUBLISHED' : 'PUBLICATION_FAILED';
}

console.log(`\nMind Coach loop finished: ${finalDecision}`);
console.log('No commit, git push, pull request, or merge was performed.');
process.exit(['COMPLETE', 'PUBLISHED'].includes(finalDecision) ? 0 : 2);
