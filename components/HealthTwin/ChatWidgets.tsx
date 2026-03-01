import React from 'react';
import { ChatWidget } from '../../store/healthTwin';
import {
    LineChart, Line, BarChart, Bar, AreaChart, Area,
    PieChart, Pie, Cell, ScatterChart, Scatter,
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer
} from 'recharts';

// ─── Design Tokens ────────────────────────────────────────────
const COLORS = ['#A84A00', '#D97706', '#059669', '#2563EB', '#7C3AED', '#DB2777', '#0891B2', '#65A30D', '#E11D48', '#6366F1'];
const BRAND = { primary: '#A84A00', secondary: '#D97706', bg: '#FFFDF9', border: '#EBE7DE', text: '#2C2A26', muted: '#A8A29E' };

const tooltipStyle = {
    contentStyle: { background: '#2C2A26', border: 'none', borderRadius: 8, fontSize: 12, color: '#fff' },
    itemStyle: { color: '#fff' },
    labelStyle: { color: '#A8A29E', fontSize: 11 },
};

// ─── Widget Title ─────────────────────────────────────────────
const WidgetTitle: React.FC<{ title?: string }> = ({ title }) => (
    <h4 className="text-[11px] font-bold text-[#A8A29E] uppercase tracking-wider mb-3">{title || 'Data Graph'}</h4>
);

// ─── 1. Line Chart ────────────────────────────────────────────
const LineChartWidget: React.FC<{ widget: ChatWidget }> = ({ widget }) => (
    <ResponsiveContainer width="100%" height={180}>
        <LineChart data={widget.data} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: BRAND.muted }} />
            <YAxis tick={{ fontSize: 10, fill: BRAND.muted }} />
            <Tooltip {...tooltipStyle} />
            <Line type="monotone" dataKey="value" stroke={BRAND.primary} strokeWidth={2} dot={{ r: 3, fill: BRAND.primary }} activeDot={{ r: 5 }} />
        </LineChart>
    </ResponsiveContainer>
);

// ─── 2. Multi-Line Chart ──────────────────────────────────────
const MultiLineChartWidget: React.FC<{ widget: ChatWidget }> = ({ widget }) => {
    if (!widget.data || widget.data.length === 0) return null;
    const keys = Object.keys(widget.data[0]).filter(k => k !== 'label');
    return (
        <ResponsiveContainer width="100%" height={180}>
            <LineChart data={widget.data} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: BRAND.muted }} />
                <YAxis tick={{ fontSize: 10, fill: BRAND.muted }} />
                <Tooltip {...tooltipStyle} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                {keys.map((key, i) => (
                    <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 2 }} />
                ))}
            </LineChart>
        </ResponsiveContainer>
    );
};

// ─── 3. Bar Chart ─────────────────────────────────────────────
const BarChartWidget: React.FC<{ widget: ChatWidget }> = ({ widget }) => (
    <ResponsiveContainer width="100%" height={180}>
        <BarChart data={widget.data} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: BRAND.muted }} />
            <YAxis tick={{ fontSize: 10, fill: BRAND.muted }} />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey="value" fill={BRAND.primary} radius={[4, 4, 0, 0]} />
        </BarChart>
    </ResponsiveContainer>
);

// ─── 4. Stacked Bar Chart ─────────────────────────────────────
const StackedBarChartWidget: React.FC<{ widget: ChatWidget }> = ({ widget }) => {
    if (!widget.data || widget.data.length === 0) return null;
    const keys = Object.keys(widget.data[0]).filter(k => k !== 'label');
    return (
        <ResponsiveContainer width="100%" height={180}>
            <BarChart data={widget.data} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: BRAND.muted }} />
                <YAxis tick={{ fontSize: 10, fill: BRAND.muted }} />
                <Tooltip {...tooltipStyle} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                {keys.map((key, i) => (
                    <Bar key={key} dataKey={key} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === keys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                ))}
            </BarChart>
        </ResponsiveContainer>
    );
};

// ─── 5. Area Chart ────────────────────────────────────────────
const AreaChartWidget: React.FC<{ widget: ChatWidget }> = ({ widget }) => (
    <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={widget.data} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
            <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={BRAND.primary} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={BRAND.primary} stopOpacity={0.02} />
                </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: BRAND.muted }} />
            <YAxis tick={{ fontSize: 10, fill: BRAND.muted }} />
            <Tooltip {...tooltipStyle} />
            <Area type="monotone" dataKey="value" stroke={BRAND.primary} strokeWidth={2} fill="url(#areaGradient)" />
        </AreaChart>
    </ResponsiveContainer>
);

// ─── 6. Donut Chart ───────────────────────────────────────────
const DonutChartWidget: React.FC<{ widget: ChatWidget }> = ({ widget }) => {
    const total = widget.data?.reduce((sum, d) => sum + (Number(d.value) || 0), 0) ?? 0;
    return (
        <ResponsiveContainer width="100%" height={200}>
            <PieChart>
                <Pie
                    data={widget.data}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    dataKey="value"
                    nameKey="label"
                    paddingAngle={2}
                    stroke="none"
                >
                    {widget.data?.map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip {...tooltipStyle} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="fill-[#2C2A26] text-lg font-bold">
                    {total}
                </text>
            </PieChart>
        </ResponsiveContainer>
    );
};

// ─── 7. Scatter Plot ──────────────────────────────────────────
const ScatterPlotWidget: React.FC<{ widget: ChatWidget }> = ({ widget }) => (
    <ResponsiveContainer width="100%" height={180}>
        <ScatterChart margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} />
            <XAxis dataKey="x" type="number" tick={{ fontSize: 10, fill: BRAND.muted }} name={widget.x_axis_label || 'X'} />
            <YAxis dataKey="y" type="number" tick={{ fontSize: 10, fill: BRAND.muted }} name={widget.y_axis_label || 'Y'} />
            <Tooltip {...tooltipStyle} cursor={{ strokeDasharray: '3 3' }} />
            <Scatter data={widget.data} fill={BRAND.primary} />
        </ScatterChart>
    </ResponsiveContainer>
);

// ─── 8. Radar Chart ───────────────────────────────────────────
const RadarChartWidget: React.FC<{ widget: ChatWidget }> = ({ widget }) => (
    <ResponsiveContainer width="100%" height={220}>
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={widget.data}>
            <PolarGrid stroke={BRAND.border} />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: BRAND.muted }} />
            <PolarRadiusAxis tick={{ fontSize: 9, fill: BRAND.muted }} />
            <Tooltip {...tooltipStyle} />
            <Radar dataKey="value" stroke={BRAND.primary} fill={BRAND.primary} fillOpacity={0.25} strokeWidth={2} />
        </RadarChart>
    </ResponsiveContainer>
);

// ─── 9. Gauge Chart ───────────────────────────────────────────
const GaugeChartWidget: React.FC<{ widget: ChatWidget }> = ({ widget }) => {
    const val = widget.value ?? 0;
    const min = widget.min ?? 0;
    const max = widget.max ?? 100;
    const pct = Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100));
    const target = widget.target;
    const targetPct = target ? Math.min(100, Math.max(0, ((target - min) / (max - min)) * 100)) : null;

    // Determine color based on percentage
    const color = pct > 75 ? '#059669' : pct > 40 ? '#D97706' : '#EF4444';

    return (
        <div className="flex flex-col items-center py-4">
            <div className="relative w-40 h-20 overflow-hidden">
                {/* Background arc */}
                <div className="absolute inset-0 rounded-t-full border-[12px] border-b-0 border-[#EBE7DE]" />
                {/* Filled arc */}
                <div
                    className="absolute inset-0 rounded-t-full border-[12px] border-b-0 transition-all duration-700"
                    style={{
                        borderColor: color,
                        clipPath: `polygon(0 100%, 0 0, ${pct}% 0, ${pct}% 100%)`,
                    }}
                />
                {/* Target marker */}
                {targetPct !== null && (
                    <div className="absolute top-0 w-0.5 h-[12px] bg-[#2C2A26]" style={{ left: `${targetPct}%` }} />
                )}
                {/* Center value */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
                    <span className="text-2xl font-bold" style={{ color }}>{val}</span>
                </div>
            </div>
            <div className="flex justify-between w-40 mt-1 text-[10px] text-[#A8A29E]">
                <span>{min}</span>
                {target && <span className="font-medium text-[#2C2A26]">Target: {target}</span>}
                <span>{max}</span>
            </div>
        </div>
    );
};

// ─── 10. Heat Map ─────────────────────────────────────────────
const HeatMapWidget: React.FC<{ widget: ChatWidget }> = ({ widget }) => {
    if (!widget.data || widget.data.length === 0) return null;

    const values = widget.data.map(d => Number(d.value) || 0);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;

    // Get unique x and y values
    const xLabels = [...new Set(widget.data.map(d => String(d.x)))];
    const yLabels = [...new Set(widget.data.map(d => String(d.y)))];

    const getColor = (v: number) => {
        const norm = (v - minVal) / range;
        // Gradient from light beige to deep brand orange
        const r = Math.round(245 - norm * (245 - 168));
        const g = Math.round(242 - norm * (242 - 74));
        const b = Math.round(235 - norm * (235 - 0));
        return `rgb(${r}, ${g}, ${b})`;
    };

    const getValue = (x: string, y: string) => {
        const d = widget.data?.find(d => String(d.x) === x && String(d.y) === y);
        return d ? Number(d.value) : null;
    };

    return (
        <div className="overflow-x-auto">
            <table className="w-full border-collapse">
                <thead>
                    <tr>
                        <th className="text-[9px] text-[#A8A29E] p-1"></th>
                        {xLabels.map(x => (
                            <th key={x} className="text-[9px] text-[#A8A29E] p-1 font-medium">{x}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {yLabels.map(y => (
                        <tr key={y}>
                            <td className="text-[9px] text-[#A8A29E] p-1 font-medium whitespace-nowrap">{y}</td>
                            {xLabels.map(x => {
                                const v = getValue(x, y);
                                return (
                                    <td
                                        key={`${x}-${y}`}
                                        className="p-1 text-center text-[10px] font-medium rounded-sm group relative"
                                        style={{ backgroundColor: v !== null ? getColor(v) : '#F5F2EB', color: v !== null && v > (maxVal * 0.6) ? '#fff' : BRAND.text, minWidth: 32, height: 28 }}
                                    >
                                        {v !== null ? v : '–'}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// ─── Chart Router ─────────────────────────────────────────────
const ChartRenderer: React.FC<{ widget: ChatWidget }> = ({ widget }) => {
    const chartType = widget.chart_type || 'bar';

    switch (chartType) {
        case 'line': return <LineChartWidget widget={widget} />;
        case 'multi_line': return <MultiLineChartWidget widget={widget} />;
        case 'bar': return <BarChartWidget widget={widget} />;
        case 'stacked_bar': return <StackedBarChartWidget widget={widget} />;
        case 'area': return <AreaChartWidget widget={widget} />;
        case 'donut': return <DonutChartWidget widget={widget} />;
        case 'scatter': return <ScatterPlotWidget widget={widget} />;
        case 'radar': return <RadarChartWidget widget={widget} />;
        case 'gauge': return <GaugeChartWidget widget={widget} />;
        case 'heatmap': return <HeatMapWidget widget={widget} />;
        default: return <BarChartWidget widget={widget} />;
    }
};

// ─── Main Widget Renderer ─────────────────────────────────────
export const ChatWidgetRenderer: React.FC<{ widget: ChatWidget }> = ({ widget }) => {
    if (widget.type === 'chart' && widget.data) {
        return (
            <div className="bg-white rounded-xl overflow-hidden border border-[#EBE7DE] shadow-sm p-4">
                <WidgetTitle title={widget.title} />
                <ChartRenderer widget={widget} />
                {(widget.x_axis_label || widget.y_axis_label) && (
                    <div className="flex justify-between mt-2 text-[9px] text-[#A8A29E]">
                        {widget.x_axis_label && <span>X: {widget.x_axis_label}</span>}
                        {widget.y_axis_label && <span>Y: {widget.y_axis_label}</span>}
                    </div>
                )}
            </div>
        );
    }

    if (widget.type === 'chart' && widget.chart_type === 'gauge') {
        return (
            <div className="bg-white rounded-xl overflow-hidden border border-[#EBE7DE] shadow-sm p-4">
                <WidgetTitle title={widget.title} />
                <GaugeChartWidget widget={widget} />
            </div>
        );
    }

    if (widget.type === 'image' && widget.url) {
        return (
            <div className="bg-white rounded-xl overflow-hidden border border-[#EBE7DE] shadow-sm">
                <img src={widget.url} alt={widget.alt_text || 'Reference Image'} className="w-full max-h-48 object-cover" />
                {widget.alt_text && (
                    <div className="bg-black/60 text-white text-[10px] p-1.5 px-3">{widget.alt_text}</div>
                )}
            </div>
        );
    }

    if (widget.type === 'triage_action') {
        return (
            <div className="bg-orange-50/50 rounded-xl overflow-hidden border border-[#EBE7DE] shadow-sm p-4">
                <p className="text-sm text-orange-900 font-medium mb-3 leading-snug">{widget.action_text}</p>
                <button className="w-full py-2.5 bg-[#A84A00] hover:bg-[#8A3D00] text-white text-xs tracking-wider font-bold rounded-lg transition-colors shadow-sm">
                    {widget.button_label || 'Take Action'}
                </button>
            </div>
        );
    }

    return null;
};
