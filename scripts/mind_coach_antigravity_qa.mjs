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
const outputPath = resolve(root, argValue('--output', '.loop-mind-coach/runs/manual/antigravity-qa.json'));
const rawPath = resolve(root, argValue('--raw', outputPath.replace(/\.json$/, '.raw.txt')));
const logPath = resolve(root, argValue('--log', '.loop-mind-coach/runs/manual/antigravity-qa.log'));
const config = JSON.parse(readFileSync(resolve(root, '.loop-mind-coach/config.json'), 'utf8'));
const prompt = promptPath ? readFileSync(resolve(root, promptPath), 'utf8') : args.join(' ');

const agyBin = process.env.AGY_BIN
  || process.env.ANTIGRAVITY_BIN
  || (existsSync(`${process.env.HOME}/.local/bin/agy`)
    ? `${process.env.HOME}/.local/bin/agy`
    : 'agy');
const timeout = process.env.MIND_COACH_AGY_TIMEOUT || '20m';

mkdirSync(dirname(outputPath), { recursive: true });
mkdirSync(dirname(logPath), { recursive: true });

function writeBlocked(reason) {
  const payload = {
    summary: reason,
    acceptanceResults: [],
    blocked: true,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(outputPath, JSON.stringify(payload, null, 2));
  writeFileSync(logPath, reason);
  console.warn(reason);
  process.exit(0);
}

const which = spawnSync('which', [agyBin], { encoding: 'utf8' });
if (which.status !== 0) {
  writeBlocked(`Antigravity CLI (${agyBin}) not found; exploratory QA marked BLOCKED.`);
}

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
    env: { ...process.env, CI: '1' },
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    timeout: 25 * 60 * 1000,
  },
);

const raw = [result.stdout || '', result.stderr || ''].join('\n');
writeFileSync(rawPath, raw);

const log = [
  `started_at=${startedAt}`,
  `command=${agyBin} -p ...`,
  `exit_code=${result.status ?? 'null'}`,
  '',
  '--- stdout ---',
  result.stdout || '',
  '',
  '--- stderr ---',
  result.stderr || '',
].join('\n');
writeFileSync(logPath, log);

let parsed = null;
const jsonMatch = raw.match(/\{[\s\S]*"acceptanceResults"[\s\S]*\}/);
if (jsonMatch) {
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    parsed = null;
  }
}

if (!parsed) {
  parsed = {
    summary: result.status === 0
      ? 'Antigravity completed but did not emit parseable JSON; see raw log.'
      : 'Antigravity exploratory QA failed or timed out.',
    acceptanceResults: [],
    rawPath,
    exitCode: result.status,
    generatedAt: new Date().toISOString(),
  };
}

writeFileSync(outputPath, JSON.stringify(parsed, null, 2));
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status === 0 ? 0 : 1);
