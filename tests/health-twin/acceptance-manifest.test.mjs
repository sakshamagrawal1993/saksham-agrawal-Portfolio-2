import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptanceIds } from '../../scripts/health_twin_acceptance_lib.mjs';

test('acceptance manifest contains exactly all 52 canonical Health Twin IDs', () => {
  assert.equal(acceptanceIds.length, 52);
  assert.equal(new Set(acceptanceIds).size, 52);
  for (const id of acceptanceIds) assert.match(id, /^HT-\d{3}$/);
});

test('acceptance manifest covers each contract section', () => {
  for (const prefix of ['HT-00', 'HT-01', 'HT-02', 'HT-03', 'HT-04', 'HT-05', 'HT-06', 'HT-07', 'HT-08', 'HT-09']) {
    assert.ok(acceptanceIds.some((id) => id.startsWith(prefix)), `missing ${prefix} coverage`);
  }
});

