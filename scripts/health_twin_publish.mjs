#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const config = JSON.parse(readFileSync(resolve(root, '.loop/config.json'), 'utf8'));
const statePath = resolve(root, '.loop/STATE.json');
const outputPath = resolve(root, argValue('--output', '.loop/runs/publication/publication.json'));
const publicationDir = dirname(outputPath);
mkdirSync(publicationDir, { recursive: true });

function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function run(name, command, commandArgs, cwd = root, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    env: { ...process.env, CI: '1' },
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    timeout: options.timeoutMs || 30 * 60 * 1000,
  });
  const record = {
    name,
    command: `${command} ${commandArgs.join(' ')}`,
    cwd,
    ok: result.status === 0,
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? String(result.error.stack || result.error) : '',
  };
  writeFileSync(
    resolve(publicationDir, `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.log`),
    [
      `command=${record.command}`,
      `cwd=${cwd}`,
      `exit_code=${record.exitCode}`,
      '',
      '--- stdout ---',
      record.stdout,
      '',
      '--- stderr ---',
      record.stderr,
      record.error,
    ].join('\n'),
  );
  console.log(`[${record.ok ? 'PASS' : 'FAIL'}] ${name}`);
  if (record.stdout) process.stdout.write(record.stdout);
  if (record.stderr) process.stderr.write(record.stderr);
  return record;
}

function assertSafeCommand(command) {
  const normalized = command.toLowerCase().replace(/\s+/g, ' ').trim();
  for (const forbidden of config.forbiddenPublicationCommands || []) {
    if (normalized.includes(forbidden.toLowerCase())) {
      throw new Error(`Refusing forbidden publication command: ${forbidden}`);
    }
  }
}

if (!config.publishCommandsAllowed) {
  throw new Error('Publication is disabled in .loop/config.json');
}
if (!existsSync(statePath)) {
  throw new Error('Missing .loop/STATE.json; run the engineering loop first.');
}
const state = JSON.parse(readFileSync(statePath, 'utf8'));
if (!state.completion || !['COMPLETE', 'PUBLISHING', 'PUBLISHED', 'PUBLICATION_FAILED'].includes(state.status)) {
  throw new Error(`Refusing publication before completion. Current state: ${state.status}`);
}

const stages = [];
const n8nRepo = config.n8nRepository;
const workflowIds = config.n8nWorkflowIds || [];
const n8nCli = resolve(n8nRepo, 'tools/n8n-cli/n8n-cli');

if (!existsSync(resolve(n8nRepo, '.env')) || !existsSync(n8nCli)) {
  stages.push({
    name: 'n8n preflight',
    ok: false,
    exitCode: null,
    stdout: '',
    stderr: 'n8n repository .env or n8n-cli binary is missing.',
  });
} else {
  const idList = workflowIds.join(',');
  const dryRunCommand = `set -a; source .env; set +a; ./tools/n8n-cli/n8n-cli apply --ids ${idList} --dry-run -d definitions`;
  assertSafeCommand(dryRunCommand);
  const n8nDryRun = run(
    'n8n health twin dry run',
    '/bin/zsh',
    ['-lc', dryRunCommand],
    n8nRepo,
  );
  stages.push(n8nDryRun);

  if (n8nDryRun.ok || n8nDryRun.exitCode === 2) {
    const applyCommand = `set -a; source .env; set +a; ./tools/n8n-cli/n8n-cli apply --ids ${idList} --force -d definitions`;
    assertSafeCommand(applyCommand);
    stages.push(run(
      'n8n health twin apply',
      '/bin/zsh',
      ['-lc', applyCommand],
      n8nRepo,
    ));
    for (const workflowId of workflowIds) {
      const activateCommand = `set -a; source .env; set +a; ./tools/n8n-cli/n8n-cli workflow activate ${workflowId}`;
      assertSafeCommand(activateCommand);
      stages.push(run(
        `n8n activate ${workflowId}`,
        '/bin/zsh',
        ['-lc', activateCommand],
        n8nRepo,
      ));
    }
  }
}

for (const functionName of config.supabaseFunctions || []) {
  const command = `npx supabase functions deploy ${functionName} --project-ref ${config.supabaseProjectRef}`;
  assertSafeCommand(command);
  stages.push(run(
    `supabase function ${functionName}`,
    'npx',
    ['supabase', 'functions', 'deploy', functionName, '--project-ref', config.supabaseProjectRef],
    root,
  ));
}

const migrationDiff = run(
  'health migration status',
  'git',
  ['status', '--porcelain', '--', 'supabase/migrations'],
  root,
);
stages.push(migrationDiff);
const changedMigrations = migrationDiff.stdout
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const path = line.slice(3).trim();
    return path.includes(' -> ') ? path.split(' -> ').at(-1) : path;
  });

if (changedMigrations.length > 0) {
  const unsafeMigration = changedMigrations.find(
    (path) => !/health|wellness/i.test(basename(path)),
  );
  if (unsafeMigration) {
    stages.push({
      name: 'supabase database migration guard',
      ok: false,
      exitCode: null,
      stdout: '',
      stderr: `Refusing to push unrelated migration: ${unsafeMigration}`,
    });
  } else {
    const dryRun = run(
      'supabase database dry run',
      'npx',
      ['supabase', 'db', 'push', '--linked', '--dry-run'],
      root,
    );
    stages.push(dryRun);
    const mentionedMigrationFiles = [...new Set(
      `${dryRun.stdout}\n${dryRun.stderr}`.match(/\d{8,}[^ \n]*\.sql/g) || [],
    )];
    const approvedNames = new Set(changedMigrations.map(basename));
    const unexpected = mentionedMigrationFiles.find((name) => !approvedNames.has(basename(name)));
    if (dryRun.ok && !unexpected) {
      stages.push(run(
        'supabase database push',
        'npx',
        ['supabase', 'db', 'push', '--linked'],
        root,
      ));
    } else if (unexpected) {
      stages.push({
        name: 'supabase database migration guard',
        ok: false,
        exitCode: null,
        stdout: dryRun.stdout,
        stderr: `Dry-run includes an unrelated pending migration: ${unexpected}`,
      });
    }
  }
}

const vercelCommand = 'vercel --prod --yes';
assertSafeCommand(vercelCommand);
stages.push(run(
  'vercel production deploy',
  'vercel',
  ['--prod', '--yes'],
  root,
  { timeoutMs: 45 * 60 * 1000 },
));

if (config.productionUrl) {
  stages.push(run(
    'production browser smoke',
    'node',
    [
      'scripts/health_twin_browser_smoke.mjs',
      '--base-url', config.productionUrl,
      '--no-server',
      '--output', resolve(publicationDir, 'production-browser-qa.json'),
      '--artifacts-dir', resolve(publicationDir, 'production-browser'),
    ],
    root,
    { timeoutMs: 20 * 60 * 1000 },
  ));
}

const report = {
  product: 'health-twin',
  generatedAt: new Date().toISOString(),
  githubPublicationPerformed: false,
  complete: stages.every((stage) => stage.ok),
  stages: stages.map(({ stdout, stderr, ...stage }) => ({
    ...stage,
    stdoutTail: stdout?.slice(-2000) || '',
    stderrTail: stderr?.slice(-2000) || '',
  })),
};
writeFileSync(outputPath, JSON.stringify(report, null, 2));

console.log(`Publication complete: ${report.complete}`);
console.log('GitHub push and PR creation were not performed.');
process.exit(report.complete ? 0 : 1);
