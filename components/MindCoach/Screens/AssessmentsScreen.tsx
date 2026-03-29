import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ClipboardList, TrendingUp, Clock, ChevronRight, ArrowLeft, Check, BookOpen } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import {
  useMindCoachStore,
  UNLOCK_MAP,
  firstPhaseWhereFeatureUnlocks,
} from '../../../store/mindCoachStore';
import { FeaturePreviewLockOverlay } from '../shared/FeaturePreviewLockOverlay';

interface AssessmentQuestion {
  id: string;
  assessment_type: string;
  assessment_name: string;
  question_number: number;
  question_text: string;
  answer_options: { value: number; label: string }[];
}

interface AssessmentScore {
  id: string;
  profile_id: string;
  assessment_type: string;
  total_score: number;
  severity: string | null;
  created_at: string;
}

const ASSESSMENT_INFO: Record<string, { name: string; maxScore: number; description: string; emoji: string }> = {
  gad7: { name: 'GAD-7', maxScore: 21, description: 'Anxiety severity', emoji: '💭' },
  phq9: { name: 'PHQ-9', maxScore: 27, description: 'Depression screening', emoji: '🌧️' },
  pss4: { name: 'PSS-4', maxScore: 16, description: 'Perceived stress', emoji: '⚡' },
};

const getSeverityInfo = (type: string, score: number): { label: string; color: string } => {
  const info = ASSESSMENT_INFO[type];
  if (!info) return { label: 'Unknown', color: '#2C2A26' };
  const pct = score / info.maxScore;
  if (pct < 0.25) return { label: 'Minimal', color: '#6B8F71' };
  if (pct < 0.5) return { label: 'Mild', color: '#D4A574' };
  if (pct < 0.75) return { label: 'Moderate', color: '#E0976F' };
  return { label: 'Severe', color: '#C75B5B' };
};

const getSeverityLabel = (type: string, score: number): string => {
  if (type === 'gad7') {
    if (score <= 4) return 'minimal';
    if (score <= 9) return 'mild';
    if (score <= 14) return 'moderate';
    return 'severe';
  }
  if (type === 'phq9') {
    if (score <= 4) return 'minimal';
    if (score <= 9) return 'mild';
    if (score <= 14) return 'moderate';
    if (score <= 19) return 'moderately_severe';
    return 'severe';
  }
  if (type === 'pss4') {
    if (score <= 4) return 'low';
    if (score <= 10) return 'moderate';
    return 'high';
  }
  return 'unknown';
};

const ASSESSMENT_INTERPRETATIONS: Record<string, Record<string, { meaning: string; advice: string }>> = {
  gad7: {
    minimal: { meaning: "You are experiencing minimal anxiety levels.", advice: "Keep practicing mindfulness and self-care to maintain your emotional balance." },
    mild: { meaning: "You are experiencing mild anxiety. This is a common level of worry.", advice: "Try a 5-minute grounding exercise or journal about your current worries." },
    moderate: { meaning: "Your anxiety levels are moderate. You may often feel restless or on edge.", advice: "Let's talk to Maya about these feelings. We can work on cognitive reframing together." },
    severe: { meaning: "You are experiencing severe anxiety. It may feel overwhelming at times.", advice: "Please reach out for support. Let's practice a deep breathing exercise together right now." },
  },
  phq9: {
    minimal: { meaning: "You are experiencing minimal or no depressive symptoms.", advice: "Focus on gratitude and daily physical activity to keep your spirits high." },
    mild: { meaning: "You are experiencing mild depression.", advice: "A short walk or a small daily goal could help boost your energy and mood." },
    moderate: { meaning: "Your depression symptoms are moderate.", advice: "Let's discuss behavioral activation strategies with Alex to help re-engage with your values." },
    moderately_severe: { meaning: "Your depression symptoms are moderately severe.", advice: "It's important to talk about these feelings. Let's schedule a dedicated session to process this." },
    severe: { meaning: "Your depression symptoms are severe.", advice: "Please prioritize your well-being and reach out to a mental health professional for additional support." },
  },
  pss4: {
    low: { meaning: "Your perceived stress levels are low.", advice: "You're handling current pressures well. Continue your current self-care routines." },
    moderate: { meaning: "You are experiencing moderate stress.", advice: "Take a few minutes to unplug and breathe. A brief meditation could help you reset." },
    high: { meaning: "Your perceived stress levels are high.", advice: "Your plate feels very full. Let's find a grounding technique that works for you right now." },
  },
};

function AssessmentCatalogSection({
  latestByType,
  historyByType,
  onStartAssessment,
  allScores,
}: {
  latestByType: Record<string, AssessmentScore>;
  historyByType: Record<string, AssessmentScore[]>;
  onStartAssessment: (type: string) => void;
  allScores: AssessmentScore[];
}) {
  return (
    <div className="p-5 space-y-5">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-xl font-semibold text-[#2C2A26]">Assessments</h2>
        <p className="text-xs text-[#2C2A26]/40 mt-1">Track your mental health scores over time</p>
      </motion.div>

      <div className="space-y-3">
        {Object.entries(ASSESSMENT_INFO).map(([type, info], i) => {
          const latest = latestByType[type];
          const history = historyByType[type] || [];
          const severity = latest ? getSeverityInfo(type, latest.total_score) : null;

          return (
            <motion.div
              key={type}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="group relative zen-glass rounded-3xl p-5 zen-card-shadow border border-white/60 hover:bg-white/40 transition-all active:scale-[0.98]"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white/60 zen-card-shadow flex items-center justify-center text-xl shrink-0 border border-white">
                  {info.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-base font-bold text-[#2C2A26] tracking-tight">{info.name}</p>
                    {latest && severity && (
                      <span
                        className="text-[10px] font-bold uppercase px-3 py-1 rounded-lg"
                        style={{ backgroundColor: severity.color + '15', color: severity.color }}
                      >
                        {severity.label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#2C2A26]/40 font-medium">{info.description}</p>
                </div>
              </div>

              {latest ? (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={12} className="text-[#6B8F71]" />
                      <span className="text-sm font-medium text-[#2C2A26]">
                        Score: {latest.total_score}/{info.maxScore}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-[#2C2A26]/40">
                      <Clock size={10} />
                      {new Date(latest.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {history.length > 1 && (
                        <span className="ml-1 text-[#6B8F71]">· {history.length} total</span>
                      )}
                    </div>
                  </div>
                  <div className="w-full h-2 bg-white/40 rounded-full overflow-hidden mb-4 border border-white/40 shadow-inner">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: severity!.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${(latest.total_score / info.maxScore) * 100}%` }}
                      transition={{ duration: 1, ease: [0.2, 0, 0, 1], delay: 0.2 + i * 0.1 }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => onStartAssessment(type)}
                    className="text-xs font-medium text-[#6B8F71] hover:text-[#5A7D60] transition-colors"
                  >
                    Retake Assessment →
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onStartAssessment(type)}
                  className="mt-3 flex items-center justify-between w-full group"
                >
                  <span className="text-xs text-[#6B8F71] font-medium group-hover:text-[#5A7D60] transition-colors">
                    Take Assessment
                  </span>
                  <ChevronRight size={14} className="text-[#6B8F71]/40 group-hover:text-[#6B8F71] transition-colors" />
                </button>
              )}
            </motion.div>
          );
        })}
      </div>

      {allScores.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center py-6"
        >
          <div className="w-14 h-14 rounded-full bg-[#F5F0EB] flex items-center justify-center mx-auto mb-3">
            <ClipboardList size={24} className="text-[#2C2A26]/25" />
          </div>
          <p className="text-sm text-[#2C2A26]/50">No assessments completed yet</p>
          <p className="text-xs text-[#2C2A26]/30 mt-1">Take one above to track your progress</p>
        </motion.div>
      )}
    </div>
  );
}

export const AssessmentsScreen: React.FC = () => {
  const profile = useMindCoachStore((s) => s.profile);
  const phase = useMindCoachStore((s) => s.journey?.current_phase ?? 1);
  const unlocked =
    UNLOCK_MAP[Math.min(Math.max(phase, 1), 4)] ?? UNLOCK_MAP[1];
  const assessmentsUnlocked = unlocked.includes('assessments');

  const setActiveTab = useMindCoachStore((s) => s.setActiveTab);
  const [scores, setScores] = useState<AssessmentScore[]>([]);
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [loading, setLoading] = useState(assessmentsUnlocked);

  // Assessment-taking state
  const [activeAssessment, setActiveAssessment] = useState<string | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showResult, setShowResult] = useState<{ type: string; score: number; severity: string } | null>(null);

  useEffect(() => {
    if (!assessmentsUnlocked || !profile) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [scoresRes, questionsRes] = await Promise.all([
        supabase
          .from('mind_coach_assessment_scores')
          .select('*')
          .eq('profile_id', profile.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('mind_coach_assessment_questions')
          .select('*')
          .order('assessment_type, question_number'),
      ]);
      if (cancelled) return;
      setScores(scoresRes.data ?? []);
      setQuestions(questionsRes.data ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, assessmentsUnlocked]);

  // Group scores by type → latest
  const latestByType: Record<string, AssessmentScore> = {};
  const historyByType: Record<string, AssessmentScore[]> = {};
  scores.forEach((s) => {
    if (!latestByType[s.assessment_type]) latestByType[s.assessment_type] = s;
    if (!historyByType[s.assessment_type]) historyByType[s.assessment_type] = [];
    historyByType[s.assessment_type].push(s);
  });

  const startAssessment = (type: string) => {
    setActiveAssessment(type);
    setShowResult(null);
    setCurrentQ(0);
    setAnswers({});
  };

  const activeQuestions = questions.filter((q) => q.assessment_type === activeAssessment);

  const handleAnswer = useCallback((questionNumber: number, value: number) => {
    setAnswers((prev) => ({ ...prev, [questionNumber]: value }));
    // Auto-advance after a short delay
    setTimeout(() => {
      if (currentQ < activeQuestions.length - 1) {
        setCurrentQ((prev) => prev + 1);
      }
    }, 300);
  }, [currentQ, activeQuestions.length]);

  const handleSubmit = useCallback(async () => {
    if (!profile || !activeAssessment || submitting) return;
    setSubmitting(true);

    const totalScore = Object.values(answers).reduce((acc, v) => acc + v, 0);
    const severity = getSeverityLabel(activeAssessment, totalScore);

    const answersArray = Object.entries(answers).map(([qn, val]) => ({
      question_number: parseInt(qn),
      value: val,
    }));

    const { data } = await supabase
      .from('mind_coach_assessment_scores')
      .insert({
        profile_id: profile.id,
        assessment_type: activeAssessment,
        answers: answersArray,
        total_score: totalScore,
        severity,
      })
      .select()
      .single();

    if (data) {
      setScores([data, ...scores]);
      setShowResult({ type: activeAssessment, score: totalScore, severity });
    }

    setSubmitting(false);
    setActiveAssessment(null);
  }, [profile, activeAssessment, answers, scores, submitting]);

  if (!assessmentsUnlocked) {
    return (
      <div className="relative flex flex-col h-full bg-[#FAFAF8] overflow-hidden">
        {/* Zen Atmospheric Aura */}
        <div className="zen-aura-container">
          <img 
            src="https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/mind%20coach/hero_aura_zen_1774777549788.png" 
            alt="" 
            className="zen-aura-img"
          />
        </div>
        <FeaturePreviewLockOverlay
          unlockPhase={firstPhaseWhereFeatureUnlocks('assessments')}
          featureLabel="Assessments"
          hint="GAD-7, PHQ-9, and PSS-4 unlock in phase 2. Here is what you will use—complete this phase to take them."
        >
          <div className="relative z-10 h-full overflow-y-auto pt-4">
            <AssessmentCatalogSection
              latestByType={{}}
              historyByType={{}}
              onStartAssessment={() => {}}
              allScores={[]}
            />
          </div>
        </FeaturePreviewLockOverlay>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-[#6B8F71] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Result View UI
  if (showResult) {
    const info = ASSESSMENT_INFO[showResult.type];
    const severityInfo = getSeverityInfo(showResult.type, showResult.score);
    const interpretation = ASSESSMENT_INTERPRETATIONS[showResult.type]?.[showResult.severity] || {
      meaning: "Your assessment is complete.",
      advice: "Practicing self-reflection is a great step forward."
    };

    return (
      <div className="relative p-5 flex flex-col h-full bg-[#FAFAF8] overflow-hidden">
        {/* Zen Atmospheric Aura */}
        <div className="zen-aura-container">
          <img 
            src="https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/mind%20coach/hero_aura_zen_1774777549788.png" 
            alt="" 
            className="zen-aura-img"
          />
        </div>
        <div className="relative z-10 flex-1 overflow-y-auto space-y-8 pt-8 pb-10">
          <div className="text-center space-y-3 py-6">
            <div className="w-20 h-20 rounded-full bg-white/40 zen-glass zen-card-shadow flex items-center justify-center mx-auto mb-4 border border-white">
              <Check size={40} className="text-[#6B8F71] drop-shadow-sm" />
            </div>
            <h3 className="text-2xl font-bold text-[#2C2A26] tracking-tight">Assessment Complete</h3>
            <p className="text-[10px] text-[#2C2A26]/40 uppercase tracking-[0.2em] font-black">Your {info.name} Results</p>
          </div>

          {/* Score Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", damping: 20 }}
            className="zen-glass rounded-[2rem] p-8 zen-card-shadow border border-white text-center shadow-lg shadow-[#6B8F71]/5"
          >
            <div className="inline-block px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest mb-4"
                 style={{ backgroundColor: severityInfo.color + '15', color: severityInfo.color }}>
              {severityInfo.label}
            </div>
            <div className="text-6xl font-black text-[#2C2A26] mb-2 tracking-tighter">
              {showResult.score}
              <span className="text-2xl text-[#2C2A26]/10">/{info.maxScore}</span>
            </div>
            <p className="text-xs text-[#2C2A26]/30 font-bold uppercase tracking-wider">Total Health Score</p>
          </motion.div>

          {/* Meaning Card */}
          <div className="zen-glass rounded-[2rem] p-7 zen-card-shadow border border-white/60 space-y-6">
            <h4 className="text-sm font-black text-[#2C2A26] uppercase tracking-[0.1em] flex items-center gap-2">
              <ClipboardList size={18} className="text-[#6B8F71]" />
              Insights
            </h4>
            <div className="space-y-4">
              <p className="text-base text-[#2C2A26]/70 leading-relaxed font-semibold">
                {interpretation.meaning}
              </p>
              <div className="p-5 bg-white/30 rounded-2xl border border-white/20 italic">
                <p className="text-[13px] text-[#2C2A26]/50 leading-relaxed font-medium">
                  "{interpretation.advice}"
                </p>
              </div>
            </div>
          </div>

          {/* Action Cards */}
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setActiveTab('journal')}
              className="zen-glass p-5 rounded-[1.5rem] border border-white/60 text-left hover:bg-white/40 transition-all group zen-card-shadow active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-xl bg-[#6B8F71]/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <BookOpen size={18} className="text-[#6B8F71]" />
              </div>
              <p className="text-[11px] font-black text-[#2C2A26] uppercase tracking-wider mb-1">Journal</p>
              <p className="text-[10px] text-[#2C2A26]/40 leading-tight">Reflect on these insights</p>
            </button>
            <button
              onClick={() => setActiveTab('home')}
              className="zen-glass p-5 rounded-[1.5rem] border border-white/60 text-left hover:bg-white/40 transition-all group zen-card-shadow active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-xl bg-[#D4A574]/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <TrendingUp size={18} className="text-[#D4A574]" />
              </div>
              <p className="text-[11px] font-black text-[#2C2A26] uppercase tracking-wider mb-1">Track</p>
              <p className="text-[10px] text-[#2C2A26]/40 leading-tight">View journey progress</p>
            </button>
          </div>
        </div>

        {/* Action Button */}
        <div className="relative z-20 pt-4 pb-6 space-y-4">
          <button
            onClick={() => setActiveTab('home')}
            className="w-full py-4.5 bg-[#2C2A26] text-white text-sm font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-[#2C2A26]/20 active:scale-95 transition-all"
          >
            Open Therapy Session
          </button>
          <button
            onClick={() => setShowResult(null)}
            className="w-full text-center py-2 text-[10px] font-black text-[#2C2A26]/20 uppercase tracking-[0.2em] hover:text-[#2C2A26] transition-colors"
          >
            ← Catalog
          </button>
        </div>
      </div>
    );
  }

  // Assessment-taking UI
  if (activeAssessment && activeQuestions.length > 0) {
    const q = activeQuestions[currentQ];
    const info = ASSESSMENT_INFO[activeAssessment];
    const allAnswered = activeQuestions.every((aq) => answers[aq.question_number] !== undefined);

    return (
      <div className="flex flex-col h-full bg-[#FAFAF7]">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E8E4DE] shrink-0">
          <button onClick={() => setActiveAssessment(null)} className="text-[#2C2A26]/60 hover:text-[#2C2A26]">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#2C2A26]">{info.name}</p>
            <p className="text-[10px] text-[#2C2A26]/40">
              Question {currentQ + 1} of {activeQuestions.length}
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="px-4 pt-3">
          <div className="flex gap-1">
            {activeQuestions.map((_, i) => (
              <div
                key={i}
                className="h-1 flex-1 rounded-full transition-colors duration-300"
                style={{
                  backgroundColor: answers[activeQuestions[i].question_number] !== undefined
                    ? '#6B8F71'
                    : i === currentQ ? '#6B8F71' + '40' : '#E8E4DE',
                }}
              />
            ))}
          </div>
        </div>

        {/* Question */}
        <div className="flex-1 overflow-y-auto px-5 py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentQ}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <p className="text-xs text-[#2C2A26]/40 uppercase tracking-wide font-medium">
                Over the last 2 weeks, how often have you been bothered by:
              </p>
              <p className="text-base font-medium text-[#2C2A26] leading-relaxed">
                {q.question_text}
              </p>

              <div className="space-y-2">
                {q.answer_options.map((opt) => {
                  const selected = answers[q.question_number] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => handleAnswer(q.question_number, opt.value)}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-all text-sm ${
                        selected
                          ? 'bg-[#6B8F71] text-white border-[#6B8F71]'
                          : 'bg-white text-[#2C2A26] border-[#E8E4DE] hover:border-[#6B8F71]/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{opt.label}</span>
                        {selected && <Check size={16} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="px-5 py-4 shrink-0 flex gap-2">
          {currentQ > 0 && (
            <button
              onClick={() => setCurrentQ(currentQ - 1)}
              className="px-4 py-2.5 text-sm font-medium text-[#2C2A26]/60 border border-[#E8E4DE] rounded-xl hover:border-[#2C2A26]/20"
            >
              Previous
            </button>
          )}
          <div className="flex-1" />
          {currentQ < activeQuestions.length - 1 ? (
            <button
              onClick={() => setCurrentQ(currentQ + 1)}
              disabled={answers[q.question_number] === undefined}
              className="px-6 py-2.5 text-sm font-medium bg-[#6B8F71] text-white rounded-xl hover:bg-[#5A7D60] disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!allAnswered || submitting}
              className="px-6 py-2.5 text-sm font-medium bg-[#2C2A26] text-white rounded-xl hover:bg-[#2C2A26]/90 disabled:opacity-40 transition-colors"
            >
              {submitting ? 'Submitting…' : 'Complete'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Assessment list UI
  return (
    <div className="relative flex flex-col h-full bg-[#FAFAF8] overflow-hidden">
      {/* Zen Atmospheric Aura */}
      <div className="zen-aura-container">
        <img 
          src="https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/mind%20coach/hero_aura_zen_1774777549788.png" 
          alt="" 
          className="zen-aura-img"
        />
      </div>
      <div className="relative z-10 flex-1 overflow-y-auto">
        <AssessmentCatalogSection
          latestByType={latestByType}
          historyByType={historyByType}
          onStartAssessment={startAssessment}
          allScores={scores}
        />
      </div>
    </div>
  );
};
