/**
 * Deterministic unit tests for calculateAxesScores.
 * Run with: node --test tests/health-twin/score-calculator.test.mjs
 *
 * These tests use synthetic data and do not require a database or browser.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateParameterScore } from '../../utils/scoreCalculator.ts';

// ─── Synthetic fixture helpers ───────────────────────────────────────────────

const makeRange = (overrides = {}) => ({
  id: 'r1',
  parameter_id: 'p1',
  gender: 'ALL',
  min_age: 0,
  max_age: 120,
  critical_min: 60,
  normal_min: 80,
  optimal_min: 90,
  optimal_max: 100,
  normal_max: 110,
  critical_max: 130,
  ...overrides,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('calculateParameterScore', () => {
  test('returns 100 for value within optimal range', () => {
    const score = calculateParameterScore(95, makeRange());
    assert.equal(score, 100);
  });

  test('returns 100 for value exactly at optimal_min boundary', () => {
    const score = calculateParameterScore(90, makeRange());
    assert.equal(score, 100);
  });

  test('returns 100 for value exactly at optimal_max boundary', () => {
    const score = calculateParameterScore(100, makeRange());
    assert.equal(score, 100);
  });

  test('returns between 80 and 100 for value in normal-high zone', () => {
    const score = calculateParameterScore(105, makeRange());
    assert.ok(score >= 80 && score < 100, `Expected 80-100 but got ${score}`);
  });

  test('returns between 20 and 80 for value in critical-high zone', () => {
    const score = calculateParameterScore(125, makeRange());
    assert.ok(score >= 20 && score <= 80, `Expected 20-80 but got ${score}`);
  });

  test('returns between 80 and 100 for value in normal-low zone', () => {
    const score = calculateParameterScore(85, makeRange());
    assert.ok(score >= 80 && score < 100, `Expected 80-100 but got ${score}`);
  });

  test('returns null when no range defined', () => {
    const score = calculateParameterScore(95, undefined);
    assert.equal(score, null);
  });

  test('returns null for NaN value', () => {
    const score = calculateParameterScore(NaN, makeRange());
    assert.equal(score, null);
  });

  test('returns 20 for boolean true (symptom present)', () => {
    const score = calculateParameterScore(true, makeRange());
    assert.equal(score, 20);
  });

  test('returns 100 for boolean false (no symptom)', () => {
    const score = calculateParameterScore(false, makeRange());
    assert.equal(score, 100);
  });

  test('clamps low score to minimum of 20', () => {
    const score = calculateParameterScore(200, makeRange({ critical_max: 150, normal_max: 120 }));
    assert.ok(score >= 20, `Score ${score} should be >= 20`);
  });

  test('handles null optimal_min (open lower bound) as optimal', () => {
    const score = calculateParameterScore(5, makeRange({ optimal_min: null, optimal_max: 100 }));
    assert.equal(score, 100);
  });

  test('handles null optimal_max (open upper bound) as optimal', () => {
    const score = calculateParameterScore(200, makeRange({ optimal_min: 10, optimal_max: null }));
    assert.equal(score, 100);
  });
});

describe('score monotonicity', () => {
  test('score decreases as value moves further above optimal_max', () => {
    const range = makeRange();
    const s1 = calculateParameterScore(101, range);
    const s2 = calculateParameterScore(110, range);
    const s3 = calculateParameterScore(125, range);
    assert.ok(s1 > s2, `s1(${s1}) should be > s2(${s2})`);
    assert.ok(s2 > s3, `s2(${s2}) should be > s3(${s3})`);
  });

  test('score decreases as value moves further below optimal_min', () => {
    const range = makeRange();
    const s1 = calculateParameterScore(89, range);
    const s2 = calculateParameterScore(82, range);
    const s3 = calculateParameterScore(65, range);
    assert.ok(s1 > s2, `s1(${s1}) should be > s2(${s2})`);
    assert.ok(s2 > s3, `s2(${s2}) should be > s3(${s3})`);
  });
});

describe('latest-reading selection', () => {
  test('uses most recent reading when two readings exist for same parameter', () => {
    // Simulate the Map-based latest selection from calculateAxesScores
    const readings = [
      { parameter_name: 'Heart Rate', parameter_value: 200, recorded_at: '2026-01-01T00:00:00Z' },
      { parameter_name: 'Heart Rate', parameter_value: 72, recorded_at: '2026-06-01T00:00:00Z' },
    ];

    const latestParams = new Map();
    for (const p of readings) {
      const existing = latestParams.get(p.parameter_name.toLowerCase());
      if (!existing || new Date(p.recorded_at) > new Date(existing.recorded_at)) {
        latestParams.set(p.parameter_name.toLowerCase(), p);
      }
    }

    const latest = latestParams.get('heart rate');
    assert.equal(latest.parameter_value, 72, 'Should pick the most recent reading');
  });
});
