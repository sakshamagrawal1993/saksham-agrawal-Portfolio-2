import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../../lib/supabaseClient';
import { useAuth } from '../../../context/AuthContext';
import { useMindCoachStore, type TherapistPersona } from '../../../store/mindCoachStore';

const TOTAL_STEPS = 8;

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
    approach: 'Person-Centered',
    color: '#B4A7D6',
    sample: "I hear you, and I want you to know — what you're feeling makes complete sense.",
    avatarUrl: "https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/guide-avatars/maya.png",
  },
  {
    id: 'alex',
    name: 'Alex',
    style: 'Structured, action-oriented coach',
    approach: 'CBT + Behavioral Activation',
    color: '#D4A574',
    sample: "Let's break this down together and find practical steps you can take today.",
    avatarUrl: "https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/guide-avatars/alex.png",
  },
  {
    id: 'sage',
    name: 'Sage',
    style: 'Thoughtful, growth-focused guide',
    approach: 'ACT + DBT',
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
      className="w-full py-3.5 rounded-2xl bg-[#6B8F71] text-white font-medium text-base hover:bg-[#5A7D60] active:scale-[0.98] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
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

// Steps components (Welcome, SafeSpace, Name, etc.) follow the same pattern as MindCoachLanding...
// [Truncated for brevity in thought, but included fully in ReplacementContent]

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
      case 1: return (
        <StepShell step={1}>
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8 max-w-sm mx-auto">
            <div className="w-16 h-16 rounded-full bg-[#6B8F71]/10 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6B8F71" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a7 7 0 0 1 7 7c0 3-1.5 5.5-4 7.5V19a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-2.5C6.5 14.5 5 12 5 9a7 7 0 0 1 7-7z" />
                <line x1="10" y1="22" x2="14" y2="22" />
              </svg>
            </div>
            <div className="space-y-4">
              <blockquote className="text-xl leading-relaxed text-[#2C2A26] font-serif italic">
                "The greatest glory in living lies not in never falling, but in rising every time we fall."
              </blockquote>
              <p className="text-[#2C2A26]/60 text-sm">Your mind deserves the same care as your body.</p>
            </div>
            <div className="space-y-3 w-full">
              <PrimaryButton onClick={goForward}>Begin Your Journey</PrimaryButton>
              <div className="space-y-2 pt-2">
                <p className="text-xs text-[#2C2A26]/40">Join 10,000+ people who chose to prioritize their mental well-being</p>
                <div className="inline-flex items-center gap-1.5 bg-[#B4A7D6]/10 px-3 py-1.5 rounded-full">
                   <span className="text-xs text-[#2C2A26]/50">Built on CBT, DBT, ACT & Person-Centered Therapy</span>
                </div>
              </div>
            </div>
          </div>
        </StepShell>
      );
      case 2: return (
        <StepShell step={2} onBack={goBack}>
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 max-w-sm mx-auto">
            <div className="w-16 h-16 rounded-full bg-[#B4A7D6]/15 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#B4A7D6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="space-y-3">
              <h2 className="text-2xl font-semibold text-[#2C2A26]">This is your safe space</h2>
              <p className="text-sm text-[#2C2A26]/60 leading-relaxed">I'm an AI wellness coach, not a licensed therapist. I use evidence-based techniques to support your mental well-being.</p>
            </div>
            <div className="w-full bg-red-50 border border-red-100 rounded-2xl p-4 text-left space-y-2">
              <p className="text-xs font-semibold text-red-800/80">If you're ever in crisis:</p>
              <p className="text-xs text-red-700/70">988 Suicide & Crisis Lifeline: <span className="font-bold">Call or text 988</span></p>
            </div>
            <PrimaryButton onClick={goForward}>I understand, let's begin</PrimaryButton>
          </div>
        </StepShell>
      );
      case 3: return (
        <StepShell step={3} onBack={goBack}>
          <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full space-y-8">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-[#2C2A26]">What should we call you?</h2>
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full px-4 py-3.5 rounded-2xl bg-white border border-[#E8E4DE] text-[#2C2A26] focus:border-[#6B8F71] transition-all"
            />
            <PrimaryButton onClick={goForward} disabled={!name.trim()}>Continue</PrimaryButton>
          </div>
        </StepShell>
      );
      case 4: return (
        <StepShell step={4} onBack={goBack}>
          <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full space-y-8">
            <h2 className="text-2xl font-semibold text-[#2C2A26]">How old are you, {name}?</h2>
            <input
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="Age"
              className="w-full px-4 py-3.5 rounded-2xl bg-white border border-[#E8E4DE] text-[#2C2A26] focus:border-[#6B8F71] transition-all"
            />
            <PrimaryButton onClick={goForward} disabled={!age}>Continue</PrimaryButton>
          </div>
        </StepShell>
      );
      case 5: return (
        <StepShell step={5} onBack={goBack}>
          <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full space-y-8">
            <h2 className="text-2xl font-semibold text-[#2C2A26]">How do you identify?</h2>
            <div className="grid grid-cols-2 gap-3">
              {GENDER_OPTIONS.map((o) => (
                <button
                  key={o}
                  onClick={() => setGender(o)}
                  className={`p-4 rounded-2xl border-2 text-sm font-medium transition-all ${gender === o ? 'border-[#6B8F71] bg-[#6B8F71]/5' : 'border-[#E8E4DE] bg-white'}`}
                >
                  {o}
                </button>
              ))}
            </div>
            <PrimaryButton onClick={goForward} disabled={!gender}>Continue</PrimaryButton>
          </div>
        </StepShell>
      );
      case 6: return (
        <StepShell step={6} onBack={goBack}>
          <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full space-y-6">
            <h2 className="text-2xl font-semibold text-[#2C2A26]">What brings you here, {name}?</h2>
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
      case 7: return (
        <StepShell step={7} onBack={goBack}>
          <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full space-y-5">
            <h2 className="text-2xl font-semibold text-[#2C2A26]">Choose your guide</h2>
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
                      <p className="text-sm text-[#2C2A26]/60">{t.style}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <PrimaryButton onClick={goForward} disabled={!therapist}>Continue</PrimaryButton>
          </div>
        </StepShell>
      );
      case 8: return (
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
  const { user } = useAuth();
  const { setProfile, setJourney } = useMindCoachStore();

  const handleStart = async () => {
    if (saving || !user?.id) return;
    setSaving(true);
    try {
      // 1. Create profile
      const { data: profile, error: pErr } = await supabase.from('mind_coach_profiles')
        .insert({ user_id: user?.id, name, age, gender, concerns, therapist_persona: therapist })
        .select().single();
      if (pErr) throw pErr;

      // 2. Create journey
      const { data: journey, error: jErr } = await supabase.from('mind_coach_journeys')
        .insert({
          profile_id: profile.id,
          title: 'Initial Assessment Phase',
          description: 'A personalized journey to unpack your concerns.',
          phases: [{ phase_number: 1, title: 'Engagement & Rapport', goal: 'Establish trust.', sessions: [{ session_number: 1, topic: 'Initial Check-in', description: 'Opening up.' }] }],
          current_phase: 1,
          sessions_completed: 0,
          active: true,
        }).select().single();
      if (jErr) throw jErr;

      // 3. Create session
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
      setSaving(false);
    }
  };

  return (
    <StepShell 
      step={8} 
      onBack={onBack}
      footer={
        <button
          onClick={handleStart}
          disabled={saving}
          className="w-full py-4 rounded-2xl bg-[#6B8F71] text-white font-semibold text-base hover:bg-[#5A7D60] transition-all disabled:opacity-50"
        >
          {saving ? 'Setting up...' : 'Start Your Journey'}
        </button>
      }
    >
      <div className="flex flex-col items-center pt-4 space-y-8">
        {/* Path Formulated Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#E8F3E9] text-[#5B8561] text-[10px] font-bold tracking-widest uppercase shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Your Path Formulated
        </div>

        {/* Title & Description */}
        <div className="space-y-4 text-center max-w-[320px] shrink-0">
          <h2 className="text-[32px] leading-tight font-serif text-[#2C2A26]">Initial Assessment Phase</h2>
          <p className="text-[#2C2A26]/60 text-[15px] leading-relaxed">
            Before we formulate a precise plan, let's take a few sessions just to unpack what's going on. I am here to listen and understand your world.
          </p>
        </div>


        {/* Timeline View */}

        {/* Timeline View */}
        <div className="w-full relative py-2">
          {/* Vertical Line */}
          <div className="absolute left-[22px] top-12 bottom-0 w-[1px] bg-[#E8E4DE]" />
          
          <div className="flex gap-4 items-start relative pb-8">
            <div className="z-10 w-11 h-11 rounded-full border border-[#E8E4DE] bg-white flex items-center justify-center shrink-0">
              <span className="text-sm font-medium text-[#2C2A26]">1</span>
            </div>
            <div className="flex-1 bg-white border border-[#F0EDEA] rounded-[24px] p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)] space-y-3">
              <h3 className="font-bold text-[#2C2A26] text-lg font-serif">Engagement & Rapport</h3>
              <p className="text-[#2C2A26]/60 text-sm leading-relaxed">
                Establish trust, safe space, and baseline emotional state.
              </p>
              <div className="flex gap-1.5">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#E8E4DE]" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </StepShell>
  );
}
