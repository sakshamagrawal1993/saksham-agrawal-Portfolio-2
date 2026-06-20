import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LabExtractionError,
  extractLabParameterCandidates,
  normalizeLabParameterRows,
  parseLabNumericValue,
} from '../../lib/healthTwin/labExtraction.ts';

const sample = {
  parameter_name: 'Hemoglobin',
  parameter_value: '14.5',
  unit: 'g/dL',
  recorded_at: '20/06/2026',
};

describe('production lab extraction normalization', () => {
  test('preserves supported real-workflow wrappers and maps insert rows', () => {
    const rows = normalizeLabParameterRows(
      [{ body: { output: { output: { parameters: [sample] } } } }],
      { twinId: 'twin-1', sourceId: 'source-1' },
      new Date('2026-01-01T00:00:00.000Z'),
    );

    assert.deepEqual(rows, [{
      twin_id: 'twin-1',
      source_id: 'source-1',
      parameter_name: 'Hemoglobin',
      parameter_value: 14.5,
      unit: 'g/dL',
      recorded_at: '2026-06-20T00:00:00.000Z',
    }]);
  });

  test('supports top-level, bare-array, and JSON-string responses', () => {
    assert.equal(extractLabParameterCandidates({ parameters: [sample] }).length, 1);
    assert.equal(extractLabParameterCandidates([sample]).length, 1);
    assert.equal(extractLabParameterCandidates(JSON.stringify({ parameters: [sample] })).length, 1);
  });

  test('empty extraction fails instead of allowing a completed source', () => {
    assert.throws(
      () => normalizeLabParameterRows(
        { body: { output: { parameters: [] } } },
        { twinId: 'twin-1', sourceId: 'source-1' },
      ),
      (error) => error instanceof LabExtractionError && /no biomarkers/i.test(error.message),
    );
  });

  test('malformed extraction fails instead of allowing a completed source', () => {
    for (const malformed of [
      null,
      {},
      { parameters: {} },
      'not-json',
      { parameters: [null] },
      { parameters: [{ parameter_value: 4.2 }] },
    ]) {
      assert.throws(
        () => normalizeLabParameterRows(
          malformed,
          { twinId: 'twin-1', sourceId: 'source-1' },
        ),
        LabExtractionError,
      );
    }
  });
});

describe('production biomarker numeric parsing', () => {
  test('preserves legitimate zero and finite numeric values', () => {
    assert.equal(parseLabNumericValue(0, 'Glucose'), 0);
    assert.equal(parseLabNumericValue('0', 'Glucose'), 0);
    assert.equal(parseLabNumericValue('1,234.50', 'Platelets'), 1234.5);
    assert.equal(parseLabNumericValue('-2.5e2', 'Synthetic marker'), -250);
  });

  test('rejects invalid values instead of silently converting them to zero', () => {
    for (const invalid of [undefined, null, '', 'not detected', '12 mg/dL', '<5', Number.NaN, Infinity]) {
      assert.throws(
        () => parseLabNumericValue(invalid, 'Glucose'),
        (error) => error instanceof LabExtractionError && /invalid numeric value/i.test(error.message),
      );
    }
  });

  test('one invalid biomarker fails the full normalized batch', () => {
    assert.throws(
      () => normalizeLabParameterRows(
        { parameters: [sample, { ...sample, parameter_name: 'Glucose', parameter_value: 'invalid' }] },
        { twinId: 'twin-1', sourceId: 'source-1' },
      ),
      /Biomarker "Glucose" has an invalid numeric value/,
    );
  });
});
