import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
    mapRealDataToPlaygroundBaseline,
    normalizePlaygroundParameterName,
} from '../../components/HealthTwin/Playground/playgroundBaselineMapper.ts';

const defaults = {
    age: 30,
    gender: 'M',
    weight_kg: 75,
    height_cm: 175,
    diabetes: false,
    hypertension: false,
    hyperlipidemia: false,
    asthma: false,
    sleep_apnea: false,
    daily_steps: 5000,
    active_minutes: 30,
    distance_walked: 3.5,
    floors_climbed: 5,
    heart_rate: 72,
    resting_heart_rate: 65,
    hrv: 45,
    respiratory_rate: 16,
    body_temperature: 36.6,
    blood_glucose: 95,
    blood_glucose_max: 130,
    blood_glucose_min: 75,
    systolic_bp: 120,
    diastolic_bp: 80,
    aqi: 45,
    uv_index: 3,
    pollen_level: 2,
    sleep_duration: 7,
    sleep_heart_rate: 60,
    spo2_min: 94,
    sleep_quality: 85,
    calorie_intake: 2200,
    water_intake: 2.5,
    protein_pct: 20,
    carbs_pct: 50,
    fats_pct: 30,
    stress_level: 25,
    recovery_score: 80,
    symptom_abdominal_cramps: false,
    symptom_night_sweats: false,
    symptom_headache: false,
    symptom_fatigue: false,
    symptom_insomnia: false,
    symptom_joint_pain: false,
    symptom_dizziness: false,
    symptom_shortness_of_breath: false,
    hba1c: 5.4,
    total_cholesterol: 180,
    hdl: 55,
    ldl: 110,
    triglycerides: 130,
    vitamin_d: 40,
    vitamin_b12: 500,
    tsh: 2.5,
    hemoglobin: 14.5,
    creatinine: 1,
};

function parameter(parameter_name, parameter_value, recorded_at = '2026-06-20T10:00:00.000Z') {
    return {
        id: crypto.randomUUID(),
        parameter_name,
        parameter_value,
        unit: '',
        recorded_at,
    };
}

function definition(id, name) {
    return { id, name, category: 'test', unit: '', axis_impact_weights: {} };
}

describe('HT-080 playground real-data baseline mapping', () => {
    test('normalizes display names and legacy separators into stable aliases', () => {
        assert.equal(normalizePlaygroundParameterName('  Sleep_Average-Heart Rate '), 'sleep average heart rate');
        assert.equal(normalizePlaygroundParameterName('Vitamin B12 / Cyanocobalamin'), 'vitamin b12 cyanocobalamin');
    });

    test('maps stored display names rather than requiring underscored keys', () => {
        const baseline = mapRealDataToPlaygroundBaseline({
            defaults,
            parameterDefinitions: [],
            personalDetails: null,
            labParameters: [
                parameter('Cholesterol-Total, Serum', 214),
                parameter('Vitamin D Total-25 Hydroxy', 22),
            ],
            wearableParameters: [
                parameter('Step Count', 12345),
                parameter('Horizontal Distance Covered', 8.4),
                parameter('Blood Pressure Systolic', 128),
                parameter('Sleep Average Heart Rate', 57),
            ],
        });

        assert.equal(baseline.daily_steps, 12345);
        assert.equal(baseline.distance_walked, 8.4);
        assert.equal(baseline.systolic_bp, 128);
        assert.equal(baseline.sleep_heart_rate, 57);
        assert.equal(baseline.total_cholesterol, 214);
        assert.equal(baseline.vitamin_d, 22);
    });

    test('uses parameter definitions to bridge stored display names to canonical ids', () => {
        const baseline = mapRealDataToPlaygroundBaseline({
            defaults,
            parameterDefinitions: [
                definition('41995-2', 'Patient Glycohemoglobin Result'),
                definition('2160-0', 'Renal Creatinine Result'),
            ],
            personalDetails: null,
            labParameters: [
                parameter('Patient Glycohemoglobin Result', 6.2),
                parameter('Renal Creatinine Result', 1.3),
            ],
            wearableParameters: [],
        });

        assert.equal(baseline.hba1c, 6.2);
        assert.equal(baseline.creatinine, 1.3);
    });

    test('selects the latest reading without mutating records, arrays, or defaults', () => {
        const older = parameter('Heart Rate', 91, '2026-06-19T10:00:00.000Z');
        const newer = parameter('heart_rate', 68, '2026-06-20T10:00:00.000Z');
        const labParameters = [parameter('Hemoglobin Hb', 13.8)];
        const wearableParameters = [older, newer];
        const defaultsSnapshot = structuredClone(defaults);
        const labSnapshot = structuredClone(labParameters);
        const wearableSnapshot = structuredClone(wearableParameters);

        const baseline = mapRealDataToPlaygroundBaseline({
            defaults,
            parameterDefinitions: [],
            personalDetails: null,
            labParameters,
            wearableParameters,
        });

        assert.equal(baseline.heart_rate, 68);
        assert.equal(baseline.hemoglobin, 13.8);
        assert.notStrictEqual(baseline, defaults);
        assert.deepEqual(defaults, defaultsSnapshot);
        assert.deepEqual(labParameters, labSnapshot);
        assert.deepEqual(wearableParameters, wearableSnapshot);
    });

    test('returns an isolated baseline so reset snapshots cannot mutate source defaults', () => {
        const baseline = mapRealDataToPlaygroundBaseline({
            defaults,
            parameterDefinitions: [],
            personalDetails: null,
            labParameters: [],
            wearableParameters: [],
        });
        const resetSnapshot = { ...baseline };

        baseline.daily_steps = 999;

        assert.equal(resetSnapshot.daily_steps, defaults.daily_steps);
        assert.equal(defaults.daily_steps, 5000);
    });
});
