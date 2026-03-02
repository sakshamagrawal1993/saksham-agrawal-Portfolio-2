import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { supabase } from '../../../lib/supabaseClient';
import { useMindCoachStore } from '../../../store/mindCoachStore';

const QUOTES = [
  '"The wound is the place where the Light enters you." — Rumi',
  '"You don\'t have to control your thoughts. You just have to stop letting them control you." — Dan Millman',
  '"Almost everything will work again if you unplug it for a few minutes, including you." — Anne Lamott',
  '"What lies behind us and what lies before us are tiny matters compared to what lies within us." — Ralph Waldo Emerson',
  '"You are allowed to be both a masterpiece and a work in progress simultaneously." — Sophia Bush',
  '"Healing is not linear." — Unknown',
];

const MOOD_EMOJIS = [
  { score: 1, emoji: '😢', label: 'Awful' },
  { score: 2, emoji: '😕', label: 'Bad' },
  { score: 3, emoji: '😐', label: 'Okay' },
  { score: 4, emoji: '🙂', label: 'Good' },
  { score: 5, emoji: '😊', label: 'Great' },
];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const HomeScreen: React.FC = () => {
  const profile = useMindCoachStore((s) => s.profile);
  const journey = useMindCoachStore((s) => s.journey);
  const sessions = useMindCoachStore((s) => s.sessions);
  const moodEntries = useMindCoachStore((s) => s.moodEntries);
  const setMoodEntries = useMindCoachStore((s) => s.setMoodEntries);
  const setActiveTab = useMindCoachStore((s) => s.setActiveTab);

  const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], []);

  const currentPhase = journey?.current_phase ?? 1;
  const phases = journey?.phases ?? [];
  const currentPhaseData = phases[currentPhase - 1];
  const completedInPhase = sessions.filter(
    (s) => s.session_state === 'completed' && s.phase_number === currentPhase
  ).length;
  const totalInPhase = currentPhaseData?.sessions?.length ?? 3;
  const progressPct = Math.round((completedInPhase / totalInPhase) * 100);

  const nextSessionTopic = currentPhaseData?.sessions?.[completedInPhase];

  const moodChartData = useMemo(() => {
    const last7 = [...moodEntries].reverse().slice(-7);
    return last7.map((m) => ({ score: m.score, date: m.created_at }));
  }, [moodEntries]);

  const handleMoodTap = async (score: number) => {
    if (!profile) return;

    const entry = {
      id: crypto.randomUUID(),
      profile_id: profile.id,
      score,
      notes: null,
      created_at: new Date().toISOString(),
    };

    setMoodEntries([entry, ...moodEntries]);

    await supabase.from('mind_coach_mood_entries').insert({
      profile_id: profile.id,
      score,
    });
  };

  const firstName = profile?.name?.split(' ')[0] ?? 'there';

  const THERAPIST_COLORS: Record<string, string> = {
    maya: '#B4A7D6',
    alex: '#D4A574',
    sage: '#6B8F71',
  };
  const THERAPIST_NAMES: Record<string, string> = {
    maya: 'Maya',
    alex: 'Alex',
    sage: 'Sage',
  };
  const therapistColor = THERAPIST_COLORS[profile?.therapist_persona ?? 'maya'];
  const therapistName = THERAPIST_NAMES[profile?.therapist_persona ?? 'maya'];

  return (
    <div className="p-5 pb-4 space-y-5">
      {/* Greeting */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-2xl font-semibold text-[#2C2A26]">
          {getGreeting()}, {firstName}
        </h2>
        <p className="text-[#2C2A26]/40 text-sm italic mt-1.5 leading-relaxed">{quote}</p>
      </motion.div>

      {/* Mood Check-in */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="bg-white rounded-2xl p-4 shadow-sm border border-[#E8E4DE]"
      >
        <p className="text-sm font-medium text-[#2C2A26] mb-3">How are you feeling right now?</p>
        <div className="flex justify-between px-2">
          {MOOD_EMOJIS.map(({ score, emoji, label }) => (
            <button
              key={score}
              onClick={() => handleMoodTap(score)}
              className="flex flex-col items-center gap-1 group"
            >
              <span className="text-2xl group-hover:scale-110 transition-transform">{emoji}</span>
              <span className="text-[10px] text-[#2C2A26]/40">{label}</span>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Journey Progress */}
      {journey && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl p-4 shadow-sm border border-[#E8E4DE]"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-[#2C2A26]/50 uppercase tracking-wide">
              Phase {currentPhase}
            </p>
            <span className="text-xs text-[#6B8F71] font-medium">
              {completedInPhase}/{totalInPhase} sessions
            </span>
          </div>
          <p className="text-sm font-semibold text-[#2C2A26] mb-3">
            {currentPhaseData?.title ?? 'Your Journey'}
          </p>
          <div className="w-full h-2 bg-[#F5F0EB] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-[#6B8F71] rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
          <button
            onClick={() => setActiveTab('sessions')}
            className="flex items-center gap-1 mt-3 text-sm font-medium text-[#6B8F71] hover:text-[#5A7D60] transition-colors"
          >
            Continue Session <ArrowRight size={14} />
          </button>
        </motion.div>
      )}

      {/* Next Session */}
      {nextSessionTopic && (
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          onClick={() => setActiveTab('sessions')}
          className="w-full bg-white rounded-2xl p-4 shadow-sm border border-[#E8E4DE] text-left hover:border-[#6B8F71]/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
              style={{ backgroundColor: therapistColor }}
            >
              {therapistName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#2C2A26]/50 mb-0.5">Up next with {therapistName}</p>
              <p className="text-sm font-medium text-[#2C2A26] truncate">
                {nextSessionTopic.topic}
              </p>
            </div>
            <ArrowRight size={16} className="text-[#2C2A26]/30 shrink-0" />
          </div>
        </motion.button>
      )}

      {/* Mood Trend */}
      {moodChartData.length >= 2 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl p-4 shadow-sm border border-[#E8E4DE]"
        >
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles size={14} className="text-[#B4A7D6]" />
            <p className="text-xs font-medium text-[#2C2A26]/50 uppercase tracking-wide">
              Mood Trend
            </p>
          </div>
          <ResponsiveContainer width="100%" height={100}>
            <AreaChart data={moodChartData}>
              <defs>
                <linearGradient id="moodGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6B8F71" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#6B8F71" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="score"
                stroke="#6B8F71"
                strokeWidth={2}
                fill="url(#moodGrad)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      )}
    </div>
  );
};
