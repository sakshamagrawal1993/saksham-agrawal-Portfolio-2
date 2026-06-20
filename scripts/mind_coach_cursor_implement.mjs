#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const promptPath = argValue('--prompt-file', '');
const outputPath = resolve(root, argValue('--output', '.loop-mind-coach/runs/manual/implementation.md'));
const logPath = resolve(root, argValue('--log', '.loop-mind-coach/runs/manual/implementer.log'));
const config = JSON.parse(readFileSync(resolve(root, '.loop-mind-coach/config.json'), 'utf8'));
const prompt = promptPath ? readFileSync(resolve(root, promptPath), 'utf8') : args.join(' ');
const budget = Number(process.env.MIND_COACH_CURSOR_BUDGET_USD || config.cursorBudgetUsdPerIteration || 25);
const model = process.env.MIND_COACH_CURSOR_MODEL || 'composer-2.5';

mkdirSync(dirname(outputPath), { recursive: true });
mkdirSync(dirname(logPath), { recursive: true });

let exitCode = 1;
let log = '';

async function runCursor() {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey || process.env.MIND_COACH_IMPLEMENTER === 'claude') return false;
  try {
    const { Agent } = await import('@cursor/sdk');
    const startedAt = new Date().toISOString();
    const result = await Agent.prompt(prompt, {
      apiKey,
      model: { id: model },
      local: {
        cwd: root,
        additionalDirectories: [config.n8nRepository].filter(Boolean),
      },
    });
    log = [
      `started_at=${startedAt}`,
      'agent=cursor-sdk',
      `model=${model}`,
      `status=${result.status}`,
      '',
      '--- result ---',
      result.result || '',
    ].join('\n');
    writeFileSync(
      outputPath,
      `# Mind Coach implementation report\n\nAgent: Cursor SDK (${model})\nStatus: ${result.status}\n\n${result.result || '(no result text)'}\n`,
    );
    exitCode = result.status === 'completed' || result.status === 'success' ? 0 : 1;
    return true;
  } catch (error) {
    log = `Cursor SDK error: ${error?.stack || error}`;
    return false;
  }
}

function runClaudeImplementer() {
  const claudeBin = process.env.CLAUDE_BIN || 'claude';
  const startedAt = new Date().toISOString();
  const result = spawnSync(
    claudeBin,
    [
      '--print',
      '--add-dir', config.n8nRepository,
      '--permission-mode', 'acceptEdits',
      '--max-budget-usd', String(budget),
      prompt,
    ],
    {
      cwd: root,
      env: { ...process.env, CI: '1' },
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      timeout: 45 * 60 * 1000,
    },
  );
  log = [
    `started_at=${startedAt}`,
    'agent=claude-terminal',
    `exit_code=${result.status ?? 'null'}`,
    '',
    '--- stdout ---',
    result.stdout || '',
    '',
    '--- stderr ---',
    result.stderr || '',
    result.error ? `\n--- process error ---\n${result.error.stack || result.error}` : '',
  ].join('\n');
  if (!existsSync(outputPath)) {
    writeFileSync(
      outputPath,
      `# Mind Coach implementation report\n\nAgent: Claude terminal\nExit code: ${result.status}\n\n${result.stdout || ''}\n`,
    );
  }
  exitCode = result.status === 0 ? 0 : 1;
}

const usedCursor = await runCursor();
if (!usedCursor) {
  console.log('Using Claude terminal implementer (set CURSOR_API_KEY to prefer Cursor SDK).');
  runClaudeImplementer();
}

writeFileSync(logPath, log);
if (log) process.stdout.write(log);
process.exit(exitCode);
