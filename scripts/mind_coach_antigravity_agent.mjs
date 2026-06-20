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

const promptPath = resolve(root, argValue('--prompt-file', ''));
const logPath = resolve(root, argValue('--log', '.loop-mind-coach/runs/manual/antigravity-agent.log'));
const rawPath = resolve(root, argValue('--raw', logPath.replace(/\.log$/, '.raw.txt')));
const jsonOutputPath = argValue('--json-output', '');
const config = JSON.parse(readFileSync(resolve(root, '.loop-mind-coach/config.json'), 'utf8'));

const agyBin = process.env.AGY_BIN
  || process.env.ANTIGRAVITY_BIN
  || (existsSync(`${process.env.HOME}/.local/bin/agy`)
    ? `${process.env.HOME}/.local/bin/agy`
    : 'agy');
const timeout = process.env.MIND_COACH_AGY_TIMEOUT || '45m';
const timeoutMs = Number(process.env.MIND_COACH_AGY_TIMEOUT_MS || 50 * 60 * 1000);

if (!existsSync(promptPath)) {
  console.error(`Missing prompt file: ${promptPath}`);
  process.exit(1);
}

mkdirSync(dirname(logPath), { recursive: true });
const prompt = readFileSync(promptPath, 'utf8');

const startedAt = new Date().toISOString();
const result = spawnSync(
  agyBin,
  [
    '-p', prompt,
    '--add-dir', root,
    '--add-dir', config.n8nRepository,
    '--dangerously-skip-permissions',
    '--print-timeout', timeout,
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      CI: '1',
      PATH: `${process.env.HOME}/.local/bin:${process.env.PATH || ''}`,
    },
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    timeout: timeoutMs,
  },
);

const raw = [result.stdout || '', result.stderr || ''].join('\n');
writeFileSync(rawPath, raw);
writeFileSync(
  logPath,
  [
    `started_at=${startedAt}`,
    `command=${agyBin} -p @${promptPath}`,
    `exit_code=${result.status ?? 'null'}`,
    '',
    '--- stdout ---',
    result.stdout || '',
    '',
    '--- stderr ---',
    result.stderr || '',
    result.error ? `\n--- process error ---\n${result.error.stack || result.error}` : '',
  ].join('\n'),
);

if (jsonOutputPath) {
  const patterns = [
    /\{[\s\S]*"complete"[\s\S]*"decision"[\s\S]*\}/,
    /\{[\s\S]*"approved"[\s\S]*"acceptanceIds"[\s\S]*\}/,
    /\{[\s\S]*"findings"[\s\S]*\}/,
    /\{[\s\S]*"acceptanceResults"[\s\S]*\}/,
    /\{[\s\S]*\}/,
  ];
  let parsed = null;
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match) continue;
    try {
      parsed = JSON.parse(match[0]);
      break;
    } catch {
      // try next pattern
    }
  }
  if (parsed) {
    mkdirSync(dirname(resolve(root, jsonOutputPath)), { recursive: true });
    writeFileSync(resolve(root, jsonOutputPath), JSON.stringify(parsed, null, 2));
  }
}

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status === 0 ? 0 : 1);
