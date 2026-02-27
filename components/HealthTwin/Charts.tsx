import React, { useMemo } from 'react';
import {
    Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis,
    ResponsiveContainer, Area, AreaChart, Cell, Pie, PieChart,
    Tooltip, Legend
} from 'recharts';
import {
    ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent
} from '../ui/chart';
import { HealthParameter } from '../../store/healthTwin';

// ======== HELPERS ========
const dayLabel = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};
const timeLabel = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
};

const ZONE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#dc2626'];

function getByName(data: HealthParameter[], name: string) {
    return data.filter(d => d.parameter_name === name).sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
}

function dailyValues(data: HealthParameter[], name: string) {
    return getByName(data, name).map(d => ({ date: dayLabel(d.recorded_at), value: Number(d.parameter_value) }));
}

// ======== SECTION HEADER ========
const SectionHeader: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
    <div className="mb-4">
        <h3 className="font-serif text-lg text-[#2C2A26]">{title}</h3>
        {subtitle && <p className="text-sm text-[#A8A29E]">{subtitle}</p>}
    </div>
);

// ======== STAT CARD ========
const StatCard: React.FC<{ label: string; value: string | number; unit?: string; color?: string }> = ({ label, value, unit, color = '#A84A00' }) => (
    <div className="bg-[#F5F2EB] rounded-xl p-4 border border-[#EBE7DE]">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#A8A29E] mb-1">{label}</p>
        <p className="text-2xl font-serif font-bold" style={{ color }}>{value}<span className="text-sm font-normal text-[#A8A29E] ml-1">{unit}</span></p>
    </div>
);

// ======== CHART WRAPPER ========
const ChartCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <div className={`bg-white border border-[#EBE7DE] shadow-sm rounded-2xl p-6 ${className}`}>{children}</div>
);

// ======== CONFIG FACTORY ========
const makeConfig = (key: string, label: string, color: string): ChartConfig => ({ [key]: { label, color } });

// ========================
//  ACTIVITY CHART
// ========================
export const ActivityChart: React.FC<{ data: HealthParameter[] }> = ({ data }) => {
    const catData = data.filter(d => d.category === 'activity');
    const steps = dailyValues(catData, 'Step Count');
    const calories = dailyValues(catData, 'Active Calories Burnt');
    const activeMin = dailyValues(catData, 'Active Minutes');
    const distance = dailyValues(catData, 'Horizontal Distance Covered');

    const latestSteps = steps[steps.length - 1]?.value || 0;
    const latestCal = calories[calories.length - 1]?.value || 0;
    const latestMin = activeMin[activeMin.length - 1]?.value || 0;
    const latestDist = distance[distance.length - 1]?.value || 0;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Steps" value={latestSteps.toLocaleString()} unit="steps" />
                <StatCard label="Active Cal" value={latestCal} unit="kcal" color="#E98226" />
                <StatCard label="Active Min" value={latestMin} unit="min" color="#10b981" />
                <StatCard label="Distance" value={latestDist} unit="km" color="#3b82f6" />
            </div>

            <ChartCard>
                <SectionHeader title="Daily Steps" subtitle="7-day step count with goal line" />
                <div className="h-[280px]">
                    <ChartContainer config={makeConfig('value', 'Steps', '#A84A00')} className="h-full w-full">
                        <ResponsiveContainer>
                            <BarChart data={steps} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE7DE" />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#A8A29E', fontSize: 11 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#A8A29E', fontSize: 11 }} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="value" fill="#A84A00" radius={[6, 6, 0, 0]} maxBarSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartContainer>
                </div>
            </ChartCard>

            <ChartCard>
                <SectionHeader title="Active Calories" subtitle="Daily calories burned from activity" />
                <div className="h-[220px]">
                    <ChartContainer config={makeConfig('value', 'Calories', '#E98226')} className="h-full w-full">
                        <ResponsiveContainer>
                            <AreaChart data={calories} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="calGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#E98226" stopOpacity={0.3} />
                                        <stop offset="100%" stopColor="#E98226" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE7DE" />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#A8A29E', fontSize: 11 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#A8A29E', fontSize: 11 }} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Area type="monotone" dataKey="value" stroke="#E98226" strokeWidth={2} fill="url(#calGradient)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </ChartContainer>
                </div>
            </ChartCard>
        </div>
    );
};

// ========================
//  VITALS CHART
// ========================
export const VitalsChart: React.FC<{ data: HealthParameter[] }> = ({ data }) => {
    const catData = data.filter(d => d.category === 'vitals');

    // Heart rate time-series (most recent day)
    const hrAll = getByName(catData, 'Heart Rate');
    const latestDay = hrAll.length > 0 ? dayLabel(hrAll[hrAll.length - 1].recorded_at) : '';
    const hrToday = hrAll.filter(d => dayLabel(d.recorded_at) === latestDay).map(d => ({
        time: timeLabel(d.recorded_at), value: Number(d.parameter_value)
    }));

    // Blood pressure (daily)
    const bpSys = dailyValues(catData, 'Blood Pressure Systolic');
    const bpDia = dailyValues(catData, 'Blood Pressure Diastolic');
    const bpCombined = bpSys.map((s, i) => ({ date: s.date, systolic: s.value, diastolic: bpDia[i]?.value || 0 }));

    // Latest values
    const latestRHR = getByName(catData, 'Resting Heart Rate');
    const latestSPO2 = getByName(catData, 'SPO2 Percentage');
    const latestResp = getByName(catData, 'Respiratory Rate');
    const latestTemp = getByName(catData, 'Body Temperature');
    const latestGlucose = getByName(catData, 'Blood Glucose Record');

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatCard label="Resting HR" value={latestRHR[latestRHR.length - 1]?.parameter_value || '—'} unit="bpm" color="#d946ef" />
                <StatCard label="SPO2" value={latestSPO2[latestSPO2.length - 1]?.parameter_value || '—'} unit="%" color="#3b82f6" />
                <StatCard label="Resp Rate" value={latestResp[latestResp.length - 1]?.parameter_value || '—'} unit="br/min" color="#10b981" />
                <StatCard label="Temp" value={latestTemp[latestTemp.length - 1]?.parameter_value || '—'} unit="°C" color="#f59e0b" />
                <StatCard label="Glucose" value={latestGlucose[latestGlucose.length - 1]?.parameter_value || '—'} unit="mg/dL" color="#ef4444" />
            </div>

            <ChartCard>
                <SectionHeader title="Heart Rate" subtitle={`Today's continuous monitoring (${latestDay})`} />
                <div className="h-[260px]">
                    <ChartContainer config={makeConfig('value', 'Heart Rate (BPM)', '#d946ef')} className="h-full w-full">
                        <ResponsiveContainer>
                            <LineChart data={hrToday} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE7DE" />
                                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#A8A29E', fontSize: 11 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#A8A29E', fontSize: 11 }} domain={['dataMin - 5', 'dataMax + 5']} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Line type="monotone" dataKey="value" stroke="#d946ef" strokeWidth={3} dot={{ r: 4, fill: '#d946ef', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </ChartContainer>
                </div>
            </ChartCard>

            <ChartCard>
                <SectionHeader title="Blood Pressure" subtitle="Systolic / Diastolic trend" />
                <div className="h-[260px]">
                    <ChartContainer config={{ systolic: { label: 'Systolic', color: '#ef4444' }, diastolic: { label: 'Diastolic', color: '#3b82f6' } }} className="h-full w-full">
                        <ResponsiveContainer>
                            <LineChart data={bpCombined} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE7DE" />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#A8A29E', fontSize: 11 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#A8A29E', fontSize: 11 }} domain={[60, 150]} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Line type="monotone" dataKey="systolic" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
                                <Line type="monotone" dataKey="diastolic" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </ChartContainer>
                </div>
            </ChartCard>
        </div>
    );
};

// ========================
//  EXERCISE CHART
// ========================
export const ExerciseChart: React.FC<{ data: HealthParameter[] }> = ({ data }) => {
    const catData = data.filter(d => d.category === 'exercise');

    // Group by group_id to get sessions
    const sessions = useMemo(() => {
        const groups: Record<string, HealthParameter[]> = {};
        catData.forEach(d => { if (d.group_id) { (groups[d.group_id] ??= []).push(d); } });
        return Object.values(groups).map(params => {
            const get = (name: string) => params.find(p => p.parameter_name === name);
            return {
                date: dayLabel(params[0].recorded_at),
                type: get('Exercise Type')?.parameter_text || '—',
                duration: Number(get('Exercise Duration')?.parameter_value || 0),
                calories: Number(get('Exercise Calories')?.parameter_value || 0),
                length: Number(get('Exercise Length')?.parameter_value || 0),
                z1: Number(get('Exercise % Time in HR Zone 1')?.parameter_value || 0),
                z2: Number(get('Exercise % Time in HR Zone 2')?.parameter_value || 0),
                z3: Number(get('Exercise % Time in HR Zone 3')?.parameter_value || 0),
                z4: Number(get('Exercise % Time in HR Zone 4')?.parameter_value || 0),
                z5: Number(get('Exercise % Time in HR Zone 5')?.parameter_value || 0),
                vo2max: Number(get('VO2 Max')?.parameter_value || 0),
            };
        });
    }, [catData]);

    if (sessions.length === 0) return <p className="text-[#A8A29E] italic">No exercise data available.</p>;

    return (
        <div className="space-y-6">
            {/* Session cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sessions.map((s, i) => (
                    <div key={i} className="bg-[#F5F2EB] rounded-xl p-5 border border-[#EBE7DE]">
                        <div className="flex items-center justify-between mb-3">
                            <span className="font-serif font-bold text-[#2C2A26]">{s.type}</span>
                            <span className="text-xs text-[#A8A29E]">{s.date}</span>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-center">
                            <div><p className="text-lg font-bold text-[#A84A00]">{s.duration}</p><p className="text-[10px] text-[#A8A29E] uppercase">min</p></div>
                            <div><p className="text-lg font-bold text-[#E98226]">{s.calories}</p><p className="text-[10px] text-[#A8A29E] uppercase">kcal</p></div>
                            <div><p className="text-lg font-bold text-[#3b82f6]">{s.length}</p><p className="text-[10px] text-[#A8A29E] uppercase">km</p></div>
                            <div><p className="text-lg font-bold text-[#10b981]">{s.vo2max}</p><p className="text-[10px] text-[#A8A29E] uppercase">VO2</p></div>
                        </div>
                    </div>
                ))}
            </div>

            {/* HR Zone Distribution */}
            <ChartCard>
                <SectionHeader title="Heart Rate Zone Distribution" subtitle="Time spent in each zone per session" />
                <div className="h-[280px]">
                    <ChartContainer config={{
                        z1: { label: 'Zone 1 (Warm Up)', color: ZONE_COLORS[0] },
                        z2: { label: 'Zone 2 (Fat Burn)', color: ZONE_COLORS[1] },
                        z3: { label: 'Zone 3 (Cardio)', color: ZONE_COLORS[2] },
                        z4: { label: 'Zone 4 (Peak)', color: ZONE_COLORS[3] },
                        z5: { label: 'Zone 5 (Max)', color: ZONE_COLORS[4] },
                    }} className="h-full w-full">
                        <ResponsiveContainer>
                            <BarChart data={sessions} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE7DE" />
                                <XAxis dataKey="type" axisLine={false} tickLine={false} tick={{ fill: '#A8A29E', fontSize: 11 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#A8A29E', fontSize: 11 }} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="z1" stackId="zones" fill={ZONE_COLORS[0]} radius={[0, 0, 0, 0]} />
                                <Bar dataKey="z2" stackId="zones" fill={ZONE_COLORS[1]} />
                                <Bar dataKey="z3" stackId="zones" fill={ZONE_COLORS[2]} />
                                <Bar dataKey="z4" stackId="zones" fill={ZONE_COLORS[3]} />
                                <Bar dataKey="z5" stackId="zones" fill={ZONE_COLORS[4]} radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartContainer>
                </div>
            </ChartCard>
        </div>
    );
};

// ========================
//  SLEEP CHART
// ========================
export const SleepChart: React.FC<{ data: HealthParameter[] }> = ({ data }) => {
    const catData = data.filter(d => d.category === 'sleep');
    const duration = dailyValues(catData, 'Sleep Duration');
    const quality = dailyValues(catData, 'Sleep Quality');
    const score = dailyValues(catData, 'Sleep Score');
    const avgHR = dailyValues(catData, 'Sleep Average Heart Rate');

    const latestScore = score[score.length - 1]?.value || 0;
    const latestDur = duration[duration.length - 1]?.value || 0;
    const latestQual = quality[quality.length - 1]?.value || 0;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-3 gap-3">
                <StatCard label="Sleep Score" value={latestScore} unit="/100" color="#8b5cf6" />
                <StatCard label="Duration" value={latestDur} unit="hrs" color="#3b82f6" />
                <StatCard label="Quality" value={latestQual} unit="%" color="#10b981" />
            </div>

            <ChartCard>
                <SectionHeader title="Sleep Duration" subtitle="Hours of sleep per night" />
                <div className="h-[250px]">
                    <ChartContainer config={makeConfig('value', 'Hours', '#8b5cf6')} className="h-full w-full">
                        <ResponsiveContainer>
                            <BarChart data={duration} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE7DE" />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#A8A29E', fontSize: 11 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#A8A29E', fontSize: 11 }} domain={[0, 10]} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="value" fill="#8b5cf6" radius={[6, 6, 0, 0]} maxBarSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartContainer>
                </div>
            </ChartCard>

            <ChartCard>
                <SectionHeader title="Sleep Heart Rate" subtitle="Average heart rate during sleep" />
                <div className="h-[220px]">
                    <ChartContainer config={makeConfig('value', 'BPM', '#d946ef')} className="h-full w-full">
                        <ResponsiveContainer>
                            <AreaChart data={avgHR} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="sleepHRGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#d946ef" stopOpacity={0.3} />
                                        <stop offset="100%" stopColor="#d946ef" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE7DE" />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#A8A29E', fontSize: 11 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#A8A29E', fontSize: 11 }} domain={['dataMin - 5', 'dataMax + 5']} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Area type="monotone" dataKey="value" stroke="#d946ef" strokeWidth={2} fill="url(#sleepHRGrad)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </ChartContainer>
                </div>
            </ChartCard>
        </div>
    );
};

// ========================
//  NUTRITION CHART
// ========================
export const NutritionChart: React.FC<{ data: HealthParameter[] }> = ({ data }) => {
    const catData = data.filter(d => d.category === 'nutrition');

    // Latest day macros total
    const allCarbs = getByName(catData, 'Total Carbohydrate');
    const allFat = getByName(catData, 'Total Fat');
    const allProtein = getByName(catData, 'Protein');

    const lastDay = allCarbs.length > 0 ? dayLabel(allCarbs[allCarbs.length - 1].recorded_at) : '';
    const sumToday = (arr: HealthParameter[]) => arr.filter(d => dayLabel(d.recorded_at) === lastDay).reduce((s, d) => s + Number(d.parameter_value), 0);

    const macros = [
        { name: 'Carbs', value: sumToday(allCarbs), fill: '#3b82f6' },
        { name: 'Fat', value: sumToday(allFat), fill: '#f59e0b' },
        { name: 'Protein', value: sumToday(allProtein), fill: '#10b981' },
    ];

    const hydration = dailyValues(catData, 'Hydration Volume');
    const dailyCal = catData.filter(d => d.parameter_name === 'Total Energy Intake from Food')
        .reduce((acc: Record<string, number>, d) => {
            const day = dayLabel(d.recorded_at);
            acc[day] = (acc[day] || 0) + Number(d.parameter_value);
            return acc;
        }, {});
    const calByDay = Object.entries(dailyCal).map(([date, value]) => ({ date, value }));

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ChartCard>
                    <SectionHeader title="Macro Split" subtitle={`Today's macronutrient breakdown (${lastDay})`} />
                    <div className="h-[220px]">
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie data={macros} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} strokeWidth={0}>
                                    {macros.map((entry, idx) => <Cell key={idx} fill={entry.fill} />)}
                                </Pie>
                                <Tooltip formatter={(value: number) => `${value}g`} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </ChartCard>

                <ChartCard>
                    <SectionHeader title="Hydration" subtitle="Daily water intake" />
                    <div className="h-[220px]">
                        <ChartContainer config={makeConfig('value', 'mL', '#3b82f6')} className="h-full w-full">
                            <ResponsiveContainer>
                                <BarChart data={hydration} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE7DE" />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#A8A29E', fontSize: 11 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#A8A29E', fontSize: 11 }} />
                                    <ChartTooltip content={<ChartTooltipContent />} />
                                    <Bar dataKey="value" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={40} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                    </div>
                </ChartCard>
            </div>

            <ChartCard>
                <SectionHeader title="Daily Calorie Intake" subtitle="Total energy from food" />
                <div className="h-[220px]">
                    <ChartContainer config={makeConfig('value', 'kcal', '#E98226')} className="h-full w-full">
                        <ResponsiveContainer>
                            <AreaChart data={calByDay} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="nutCalGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#E98226" stopOpacity={0.3} />
                                        <stop offset="100%" stopColor="#E98226" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE7DE" />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#A8A29E', fontSize: 11 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#A8A29E', fontSize: 11 }} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Area type="monotone" dataKey="value" stroke="#E98226" strokeWidth={2} fill="url(#nutCalGrad)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </ChartContainer>
                </div>
            </ChartCard>
        </div>
    );
};

// ========================
//  RECOVERY CHART
// ========================
export const RecoveryChart: React.FC<{ data: HealthParameter[] }> = ({ data }) => {
    const catData = data.filter(d => d.category === 'recovery');
    const stress = dailyValues(catData, 'Body Stress Score');
    const physical = dailyValues(catData, 'Physical Recovery');
    const mental = dailyValues(catData, 'Mental Recovery');

    const combined = stress.map((s, i) => ({
        date: s.date,
        stress: s.value,
        physical: physical[i]?.value || 0,
        mental: mental[i]?.value || 0,
    }));

    const latestStress = stress[stress.length - 1]?.value || 0;
    const latestPhys = physical[physical.length - 1]?.value || 0;
    const latestMent = mental[mental.length - 1]?.value || 0;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-3 gap-3">
                <StatCard label="Stress" value={latestStress} unit="/100" color={latestStress > 50 ? '#ef4444' : '#10b981'} />
                <StatCard label="Physical" value={latestPhys} unit="%" color="#3b82f6" />
                <StatCard label="Mental" value={latestMent} unit="%" color="#8b5cf6" />
            </div>

            <ChartCard>
                <SectionHeader title="Recovery & Stress" subtitle="7-day trend" />
                <div className="h-[280px]">
                    <ChartContainer config={{
                        stress: { label: 'Stress', color: '#ef4444' },
                        physical: { label: 'Physical Recovery', color: '#3b82f6' },
                        mental: { label: 'Mental Recovery', color: '#8b5cf6' },
                    }} className="h-full w-full">
                        <ResponsiveContainer>
                            <LineChart data={combined} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE7DE" />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#A8A29E', fontSize: 11 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#A8A29E', fontSize: 11 }} domain={[0, 100]} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Line type="monotone" dataKey="stress" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                                <Line type="monotone" dataKey="physical" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                                <Line type="monotone" dataKey="mental" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </ChartContainer>
                </div>
            </ChartCard>
        </div>
    );
};

// ========================
//  SYMPTOMS CHART (Heatmap-style grid)
// ========================
export const SymptomsChart: React.FC<{ data: HealthParameter[] }> = ({ data }) => {
    const catData = data.filter(d => d.category === 'symptoms');
    const days = [...new Set(catData.map(d => dayLabel(d.recorded_at)))];
    const paramNames = [...new Set(catData.map(d => d.parameter_name))].sort();

    return (
        <div className="space-y-4">
            <SectionHeader title="Symptoms Tracker" subtitle="Binary indicators — orange = present, gray = absent" />
            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr>
                            <th className="text-left py-2 px-1 font-bold text-[#A8A29E] uppercase tracking-widest text-[10px] sticky left-0 bg-white">Symptom</th>
                            {days.map(d => <th key={d} className="py-2 px-2 font-bold text-[#A8A29E] uppercase tracking-widest text-[10px]">{d}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {paramNames.map(name => (
                            <tr key={name} className="border-t border-[#EBE7DE]">
                                <td className="py-1.5 px-1 text-[#5D5A53] sticky left-0 bg-white whitespace-nowrap">{name.replace(' Indicator', '').replace(' Alert', '')}</td>
                                {days.map(day => {
                                    const val = catData.find(d => d.parameter_name === name && dayLabel(d.recorded_at) === day);
                                    const isActive = val && Number(val.parameter_value) === 1;
                                    return (
                                        <td key={day} className="text-center py-1.5 px-2">
                                            <span className={`inline-block w-4 h-4 rounded-full ${isActive ? 'bg-[#E98226]' : 'bg-[#EBE7DE]'}`} />
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// ========================
//  REPRODUCTIVE CHART
// ========================
export const ReproductiveChart: React.FC<{ data: HealthParameter[] }> = ({ data }) => {
    const catData = data.filter(d => d.category === 'reproductive');
    if (catData.length === 0) return <p className="text-[#A8A29E] italic">No reproductive health data available.</p>;

    const days = [...new Set(catData.map(d => dayLabel(d.recorded_at)))];


    return (
        <div className="space-y-4">
            <SectionHeader title="Reproductive Health" subtitle="Cycle and symptom tracking" />
            <div className="space-y-3">
                {days.map(day => {
                    const dayData = catData.filter(d => dayLabel(d.recorded_at) === day);
                    return (
                        <div key={day} className="bg-[#F5F2EB] rounded-xl p-4 border border-[#EBE7DE]">
                            <p className="text-xs font-bold text-[#A8A29E] uppercase tracking-widest mb-2">{day}</p>
                            <div className="flex flex-wrap gap-2">
                                {dayData.map((d, i) => {
                                    const isText = d.parameter_text;
                                    const isActive = Number(d.parameter_value) === 1;
                                    return (
                                        <span key={i} className={`text-xs px-2.5 py-1 rounded-full ${isText ? 'bg-[#8b5cf6]/10 text-[#8b5cf6]' : isActive ? 'bg-[#E98226]/10 text-[#E98226]' : 'bg-[#EBE7DE] text-[#A8A29E]'}`}>
                                            {d.parameter_name.replace(' Indicator', '')}: {isText || (isActive ? 'Yes' : 'No')}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ============ LEGACY EXPORTS (keep backward compat) ============
export const StepsChart = ActivityChart;
export const HeartRateChart = VitalsChart;
