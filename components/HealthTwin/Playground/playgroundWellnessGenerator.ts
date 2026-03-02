import { WellnessProgram } from '../../../store/healthTwin';
import { PlaygroundParameters } from '../../../store/playgroundStore';

/**
 * Generates wellness plans locally for the playground to ensure instant feedback
 * and avoid unnecessary edge function calls during simulation.
 */
export function generatePlaygroundWellness(params: PlaygroundParameters): WellnessProgram[] {
    const programs: WellnessProgram[] = [];
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Cardiovascular Optimization
    if (params.daily_steps < 7000 || params.resting_heart_rate > 75) {
        programs.push({
            id: 'pg-cardio-' + Date.now(),
            title: 'Cardiovascular Optimization',
            icon: 'heart',
            priority: params.resting_heart_rate > 85 ? 'high' : 'medium',
            duration: '12 weeks',
            reason: `Simulated resting HR of ${params.resting_heart_rate} bpm indicates potential for aerobic base improvement.`,
            data_connections: [
                { metric: 'Steps', value: params.daily_steps.toLocaleString(), insight: 'Below target for metabolic health.' },
                { metric: 'Resting HR', value: `${params.resting_heart_rate} bpm`, insight: 'Cardiac efficiency marker.' }
            ],
            weekly_plan: [
                { day: 'Mon/Wed/Fri', activity: 'Zone 2 Cardio', goal: '35 mins steady state' },
                { day: 'Tue/Thu', activity: 'Strength Training', goal: 'Focus on compound movements' }
            ],
            expected_outcomes: ['Decrease in resting HR by 3-5 bpm', 'Improved recovery scores'],
            generated_at: now,
            expires_at: expires
        });
    }

    // 2. Glycemic Stability
    if (params.hba1c > 5.7 || params.blood_glucose > 100 || params.diabetes) {
        programs.push({
            id: 'pg-glycemic-' + Date.now(),
            title: 'Glycemic Stability Plan',
            icon: 'utensils',
            priority: (params.hba1c > 6.5 || params.diabetes) ? 'high' : 'medium',
            duration: '6 months',
            reason: `Simulated HbA1c of ${params.hba1c}% suggests a benefit from glycemic load management.`,
            data_connections: [
                { metric: 'HbA1c', value: `${params.hba1c}%`, insight: 'Long-term glucose control marker.' },
                { metric: 'Max Glucose', value: `${params.blood_glucose_max} mg/dL`, insight: 'Peak glycemic excursion.' }
            ],
            weekly_plan: [
                { day: 'Daily', activity: 'Low GI Nutrition', goal: '< 150g net carbs' },
                { day: 'Post-Meal', activity: 'Light Walk', goal: '10-15 mins to blunt spikes' }
            ],
            expected_outcomes: ['Stabilized energy levels', 'Reduction in simulated HbA1c'],
            generated_at: now,
            expires_at: expires
        });
    }

    // 3. Sleep & Recovery
    if (params.sleep_duration < 6.5 || params.sleep_quality < 70 || params.stress_level > 60) {
        programs.push({
            id: 'pg-sleep-' + Date.now(),
            title: 'Sleep & Recovery Protocol',
            icon: 'moon',
            priority: (params.sleep_duration < 5) ? 'high' : 'medium',
            duration: '4 weeks',
            reason: `Simulated sleep duration of ${params.sleep_duration}h is below restorative thresholds.`,
            data_connections: [
                { metric: 'Sleep', value: `${params.sleep_duration}h`, insight: 'Insufficient total duration.' },
                { metric: 'Recovery', value: `${params.recovery_score}/100`, insight: 'Systemic readiness marker.' }
            ],
            weekly_plan: [
                { day: 'Nightly', activity: 'Blue Light Blockers', goal: '90 mins before bed' },
                { day: 'Morning', activity: 'Sunlight Exposure', goal: '20 mins upon waking' }
            ],
            expected_outcomes: ['Improved deep sleep percentage', '20% increase in recovery score'],
            generated_at: now,
            expires_at: expires
        });
    }

    // 4. Lipid Management
    if (params.ldl > 130 || params.triglycerides > 150 || params.hyperlipidemia) {
        programs.push({
            id: 'pg-lipid-' + Date.now(),
            title: 'Lipid Management Protocol',
            icon: 'activity',
            priority: params.ldl > 160 ? 'high' : 'medium',
            duration: '6 months',
            reason: `Elevated simulated LDL (${params.ldl} mg/dL) impacts long-term cardiovascular scoring.`,
            data_connections: [
                { metric: 'LDL', value: `${params.ldl} mg/dL`, insight: 'Atherogenic risk marker.' },
                { metric: 'Triglycerides', value: `${params.triglycerides} mg/dL`, insight: 'Metabolic syndrome indicator.' }
            ],
            weekly_plan: [
                { day: 'Daily', activity: 'Soluble Fiber', goal: '25-35g per day' },
                { day: '5x Weekly', activity: 'LISS Cardio', goal: '45 mins walking/cycling' }
            ],
            expected_outcomes: ['Reduction in LDL-C', 'Improved HDL/Triglyceride ratio'],
            generated_at: now,
            expires_at: expires
        });
    }

    // 5. Environmental Resilience
    if (params.aqi > 50 || params.pollen_level > 5) {
        programs.push({
            id: 'pg-env-' + Date.now(),
            title: 'Environmental Resilience',
            icon: 'wind',
            priority: params.aqi > 100 ? 'high' : 'medium',
            duration: 'Ongoing',
            reason: `Simulated AQI of ${params.aqi} increases respiratory inflammatory load.`,
            data_connections: [
                { metric: 'AQI', value: `${params.aqi}`, insight: 'Air quality impact on SPO2.' },
                { metric: 'Pollen', value: `${params.pollen_level}`, insight: 'Allergenic stressor.' }
            ],
            weekly_plan: [
                { day: 'Daily', activity: 'Air Filtration', goal: 'Maintain HEPA in key rooms' },
                { day: 'High AQI Days', activity: 'Indoor Exercise', goal: 'Avoid outdoor exertion' }
            ],
            expected_outcomes: ['Maintained airway health', 'Reduced systemic inflammation'],
            generated_at: now,
            expires_at: expires
        });
    }

    // 6. Nutritional Balance
    if (params.protein_pct < 15 || params.calorie_intake > 3000) {
        programs.push({
            id: 'pg-nutrition-' + Date.now(),
            title: 'Nutritional Balance Plan',
            icon: 'utensils',
            priority: 'medium',
            duration: '4 weeks',
            reason: `Simulated calorie intake of ${params.calorie_intake} kcal requires optimized macro splitting.`,
            data_connections: [
                { metric: 'Calories', value: `${params.calorie_intake} kcal`, insight: 'Daily energy budget.' },
                { metric: 'Protein', value: `${params.protein_pct}%`, insight: 'Muscle preservation marker.' }
            ],
            weekly_plan: [
                { day: 'Daily', activity: 'Protein Pacing', goal: '25g per meal' },
                { day: 'Daily', activity: 'Water Intake', goal: `Target ${params.water_intake}L` }
            ],
            expected_outcomes: ['Optimized body composition', 'Sustained energy levels'],
            generated_at: now,
            expires_at: expires
        });
    }

    return programs;
}
