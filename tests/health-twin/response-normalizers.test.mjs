/**
 * Deterministic unit tests for lab-report and chat response normalization.
 * Run with: node --test tests/health-twin/response-normalizers.test.mjs
 *
 * These tests exercise the documented wrapper formats from ACCEPTANCE.md
 * HT-043 and HT-063 without requiring a browser or external services.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractLabParameterCandidates } from '../../lib/healthTwin/labExtraction.ts';
import { normalizeHealthTwinChatResponse } from '../../supabase/functions/_shared/healthTwinChatResponse.ts';

// ─── Lab Response Normalizer ─────────────────────────────────────────────────
// Re-implements the unwrapping logic from LeftPanel.tsx handleUploadReport.
// Acceptance criteria HT-043: top-level, body/output wrappers, repeated output,
// array roots, and JSON-string responses.

function normalizeLabParameters(raw) {
  try {
    return extractLabParameterCandidates(raw);
  } catch {
    return [];
  }
}

// ─── Chat Response Normalizer ────────────────────────────────────────────────
// Re-implements the chat reply extraction from chat-completion/index.ts.
// Acceptance criteria HT-063: array root, assistant_reply/output fields,
// JSON-string double-encoding.

function normalizeChatResponse(raw) {
  return normalizeHealthTwinChatResponse(raw);
}

// ─── Lab normalizer tests ─────────────────────────────────────────────────────

describe('normalizeLabParameters — HT-043', () => {
  const sampleParam = { parameter_name: 'Hemoglobin', parameter_value: 14.5, unit: 'g/dL' };

  test('top-level parameters field', () => {
    const result = normalizeLabParameters({ parameters: [sampleParam] });
    assert.equal(result.length, 1);
    assert.equal(result[0].parameter_name, 'Hemoglobin');
  });

  test('array root (bare array response)', () => {
    const result = normalizeLabParameters([sampleParam]);
    assert.equal(result.length, 1);
  });

  test('body wrapper', () => {
    const result = normalizeLabParameters({ body: { parameters: [sampleParam] } });
    assert.equal(result.length, 1);
  });

  test('body + output wrapper', () => {
    const result = normalizeLabParameters({ body: { output: { parameters: [sampleParam] } } });
    assert.equal(result.length, 1);
  });

  test('double output wrapper', () => {
    const result = normalizeLabParameters({ output: { output: { parameters: [sampleParam] } } });
    assert.equal(result.length, 1);
  });

  test('JSON-string response', () => {
    const jsonStr = JSON.stringify({ parameters: [sampleParam] });
    const result = normalizeLabParameters(jsonStr);
    assert.equal(result.length, 1);
  });

  test('array root inside first element of array', () => {
    const result = normalizeLabParameters([{ parameters: [sampleParam] }]);
    assert.equal(result.length, 1);
  });

  test('empty / null response returns empty array', () => {
    assert.deepEqual(normalizeLabParameters(null), []);
    assert.deepEqual(normalizeLabParameters({}), []);
    assert.deepEqual(normalizeLabParameters({ body: {} }), []);
  });

  test('invalid JSON string returns empty array', () => {
    assert.deepEqual(normalizeLabParameters('not-json'), []);
  });
});

// ─── Chat normalizer tests ────────────────────────────────────────────────────

describe('normalizeChatResponse — HT-063', () => {
  test('direct assistant_reply field', () => {
    const { assistant_reply } = normalizeChatResponse({ assistant_reply: 'Hello' });
    assert.equal(assistant_reply, 'Hello');
  });

  test('output field fallback', () => {
    const { assistant_reply } = normalizeChatResponse({ output: 'Hello via output' });
    assert.equal(assistant_reply, 'Hello via output');
  });

  test('array root unwrap with assistant_reply', () => {
    const { assistant_reply } = normalizeChatResponse([{ assistant_reply: 'Array wrapped' }]);
    assert.equal(assistant_reply, 'Array wrapped');
  });

  test('JSON-string double-encoded reply', () => {
    const encoded = JSON.stringify('This is the reply');
    const { assistant_reply } = normalizeChatResponse({ assistant_reply: encoded });
    assert.equal(assistant_reply, 'This is the reply');
  });

  test('JSON-string with escaped newlines', () => {
    const encoded = '"Line 1\\nLine 2"';
    const { assistant_reply } = normalizeChatResponse({ assistant_reply: encoded });
    assert.equal(assistant_reply, 'Line 1\nLine 2');
  });

  test('widgets are returned as-is', () => {
    const widgets = [{ type: 'chart', title: 'Heart Rate' }];
    const { widgets: w } = normalizeChatResponse({ assistant_reply: 'ok', widgets });
    assert.deepEqual(w, widgets);
  });

  test('missing reply returns empty string', () => {
    const { assistant_reply } = normalizeChatResponse({});
    assert.equal(assistant_reply, '');
  });

  test('null/undefined input is safe', () => {
    assert.doesNotThrow(() => normalizeChatResponse(null));
    assert.doesNotThrow(() => normalizeChatResponse(undefined));
  });

  test('array root with output field', () => {
    const { assistant_reply } = normalizeChatResponse([{ output: 'Nested output' }]);
    assert.equal(assistant_reply, 'Nested output');
  });
});
