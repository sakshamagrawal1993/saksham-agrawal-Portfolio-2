import type {
    HealthParameter,
    HealthParameterDefinition,
    HealthPersonalDetails,
} from '../../../store/healthTwin';
import type { PlaygroundParameters } from '../../../store/playgroundStore';

type NumericPlaygroundKey = {
    [K in keyof PlaygroundParameters]: PlaygroundParameters[K] extends number ? K : never;
}[keyof PlaygroundParameters];

interface ParameterMapping {
    key: NumericPlaygroundKey;
    aliases: string[];
}

export interface PlaygroundBaselineInput {
    defaults: PlaygroundParameters;
    labParameters: HealthParameter[];
    wearableParameters: HealthParameter[];
    parameterDefinitions: HealthParameterDefinition[];
    personalDetails: HealthPersonalDetails | null;
}

const PARAMETER_MAPPINGS: ParameterMapping[] = [
    { key: 'daily_steps', aliases: ['daily_steps', 'daily steps', 'step_count', 'step count'] },
    { key: 'active_minutes', aliases: ['active_minutes', 'active minutes'] },
    { key: 'distance_walked', aliases: ['distance_walked', 'distance walked', 'horizontal distance covered'] },
    { key: 'floors_climbed', aliases: ['floors_climbed', 'floors climbed'] },
    { key: 'heart_rate', aliases: ['heart_rate', 'heart rate', 'average heart rate', 'avg heart rate'] },
    { key: 'resting_heart_rate', aliases: ['resting_heart_rate', 'resting heart rate', 'resting hr'] },
    { key: 'hrv', aliases: ['hrv', 'average hrv', 'heart rate variability'] },
    { key: 'respiratory_rate', aliases: ['respiratory_rate', 'respiratory rate'] },
    { key: 'body_temperature', aliases: ['body_temperature', 'body temperature', 'body temp'] },
    { key: 'blood_glucose', aliases: ['blood_glucose', 'blood glucose', 'blood glucose record'] },
    { key: 'blood_glucose_max', aliases: ['blood_glucose_max', '7-day max blood glucose', '7 day max blood glucose'] },
    { key: 'blood_glucose_min', aliases: ['blood_glucose_min', '7-day min blood glucose', '7 day min blood glucose'] },
    { key: 'systolic_bp', aliases: ['systolic_bp', 'systolic bp', 'blood pressure systolic'] },
    { key: 'diastolic_bp', aliases: ['diastolic_bp', 'diastolic bp', 'blood pressure diastolic'] },
    { key: 'aqi', aliases: ['aqi', 'air quality index'] },
    { key: 'uv_index', aliases: ['uv_index', 'uv index'] },
    { key: 'pollen_level', aliases: ['pollen_level', 'pollen level'] },
    { key: 'sleep_duration', aliases: ['sleep_duration', 'sleep duration'] },
    { key: 'sleep_heart_rate', aliases: ['sleep_heart_rate', 'sleep heart rate', 'sleep average heart rate'] },
    { key: 'spo2_min', aliases: ['spo2_min', 'spo2 min', 'sleep min spo2', 'sleep minimum spo2'] },
    { key: 'sleep_quality', aliases: ['sleep_quality', 'sleep quality'] },
    { key: 'calorie_intake', aliases: ['calorie_intake', 'calorie intake', 'total energy intake from food'] },
    { key: 'water_intake', aliases: ['water_intake', 'water intake', 'daily water intake', 'hydration volume'] },
    { key: 'protein_pct', aliases: ['protein_pct', 'protein percentage', 'protein percent'] },
    { key: 'carbs_pct', aliases: ['carbs_pct', 'carbs percentage', 'carbohydrate percentage'] },
    { key: 'fats_pct', aliases: ['fats_pct', 'fats percentage', 'fat percentage'] },
    { key: 'stress_level', aliases: ['stress_level', 'stress level', 'average stress level', 'body stress score'] },
    { key: 'recovery_score', aliases: ['recovery_score', 'recovery score'] },
    { key: 'hba1c', aliases: ['41995-2', 'hba1c', 'hba1c value', 'glycated hemoglobin hba1c', 'hemoglobin a1c'] },
    { key: 'total_cholesterol', aliases: ['2093-3', 'total cholesterol', 'cholesterol total serum', 'cholesterol'] },
    { key: 'hdl', aliases: ['2085-9', 'hdl', 'hdl cholesterol', 'hdl cholesterol direct'] },
    { key: 'ldl', aliases: ['13457-7', 'ldl', 'ldl cholesterol', 'ldl cholesterol cal'] },
    { key: 'triglycerides', aliases: ['2571-8', 'triglycerides', 'triglycerides serum', 'triglyceride'] },
    { key: 'vitamin_d', aliases: ['1989-3', 'vitamin d', 'vitamin d total 25 hydroxy', 'calcidiol'] },
    { key: 'vitamin_b12', aliases: ['2132-9', 'vitamin b12', 'vitamin b12 cyanocobalamin', 'cobalamins'] },
    { key: 'tsh', aliases: ['3016-3', 'tsh', 'thyroid stimulating hormone'] },
    { key: 'hemoglobin', aliases: ['718-7', 'hemoglobin', 'hemoglobin hb'] },
    { key: 'creatinine', aliases: ['2160-0', 'creatinine', 'creatinine serum'] },
];

export function normalizePlaygroundParameterName(value: string): string {
    return value
        .normalize('NFKD')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function makeAliasIndex(): Map<string, NumericPlaygroundKey> {
    const index = new Map<string, NumericPlaygroundKey>();
    for (const mapping of PARAMETER_MAPPINGS) {
        for (const alias of [mapping.key, ...mapping.aliases]) {
            index.set(normalizePlaygroundParameterName(alias), mapping.key);
        }
    }
    return index;
}

function makeDefinitionIndex(
    definitions: HealthParameterDefinition[],
): Map<string, HealthParameterDefinition> {
    const index = new Map<string, HealthParameterDefinition>();
    for (const definition of definitions) {
        index.set(normalizePlaygroundParameterName(definition.id), definition);
        index.set(normalizePlaygroundParameterName(definition.name), definition);
    }
    return index;
}

function parameterTimestamp(parameter: HealthParameter): number {
    const timestamp = Date.parse(parameter.recorded_at);
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function resolvePlaygroundKey(
    parameter: HealthParameter,
    definitionIndex: Map<string, HealthParameterDefinition>,
    aliasIndex: Map<string, NumericPlaygroundKey>,
): NumericPlaygroundKey | undefined {
    const storedName = normalizePlaygroundParameterName(parameter.parameter_name);
    const definition = definitionIndex.get(storedName);
    const candidates = definition
        ? [storedName, normalizePlaygroundParameterName(definition.id), normalizePlaygroundParameterName(definition.name)]
        : [storedName];

    for (const candidate of candidates) {
        const key = aliasIndex.get(candidate);
        if (key) return key;
    }
    return undefined;
}

export function mapRealDataToPlaygroundBaseline({
    defaults,
    labParameters,
    wearableParameters,
    parameterDefinitions,
    personalDetails,
}: PlaygroundBaselineInput): PlaygroundParameters {
    const baseline: PlaygroundParameters = {
        ...defaults,
        age: personalDetails?.age ?? defaults.age,
        gender: personalDetails?.gender?.toLowerCase() === 'female' ? 'F' : 'M',
        weight_kg: personalDetails?.weight_kg ?? defaults.weight_kg,
        height_cm: personalDetails?.height_cm ?? defaults.height_cm,
        diabetes: personalDetails?.co_morbidities?.some(value => value.toLowerCase().includes('diabetes')) ?? false,
        hypertension: personalDetails?.co_morbidities?.some(value => value.toLowerCase().includes('hypertension')) ?? false,
        hyperlipidemia: personalDetails?.co_morbidities?.some(value => {
            const normalized = value.toLowerCase();
            return normalized.includes('cholesterol') || normalized.includes('lipid');
        }) ?? false,
        asthma: personalDetails?.co_morbidities?.some(value => value.toLowerCase().includes('asthma')) ?? false,
        sleep_apnea: personalDetails?.co_morbidities?.some(value => value.toLowerCase().includes('apnea')) ?? false,
    };

    const aliasIndex = makeAliasIndex();
    const definitionIndex = makeDefinitionIndex(parameterDefinitions);
    const latestByKey = new Map<NumericPlaygroundKey, HealthParameter>();

    for (const parameter of [...labParameters, ...wearableParameters]) {
        if (typeof parameter.parameter_value !== 'number' || !Number.isFinite(parameter.parameter_value)) {
            continue;
        }

        const key = resolvePlaygroundKey(parameter, definitionIndex, aliasIndex);
        if (!key) continue;

        const existing = latestByKey.get(key);
        if (!existing || parameterTimestamp(parameter) >= parameterTimestamp(existing)) {
            latestByKey.set(key, parameter);
        }
    }

    for (const [key, parameter] of latestByKey) {
        baseline[key] = parameter.parameter_value as PlaygroundParameters[typeof key];
    }

    return baseline;
}
