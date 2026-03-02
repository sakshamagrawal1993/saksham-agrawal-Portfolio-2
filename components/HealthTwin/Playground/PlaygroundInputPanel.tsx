import React from 'react';
import {
    User, Activity, Wind, Moon, Utensils, Zap, Database, AlertTriangle
} from 'lucide-react';
import { usePlaygroundStore } from '../../../store/playgroundStore';
import { useHealthTwinStore } from '../../../store/healthTwin';
import { CategoryCollapsible } from './CategoryCollapsible';
import { ParameterSlider } from './ParameterSlider';

export const PlaygroundInputPanel: React.FC = () => {
    const { parameters, setParameter, isGeneratingWellness } = usePlaygroundStore();

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b border-[#EBE7DE] shrink-0 bg-[#FAF9F6]">
                <h2 className="text-lg font-serif text-[#A84A00]">Parameter Inputs</h2>
                <p className="text-[10px] text-[#A8A29E] font-medium tracking-wide uppercase mt-1">
                    Adjust 56 health markers to simulate impact
                </p>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden">
                {/* Profile & Co-morbidities */}
                <CategoryCollapsible title="Profile & History" icon={User} defaultExpanded count={10}>
                    <div className="flex flex-col gap-1 px-3 py-2">
                        <label className="text-xs font-medium text-[#5D5A53]">Gender</label>
                        <div className="flex p-1 bg-[#F5F1E8] rounded-md">
                            {(['M', 'F', 'ALL'] as const).map((g) => (
                                <button
                                    key={g}
                                    onClick={() => setParameter('gender', g)}
                                    className={`flex-1 py-1 text-[10px] font-bold rounded transition-all uppercase tracking-wider ${parameters.gender === g
                                            ? 'bg-white text-[#A84A00] shadow-sm'
                                            : 'text-[#8C8980] hover:text-[#5D5A53]'
                                        }`}
                                >
                                    {g === 'M' ? 'Male' : g === 'F' ? 'Female' : 'All'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <ParameterSlider
                        label="Age" value={parameters.age} min={0} max={120}
                        onChange={(v) => setParameter('age', v)} unit="yrs"
                    />
                    <ParameterSlider
                        label="Weight" value={parameters.weight_kg} min={30} max={200}
                        onChange={(v) => setParameter('weight_kg', v)} unit="kg"
                    />
                    <ParameterSlider
                        label="Height" value={parameters.height_cm} min={100} max={250}
                        onChange={(v) => setParameter('height_cm', v)} unit="cm"
                    />
                    <div className="h-2" />
                    <ParameterSlider
                        label="Diabetes" value={parameters.diabetes ? 1 : 0} min={0} max={1}
                        onChange={(v) => setParameter('diabetes', v === 1)} isBoolean
                    />
                    <ParameterSlider
                        label="Hypertension" value={parameters.hypertension ? 1 : 0} min={0} max={1}
                        onChange={(v) => setParameter('hypertension', v === 1)} isBoolean
                    />
                    <ParameterSlider
                        label="Hyperlipidemia" value={parameters.hyperlipidemia ? 1 : 0} min={0} max={1}
                        onChange={(v) => setParameter('hyperlipidemia', v === 1)} isBoolean
                    />
                    <ParameterSlider
                        label="Asthma" value={parameters.asthma ? 1 : 0} min={0} max={1}
                        onChange={(v) => setParameter('asthma', v === 1)} isBoolean
                    />
                    <ParameterSlider
                        label="Sleep Apnea" value={parameters.sleep_apnea ? 1 : 0} min={0} max={1}
                        onChange={(v) => setParameter('sleep_apnea', v === 1)} isBoolean
                    />
                </CategoryCollapsible>

                {/* Activity & Vitals */}
                <CategoryCollapsible title="Activity & Vitals" icon={Activity} count={14}>
                    <ParameterSlider
                        label="Daily Steps" value={parameters.daily_steps} min={0} max={30000} step={500}
                        onChange={(v) => setParameter('daily_steps', v)} unit="steps"
                        optimalMin={10000} optimalMax={15000}
                    />
                    <ParameterSlider
                        label="Active Minutes" value={parameters.active_minutes} min={0} max={300} step={5}
                        onChange={(v) => setParameter('active_minutes', v)} unit="min"
                        optimalMin={45} optimalMax={120}
                    />
                    <ParameterSlider
                        label="Distance" value={parameters.distance_walked} min={0} max={50} step={0.5}
                        onChange={(v) => setParameter('distance_walked', v)} unit="km"
                    />
                    <ParameterSlider
                        label="Floors Climbed" value={parameters.floors_climbed} min={0} max={200}
                        onChange={(v) => setParameter('floors_climbed', v)} unit="floors"
                    />
                    <div className="h-4" />
                    <ParameterSlider
                        label="Avg Heart Rate" value={parameters.heart_rate} min={40} max={180}
                        onChange={(v) => setParameter('heart_rate', v)} unit="bpm"
                    />
                    <ParameterSlider
                        label="Resting HR" value={parameters.resting_heart_rate} min={40} max={110}
                        onChange={(v) => setParameter('resting_heart_rate', v)} unit="bpm"
                        optimalMin={55} optimalMax={70}
                    />
                    <ParameterSlider
                        label="Heart Rate Variability" value={parameters.hrv} min={10} max={150}
                        onChange={(v) => setParameter('hrv', v)} unit="ms"
                        optimalMin={60} optimalMax={150}
                    />
                    <ParameterSlider
                        label="Respiratory Rate" value={parameters.respiratory_rate} min={8} max={30}
                        onChange={(v) => setParameter('respiratory_rate', v)} unit="brpm"
                        optimalMin={12} optimalMax={16}
                    />
                    <ParameterSlider
                        label="Body Temp" value={parameters.body_temperature} min={35} max={40} step={0.1}
                        onChange={(v) => setParameter('body_temperature', v)} unit="°C"
                        optimalMin={36.5} optimalMax={37.2}
                    />
                    <div className="h-4" />
                    <ParameterSlider
                        label="Blood Glucose" value={parameters.blood_glucose} min={50} max={400}
                        onChange={(v) => setParameter('blood_glucose', v)} unit="mg/dL"
                    />
                    <ParameterSlider
                        label="Systolic BP" value={parameters.systolic_bp} min={70} max={220}
                        onChange={(v) => setParameter('systolic_bp', v)} unit="mmHg"
                    />
                    <ParameterSlider
                        label="Diastolic BP" value={parameters.diastolic_bp} min={40} max={130}
                        onChange={(v) => setParameter('diastolic_bp', v)} unit="mmHg"
                    />
                </CategoryCollapsible>

                {/* Environment */}
                <CategoryCollapsible title="Environment" icon={Wind} count={3}>
                    <ParameterSlider
                        label="Air Quality Index" value={parameters.aqi} min={0} max={500}
                        onChange={(v) => setParameter('aqi', v)} unit="aqi"
                        optimalMin={0} optimalMax={50}
                    />
                    <ParameterSlider
                        label="UV Index" value={parameters.uv_index} min={0} max={15}
                        onChange={(v) => setParameter('uv_index', v)} unit="idx"
                        optimalMin={0} optimalMax={2}
                    />
                    <ParameterSlider
                        label="Pollen Level" value={parameters.pollen_level} min={0} max={15}
                        onChange={(v) => setParameter('pollen_level', v)} unit="lvl"
                        optimalMin={0} optimalMax={3}
                    />
                </CategoryCollapsible>

                {/* Sleep & Recovery */}
                <CategoryCollapsible title="Sleep & Recovery" icon={Moon} count={6}>
                    <ParameterSlider
                        label="Sleep Duration" value={parameters.sleep_duration} min={3} max={12} step={0.5}
                        onChange={(v) => setParameter('sleep_duration', v)} unit="hrs"
                        optimalMin={7} optimalMax={9}
                    />
                    <ParameterSlider
                        label="Sleep HR" value={parameters.sleep_heart_rate} min={35} max={100}
                        onChange={(v) => setParameter('sleep_heart_rate', v)} unit="bpm"
                    />
                    <ParameterSlider
                        label="SpO2 Min" value={parameters.spo2_min} min={80} max={100}
                        onChange={(v) => setParameter('spo2_min', v)} unit="%"
                    />
                    <ParameterSlider
                        label="Sleep Quality" value={parameters.sleep_quality} min={0} max={100}
                        onChange={(v) => setParameter('sleep_quality', v)} unit="%"
                        optimalMin={85} optimalMax={100}
                    />
                    <ParameterSlider
                        label="Stress Level" value={parameters.stress_level} min={0} max={100}
                        onChange={(v) => setParameter('stress_level', v)} unit="pts"
                    />
                    <ParameterSlider
                        label="Recovery Score" value={parameters.recovery_score} min={0} max={100}
                        onChange={(v) => setParameter('recovery_score', v)} unit="pts"
                        optimalMin={80} optimalMax={100}
                    />
                </CategoryCollapsible>

                {/* Nutrition */}
                <CategoryCollapsible title="Nutrition & Fuel" icon={Utensils} count={5}>
                    <ParameterSlider
                        label="Calorie Intake" value={parameters.calorie_intake} min={1000} max={5000} step={50}
                        onChange={(v) => setParameter('calorie_intake', v)} unit="kcal"
                    />
                    <ParameterSlider
                        label="Water Intake" value={parameters.water_intake} min={0} max={8} step={0.1}
                        onChange={(v) => setParameter('water_intake', v)} unit="L"
                        optimalMin={2.5} optimalMax={3.7}
                    />
                    <div className="h-2" />
                    <ParameterSlider
                        label="Protein %" value={parameters.protein_pct} min={5} max={60}
                        onChange={(v) => setParameter('protein_pct', v)} unit="%"
                    />
                    <ParameterSlider
                        label="Carbs %" value={parameters.carbs_pct} min={10} max={80}
                        onChange={(v) => setParameter('carbs_pct', v)} unit="%"
                    />
                    <ParameterSlider
                        label="Fats %" value={parameters.fats_pct} min={5} max={60}
                        onChange={(v) => setParameter('fats_pct', v)} unit="%"
                    />
                </CategoryCollapsible>

                {/* Symptoms */}
                <CategoryCollapsible title="Recent Symptoms" icon={AlertTriangle} count={8}>
                    <div className="grid grid-cols-2 gap-2">
                        <ParameterSlider
                            label="Abd. Cramps" value={parameters.symptom_abdominal_cramps ? 1 : 0} min={0} max={1}
                            onChange={(v) => setParameter('symptom_abdominal_cramps', v === 1)} isBoolean
                        />
                        <ParameterSlider
                            label="Night Sweats" value={parameters.symptom_night_sweats ? 1 : 0} min={0} max={1}
                            onChange={(v) => setParameter('symptom_night_sweats', v === 1)} isBoolean
                        />
                        <ParameterSlider
                            label="Headache" value={parameters.symptom_headache ? 1 : 0} min={0} max={1}
                            onChange={(v) => setParameter('symptom_headache', v === 1)} isBoolean
                        />
                        <ParameterSlider
                            label="Fatigue" value={parameters.symptom_fatigue ? 1 : 0} min={0} max={1}
                            onChange={(v) => setParameter('symptom_fatigue', v === 1)} isBoolean
                        />
                        <ParameterSlider
                            label="Insomnia" value={parameters.symptom_insomnia ? 1 : 0} min={0} max={1}
                            onChange={(v) => setParameter('symptom_insomnia', v === 1)} isBoolean
                        />
                        <ParameterSlider
                            label="Joint Pain" value={parameters.symptom_joint_pain ? 1 : 0} min={0} max={1}
                            onChange={(v) => setParameter('symptom_joint_pain', v === 1)} isBoolean
                        />
                        <ParameterSlider
                            label="Dizziness" value={parameters.symptom_dizziness ? 1 : 0} min={0} max={1}
                            onChange={(v) => setParameter('symptom_dizziness', v === 1)} isBoolean
                        />
                        <ParameterSlider
                            label="Shortness of Breath" value={parameters.symptom_shortness_of_breath ? 1 : 0} min={0} max={1}
                            onChange={(v) => setParameter('symptom_shortness_of_breath', v === 1)} isBoolean
                        />
                    </div>
                </CategoryCollapsible>

                {/* Lab Results */}
                <CategoryCollapsible title="Laboratory Markers" icon={Database} count={10}>
                    <ParameterSlider
                        label="HbA1c" value={parameters.hba1c} min={3} max={15} step={0.1}
                        onChange={(v) => setParameter('hba1c', v)} unit="%"
                        optimalMin={4.0} optimalMax={5.6}
                    />
                    <ParameterSlider
                        label="Total Cholesterol" value={parameters.total_cholesterol} min={100} max={400}
                        onChange={(v) => setParameter('total_cholesterol', v)} unit="mg/dL"
                        optimalMin={125} optimalMax={200}
                    />
                    <div className="grid grid-cols-2 gap-2">
                        <ParameterSlider
                            label="HDL" value={parameters.hdl} min={20} max={100}
                            onChange={(v) => setParameter('hdl', v)} unit="mg"
                        />
                        <ParameterSlider
                            label="LDL" value={parameters.ldl} min={50} max={250}
                            onChange={(v) => setParameter('ldl', v)} unit="mg"
                        />
                    </div>
                    <ParameterSlider
                        label="Triglycerides" value={parameters.triglycerides} min={50} max={500}
                        onChange={(v) => setParameter('triglycerides', v)} unit="mg"
                    />
                    <ParameterSlider
                        label="Vitamin D" value={parameters.vitamin_d} min={10} max={100}
                        onChange={(v) => setParameter('vitamin_d', v)} unit="ng"
                        optimalMin={30} optimalMax={100}
                    />
                    <ParameterSlider
                        label="Vitamin B12" value={parameters.vitamin_b12} min={100} max={1500}
                        onChange={(v) => setParameter('vitamin_b12', v)} unit="pg"
                    />
                    <ParameterSlider
                        label="TSH" value={parameters.tsh} min={0.1} max={10} step={0.1}
                        onChange={(v) => setParameter('tsh', v)} unit="mIU"
                    />
                    <ParameterSlider
                        label="Hemoglobin" value={parameters.hemoglobin} min={8} max={20} step={0.1}
                        onChange={(v) => setParameter('hemoglobin', v)} unit="g/dL"
                    />
                    <ParameterSlider
                        label="Creatinine" value={parameters.creatinine} min={0.4} max={2.5} step={0.1}
                        onChange={(v) => setParameter('creatinine', v)} unit="mg"
                    />
                </CategoryCollapsible>
            </div>

            <div className="p-4 bg-[#F5F1E8] border-t border-[#EBE7DE] shrink-0">
                <button
                    disabled={isGeneratingWellness}
                    onClick={() => {
                        const { parameterDefinitions, parameterRanges } = useHealthTwinStore.getState();
                        usePlaygroundStore.getState().recalculateScores(parameterDefinitions, parameterRanges);
                    }}
                    className="w-full bg-[#A84A00] text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg hover:bg-[#8B3D00] transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isGeneratingWellness ? (
                        <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Generating Plans...</span>
                        </>
                    ) : (
                        <>
                            <Zap className="w-4 h-4 fill-white text-white" />
                            <span>Save & Recalculate</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};
