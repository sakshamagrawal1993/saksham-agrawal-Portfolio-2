import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import type { MoodEntry } from '../../../store/mindCoachStore';

interface MoodChartProps {
  entries: MoodEntry[];
  height?: number;
}

export const MoodChart: React.FC<MoodChartProps> = ({ entries, height = 200 }) => {
  const data = useMemo(() => {
    const sorted = [...entries].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    return sorted.map((e) => ({
      date: new Date(e.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      score: e.score,
    }));
  }, [entries]);

  if (entries.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl bg-white border border-[#E8E4DE]"
        style={{ height }}
      >
        <p className="text-xs text-[#2C2A26]/40">Track your mood to see trends</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl bg-white border border-[#E8E4DE] p-3 overflow-hidden"
      style={{ height }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="moodGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6B8F71" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#6B8F71" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#2C2A26', opacity: 0.35 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[1, 5]}
            ticks={[1, 2, 3, 4, 5]}
            tick={{ fontSize: 10, fill: '#2C2A26', opacity: 0.25 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              fontSize: 11,
              borderRadius: 8,
              border: '1px solid #E8E4DE',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
            formatter={(value: number) => {
              const labels = ['', '😢', '😕', '😐', '🙂', '😊'];
              return [labels[value] ?? value, 'Mood'];
            }}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="#6B8F71"
            strokeWidth={2}
            fill="url(#moodGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
