import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Settings, Phone, ExternalLink, Trash2 } from 'lucide-react';
import { AreaChart, Area, XAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabaseClient';
import {
  useMindCoachStore,
  type TherapistPersona,
} from '../../../store/mindCoachStore';

const THERAPIST_META: Record<
  TherapistPersona,
  { name: string; color: string; style: string }
> = {
  maya: { name: 'Maya', color: '#B4A7D6', style: 'Warm & Empathetic' },
  alex: { name: 'Alex', color: '#D4A574', style: 'Direct & Solution-focused' },
  sage: { name: 'Sage', color: '#6B8F71', style: 'Calm & Mindful' },
};

function computeStreak(sessionDates: string[]): number {
  if (sessionDates.length === 0) return 0;

  const uniqueDays = Array.from(
    new Set(
      sessionDates.map((d) => new Date(d).toISOString().slice(0, 10))
    )
  ).sort().reverse();

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  if (uniqueDays[0] !== today && uniqueDays[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < uniqueDays.length; i++) {
    const prev = new Date(uniqueDays[i - 1]);
    const curr = new Date(uniqueDays[i]);
    const diffDays = (prev.getTime() - curr.getTime()) / 86400000;
    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

export const ProfileScreen: React.FC = () => {
  const navigate = useNavigate();
  const profile = useMindCoachStore((s) => s.profile);
  const journey = useMindCoachStore((s) => s.journey);
  const sessions = useMindCoachStore((s) => s.sessions);
  const moodEntries = useMindCoachStore((s) => s.moodEntries);
  const completedSessionCount = useMindCoachStore((s) => s.completedSessionCount);
  const resetLocalStore = useMindCoachStore((s) => s.reset);
  const [resetting, setResetting] = React.useState(false);

  const persona = profile?.therapist_persona ?? 'maya';
  const meta = THERAPIST_META[persona];
  const currentPhase = journey?.current_phase ?? 1;
  const completedCount = completedSessionCount();

  const completedDates = sessions
    .filter((s) => s.session_state === 'completed' && s.ended_at)
    .map((s) => s.ended_at!);
  const streak = computeStreak(completedDates);

  const moodChartData = useMemo(() => {
    const thirtyDaysAgo = Date.now() - 30 * 86400000;
    return [...moodEntries]
      .filter((m) => new Date(m.created_at).getTime() >= thirtyDaysAgo)
      .reverse()
      .map((m) => ({
        date: new Date(m.created_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        score: m.score,
      }));
  }, [moodEntries]);

  const handleResetData = async () => {
    if (!profile) return;

    const confirmWipe = window.confirm(
      "Are you sure you want to completely erase your Mind Coach journey? This will delete all your sessions, memories, and progress permanently."
    );

    if (!confirmWipe) return;

    setResetting(true);
    try {
      // Deleting the root profile propagates ON DELETE CASCADE to all other mind_coach_* tables.
      await supabase.from('mind_coach_profiles').delete().eq('id', profile.id);
      resetLocalStore();
      navigate('/mind-coach', { replace: true });
    } catch (e) {
      console.error('Failed to reset data:', e);
      alert('Failed to delete data. Please try again.');
    } finally {
      if (window.location.pathname.includes('/mind-coach')) {
        setResetting(false);
      }
    }
  };

  return (
    <div className="p-5 pb-4 space-y-5">
      <h2 className="text-xl font-semibold text-[#2C2A26]">Profile</h2>

      {/* Therapist Card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl p-4 border border-[#E8E4DE]"
      >
        <p className="text-xs font-medium text-[#2C2A26]/40 uppercase tracking-wide mb-3">
          Your Therapist
        </p>
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-semibold"
            style={{ backgroundColor: meta.color }}
          >
            {meta.name[0]}
          </div>
          <div>
            <p className="text-sm font-semibold text-[#2C2A26]">{meta.name}</p>
            <p className="text-xs text-[#2C2A26]/50">{meta.style}</p>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-3 gap-3"
      >
        {[
          { label: 'Sessions', value: completedCount },
          { label: 'Phase', value: currentPhase },
          { label: 'Streak', value: `${streak}d` },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-xl p-3 border border-[#E8E4DE] text-center"
          >
            <p className="text-lg font-bold text-[#2C2A26]">{stat.value}</p>
            <p className="text-[10px] text-[#2C2A26]/40 font-medium uppercase">{stat.label}</p>
          </div>
        ))}
      </motion.div>

      {/* Mood Chart */}
      {moodChartData.length >= 2 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl p-4 border border-[#E8E4DE]"
        >
          <p className="text-xs font-medium text-[#2C2A26]/40 uppercase tracking-wide mb-3">
            Mood — Last 30 Days
          </p>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={moodChartData}>
              <defs>
                <linearGradient id="profileMoodGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6B8F71" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#6B8F71" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#2C2A2660' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #E8E4DE',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Area
                type="monotone"
                dataKey="score"
                stroke="#6B8F71"
                strokeWidth={2}
                fill="url(#profileMoodGrad)"
                dot={{ r: 2, fill: '#6B8F71' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* Settings */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="space-y-2"
      >
        <button className="w-full flex items-center gap-3 bg-white rounded-xl p-3.5 border border-[#E8E4DE] text-left hover:border-[#6B8F71]/30 transition-colors">
          <Settings size={16} className="text-[#2C2A26]/40" />
          <span className="text-sm text-[#2C2A26]">Adjust My Journey</span>
        </button>
        <button className="w-full flex items-center gap-3 bg-white rounded-xl p-3.5 border border-[#E8E4DE] text-left hover:border-[#6B8F71]/30 transition-colors">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: meta.color }}
          />
          <span className="text-sm text-[#2C2A26]">Change Therapist</span>
        </button>
      </motion.div>

      {/* Crisis Resources */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-[#FFF5F5] rounded-2xl p-4 border border-red-100"
      >
        <div className="flex items-start gap-3">
          <Phone size={16} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-[#2C2A26]">Crisis Resources</p>
            <p className="text-xs text-[#2C2A26]/60 mt-1 leading-relaxed">
              If you or someone you know is in crisis, please reach out:
            </p>
            <p className="text-xs font-semibold text-[#2C2A26] mt-2">
              988 Suicide & Crisis Lifeline
            </p>
            <p className="text-xs text-[#2C2A26]/60">Call or text 988 — available 24/7</p>
          </div>
        </div>
      </motion.div>

      {/* Start Afresh (Danger Zone) */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22 }}
      >
        <button
          onClick={handleResetData}
          disabled={resetting}
          className="w-full flex items-center justify-center gap-2 bg-white rounded-xl p-3.5 border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
        >
          {resetting ? (
            <span className="text-sm font-medium">Resetting...</span>
          ) : (
            <>
              <Trash2 size={16} />
              <span className="text-sm font-medium">Delete Journey & Start Afresh</span>
            </>
          )}
        </button>
      </motion.div>

      {/* Back to portfolio */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
      >
        <button
          onClick={() => navigate('/project/p2')}
          className="flex items-center gap-2 text-sm text-[#2C2A26]/40 hover:text-[#2C2A26]/60 transition-colors mx-auto"
        >
          <ArrowLeft size={14} />
          Back to portfolio
          <ExternalLink size={12} />
        </button>
      </motion.div>
    </div>
  );
};
