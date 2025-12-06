import React, { useMemo, useState } from 'react';
import { Ticket } from './types';

interface AnalyticsProps {
    tickets: Ticket[];
    onClose: () => void;
}

const Analytics: React.FC<AnalyticsProps> = ({ tickets, onClose }) => {
    const [period, setPeriod] = useState<'1day' | '7days' | '1month' | '3months'>('7days');

    const chartData = useMemo(() => {
        const now = new Date();
        const data: { label: string; Open: number; InProgress: number; Resolved: number; Closed: number }[] = [];

        // Define buckets based on time params
        let buckets = 0;
        let intervalMs = 0;
        let formatLabel = (_date: Date) => '';

        if (period === '1day') {
            // 24 buckets of 1 hour
            buckets = 24;
            intervalMs = 60 * 60 * 1000;
            formatLabel = (d) => d.getHours() + ':00';
            // Start from the beginning of the current hour - 24 hours
            now.setMinutes(0, 0, 0);
        } else if (period === '7days') {
            buckets = 7;
            intervalMs = 24 * 60 * 60 * 1000;
            formatLabel = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            now.setHours(0, 0, 0, 0); // Start of today
        } else if (period === '1month') {
            buckets = 30; // Approx last 30 days
            intervalMs = 24 * 60 * 60 * 1000;
            formatLabel = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            now.setHours(0, 0, 0, 0);
        } else {
            // 3 months -> 12 weeks approx, let's do 14 weeks to be safe or 90 days. 
            // To simplify flexbox layout, let's do 12 weeks
            buckets = 12;
            intervalMs = 7 * 24 * 60 * 60 * 1000;
            formatLabel = (d) => `W${Math.ceil((d.getDate()) / 7)} ${d.toLocaleString('default', { month: 'short' })}`;
            now.setHours(0, 0, 0, 0);
        }

        // Initialize buckets
        // "now" is the END of the period. We usually want to show from Start to End.
        // Let's generate timestamps for the buckets.
        const endTime = Date.now();
        const startTime = endTime - (buckets * intervalMs);

        for (let i = 0; i < buckets; i++) {
            const bucketStart = startTime + (i * intervalMs);
            const bucketEnd = bucketStart + intervalMs;
            const labelDate = new Date(bucketStart);

            // Filter tickets in this bucket
            const bucketTickets = tickets.filter(t => t.createdAt >= bucketStart && t.createdAt < bucketEnd);

            data.push({
                label: formatLabel(labelDate),
                Open: bucketTickets.filter(t => t.status === 'Open').length,
                InProgress: bucketTickets.filter(t => t.status === 'In Progress').length,
                Resolved: bucketTickets.filter(t => t.status === 'Resolved').length,
                Closed: bucketTickets.filter(t => t.status === 'Closed').length
            });
        }
        return data;
    }, [tickets, period]);

    // Calculate max value for Y-axis scaling
    const maxVal = useMemo(() => {
        return Math.max(...chartData.map(d => d.Open + d.InProgress + d.Resolved + d.Closed), 1);
    }, [chartData]);

    // Total for summary cards (based on currently viewed period)
    const periodStats = useMemo(() => {
        return chartData.reduce((acc, curr) => ({
            Open: acc.Open + curr.Open,
            InProgress: acc.InProgress + curr.InProgress,
            Resolved: acc.Resolved + curr.Resolved,
            Closed: acc.Closed + curr.Closed
        }), { Open: 0, InProgress: 0, Resolved: 0, Closed: 0 });
    }, [chartData]);

    const totalTickets = periodStats.Open + periodStats.InProgress + periodStats.Resolved + periodStats.Closed;

    return (
        <div className="fixed inset-0 bg-[#2C2A26]/80 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
            <div className="bg-[#F5F2EB] w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-8 border-b border-[#D6D1C7] flex justify-between items-center bg-[#EBE5D9]/30 shrink-0">
                    <h2 className="text-3xl font-serif text-[#2C2A26]">Analytics</h2>
                    <button onClick={onClose} className="text-[#2C2A26]/50 hover:text-[#2C2A26] text-3xl font-serif transition-colors">&times;</button>
                </div>

                <div className="p-8 overflow-y-auto flex-1">
                    <div className="flex justify-between items-center mb-8">
                        <div className="flex space-x-8">
                            <div>
                                <span className="text-[10px] uppercase tracking-widest text-[#2C2A26]/60 block mb-1">Total Tickets</span>
                                <span className="text-3xl font-serif text-[#2C2A26]">{totalTickets}</span>
                            </div>
                            <div>
                                <span className="text-[10px] uppercase tracking-widest text-[#2C2A26]/60 block mb-1">Open</span>
                                <span className="text-3xl font-serif text-blue-800">{periodStats.Open}</span>
                            </div>
                            <div>
                                <span className="text-[10px] uppercase tracking-widest text-[#2C2A26]/60 block mb-1">Resolved</span>
                                <span className="text-3xl font-serif text-green-800">{periodStats.Resolved + periodStats.Closed}</span>
                            </div>
                        </div>

                        <div className="flex space-x-2">
                            {(['1day', '7days', '1month', '3months'] as const).map((p) => (
                                <button
                                    key={p}
                                    onClick={() => setPeriod(p)}
                                    className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest border transition-all ${period === p
                                        ? 'bg-[#2C2A26] text-[#F5F2EB] border-[#2C2A26]'
                                        : 'bg-transparent text-[#2C2A26] border-[#D6D1C7] hover:border-[#2C2A26]'
                                        }`}
                                >
                                    {p === '1day' ? 'Today' : p === '7days' ? '7 Days' : p === '1month' ? '1 Month' : '3 Months'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Stacked Bar Chart */}
                    <div className="border border-[#D6D1C7] bg-[#white] p-6 relative">
                        <div className="h-64 flex items-end justify-between space-x-1 sm:space-x-2 pb-6 border-b border-[#2C2A26]/10 relative">
                            {/* Y-axis grid lines (simplified) */}
                            <div className="absolute inset-0 pointer-events-none flex flex-col justify-between">
                                <div className="border-t border-dashed border-gray-200 w-full h-0"></div>
                                <div className="border-t border-dashed border-gray-200 w-full h-0"></div>
                                <div className="border-t border-dashed border-gray-200 w-full h-0"></div>
                                <div className="border-t border-dashed border-gray-200 w-full h-0"></div>
                            </div>

                            {chartData.map((data, i) => {
                                const total = data.Open + data.InProgress + data.Resolved + data.Closed;
                                const heightPct = maxVal > 0 ? (total / maxVal) * 100 : 0;

                                return (
                                    <div key={i} className="flex-1 flex flex-col justify-end items-center group h-full relative">
                                        {/* Tooltip */}
                                        <div className="absolute bottom-full mb-2 hidden group-hover:block z-10 bg-[#2C2A26] text-[#F5F2EB] text-[10px] p-2 rounded shadow-lg whitespace-nowrap">
                                            <div className="font-bold border-b border-gray-600 pb-1 mb-1">{data.label}</div>
                                            <div>Open: {data.Open}</div>
                                            <div>In Prog: {data.InProgress}</div>
                                            <div>Resolved: {data.Resolved}</div>
                                            <div>Closed: {data.Closed}</div>
                                        </div>

                                        {/* Stacked Bar */}
                                        <div className="w-full max-w-[40px] flex flex-col-reverse rounded-t-sm overflow-hidden" style={{ height: `${heightPct}%` }}>
                                            {data.Closed > 0 && <div style={{ flex: data.Closed }} className="bg-[#2C2A26] opacity-60"></div>}
                                            {data.Resolved > 0 && <div style={{ flex: data.Resolved }} className="bg-green-700 opacity-80"></div>}
                                            {data.InProgress > 0 && <div style={{ flex: data.InProgress }} className="bg-yellow-600 opacity-90"></div>}
                                            {data.Open > 0 && <div style={{ flex: data.Open }} className="bg-blue-800"></div>}

                                            {/* Empty placeholder if total is 0 to distinguish buckets */}
                                            {total === 0 && <div className="h-0.5 bg-gray-200"></div>}
                                        </div>

                                        {/* X Label */}
                                        <div className="absolute top-full mt-2 text-[8px] sm:text-[10px] text-[#A8A29E] font-bold uppercase tracking-wider -rotate-45 sm:rotate-0 origin-top-left sm:origin-center w-full text-center truncate">
                                            {/* Show label sparse for 1month+ */}
                                            {period === '1month' && i % 4 !== 0 ? '' : period === '3months' && i % 2 !== 0 ? '' : data.label}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex justify-center mt-8 gap-6">
                            <div className="flex items-center"><div className="w-3 h-3 bg-blue-800 mr-2 rounded-[1px]"></div><span className="text-xs text-[#2C2A26]/70">Open</span></div>
                            <div className="flex items-center"><div className="w-3 h-3 bg-yellow-600 opacity-90 mr-2 rounded-[1px]"></div><span className="text-xs text-[#2C2A26]/70">In Progress</span></div>
                            <div className="flex items-center"><div className="w-3 h-3 bg-green-700 opacity-80 mr-2 rounded-[1px]"></div><span className="text-xs text-[#2C2A26]/70">Resolved</span></div>
                            <div className="flex items-center"><div className="w-3 h-3 bg-[#2C2A26] opacity-60 mr-2 rounded-[1px]"></div><span className="text-xs text-[#2C2A26]/70">Closed</span></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Analytics;
