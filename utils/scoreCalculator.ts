import {
  HealthParameter,
  HealthParameterDefinition,
  HealthParameterRange,
  HealthPersonalDetails,
  HealthScore
} from '../store/healthTwin';

// Mathematical representation of health score mapped 0-100
// P_score = max(0, 100 - (\max(0, distance_from_optimal) / allowed_variance) * 50)
// This is a simplified boundary logic mapped to Optimal, Normal, and Critical thresholds.
function calculateParameterScore(
  val: number | string | boolean,
  rangeDef: HealthParameterRange | undefined
): number | null {
  if (!rangeDef) return null; // Can't score without reference ranges

  if (typeof val === 'boolean') {
      // For boolean exact indicators: false is generally good (no symptom), true is bad (has symptom)
      return val === true ? 20 : 100;
  }

  const numVal = Number(val);
  if (isNaN(numVal)) return null;

  const { 
      optimal_min, optimal_max, 
      normal_min, normal_max, 
      critical_min, critical_max 
  } = rangeDef;

  // 1. Within Optimal
  if (
      (optimal_min === null || numVal >= optimal_min) &&
      (optimal_max === null || numVal <= optimal_max)
  ) {
      return 100;
  }

  // 2. High Out of Bounds
  if (optimal_max !== null && numVal > optimal_max) {
      if (normal_max !== null && numVal <= normal_max) {
          // Normal but high: 80-99
          const fraction = (numVal - optimal_max) / (normal_max - optimal_max);
          return Math.max(80, 100 - (fraction * 20));
      }
      if (critical_max !== null) {
          // Borderline to Critical: 40-79
          const normMax = normal_max ?? optimal_max;
          const fraction = Math.min(1, (numVal - normMax) / (critical_max - normMax));
          return Math.max(20, 80 - (fraction * 60)); 
      } 
      return Math.max(20, 80 - ((numVal - (normal_max ?? optimal_max)) / (normal_max ?? optimal_max)) * 50);
  }

  // 3. Low Out of Bounds
  if (optimal_min !== null && numVal < optimal_min) {
      if (normal_min !== null && numVal >= normal_min) {
          // Normal but low: 80-99
          const fraction = (optimal_min - numVal) / (optimal_min - normal_min);
          return Math.max(80, 100 - (fraction * 20));
      }
      if (critical_min !== null) {
          // Borderline to Critical: 40-79
          const normMin = normal_min ?? optimal_min;
          const fraction = Math.min(1, (normMin - numVal) / (normMin - critical_min));
          return Math.max(20, 80 - (fraction * 60));
      }
      return Math.max(20, 80 - (( (normal_min ?? optimal_min) - numVal) / (normal_min ?? optimal_min)) * 50);
  }

  return 50;
}

export function calculateAxesScores(
  parameters: HealthParameter[],
  definitions: HealthParameterDefinition[],
  ranges: HealthParameterRange[],
  details: HealthPersonalDetails | null
): HealthScore[] {
  
  const age = details?.age ?? 30;
  const gender = details?.gender === 'Female' ? 'F' : (details?.gender === 'Male' ? 'M' : 'ALL');

  const axesAccumulators = {
      energy: { score: 0, weight: 0, name: 'Energy & Metabolism' },
      strength: { score: 0, weight: 0, name: 'Strength & Recovery' },
      mind: { score: 0, weight: 0, name: 'Mind & Focus' },
      resilience: { score: 0, weight: 0, name: 'Resilience & Defence' },
      heart: { score: 0, weight: 0, name: 'Heart & Circulation' },
      hormone: { score: 0, weight: 0, name: 'Hormone & Vitality' },
      environment: { score: 0, weight: 0, name: 'Environment' },
  };

  const latestParams = new Map<string, HealthParameter>();
  for (const p of parameters) {
      const existing = latestParams.get(p.parameter_name.toLowerCase());
      if (!existing || new Date(p.recorded_at) > new Date(existing.recorded_at)) {
          latestParams.set(p.parameter_name.toLowerCase(), p);
      }
  }

  for (const param of Array.from(latestParams.values())) {
      const normalize = (s: string) => s.toLowerCase().replace(/_/g, ' ').trim();
      const paramNameNorm = normalize(param.parameter_name);
      const paramIdNorm = param.parameter_name.toLowerCase().trim();

      let def = definitions.find(d => 
          normalize(d.name) === paramNameNorm || 
          normalize(d.id) === paramNameNorm ||
          d.id.toLowerCase() === paramIdNorm
      );

      const hasWeights = (d: any) => d?.axis_impact_weights && Object.keys(d.axis_impact_weights).length > 0;
      
      if (!def || !hasWeights(def)) {
          const defaults: Record<string, HealthParameterDefinition> = {
              'aqi': { id: 'aqi', name: 'Air Quality Index', category: 'environment', unit: 'index', axis_impact_weights: { environment: 3, resilience: 2 } },
              'uv_index': { id: 'uv_index', name: 'UV Index', category: 'environment', unit: 'index', axis_impact_weights: { environment: 3, resilience: 1 } },
              'pollen_level': { id: 'pollen_level', name: 'Pollen Level', category: 'environment', unit: 'level', axis_impact_weights: { environment: 2, resilience: 3 } },
              'step_count': { id: 'step_count', name: 'Step Count', category: 'activity', unit: 'steps', axis_impact_weights: { energy: 3, heart: 2, strength: 1 } },
              'step count': { id: 'step_count', name: 'Step Count', category: 'activity', unit: 'steps', axis_impact_weights: { energy: 3, heart: 2, strength: 1 } },
              'daily steps': { id: 'step_count', name: 'Step Count', category: 'activity', unit: 'steps', axis_impact_weights: { energy: 3, heart: 2, strength: 1 } },
              'active_minutes': { id: 'active_minutes', name: 'Active Minutes', category: 'activity', unit: 'min', axis_impact_weights: { energy: 3, heart: 2, strength: 2 } },
              'active minutes': { id: 'active_minutes', name: 'Active Minutes', category: 'activity', unit: 'min', axis_impact_weights: { energy: 3, heart: 2, strength: 2 } },
              'heart_rate': { id: 'heart_rate', name: 'Heart Rate', category: 'vitals', unit: 'bpm', axis_impact_weights: { heart: 3, energy: 1, resilience: 1 } },
              'heart rate': { id: 'heart_rate', name: 'Heart Rate', category: 'vitals', unit: 'bpm', axis_impact_weights: { heart: 3, energy: 1, resilience: 1 } },
              'avg heart rate': { id: 'heart_rate', name: 'Heart Rate', category: 'vitals', unit: 'bpm', axis_impact_weights: { heart: 3, energy: 1, resilience: 1 } },
              'resting_heart_rate': { id: 'resting_heart_rate', name: 'Resting Heart Rate', category: 'vitals', unit: 'bpm', axis_impact_weights: { heart: 3, resilience: 1 } },
              'resting heart rate': { id: 'resting_heart_rate', name: 'Resting Heart Rate', category: 'vitals', unit: 'bpm', axis_impact_weights: { heart: 3, resilience: 1 } },
              'resting hr': { id: 'resting_heart_rate', name: 'Resting Heart Rate', category: 'vitals', unit: 'bpm', axis_impact_weights: { heart: 3, resilience: 1 } },
              'respiratory_rate': { id: 'respiratory_rate', name: 'Respiratory Rate', category: 'vitals', unit: 'brpm', axis_impact_weights: { heart: 2, resilience: 2 } },
              'respiratory rate': { id: 'respiratory_rate', name: 'Respiratory Rate', category: 'vitals', unit: 'brpm', axis_impact_weights: { heart: 2, resilience: 2 } },
              'body_temperature': { id: 'body_temperature', name: 'Body Temperature', category: 'vitals', unit: '°C', axis_impact_weights: { resilience: 3 } },
              'body temperature': { id: 'body_temperature', name: 'Body Temperature', category: 'vitals', unit: '°C', axis_impact_weights: { resilience: 3 } },
              'body temp': { id: 'body_temperature', name: 'Body Temperature', category: 'vitals', unit: '°C', axis_impact_weights: { resilience: 3 } },
              'systolic_bp': { id: 'systolic_bp', name: 'Blood Pressure Systolic', category: 'vitals', unit: 'mmHg', axis_impact_weights: { heart: 3, resilience: 1 } },
              'blood pressure systolic': { id: 'systolic_bp', name: 'Blood Pressure Systolic', category: 'vitals', unit: 'mmHg', axis_impact_weights: { heart: 3, resilience: 1 } },
              'systolic bp': { id: 'systolic_bp', name: 'Blood Pressure Systolic', category: 'vitals', unit: 'mmHg', axis_impact_weights: { heart: 3, resilience: 1 } },
              'diastolic_bp': { id: 'diastolic_bp', name: 'Blood Pressure Diastolic', category: 'vitals', unit: 'mmHg', axis_impact_weights: { heart: 3, resilience: 1 } },
              'blood pressure diastolic': { id: 'diastolic_bp', name: 'Blood Pressure Diastolic', category: 'vitals', unit: 'mmHg', axis_impact_weights: { heart: 3, resilience: 1 } },
              'diastolic bp': { id: 'diastolic_bp', name: 'Blood Pressure Diastolic', category: 'vitals', unit: 'mmHg', axis_impact_weights: { heart: 3, resilience: 1 } },
              'blood_glucose': { id: 'blood_glucose', name: 'Blood Glucose', category: 'labs', unit: 'mg/dL', axis_impact_weights: { energy: 3, hormone: 2 } },
              'blood glucose': { id: 'blood_glucose', name: 'Blood Glucose', category: 'labs', unit: 'mg/dL', axis_impact_weights: { energy: 3, hormone: 2 } },
              'blood glucose record': { id: 'blood_glucose', name: 'Blood Glucose', category: 'labs', unit: 'mg/dL', axis_impact_weights: { energy: 3, hormone: 2 } },
              'hba1c': { id: 'hba1c', name: 'HbA1c', category: 'labs', unit: '%', axis_impact_weights: { energy: 3, hormone: 2, resilience: 1 } },
              'calorie_intake': { id: 'calorie_intake', name: 'Calorie Intake', category: 'nutrition', unit: 'kcal', axis_impact_weights: { energy: 3, hormone: 1 } },
              'calorie intake': { id: 'calorie_intake', name: 'Calorie Intake', category: 'nutrition', unit: 'kcal', axis_impact_weights: { energy: 3, hormone: 1 } },
              'total energy intake from food': { id: 'calorie_intake', name: 'Calorie Intake', category: 'nutrition', unit: 'kcal', axis_impact_weights: { energy: 3, hormone: 1 } },
              'water_intake': { id: 'water_intake', name: 'Daily Water Intake', category: 'nutrition', unit: 'L', axis_impact_weights: { energy: 1, resilience: 3 } },
              'water intake': { id: 'water_intake', name: 'Daily Water Intake', category: 'nutrition', unit: 'L', axis_impact_weights: { energy: 1, resilience: 3 } },
              'hydration volume': { id: 'water_intake', name: 'Daily Water Intake', category: 'nutrition', unit: 'L', axis_impact_weights: { energy: 1, resilience: 3 } },
              'sleep_duration': { id: 'sleep_duration', name: 'Sleep Duration', category: 'sleep', unit: 'hrs', axis_impact_weights: { mind: 3, strength: 2, hormone: 2 } },
              'sleep duration': { id: 'sleep_duration', name: 'Sleep Duration', category: 'sleep', unit: 'hrs', axis_impact_weights: { mind: 3, strength: 2, hormone: 2 } },
              'sleep_quality': { id: 'sleep_quality', name: 'Sleep Quality', category: 'sleep', unit: 'score', axis_impact_weights: { mind: 3, resilience: 2 } },
              'sleep quality': { id: 'sleep_quality', name: 'Sleep Quality', category: 'sleep', unit: 'score', axis_impact_weights: { mind: 3, resilience: 2 } },
              'spo2_min': { id: 'spo2_min', name: 'Sleep Min SpO2', category: 'sleep', unit: '%', axis_impact_weights: { mind: 2, heart: 2 } },
              'spo2 min': { id: 'spo2_min', name: 'Sleep Min SpO2', category: 'sleep', unit: '%', axis_impact_weights: { mind: 2, heart: 2 } },
              'sleep min spo2': { id: 'spo2_min', name: 'Sleep Min SpO2', category: 'sleep', unit: '%', axis_impact_weights: { mind: 2, heart: 2 } },
              'sleep_heart_rate': { id: 'sleep_heart_rate', name: 'Sleep Average Heart Rate', category: 'sleep', unit: 'bpm', axis_impact_weights: { heart: 2, resilience: 1 } },
              'sleep hr': { id: 'sleep_heart_rate', name: 'Sleep Average Heart Rate', category: 'sleep', unit: 'bpm', axis_impact_weights: { heart: 2, resilience: 1 } },
              'sleep average heart rate': { id: 'sleep_heart_rate', name: 'Sleep Average Heart Rate', category: 'sleep', unit: 'bpm', axis_impact_weights: { heart: 2, resilience: 1 } },
              'stress_level': { id: 'stress_level', name: 'Average Stress Level', category: 'mental', unit: 'score', axis_impact_weights: { mind: 3, hormone: 2 } },
              'stress level': { id: 'stress_level', name: 'Average Stress Level', category: 'mental', unit: 'score', axis_impact_weights: { mind: 3, hormone: 2 } },
              'body stress score': { id: 'stress_level', name: 'Average Stress Level', category: 'mental', unit: 'score', axis_impact_weights: { mind: 3, hormone: 2 } },
              'recovery_score': { id: 'recovery_score', name: 'Recovery Score', category: 'recovery', unit: 'score', axis_impact_weights: { strength: 3, energy: 2, resilience: 1 } },
              'recovery score': { id: 'recovery_score', name: 'Recovery Score', category: 'recovery', unit: 'score', axis_impact_weights: { strength: 3, energy: 2, resilience: 1 } },
              '39156-5': { id: '39156-5', name: 'Body Mass Index (BMI)', category: 'vitals', unit: 'kg/m²', axis_impact_weights: { heart: 3, resilience: 2, strength: 1, energy: 1, mind: 1 } },
              'comorb_diabetes': { id: 'comorb_diabetes', name: 'Diabetes', category: 'history', unit: 'indicator', axis_impact_weights: { energy: 3, hormone: 2, resilience: 1 } },
              'comorb diabetes': { id: 'comorb_diabetes', name: 'Diabetes', category: 'history', unit: 'indicator', axis_impact_weights: { energy: 3, hormone: 2, resilience: 1 } },
              'comorb_hypertension': { id: 'comorb_hypertension', name: 'Hypertension', category: 'history', unit: 'indicator', axis_impact_weights: { heart: 4, resilience: 1 } },
              'comorb hypertension': { id: 'comorb_hypertension', name: 'Hypertension', category: 'history', unit: 'indicator', axis_impact_weights: { heart: 4, resilience: 1 } },
          };
          
          const fallback = defaults[paramIdNorm] || 
                           defaults[paramNameNorm] || 
                           Object.values(defaults).find(d => normalize(d.id) === paramNameNorm || normalize(d.name) === paramNameNorm);
          
          if (fallback) {
              def = def ? { ...def, axis_impact_weights: fallback.axis_impact_weights } : fallback;
          }
      }

      if (!def) continue;

      const matchedRanges = ranges.filter(r => r.parameter_id === def?.id);
      let r = matchedRanges.find(r => r.gender === gender && age >= r.min_age && age <= r.max_age);
      if (!r) r = matchedRanges.find(r => r.gender === gender);
      if (!r) r = matchedRanges.find(r => r.gender === 'ALL' && age >= r.min_age && age <= r.max_age);
      if (!r) r = matchedRanges.find(r => r.gender === 'ALL');

      if (!r && def) {
          const drs: Record<string, any> = {
              'aqi': { optimal_min: 0, optimal_max: 50, normal_min: 0, normal_max: 100, critical_min: null, critical_max: 300 },
              'uv_index': { optimal_min: 0, optimal_max: 2, normal_min: 0, normal_max: 5, critical_min: null, critical_max: 11 },
              'pollen_level': { optimal_min: 0, optimal_max: 3, normal_min: 0, normal_max: 6, critical_min: null, critical_max: 12 },
              'step_count': { optimal_min: 10000, optimal_max: 20000, normal_min: 5000, normal_max: 30000, critical_min: 2000, critical_max: null },
              'active_minutes': { optimal_min: 45, optimal_max: 120, normal_min: 20, normal_max: 300, critical_min: 5, critical_max: null },
              'resting_heart_rate': { optimal_min: 50, optimal_max: 70, normal_min: 40, normal_max: 90, critical_min: 35, critical_max: 110 },
              'systolic_bp': { optimal_min: 90, optimal_max: 120, normal_min: 80, normal_max: 140, critical_min: 70, critical_max: 180 },
              'diastolic_bp': { optimal_min: 60, optimal_max: 80, normal_min: 50, normal_max: 90, critical_min: 40, critical_max: 110 },
              'blood_glucose': { optimal_min: 70, optimal_max: 99, normal_min: 60, normal_max: 140, critical_min: 40, critical_max: 250 },
              'hba1c': { optimal_min: 4.0, optimal_max: 5.6, normal_min: 3.5, normal_max: 6.4, critical_min: 3.0, critical_max: 10.0 },
              'sleep_duration': { optimal_min: 7, optimal_max: 9, normal_min: 6, normal_max: 10, critical_min: 4, critical_max: 12 },
              'sleep_quality': { optimal_min: 85, optimal_max: 100, normal_min: 60, normal_max: 100, critical_min: 30, critical_max: null },
              'sleep_heart_rate': { optimal_min: 45, optimal_max: 65, normal_min: 40, normal_max: 85, critical_min: 35, critical_max: 100 },
              'water_intake': { optimal_min: 2.7, optimal_max: 3.7, normal_min: 2.0, normal_max: 5.0, critical_min: 1.0, critical_max: 7.0 },
              'stress_level': { optimal_min: 0, optimal_max: 25, normal_min: 0, normal_max: 60, critical_min: null, critical_max: 90 },
              'recovery_score': { optimal_min: 70, optimal_max: 100, normal_min: 40, normal_max: 100, critical_min: 10, critical_max: null },
              'total_cholesterol': { optimal_min: 125, optimal_max: 200, normal_min: 100, normal_max: 240, critical_min: null, critical_max: 300 },
              'hdl': { optimal_min: 60, optimal_max: null, normal_min: 40, normal_max: null, critical_min: 30, critical_max: null },
              'ldl': { optimal_min: 0, optimal_max: 100, normal_min: 0, normal_max: 160, critical_min: null, critical_max: 190 },
              'triglycerides': { optimal_min: 0, optimal_max: 150, normal_min: 0, normal_max: 200, critical_min: null, critical_max: 500 },
              'vitamin_d': { optimal_min: 30, optimal_max: 100, normal_min: 20, normal_max: 100, critical_min: 10, critical_max: null },
              'vitamin_b12': { optimal_min: 500, optimal_max: 900, normal_min: 200, normal_max: 1100, critical_min: 100, critical_max: null },
              'hemoglobin': { optimal_min: 13.5, optimal_max: 17.5, normal_min: 12.0, normal_max: 18.0, critical_min: 10.0, critical_max: 20.0 },
              'heart_rate': { optimal_min: 55, optimal_max: 85, normal_min: 50, normal_max: 100, critical_min: 40, critical_max: 160 },
              'respiratory_rate': { optimal_min: 12, optimal_max: 18, normal_min: 10, normal_max: 24, critical_min: 8, critical_max: 35 },
              'body_temperature': { optimal_min: 36.3, optimal_max: 37.3, normal_min: 35.5, normal_max: 38.0, critical_min: 34.0, critical_max: 40.0 },
              'spo2_min': { optimal_min: 95, optimal_max: 100, normal_min: 92, normal_max: 100, critical_min: 85, critical_max: null },
              'calorie_intake': { optimal_min: 1800, optimal_max: 2500, normal_min: 1500, normal_max: 3000, critical_min: 1000, critical_max: 5000 },
              'hrv': { optimal_min: 50, optimal_max: 150, normal_min: 30, normal_max: 200, critical_min: 15, critical_max: null },
              '39156-5': gender === 'F' 
                  ? { optimal_min: 18, optimal_max: 24, normal_min: 15, normal_max: 29, critical_min: null, critical_max: 34 }
                  : { optimal_min: 18.5, optimal_max: 25, normal_min: 16, normal_max: 30, critical_min: null, critical_max: 35 },
          };
          const dr = drs[def.id] || 
                     drs[paramIdNorm] ||
                     drs[normalize(def.name)] || 
                     drs[normalize(def.id)];
          if (dr) {
              r = { ...dr, parameter_id: def.id, gender: 'ALL', min_age: 0, max_age: 120, id: `fallback-${def.id}` };
          }
      }

      if (!r) continue;

      const pScore = calculateParameterScore(param.parameter_value, r);
      if (pScore === null) continue;

      const weights = def.axis_impact_weights as Record<string, number>;
      Object.keys(axesAccumulators).forEach(axisKey => {
          const w = weights[axisKey] ?? 0;
          if (w > 0) {
              const ax = axesAccumulators[axisKey as keyof typeof axesAccumulators];
              ax.score += (pScore * w);
              ax.weight += w;
          }
      });
  }

  const finalScores: HealthScore[] = Object.values(axesAccumulators).map(ax => {
      let finalScore = ax.weight > 0 ? Math.round(ax.score / ax.weight) : 0;
      if (ax.weight === 0) finalScore = 85; 
      
      return {
          category: ax.name,
          score: finalScore
      };
  });

  const totalScore = finalScores.reduce((sum, ax) => sum + ax.score, 0);
  const overallScore = Math.round(totalScore / finalScores.length);
  
  finalScores.unshift({
      category: 'Overall Health',
      score: overallScore
  });

  return finalScores;
}
