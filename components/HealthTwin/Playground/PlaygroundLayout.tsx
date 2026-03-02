import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useHealthTwinStore } from '../../../store/healthTwin';
import { usePlaygroundStore } from '../../../store/playgroundStore';
import { Loader2, ArrowLeft, RefreshCw, Save, Zap } from 'lucide-react';
import { PlaygroundInputPanel } from './PlaygroundInputPanel';
import { PlaygroundScorePanel } from './PlaygroundScorePanel';
import { PlaygroundWellnessPanel } from './PlaygroundWellnessPanel';

export const PlaygroundLayout: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    // Main Store (Source of truth for baseline)
    const {
        activeTwinId,
        parameterDefinitions,
        parameterRanges,
        personalDetails,
        scores: baselineScores,
        labParameters,
        wearableParameters
    } = useHealthTwinStore();

    // Playground Store (Simulation state)
    const {
        initializeBaseline,
        resetToBaseline,
        recalculateScores,
        parameters,
        changedParams
    } = usePlaygroundStore();

    const [loading, setLoading] = useState(true);

    const isInitialized = React.useRef(false);

    // 1. Initial Sync: Load baseline data from the main store into the playground store
    useEffect(() => {
        if (!id || activeTwinId !== id) {
            navigate(`/health-twin/${id || ''}`);
            return;
        }

        if (isInitialized.current) return;

        const syncBaseline = () => {
            // Helper to find most recent value for a parameter name or id
            const getParamValue = (name: string, fallback: number): number => {
                const p = [...labParameters, ...wearableParameters]
                    .find(p => p.parameter_name.toLowerCase() === name.toLowerCase() || p.id === name);
                return p ? p.parameter_value : fallback;
            };

            const baseline: any = {
                age: personalDetails?.age ?? 30,
                gender: personalDetails?.gender === 'Female' ? 'F' : 'M',
                weight_kg: personalDetails?.weight_kg ?? 75,
                height_cm: personalDetails?.height_cm ?? 175,
                diabetes: personalDetails?.co_morbidities?.some(c => c.toLowerCase().includes('diabetes')) ?? false,
                hypertension: personalDetails?.co_morbidities?.some(c => c.toLowerCase().includes('hypertension')) ?? false,
                hyperlipidemia: personalDetails?.co_morbidities?.some(c => c.toLowerCase().includes('cholesterol') || c.toLowerCase().includes('lipid')) ?? false,
                asthma: personalDetails?.co_morbidities?.some(c => c.toLowerCase().includes('asthma')) ?? false,
                sleep_apnea: personalDetails?.co_morbidities?.some(c => c.toLowerCase().includes('apnea')) ?? false,

                // Activity
                daily_steps: getParamValue('daily_steps', 5000),
                active_minutes: getParamValue('active_minutes', 30),
                distance_walked: getParamValue('distance_walked', 3.5),
                floors_climbed: getParamValue('floors_climbed', 5),

                // Vitals
                heart_rate: getParamValue('heart_rate', 72),
                resting_heart_rate: getParamValue('resting_heart_rate', 65),
                hrv: getParamValue('hrv', 45),
                respiratory_rate: getParamValue('respiratory_rate', 16),
                body_temperature: getParamValue('body_temperature', 36.6),
                blood_glucose: getParamValue('blood_glucose', 95),
                blood_glucose_max: getParamValue('blood_glucose_max', 130),
                blood_glucose_min: getParamValue('blood_glucose_min', 75),
                systolic_bp: getParamValue('systolic_bp', 120),
                diastolic_bp: getParamValue('diastolic_bp', 80),

                // Environment
                aqi: getParamValue('aqi', 45),
                uv_index: getParamValue('uv_index', 3),
                pollen_level: getParamValue('pollen_level', 2),

                // Sleep
                sleep_duration: getParamValue('sleep_duration', 7),
                sleep_heart_rate: getParamValue('sleep_heart_rate', 60),
                spo2_min: getParamValue('spo2_min', 94),
                sleep_quality: getParamValue('sleep_quality', 85),

                // Nutrition
                calorie_intake: getParamValue('calorie_intake', 2200),
                water_intake: getParamValue('water_intake', 2.5),
                protein_pct: getParamValue('protein_pct', 20),
                carbs_pct: getParamValue('carbs_pct', 50),
                fats_pct: getParamValue('fats_pct', 30),

                // Stress
                stress_level: getParamValue('stress_level', 25),
                recovery_score: getParamValue('recovery_score', 80),

                // Symptoms
                symptom_abdominal_cramps: false,
                symptom_night_sweats: false,
                symptom_headache: false,
                symptom_fatigue: false,
                symptom_insomnia: false,
                symptom_joint_pain: false,
                symptom_dizziness: false,
                symptom_shortness_of_breath: false,

                // Labs
                hba1c: getParamValue('41995-2', 5.4),
                total_cholesterol: getParamValue('2093-3', 180),
                hdl: getParamValue('2085-9', 55),
                ldl: getParamValue('13457-7', 110),
                triglycerides: getParamValue('2571-8', 130),
                vitamin_d: getParamValue('1989-3', 40),
                vitamin_b12: getParamValue('2132-9', 500),
                tsh: getParamValue('3016-3', 2.5),
                hemoglobin: getParamValue('718-7', 14.5),
                creatinine: getParamValue('2160-0', 1.0),
            };

            initializeBaseline(baseline, baselineScores);
            isInitialized.current = true;
            setLoading(false);
        };

        syncBaseline();
    }, [id, activeTwinId, navigate, labParameters, wearableParameters, personalDetails, baselineScores, initializeBaseline]);

    // 2. Continuous Recalculation: Trigger scores on parameter change
    useEffect(() => {
        if (!loading && parameterDefinitions.length > 0) {
            recalculateScores(parameterDefinitions, parameterRanges);
        }
    }, [parameters, parameterDefinitions, parameterRanges, recalculateScores, loading]);

    if (loading) {
        return (
            <div className="h-screen w-full bg-[#FAF9F6] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[#A84A00]" />
            </div>
        );
    }

    return (
        <div className="h-screen w-full bg-[#FAF9F6] text-[#2C2A26] flex flex-col font-sans overflow-hidden">
            {/* Top Navigation Bar */}
            <header className="h-14 border-b border-[#EBE7DE] flex items-center justify-between px-6 shrink-0 bg-white">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(`/health-twin/${id}`)}
                        className="p-2 hover:bg-[#FAF9F6] rounded-full transition-colors text-[#5D5A53]"
                        title="Back to Dashboard"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="h-6 w-[1px] bg-[#EBE7DE]" />
                    <Zap className="w-5 h-5 text-[#A84A00] fill-[#A84A00]" />
                    <h1 className="text-xl font-serif text-[#A84A00]">Digital Twin Playground</h1>
                    <span className="text-xs bg-[#F5F1E8] text-[#A84A00] px-2 py-0.5 rounded-full font-bold tracking-wider uppercase">
                        Simulation Mode
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={resetToBaseline}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#5D5A53] hover:text-[#A84A00] transition-colors"
                        disabled={changedParams.size === 0}
                    >
                        <RefreshCw className={`w-4 h-4 ${changedParams.size > 0 ? 'animate-spin-once' : 'opacity-50'}`} />
                        Reset to Real Data
                    </button>
                    <button className="flex items-center gap-2 px-4 py-1.5 bg-[#A84A00] text-white text-sm font-medium rounded-lg hover:bg-[#8B3D00] transition-colors shadow-sm">
                        <Save className="w-4 h-4" />
                        Save Scenario
                    </button>
                </div>
            </header>

            {/* 3-Column Playground Area */}
            <main className="flex-1 overflow-hidden">
                <div className="grid grid-cols-[320px_1fr_350px] h-full">
                    {/* Left Column: Parameter Control */}
                    <section className="h-full border-r border-[#EBE7DE] bg-[#FAF9F6] flex flex-col shadow-[inset_-4px_0_12px_rgba(0,0,0,0.02)] overflow-hidden">
                        <PlaygroundInputPanel />
                    </section>

                    {/* Center Column: Avatar & Simulation */}
                    <section className="h-full bg-white flex flex-col shadow-sm overflow-hidden min-w-0">
                        <PlaygroundScorePanel />
                    </section>

                    {/* Right Column: Dynamic Recommendations */}
                    <section className="h-full border-l border-[#EBE7DE] bg-[#FAF9F6] flex flex-col shadow-[inset_4px_0_12px_rgba(0,0,0,0.02)] overflow-hidden">
                        <PlaygroundWellnessPanel />
                    </section>
                </div>
            </main>
        </div>
    );
};
