import { create } from 'zustand';
import { 
  HealthScore, 
  HealthParameter, 
  HealthParameterDefinition, 
  HealthParameterRange,
  HealthPersonalDetails,
  WellnessProgram
} from './healthTwin';
import { calculateAxesScores } from '../utils/scoreCalculator';
import { generatePlaygroundWellness } from '../components/HealthTwin/Playground/playgroundWellnessGenerator';

export interface PlaygroundParameters {
    // Profile & Co-morbidities
    age: number;
    gender: 'M' | 'F' | 'ALL';
    weight_kg: number;
    height_cm: number;
    diabetes: boolean;
    hypertension: boolean;
    hyperlipidemia: boolean;
    asthma: boolean;
    sleep_apnea: boolean;

    // Activity (7-day averages)
    daily_steps: number;
    active_minutes: number;
    distance_walked: number;
    floors_climbed: number;

    // Vitals (7-day averages)
    heart_rate: number;
    resting_heart_rate: number;
    hrv: number;
    respiratory_rate: number;
    body_temperature: number;
    blood_glucose: number;
    blood_glucose_max: number;
    blood_glucose_min: number;
    systolic_bp: number;
    diastolic_bp: number;

    // Location & Environment
    aqi: number;
    uv_index: number;
    pollen_level: number;

    // Sleep (7-day averages)
    sleep_duration: number;
    sleep_heart_rate: number;
    spo2_min: number;
    sleep_quality: number;

    // Nutrition & Hydration (7-day averages)
    calorie_intake: number;
    water_intake: number;
    protein_pct: number;
    carbs_pct: number;
    fats_pct: number;

    // Stress & Recovery
    stress_level: number;
    recovery_score: number;

    // Symptoms (last 7 days)
    symptom_abdominal_cramps: boolean;
    symptom_night_sweats: boolean;
    symptom_headache: boolean;
    symptom_fatigue: boolean;
    symptom_insomnia: boolean;
    symptom_joint_pain: boolean;
    symptom_dizziness: boolean;
    symptom_shortness_of_breath: boolean;

    // Lab Results
    hba1c: number;
    total_cholesterol: number;
    hdl: number;
    ldl: number;
    triglycerides: number;
    vitamin_d: number;
    vitamin_b12: number;
    tsh: number;
    hemoglobin: number;
    creatinine: number;
}

interface PlaygroundState {
    // Parameters
    parameters: PlaygroundParameters;
    baselineParameters: PlaygroundParameters | null;
    
    // Computed Results
    scores: HealthScore[];
    baselineScores: HealthScore[];
    
    // Wellness
    wellnessPrograms: WellnessProgram[];
    isGeneratingWellness: boolean;
    
    // Metadata
    lastUpdated: number;
    
    // Changed Set
    changedParams: Set<keyof PlaygroundParameters>;
    
    // Actions
    setParameters: (params: Partial<PlaygroundParameters>) => void;
    setParameter: (key: keyof PlaygroundParameters, value: any) => void;
    initializeBaseline: (params: PlaygroundParameters, scores: HealthScore[]) => void;
    resetToBaseline: () => void;
    recalculateScores: (definitions: HealthParameterDefinition[], ranges: HealthParameterRange[]) => void;
    setWellnessPrograms: (programs: WellnessProgram[]) => void;
    setIsGeneratingWellness: (loading: boolean) => void;
}

export const defaultPlaygroundParams: PlaygroundParameters = {
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
    creatinine: 1.0,
};

export const usePlaygroundStore = create<PlaygroundState>((set, get) => ({
    parameters: { ...defaultPlaygroundParams },
    baselineParameters: null,
    scores: [],
    baselineScores: [],
    wellnessPrograms: [],
    isGeneratingWellness: false,
    lastUpdated: Date.now(),
    changedParams: new Set(),

    setParameters: (newParams) => {
        set((state) => {
            const updatedParams = { ...state.parameters, ...newParams };
            const newChanged = new Set(state.changedParams);
            
            Object.keys(newParams).forEach((key) => {
                const k = key as keyof PlaygroundParameters;
                if (state.baselineParameters && updatedParams[k] !== state.baselineParameters[k]) {
                    newChanged.add(k);
                } else {
                    newChanged.delete(k);
                }
            });

            return { parameters: updatedParams, changedParams: newChanged };
        });
    },

    setParameter: (key, value) => {
        get().setParameters({ [key]: value });
    },

    initializeBaseline: (params, scores) => {
        set({ 
            baselineParameters: { ...params }, 
            parameters: { ...params },
            baselineScores: [...scores],
            scores: [...scores],
            changedParams: new Set()
        });
    },

    resetToBaseline: () => {
        const { baselineParameters, baselineScores } = get();
        if (baselineParameters) {
            set({ 
                parameters: { ...baselineParameters }, 
                scores: [...baselineScores],
                changedParams: new Set()
            });
        }
    },

    recalculateScores: (definitions, ranges) => {
        const { parameters } = get();
        const healthParams = playgroundToHealthParams(parameters);
        
        // Mock personal details for the calculator
        const personalDetails: HealthPersonalDetails = {
            id: 'playground',
            name: 'Playground User',
            age: parameters.age,
            gender: parameters.gender === 'M' ? 'Male' : (parameters.gender === 'F' ? 'Female' : 'Male'),
            blood_type: 'Unknown',
            height_cm: parameters.height_cm,
            weight_kg: parameters.weight_kg,
            co_morbidities: [], // Handled via parameters in our mapping
            location: 'Playground'
        };

        const computedScores = calculateAxesScores(
            healthParams,
            definitions,
            ranges,
            personalDetails
        );

        // Also generate wellness programs locally
        const wellness = generatePlaygroundWellness(parameters);

        set({ 
            scores: computedScores, 
            wellnessPrograms: wellness,
            lastUpdated: Date.now() 
        });
    },

    setWellnessPrograms: (wellnessPrograms) => set({ wellnessPrograms }),
    setIsGeneratingWellness: (isGeneratingWellness) => set({ isGeneratingWellness }),
}));

/**
 * Converts flat playground parameters into the array format expected by the score calculator
 */
export function playgroundToHealthParams(params: PlaygroundParameters): HealthParameter[] {
    const now = new Date().toISOString();
    
    // Helper to create a HealthParameter object
    const p = (name: string, val: number | boolean, unit: string = ''): HealthParameter => ({
        id: `pg-${name}`,
        parameter_name: name,
        parameter_value: typeof val === 'boolean' ? (val ? 1 : 0) : val,
        unit,
        recorded_at: now
    });

    return [
        // Profile mapping (handled partly by calculator, but we can pass them)
        p('weight_kg', params.weight_kg, 'kg'),
        
        // Co-morbidities (Mapping to comorb_ IDs from migration)
        p('comorb_diabetes', params.diabetes),
        p('comorb_hypertension', params.hypertension),
        p('comorb_hyperlipidemia', params.hyperlipidemia),
        p('comorb_asthma', params.asthma),
        p('comorb_sleep_apnea', params.sleep_apnea),

        // Activity
        p('Step Count', params.daily_steps, 'steps'),
        p('Active Minutes', params.active_minutes, 'min'),
        p('Horizontal Distance Covered', params.distance_walked, 'km'),
        p('floors_climbed', params.floors_climbed, 'floors'),

        // Vitals
        p('Heart Rate', params.heart_rate, 'bpm'),
        p('Resting Heart Rate', params.resting_heart_rate, 'bpm'),
        p('Average HRV', params.hrv, 'ms'),
        p('Respiratory Rate', params.respiratory_rate, 'brpm'),
        p('Body Temperature', params.body_temperature, '°C'),
        p('Blood Glucose Record', params.blood_glucose, 'mg/dL'),
        p('blood_glucose_max', params.blood_glucose_max, 'mg/dL'),
        p('blood_glucose_min', params.blood_glucose_min, 'mg/dL'),
        p('Blood Pressure Systolic', params.systolic_bp, 'mmHg'),
        p('Blood Pressure Diastolic', params.diastolic_bp, 'mmHg'),

        // Environment
        p('aqi', params.aqi, 'index'),
        p('uv_index', params.uv_index, 'index'),
        p('pollen_level', params.pollen_level, 'level'),

        // Sleep
        p('Sleep Duration', params.sleep_duration, 'hrs'),
        p('Sleep Average Heart Rate', params.sleep_heart_rate, 'bpm'),
        p('Sleep Min SPO2', params.spo2_min, '%'),
        p('Sleep Quality', params.sleep_quality, 'score'),

        // Nutrition
        p('Total Energy Intake from Food', params.calorie_intake, 'kcal'),
        p('Hydration Volume', params.water_intake, 'L'),
        p('protein_pct', params.protein_pct, '%'),
        p('carbs_pct', params.carbs_pct, '%'),
        p('fats_pct', params.fats_pct, '%'),

        // Stress & Recovery
        p('Body Stress Score', params.stress_level, 'score'),
        p('Recovery Score', params.recovery_score, 'score'),

        // Symptoms
        p('symp_abdominal_cramps', params.symptom_abdominal_cramps),
        p('symp_night_sweats', params.symptom_night_sweats),
        p('Headache', params.symptom_headache),
        p('Fatigue', params.symptom_fatigue),
        p('Insomnia', params.symptom_insomnia),
        p('Joint Pain', params.symptom_joint_pain),
        p('Dizziness', params.symptom_dizziness),
        p('Shortness of Breath', params.symptom_shortness_of_breath),

        // Labs
        p('41995-2', params.hba1c, '%'), // HbA1c LOINC
        p('2093-3', params.total_cholesterol, 'mg/dL'),
        p('2085-9', params.hdl, 'mg/dL'),
        p('13457-7', params.ldl, 'mg/dL'),
        p('2571-8', params.triglycerides, 'mg/dL'),
        p('1989-3', params.vitamin_d, 'ng/mL'),
        p('2132-9', params.vitamin_b12, 'pg/mL'),
        p('3016-3', params.tsh, 'mIU/L'),
        p('718-7', params.hemoglobin, 'g/dL'),
        p('2160-0', params.creatinine, 'mg/dL'),
    ];
}
