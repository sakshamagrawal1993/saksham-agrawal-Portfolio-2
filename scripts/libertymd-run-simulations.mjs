import { spawnSync } from 'node:child_process'
import process from 'node:process'

const results = []
for (let loop = 1; loop <= 10; loop += 1) {
  const run = spawnSync('deno', ['run', '--no-config', 'scripts/libertymd-flow-simulation.ts', `--loop=${loop}`], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  if (run.error) throw run.error
  const output = JSON.parse(run.stdout.trim())
  results.push({ loop, passed: output.passed })
  if (run.status !== 0 || output.passed !== true) {
    console.error(run.stderr || run.stdout)
    process.exit(run.status || 1)
  }
}

console.log(JSON.stringify({ loops: results, passed: true }, null, 2))
