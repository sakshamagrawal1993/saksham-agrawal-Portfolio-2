import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../../lib/supabaseClient';
import { useAuth } from '../../../context/AuthContext';
import { useMindCoachStore, type TherapistPersona } from '../../../store/mindCoachStore';

const TOTAL_STEPS = 6;

const CONCERN_OPTIONS = [
  'Anxiety & Worry',
  'Stress & Burnout',
  'Relationships',
  'Self-Esteem',
  'Grief & Loss',
  'Sleep Issues',
  'Loneliness',
  'Overthinking',
  'Low Confidence',
  'General Wellness',
] as const;

const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'] as const;

interface TherapistOption {
  id: TherapistPersona;
  name: string;
  style: string;
  approach: string;
  color: string;
  sample: string;
  avatarUrl?: string;
}

const THERAPISTS: TherapistOption[] = [
  {
    id: 'maya',
    name: 'Maya',
    style: 'Warm, empathetic listener',
    approach: 'Gentle and reflective',
    color: '#B4A7D6',
    sample: "I hear you, and I want you to know — what you're feeling makes complete sense.",
    avatarUrl: "https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/guide-avatars/maya.png",
  },
  {
    id: 'alex',
    name: 'Alex',
    style: 'Structured, action-oriented coach',
    approach: 'Structured and practical',
    color: '#D4A574',
    sample: "Let's break this down together and find practical steps you can take today.",
    avatarUrl: "https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/guide-avatars/alex.png",
  },
  {
    id: 'sage',
    name: 'Sage',
    style: 'Thoughtful, growth-focused guide',
    approach: 'Mindful and values-driven',
    color: '#6B8F71',
    sample: "What if we explored what's underneath that feeling? There might be something important there.",
    avatarUrl: "https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/guide-avatars/sage.png",
  },
];

const pageVariants = {
  enter: (direction: number) => ({ opacity: 0, y: direction > 0 ? 40 : -40 }),
  center: { opacity: 1, y: 0 },
  exit: (direction: number) => ({ opacity: 0, y: direction > 0 ? -40 : 40 }),
};

const pageTransition = { type: 'tween' as const, ease: 'easeInOut' as const, duration: 0.35 };

function ProgressBar({ step }: { step: number }) {
  const pct = (step / TOTAL_STEPS) * 100;
  return (
    <div className="w-full h-1 bg-[#E8E4DE] rounded-full overflow-hidden">
      <motion.div
        className="h-full bg-[#6B8F71] rounded-full"
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.4, ease: 'easeInOut' }}
      />
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-[#2C2A26]/50 hover:text-[#2C2A26]/80 transition-colors text-sm">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      Back
    </button>
  );
}

function PrimaryButton({ children, onClick, disabled = false }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-3.5 rounded-xl bg-[#6B8F71] text-white font-medium text-base hover:bg-[#5A7D60] active:scale-[0.98] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function StepShell({ step, onBack, children, footer }: { step: number; onBack?: () => void; children: React.ReactNode; footer?: React.ReactNode; }) {
  return (
    <div className="flex flex-col h-full bg-[#FAFAF7]">
      <div className="px-6 pt-5 pb-3 space-y-3">
        <ProgressBar step={step} />
        <div className="flex items-center justify-between h-6">
          {onBack ? <BackButton onClick={onBack} /> : <div />}
          <span className="text-xs text-[#2C2A26]/40 tabular-nums">{step} of {TOTAL_STEPS}</span>
        </div>
      </div>
      <div className="flex-1 flex flex-col px-6 overflow-y-auto min-h-0">{children}</div>
      {footer && <div className="px-6 pt-2 pb-8">{footer}</div>}
    </div>
  );
}

interface OnboardingFlowProps {
  onComplete: (profileId: string) => void;
}

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onComplete }) => {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [concerns, setConcerns] = useState<string[]>([]);
  const [therapist, setTherapist] = useState<TherapistPersona | null>(null);

  const goForward = useCallback(() => { setDirection(1); setStep((s) => Math.min(s + 1, TOTAL_STEPS)); }, []);
  const goBack = useCallback(() => { setDirection(-1); setStep((s) => Math.max(s - 1, 1)); }, []);

  useEffect(() => {
    if (!user?.id) return;
    supabase.from('profiles').select('full_name').eq('id', user.id).single()
      .then(({ data }) => { if (data?.full_name) setName(data.full_name.split(' ')[0]); });
  }, [user?.id]);

  if (!user) return null;

  const renderStep = () => {
    switch (step) {
      /* Step 1: Welcome — concern-mirroring copy, no generic quote */
      case 1: return (
        <StepShell step={1}>
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8 max-w-sm mx-auto">
            <div className="w-16 h-16 rounded-full bg-[#6B8F71]/10 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6B8F71" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a7 7 0 0 1 7 7c0 3-1.5 5.5-4 7.5V19a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-2.5C6.5 14.5 5 12 5 9a7 7 0 0 1 7-7z" />
                <line x1="10" y1="22" x2="14" y2="22" />
              </svg>
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-[#2C2A26] leading-snug">
                Whatever brought you here, you are in the right place.
              </h2>
              <p className="text-[#2C2A26]/50 text-sm leading-relaxed">
                Your mind deserves the same care as your body. This is a space to talk, reflect, and grow at your own pace.
              </p>
            </div>
            <div className="w-full">
              <PrimaryButton onClick={goForward}>Begin</PrimaryButton>
            </div>
          </div>
        </StepShell>
      );

      /* Step 2: Safe space — warm neutral crisis card */
      case 2: return (
        <StepShell step={2} onBack={goBack}>
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 max-w-sm mx-auto">
            <div className="w-16 h-16 rounded-full bg-[#F5F0EB] flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6B8F71" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-[#2C2A26]">This is your safe space</h2>
              <p className="text-sm text-[#2C2A26]/55 leading-relaxed">I'm an AI wellness coach, not a licensed therapist. I use evidence-based techniques to support your mental well-being.</p>
            </div>
            <div className="w-full bg-[#F5F0EB] border border-[#E8E4DE] rounded-2xl p-4 text-left space-y-2">
              <p className="text-xs font-medium text-[#2C2A26]/70">If you're ever in crisis:</p>
              <p className="text-xs text-[#2C2A26]/60">988 Suicide & Crisis Lifeline: <span className="font-semibold text-[#2C2A26]/80">Call or text 988</span></p>
            </div>
            <PrimaryButton onClick={goForward}>I understand, let's begin</PrimaryButton>
          </div>
        </StepShell>
      );

      /* Step 3: About you — merged name, age, gender */
      case 3: return (
        <StepShell step={3} onBack={goBack}>
          <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full space-y-6">
            <h2 className="text-xl font-semibold text-[#2C2A26]">Tell us about you</h2>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-[#2C2A26]/50 mb-1.5 block">Your name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name"
                  className="w-full px-4 py-3 rounded-xl bg-white border border-[#E8E4DE] text-[#2C2A26] text-sm focus:border-[#6B8F71] transition-all outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#2C2A26]/50 mb-1.5 block">Age</label>
                <input
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="Age"
                  className="w-full px-4 py-3 rounded-xl bg-white border border-[#E8E4DE] text-[#2C2A26] text-sm focus:border-[#6B8F71] transition-all outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#2C2A26]/50 mb-1.5 block">How do you identify?</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {GENDER_OPTIONS.map((o) => (
                    <button
                      key={o}
                      onClick={() => setGender(o)}
                      className={`p-3 rounded-xl border text-sm font-medium transition-all ${gender === o ? 'border-[#6B8F71] bg-[#6B8F71]/5 text-[#2C2A26]' : 'border-[#E8E4DE] bg-white text-[#2C2A26]/70'}`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <PrimaryButton onClick={goForward} disabled={!name.trim() || !age || !gender}>Continue</PrimaryButton>
          </div>
        </StepShell>
      );

      /* Step 4: Concerns */
      case 4: return (
        <StepShell step={4} onBack={goBack}>
          <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-[#2C2A26]">What brings you here, {name}?</h2>
              <p className="text-xs text-[#2C2A26]/40 mt-1.5">Choose up to 3 that resonate most.</p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {CONCERN_OPTIONS.map((c) => {
                const sel = concerns.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => setConcerns(prev => sel ? prev.filter(x => x !== c) : (prev.length < 3 ? [...prev, c] : prev))}
                    className={`px-4 py-2 rounded-full text-sm transition-all ${sel ? 'bg-[#6B8F71] text-white' : 'bg-white border border-[#E8E4DE] text-[#2C2A26]/70'}`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
            <PrimaryButton onClick={goForward} disabled={concerns.length === 0}>Continue</PrimaryButton>
          </div>
        </StepShell>
      );

      /* Step 5: Choose guide — plain-language approach labels */
      case 5: return (
        <StepShell step={5} onBack={goBack}>
          <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full space-y-5">
            <h2 className="text-xl font-semibold text-[#2C2A26]">Choose your guide</h2>
            <div className="space-y-3">
              {THERAPISTS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTherapist(t.id)}
                  className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${therapist === t.id ? 'border-[#6B8F71] bg-[#6B8F71]/5' : 'border-[#E8E4DE] bg-white'}`}
                >
                  <div className="flex items-start gap-3">
                    <img src={t.avatarUrl} alt={t.name} className="w-12 h-12 rounded-full object-cover border border-[#E8E4DE]" />
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-[#2C2A26]">{t.name}</span>
                        <span className="text-xs text-[#2C2A26]/40">{t.approach}</span>
                      </div>
                      <p className="text-sm text-[#2C2A26]/55 mt-0.5">{t.style}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <PrimaryButton onClick={goForward} disabled={!therapist}>Continue</PrimaryButton>
          </div>
        </StepShell>
      );

      /* Step 6: Journey preview */
      case 6: return (
        <JourneyPreviewStep
          concerns={concerns}
          name={name}
          age={parseInt(age, 10)}
          gender={gender}
          therapist={therapist!}
          onBack={goBack}
          onComplete={onComplete}
        />
      );
      default: return null;
    }
  };

  return (
    <AnimatePresence mode="wait" custom={direction}>
      <motion.div
        key={step}
        custom={direction}
        variants={pageVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={pageTransition}
        className="h-full"
      >
        {renderStep()}
      </motion.div>
    </AnimatePresence>
  );
};

function JourneyPreviewStep({ concerns, name, age, gender, therapist, onBack, onComplete }: any) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { user } = useAuth();
  const { setProfile, setJourney } = useMindCoachStore();

  const therapistName = THERAPISTS.find((t) => t.id === therapist)?.name ?? 'your guide';

  const handleStart = async () => {
    if (saving || !user?.id) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { data: profile, error: pErr } = await supabase.from('mind_coach_profiles')
        .insert({ user_id: user?.id, name, age, gender, concerns, therapist_persona: therapist })
        .select().single();
      if (pErr) throw pErr;

      const { data: journey, error: jErr } = await supabase.from('mind_coach_journeys')
        .insert({
          profile_id: profile.id,
          title: 'Initial Assessment Phase',
          description: 'A personalized journey to unpack your concerns.',
          phases: [{
            phase_number: 1,
            title: 'Engagement & Rapport',
            goal: 'Establish trust.',
            sessions: [{
              session_number: 1,
              title: 'Initial Check-in',
              objective: 'Create safety and gather initial concerns.',
              success_signal: 'Client shares primary concerns and agrees on session focus.',
              description: 'Opening up.',
            }],
          }],
          current_phase: 1,
          sessions_completed: 0,
          active: true,
        }).select().single();
      if (jErr) throw jErr;

      const { data: session, error: sErr } = await supabase.from('mind_coach_sessions')
        .insert({ profile_id: profile.id, journey_id: journey.id, phase_number: 1, session_number: 1, pathway: 'engagement_rapport_and_assessment', session_state: 'intake', message_count: 0 })
        .select().single();
      if (sErr) throw sErr;

      setProfile(profile);
      setJourney(journey);
      useMindCoachStore.getState().setActiveSession(session);
      useMindCoachStore.getState().setSessions([session]);
      onComplete(profile.id);
    } catch (err) {
      console.error(err);
      setSaveError(
        'We could not finish setup. Check your connection and try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <StepShell
      step={6}
      onBack={onBack}
      footer={
        <div className="w-full space-y-3">
          {saveError && (
            <p className="text-xs text-center text-red-700/90 bg-red-50 border border-red-100 rounded-xl px-3 py-2 leading-relaxed">
              {saveError}
            </p>
          )}
          <button
            onClick={handleStart}
            disabled={saving}
            className="w-full py-4 rounded-xl bg-[#6B8F71] text-white font-semibold text-base hover:bg-[#5A7D60] transition-all disabled:opacity-50"
          >
            {saving ? 'Setting up...' : saveError ? 'Try again' : 'Start Your Journey'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col items-center pt-6 space-y-8">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#E8F3E9] text-[#5B8561] text-[11px] font-semibold tracking-wide uppercase shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Ready to begin
        </div>

        <div className="space-y-4 text-center max-w-[300px] shrink-0">
          <h2 className="text-xl font-semibold text-[#2C2A26] leading-snug">Getting to know you</h2>
          <p className="text-[#2C2A26]/55 text-sm leading-relaxed">
            Your first session will be a gentle conversation with {therapistName}. No pressure, no homework — just talking about what is on your mind.
          </p>
        </div>

        <div className="w-full bg-white border border-[#E8E4DE] rounded-2xl p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40 mb-3">Phase 1</p>
          <h3 className="font-semibold text-[#2C2A26] text-base">Engagement & Rapport</h3>
          <p className="text-[#2C2A26]/55 text-sm leading-relaxed mt-1.5">
            Establish trust, create a safe space, and understand your baseline emotional state.
          </p>
        </div>
      </div>
    </StepShell>
  );
}
