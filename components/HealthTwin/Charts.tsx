import React from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Line,
    LineChart,
    XAxis,
    YAxis,
    ResponsiveContainer
} from 'recharts';
import {
    ChartConfig,
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent
} from '../ui/chart';

const stepsData = [
    { date: 'Mon', steps: 6500 },
    { date: 'Tue', steps: 8400 },
    { date: 'Wed', steps: 5200 },
    { date: 'Thu', steps: 11200 },
    { date: 'Fri', steps: 9600 },
    { date: 'Sat', steps: 14000 },
    { date: 'Sun', steps: 8900 },
];

const stepsConfig = {
    steps: {
        label: "Daily Steps",
        color: "#A84A00",
    },
} satisfies ChartConfig;

export const StepsChart: React.FC = () => {
    return (
        <div className="w-full h-full flex flex-col">
            <div className="mb-4">
                <h3 className="font-serif text-lg">Activity History</h3>
                <p className="text-sm text-[#A8A29E]">Daily step count over the last 7 days</p>
            </div>
            <div className="flex-1 min-h-[200px]">
                <ChartContainer config={stepsConfig} className="h-full w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stepsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE7DE" />
                            <XAxis
                                dataKey="date"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#A8A29E', fontSize: 12 }}
                                dy={10}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#A8A29E', fontSize: 12 }}
                            />
                            <ChartTooltip cursor={{ fill: '#F5F2EB' }} content={<ChartTooltipContent />} />
                            <Bar
                                dataKey="steps"
                                fill="var(--color-steps)"
                                radius={[4, 4, 0, 0]}
                                maxBarSize={40}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartContainer>
            </div>
        </div>
    );
};

const heartRateData = [
    { time: '08:00', hr: 62 },
    { time: '10:00', hr: 65 },
    { time: '12:00', hr: 68 },
    { time: '14:00', hr: 61 },
    { time: '16:00', hr: 64 },
    { time: '18:00', hr: 72 }, // Workout
    { time: '20:00', hr: 66 },
];

const hrConfig = {
    hr: {
        label: "Heart Rate (BPM)",
        color: "#d946ef", // Fuchsia-ish
    },
} satisfies ChartConfig;

export const HeartRateChart: React.FC = () => {
    return (
        <div className="w-full h-full flex flex-col">
            <div className="mb-4">
                <h3 className="font-serif text-lg">Resting Heart Rate</h3>
                <p className="text-sm text-[#A8A29E]">Today's continuous monitoring</p>
            </div>
            <div className="flex-1 min-h-[200px]">
                <ChartContainer config={hrConfig} className="h-full w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={heartRateData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE7DE" />
                            <XAxis
                                dataKey="time"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#A8A29E', fontSize: 12 }}
                                dy={10}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#A8A29E', fontSize: 12 }}
                                domain={['dataMin - 5', 'dataMax + 5']}
                            />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Line
                                type="monotone"
                                dataKey="hr"
                                stroke="var(--color-hr)"
                                strokeWidth={3}
                                dot={{ r: 4, fill: "var(--color-hr)", strokeWidth: 2, stroke: "#fff" }}
                                activeDot={{ r: 6 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </ChartContainer>
            </div>
        </div>
    );
};
