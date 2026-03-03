import { PlaygroundParameters } from '../../../store/playgroundStore';
import { WellnessProgram } from '../../../store/healthTwin';

export function generatePlaygroundWellness(params: PlaygroundParameters): WellnessProgram[] {
    const programs: WellnessProgram[] = [];

    // 1. Cardiovascular Optimization (based on high heart rate or low activity)
    if (params.resting_heart_rate > 75 || params.daily_steps < 6000) {
        programs.push({
            title: "Cardiovascular Optimization",
            id: "pg-cardio",
            generated_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
            icon: "heart",
            priority: params.resting_heart_rate > 85 ? "high" : "medium",
            duration: "12 weeks",
            reason: `Based on simulated resting HR of ${params.resting_heart_rate} bpm and activity levels.`,
            data_connections: [
                { metric: "Resting Heart Rate", value: `${params.resting_heart_rate} bpm`, insight: "Elevated resting heart rate suggests potential for aerobic efficiency improvements." },
                { metric: "Daily Steps", value: `${params.daily_steps}`, insight: "Simulated activity is below the 10,000-step optimal threshold." }
            ],
            weekly_plan: [
                { day: "Mon", activity: "Zone 2 Cardio", target_hr: "120-135 bpm", goal: "35 min" },
                { day: "Wed", activity: "HIIT Intervals", target_hr: "150-165 bpm", goal: "20 min" },
                { day: "Fri", activity: "Endurance Walk", target_hr: "110-120 bpm", goal: "60 min" }
            ],
            expected_outcomes: [
                "Reduction in resting heart rate by 5-8 bpm",
                "Improved VO2 max over a 3-month period"
            ]
        });
    }

    // 2. Glycemic Stability (based on high blood glucose or diabetes simulation)
    if (params.diabetes || params.blood_glucose > 100 || params.hba1c > 5.7) {
        programs.push({
            title: "Glycemic Stability Plan",
            id: "pg-glycemic",
            generated_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
            icon: "utensils",
            priority: (params.diabetes || params.hba1c > 6.5) ? "high" : "medium",
            duration: "6 months",
            reason: "Targeting blood glucose management and insulin sensitivity.",
            data_connections: [
                { metric: "HbA1c", value: `${params.hba1c}%`, insight: "Simulated level indicates potential for glycemic load management." },
                { metric: "Blood Glucose", value: `${params.blood_glucose} mg/dL`, insight: "Morning fasting state simulation suggests carbohydrate timing adjustments." }
            ],
            weekly_plan: [
                { day: "Daily", activity: "Post-meal Walks", target_hr: "90-105 bpm", goal: "15 min" },
                { day: "Tue/Thu", activity: "Strength Training", target_hr: "110-130 bpm", goal: "45 min" },
                { day: "Sat", activity: "Metabolic Tracking", target_hr: "N/A", goal: "Log all meals" }
            ],
            expected_outcomes: [
                "Stabilization of fasting blood glucose below 100 mg/dL",
                "Gradual reduction of HbA1c toward optimal range"
            ]
        });
    }

    // 3. Sleep & Recovery Protocol (based on low sleep or poor quality)
    if (params.sleep_duration < 7 || params.sleep_quality < 80) {
        programs.push({
            title: "Sleep & Recovery Protocol",
            id: "pg-sleep",
            generated_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
            icon: "moon",
            priority: params.sleep_duration < 5 ? "high" : "medium",
            duration: "4 weeks",
            reason: `Simulated sleep duration of ${params.sleep_duration}h is below restorative thresholds.`,
            data_connections: [
                { metric: "Sleep Duration", value: `${params.sleep_duration}h`, insight: "Shortened sleep cycles impact hormonal balance and neural recovery." },
                { metric: "Recovery Score", value: `${params.recovery_score}%`, insight: "Simulated recovery indicates potential for parasympathetic optimization." }
            ],
            weekly_plan: [
                { day: "Nightly", activity: "Digital Detox", target_hr: "Relaxing", goal: "No screens 60m before bed" },
                { day: "Mon/Wed", activity: "Yoga/Stretching", target_hr: "80-90 bpm", goal: "20 min PM" },
                { day: "Daily", activity: "Morning Sunlight", target_hr: "N/A", goal: "10 min first thing" }
            ],
            expected_outcomes: [
                "Increase in REM and Deep Sleep percentages",
                "Improved morning alertness and sustained energy"
            ]
        });
    }

    // 4. Environmental Resilience (based on AQI or UV or Asthma)
    if (params.aqi > 100 || params.uv_index > 8 || params.asthma) {
        programs.push({
            title: "Environmental Resilience",
            id: "pg-env",
            generated_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
            icon: "shield",
            priority: (params.aqi > 200 || (params.asthma && params.aqi > 100)) ? "high" : "medium",
            duration: "Seasonal",
            reason: params.asthma 
                ? `Managing respiratory sensitivity due to Asthma simulation in ${params.aqi} AQI environment.` 
                : "Managing health impacts of simulated high-exposure environment.",
            data_connections: [
                { metric: "AQI", value: `${params.aqi}`, insight: params.aqi > 150 ? "Unhealthy air quality detected for sensitive respiratory systems." : "Simulated air quality necessitates respiratory protective measures." },
                { metric: "Ashtma Simulation", value: params.asthma ? "Active" : "Inactive", insight: params.asthma ? "Heightened sensitivity to air pollutants and environmental triggers." : "No specific respiratory co-morbidity simulated." }
            ],
            weekly_plan: [
                { day: "Daily", activity: "Air Quality Tracking", target_hr: "N/A", goal: `Limit outdoor exposure when AQI > ${params.asthma ? '100' : '150'}` },
                { day: "Tue/Thu", activity: "Respiratory Support", target_hr: "Relaxing", goal: "Practice controlled breathing exercises" },
                { day: "Daily", activity: "HEPA Filtration", target_hr: "N/A", goal: "Run indoor air purifiers at high settings" }
            ],
            expected_outcomes: [
                "Reduced systemic inflammation from pollutants",
                "Prevention of asthma-related exacerbations in variable air quality"
            ]
        });
    }

    // Ensure we always return at least 3 plans for UI consistency
    if (programs.length < 3) {
        programs.push({
            title: "General Maintenance Program",
            id: "pg-maint",
            generated_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
            icon: "heart",
            priority: "low",
            duration: "Indefinite",
            reason: "Sustaining current health baseline.",
            data_connections: [
                { metric: "Overall Health", value: "Optimal", insight: "Current simulation shows balanced vital metrics." }
            ],
            weekly_plan: [
                { day: "Daily", activity: "Baseline Movement", target_hr: "100-115 bpm", goal: "30 min" },
                { day: "Sun", activity: "Wellness Review", target_hr: "N/A", goal: "Plan the next week" }
            ],
            expected_outcomes: [
                "Maintenance of current strength and cardiovascular health",
                "Long-term disease risk mitigation"
            ]
        });
    }

    return programs;
}
