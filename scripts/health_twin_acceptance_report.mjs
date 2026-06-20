#!/usr/bin/env node

import {
  acceptanceIds, argValue, evidence, readJsonIfPresent, reportSummary, writeJson,
} from './health_twin_acceptance_lib.mjs';

const args = process.argv.slice(2);
const output = argValue(args, '--output', '.loop/runs/manual/acceptance-complete.json');
const inputs = [];
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--input' && args[index + 1]) inputs.push(args[index + 1]);
}

// A real failure must never be hidden by weaker source-level PASS evidence.
const rank = { FAIL: 4, PASS: 3, BLOCKED: 2, NOT_TESTED: 1 };
const evidenceStrength = {
  'browser-smoke': 4,
  'authenticated-api': 4,
  build: 4,
  'unit-contract': 3,
  'source-contract': 1,
  'acceptance-merge': 0,
};
const sourcePassEligible = new Set([
  'HT-024', 'HT-032', 'HT-043', 'HT-045', 'HT-046',
  'HT-051', 'HT-054', 'HT-055', 'HT-063',
  'HT-081', 'HT-082', 'HT-085', 'HT-092', 'HT-095',
]);
const evidenceById = new Map();
for (const input of inputs) {
  const report = readJsonIfPresent(input);
  if (!report) continue;
  for (const row of report.results || []) {
    const canonicalId = String(row.id || '').match(/^HT-\d{3}/)?.[0];
    if (!canonicalId || !acceptanceIds.includes(canonicalId)) continue;
    const normalizedRow = {
      ...row,
      id: canonicalId,
      sourceReport: input,
      status: row.status === 'PASS'
        && row.evidenceType === 'source-contract'
        && !sourcePassEligible.has(canonicalId)
        ? 'NOT_TESTED'
        : row.status,
    };
    if (normalizedRow.status !== row.status) {
      normalizedRow.detail = 'Source wiring passed, but this criterion requires browser, API, RLS, storage, build, or live Edge evidence.';
    }
    const existing = evidenceById.get(canonicalId);
    const incomingStrength = evidenceStrength[normalizedRow.evidenceType] ?? 2;
    const existingStrength = evidenceStrength[existing?.evidenceType] ?? 2;
    if (!existing
      || incomingStrength > existingStrength
      || (incomingStrength === existingStrength && rank[normalizedRow.status] > rank[existing.status])) {
      evidenceById.set(canonicalId, normalizedRow);
    } else if (existing && row.evidence?.length) {
      existing.evidence = [...new Set([...(existing.evidence || []), ...row.evidence])];
    }
  }
}

const results = acceptanceIds.map((id) => evidenceById.get(id) || evidence(
  id,
  'NOT_TESTED',
  'No executable evidence was produced for this acceptance criterion.',
  { evidenceType: 'acceptance-merge', detail: 'Add browser, API, RLS, Edge, or build evidence.' },
));

const report = {
  product: 'health-twin',
  generatedAt: new Date().toISOString(),
  testType: 'acceptance-complete',
  inputs,
  summary: reportSummary(results),
  completion: results.every((row) => row.status === 'PASS'),
  results,
};
writeJson(output, report);
for (const row of results) console.log(`[${row.status}] ${row.id} ${row.description}`);
console.log(`Acceptance coverage: ${report.summary.passed}/${report.summary.total} PASS; ${report.summary.failed} FAIL; ${report.summary.blocked} BLOCKED; ${report.summary.notTested} NOT_TESTED`);
process.exit(report.completion ? 0 : report.summary.failed > 0 ? 1 : 2);
