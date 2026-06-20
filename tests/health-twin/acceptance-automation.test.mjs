import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from '../../scripts/health_twin_acceptance_lib.mjs';

const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('acceptance runner is cleanup-safe and contains no GitHub publication command', () => {
  const source = read('scripts/health_twin_acceptance_run.mjs')
    + read('scripts/health_twin_acceptance_api.mjs')
    + read('scripts/health_twin_browser_smoke.mjs');
  assert.match(source, /method: 'DELETE'/);
  assert.doesNotMatch(source, /\bgit\s+push\b/);
  assert.doesNotMatch(source, /\bgh\s+pr\s+create\b/);
});

test('API automation separates storage object evidence from source-row evidence', () => {
  const source = read('scripts/health_twin_acceptance_api.mjs');
  assert.match(source, /storage\/v1\/object\/health_documents/);
  assert.match(source, /health_sources\?select=\*/);
  assert.match(source, /add\('HT-040'/);
  assert.match(source, /add\('HT-041'/);
  assert.match(source, /add\('HT-091'/);
});

test('two-user checks require explicit secondary credentials', () => {
  const source = read('scripts/health_twin_acceptance_api.mjs');
  assert.match(source, /HEALTH_TWIN_SECOND_TEST_EMAIL/);
  assert.match(source, /HEALTH_TWIN_SECOND_TEST_PASSWORD/);
  assert.match(source, /never guessed, probed, or auto-provisioned/);
});

test('acceptance merger does not promote source contracts into live evidence', () => {
  const source = read('scripts/health_twin_acceptance_report.mjs');
  assert.match(source, /sourcePassEligible/);
  assert.match(source, /evidenceStrength/);
  assert.match(source, /incomingStrength > existingStrength/);
  assert.match(source, /row\.evidenceType === 'source-contract'/);
  assert.match(source, /requires browser, API, RLS, storage, build, or live Edge evidence/);
});
