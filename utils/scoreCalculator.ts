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
      // We don't have boolean ranges in the DB schema setup properly, so we bypass it here.
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
          return Math.max(20, 80 - (fraction * 60)); // 20 is absolute bottom out unless extremely pathological
      } 
      // Off the charts without critical max known
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
      // Off the charts low
      return Math.max(20, 80 - (( (normal_min ?? optimal_min) - numVal) / (normal_min ?? optimal_min)) * 50);
  }

  return 50; // Unknown variance
}

export function calculateAxesScores(
  parameters: HealthParameter[],
  definitions: HealthParameterDefinition[],
  ranges: HealthParameterRange[],
  details: HealthPersonalDetails | null
): HealthScore[] {
  
  const age = details?.age ?? 30; // Default to 30 if unknown
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

  // Group by parameter name to only use the MOST RECENT value
  const latestParams = new Map<string, HealthParameter>();
  for (const p of parameters) {
      const existing = latestParams.get(p.parameter_name.toLowerCase());
      if (!existing || new Date(p.recorded_at) > new Date(existing.recorded_at)) {
          latestParams.set(p.parameter_name.toLowerCase(), p);
      }
  }

  // Compute individual scores
  for (const param of Array.from(latestParams.values())) {
      // Match definition
      const def = definitions.find(d => 
          d.name.toLowerCase() === param.parameter_name.toLowerCase() || 
          d.id.toLowerCase() === param.parameter_name.toLowerCase()
      );
      if (!def) continue;

      // Match correct demographic range brackets
      const matchedRanges = ranges.filter(r => r.parameter_id === def.id);
      
      // Try specific gender + age
      let r = matchedRanges.find(r => r.gender === gender && age >= r.min_age && age <= r.max_age);
      // Fallback 1: specific gender, open age
      if (!r) r = matchedRanges.find(r => r.gender === gender);
      // Fallback 2: ALL gender, specific age
      if (!r) r = matchedRanges.find(r => r.gender === 'ALL' && age >= r.min_age && age <= r.max_age);
      // Fallback 3: Generic ALL
      if (!r) r = matchedRanges.find(r => r.gender === 'ALL');

      if (!r) continue;

      const pScore = calculateParameterScore(param.parameter_value, r);
      if (pScore === null) continue;

      // Distribute score across axes according to definition weights
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

  // Finalize averages
  const finalScores: HealthScore[] = Object.values(axesAccumulators).map(ax => {
      let finalScore = ax.weight > 0 ? Math.round(ax.score / ax.weight) : 0;
      // Provide a Baseline of 85 if no data is found for an axis to keep UI looking somewhat complete
      if (ax.weight === 0) finalScore = 85; 
      
      return {
          category: ax.name,
          score: finalScore
      };
  });

  // Calculate Overall Score (Arithmetic Mean of the 7 axes)
  const totalScore = finalScores.reduce((sum, ax) => sum + ax.score, 0);
  const overallScore = Math.round(totalScore / finalScores.length);
  
  finalScores.unshift({
      category: 'Overall Health',
      score: overallScore
  });

  return finalScores;
}
