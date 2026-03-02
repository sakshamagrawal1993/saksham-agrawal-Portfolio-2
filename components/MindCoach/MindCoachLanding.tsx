import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabaseClient';
import {
  useMindCoachStore,
  type TherapistPersona,
  type JourneyPhase,
  type MindCoachProfile,
  type MindCoachJourney,
} from '../../store/mindCoachStore';

// ── Constants ────────────────────────────────────────────────────────────────

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
  bgColor: string;
  sample: string;
}

const THERAPISTS: TherapistOption[] = [
  {
    id: 'maya',
    name: 'Maya',
    style: 'Warm, empathetic listener',
    approach: 'Person-Centered',
    color: '#B4A7D6',
    bgColor: 'bg-[#B4A7D6]/15',
    sample:
      "I hear you, and I want you to know — what you're feeling makes complete sense.",
  },
  {
    id: 'alex',
    name: 'Alex',
    style: 'Structured, action-oriented coach',
    approach: 'CBT + Behavioral Activation',
    color: '#D4A574',
    bgColor: 'bg-[#D4A574]/15',
    sample:
      "Let's break this down together and find practical steps you can take today.",
  },
  {
    id: 'sage',
    name: 'Sage',
    style: 'Thoughtful, growth-focused guide',
    approach: 'ACT + DBT',
    color: '#6B8F71',
    bgColor: 'bg-[#6B8F71]/15',
    sample:
      "What if we explored what's underneath that feeling? There might be something important there.",
  },
];

// ── Animation variants ───────────────────────────────────────────────────────

const pageVariants = {
  enter: (direction: number) => ({
    opacity: 0,
    y: direction > 0 ? 40 : -40,
  }),
  center: { opacity: 1, y: 0 },
  exit: (direction: number) => ({
    opacity: 0,
    y: direction > 0 ? -40 : 40,
  }),
};

const pageTransition = {
  type: 'tween' as const,
  ease: 'easeInOut' as const,
  duration: 0.35,
};

// ── Shared sub-components ────────────────────────────────────────────────────

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
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-[#2C2A26]/50 hover:text-[#2C2A26]/80 transition-colors text-sm"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      Back
    </button>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-3.5 rounded-2xl bg-[#6B8F71] text-white font-medium text-base
                 hover:bg-[#5A7D60] active:scale-[0.98] transition-all duration-200
                 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#6B8F71] disabled:active:scale-100"
    >
      {children}
    </button>
  );
}

function StepShell({
  step,
  onBack,
  children,
}: {
  step: number;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-[#FAFAF7]">
      <div className="px-6 pt-5 pb-3 space-y-3">
        <ProgressBar step={step} />
        <div className="flex items-center justify-between h-6">
          {onBack ? <BackButton onClick={onBack} /> : <div />}
          <span className="text-xs text-[#2C2A26]/40 tabular-nums">
            {step} of {TOTAL_STEPS}
          </span>
        </div>
      </div>
      <div className="flex-1 flex flex-col px-6 pb-8">{children}</div>
    </div>
  );
}

// ── Step 1: Welcome ──────────────────────────────────────────────────────────

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <StepShell step={1}>
      <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8 max-w-sm mx-auto">
        {/* Decorative icon */}
        <div className="w-16 h-16 rounded-full bg-[#6B8F71]/10 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6B8F71" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a7 7 0 0 1 7 7c0 3-1.5 5.5-4 7.5V19a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-2.5C6.5 14.5 5 12 5 9a7 7 0 0 1 7-7z" />
            <line x1="10" y1="22" x2="14" y2="22" />
          </svg>
        </div>

        <div className="space-y-4">
          <blockquote className="text-xl leading-relaxed text-[#2C2A26] font-serif italic">
            &ldquo;The greatest glory in living lies not in never falling, but in
            rising every time we fall.&rdquo;
          </blockquote>
          <p className="text-[#2C2A26]/60 text-sm">
            Your mind deserves the same care as your body.
          </p>
        </div>

        <div className="space-y-3 w-full">
          <PrimaryButton onClick={onNext}>Begin Your Journey</PrimaryButton>

          <div className="space-y-2 pt-2">
            <p className="text-xs text-[#2C2A26]/40">
              Join 10,000+ people who chose to prioritize their mental well-being
            </p>
            <div className="inline-flex items-center gap-1.5 bg-[#B4A7D6]/10 px-3 py-1.5 rounded-full">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#B4A7D6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span className="text-xs text-[#2C2A26]/50">
                Built on CBT, DBT, ACT &amp; Person-Centered Therapy
              </span>
            </div>
          </div>
        </div>
      </div>
    </StepShell>
  );
}

// ── Step 2: Safe Space ───────────────────────────────────────────────────────

function SafeSpaceStep({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <StepShell step={2} onBack={onBack}>
      <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 max-w-sm mx-auto">
        <div className="w-16 h-16 rounded-full bg-[#B4A7D6]/15 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#B4A7D6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>

        <div className="space-y-3">
          <h2 className="text-2xl font-semibold text-[#2C2A26]">
            This is your safe space
          </h2>
          <p className="text-sm text-[#2C2A26]/60 leading-relaxed">
            I&apos;m an AI wellness coach, not a licensed therapist. I use
            evidence-based techniques to support your mental well-being.
          </p>
          <p className="text-sm text-[#2C2A26]/60 leading-relaxed">
            Your conversations are private and stored securely.
          </p>
        </div>

        <div className="w-full bg-red-50 border border-red-100 rounded-2xl p-4 text-left space-y-2">
          <p className="text-xs font-semibold text-red-800/80">
            If you&apos;re ever in crisis:
          </p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-700/70">988 Suicide &amp; Crisis Lifeline</span>
              <span className="text-xs font-medium text-red-800 bg-red-100 px-2 py-0.5 rounded-full">
                Call or text 988
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-700/70">Crisis Text Line</span>
              <span className="text-xs font-medium text-red-800 bg-red-100 px-2 py-0.5 rounded-full">
                Text HOME to 741741
              </span>
            </div>
          </div>
        </div>

        <PrimaryButton onClick={onNext}>I understand, let&apos;s begin</PrimaryButton>
      </div>
    </StepShell>
  );
}

// ── Step 3: Name ─────────────────────────────────────────────────────────────

function NameStep({
  value,
  onChange,
  onNext,
  onBack,
}: {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <StepShell step={3} onBack={onBack}>
      <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full space-y-8">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-[#2C2A26]">
            What should we call you?
          </h2>
          <p className="text-sm text-[#2C2A26]/50">
            This helps make our conversations more personal.
          </p>
        </div>

        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) onNext();
          }}
          placeholder="Your name"
          autoFocus
          className="w-full px-4 py-3.5 rounded-2xl bg-white border border-[#E8E4DE] text-[#2C2A26]
                     placeholder:text-[#2C2A26]/30 focus:outline-none focus:border-[#6B8F71]
                     focus:ring-2 focus:ring-[#6B8F71]/20 transition-all text-base"
        />

        <PrimaryButton onClick={onNext} disabled={!value.trim()}>
          Continue
        </PrimaryButton>
      </div>
    </StepShell>
  );
}

// ── Step 4: Age ──────────────────────────────────────────────────────────────

function AgeStep({
  name,
  value,
  onChange,
  onNext,
  onBack,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const age = parseInt(value, 10);
  const isValid = !isNaN(age) && age >= 13 && age <= 120;

  return (
    <StepShell step={4} onBack={onBack}>
      <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full space-y-8">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-[#2C2A26]">
            How old are you, {name}?
          </h2>
          <p className="text-sm text-[#2C2A26]/50">
            This helps us tailor the experience to your needs.
          </p>
        </div>

        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && isValid) onNext();
          }}
          placeholder="Age"
          min={13}
          max={120}
          autoFocus
          className="w-full px-4 py-3.5 rounded-2xl bg-white border border-[#E8E4DE] text-[#2C2A26]
                     placeholder:text-[#2C2A26]/30 focus:outline-none focus:border-[#6B8F71]
                     focus:ring-2 focus:ring-[#6B8F71]/20 transition-all text-base
                     [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />

        <PrimaryButton onClick={onNext} disabled={!isValid}>
          Continue
        </PrimaryButton>
      </div>
    </StepShell>
  );
}

// ── Step 5: Gender ───────────────────────────────────────────────────────────

function GenderStep({
  value,
  onChange,
  onNext,
  onBack,
}: {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <StepShell step={5} onBack={onBack}>
      <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full space-y-8">
        <h2 className="text-2xl font-semibold text-[#2C2A26]">
          How do you identify?
        </h2>

        <div className="grid grid-cols-2 gap-3">
          {GENDER_OPTIONS.map((option) => (
            <button
              key={option}
              onClick={() => onChange(option)}
              className={`p-4 rounded-2xl border-2 text-sm font-medium transition-all duration-200
                ${
                  value === option
                    ? 'border-[#6B8F71] bg-[#6B8F71]/5 text-[#2C2A26]'
                    : 'border-[#E8E4DE] bg-white text-[#2C2A26]/70 hover:border-[#6B8F71]/40'
                }`}
            >
              {option}
            </button>
          ))}
        </div>

        <PrimaryButton onClick={onNext} disabled={!value}>
          Continue
        </PrimaryButton>
      </div>
    </StepShell>
  );
}

// ── Step 6: Concerns ─────────────────────────────────────────────────────────

function ConcernStep({
  name,
  values,
  onChange,
  onNext,
  onBack,
}: {
  name: string;
  values: string[];
  onChange: (v: string[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const toggle = (concern: string) => {
    if (values.includes(concern)) {
      onChange(values.filter((c) => c !== concern));
    } else if (values.length < 2) {
      onChange([...values, concern]);
    }
  };

  return (
    <StepShell step={6} onBack={onBack}>
      <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-[#2C2A26]">
            What brings you here today, {name}?
          </h2>
          <p className="text-sm text-[#2C2A26]/50 leading-relaxed">
            Select up to 2 topics. Most people have more than one concern —
            that&apos;s completely normal.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {CONCERN_OPTIONS.map((concern) => {
            const selected = values.includes(concern);
            const maxed = values.length >= 2 && !selected;
            return (
              <button
                key={concern}
                onClick={() => toggle(concern)}
                disabled={maxed}
                className={`px-4 py-2 rounded-full text-sm transition-all duration-200
                  ${
                    selected
                      ? 'bg-[#6B8F71] text-white shadow-sm'
                      : maxed
                        ? 'bg-[#F5F0EB] text-[#2C2A26]/25 cursor-not-allowed'
                        : 'bg-white border border-[#E8E4DE] text-[#2C2A26]/70 hover:border-[#6B8F71]/40'
                  }`}
              >
                {concern}
              </button>
            );
          })}
        </div>

        <PrimaryButton onClick={onNext} disabled={values.length === 0}>
          Continue
        </PrimaryButton>
      </div>
    </StepShell>
  );
}

// ── Step 7: Therapist ────────────────────────────────────────────────────────

function TherapistStep({
  value,
  onChange,
  onNext,
  onBack,
}: {
  value: TherapistPersona | null;
  onChange: (v: TherapistPersona) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <StepShell step={7} onBack={onBack}>
      <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full space-y-5">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-[#2C2A26]">
            Choose your guide
          </h2>
          <p className="text-sm text-[#2C2A26]/50 leading-relaxed">
            Your therapist&apos;s style shapes how your sessions feel. You can change
            this later.
          </p>
        </div>

        <div className="space-y-3">
          {THERAPISTS.map((t) => {
            const selected = value === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onChange(t.id)}
                className={`w-full text-left p-4 rounded-2xl border-2 transition-all duration-200
                  ${
                    selected
                      ? 'border-[#6B8F71] bg-[#6B8F71]/5'
                      : 'border-[#E8E4DE] bg-white hover:border-[#6B8F71]/30'
                  }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-white font-semibold text-sm"
                    style={{ backgroundColor: t.color }}
                  >
                    {t.name[0]}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-[#2C2A26]">{t.name}</span>
                      <span className="text-xs text-[#2C2A26]/40">{t.approach}</span>
                    </div>
                    <p className="text-sm text-[#2C2A26]/60">{t.style}</p>
                    <p className="text-xs text-[#2C2A26]/40 italic leading-relaxed">
                      &ldquo;{t.sample}&rdquo;
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <PrimaryButton onClick={onNext} disabled={!value}>
          Continue
        </PrimaryButton>
      </div>
    </StepShell>
  );
}

// ── Step 8: Journey Preview ──────────────────────────────────────────────────

function generateMockJourney(concerns: string[]): {
  title: string;
  description: string;
  phases: JourneyPhase[];
} {
  const primary = concerns[0] ?? 'General Wellness';
  const titleMap: Record<string, string> = {
    'Anxiety & Worry': 'Your Path to Managing Anxiety',
    'Stress & Burnout': 'Your Journey to Calm & Balance',
    Relationships: 'Building Healthier Connections',
    'Self-Esteem': 'Rediscovering Your Worth',
    'Grief & Loss': 'Finding Peace Through Grief',
    'Sleep Issues': 'Restoring Restful Sleep',
    Loneliness: 'Building Connection & Belonging',
    Overthinking: 'Quieting the Overactive Mind',
    'Low Confidence': 'Growing Into Your Confidence',
    'General Wellness': 'Your Path to Mental Wellness',
  };

  const title = titleMap[primary] ?? titleMap['General Wellness'];

  const phases: JourneyPhase[] = [
    {
      phase_number: 1,
      title: 'Understanding & Foundation',
      goal: 'Build awareness of your patterns and establish trust',
      sessions: [
        { session_number: 1, topic: 'Welcome & Assessment', description: 'Getting to know you' },
        { session_number: 2, topic: 'Identifying Patterns', description: 'Exploring what triggers you' },
        { session_number: 3, topic: 'Building Awareness', description: 'Recognizing thought loops' },
      ],
    },
    {
      phase_number: 2,
      title: 'Skills & Strategies',
      goal: 'Learn practical coping techniques tailored to you',
      sessions: [
        { session_number: 4, topic: 'Coping Toolkit', description: 'Practical exercises' },
        { session_number: 5, topic: 'Reframing Thoughts', description: 'Challenging negative patterns' },
        { session_number: 6, topic: 'Emotional Regulation', description: 'Managing intense feelings' },
      ],
    },
    {
      phase_number: 3,
      title: 'Deepening & Growth',
      goal: 'Explore root causes and develop lasting change',
      sessions: [
        { session_number: 7, topic: 'Root Exploration', description: 'Understanding deeper causes' },
        { session_number: 8, topic: 'Values Alignment', description: 'Living by what matters' },
        { session_number: 9, topic: 'Resilience Building', description: 'Strengthening inner resources' },
      ],
    },
    {
      phase_number: 4,
      title: 'Integration & Independence',
      goal: 'Consolidate progress and build self-reliance',
      sessions: [
        { session_number: 10, topic: 'Progress Review', description: 'Reflecting on growth' },
        { session_number: 11, topic: 'Maintenance Plan', description: 'Staying on track' },
        { session_number: 12, topic: 'Moving Forward', description: 'Your continued journey' },
      ],
    },
  ];

  return {
    title,
    description: `A personalized ${phases.length}-phase journey designed around ${concerns.join(' and ').toLowerCase()}.`,
    phases,
  };
}

function JourneyPreviewStep({
  concerns,
  name,
  age,
  gender,
  therapist,
  onBack,
}: {
  concerns: string[];
  name: string;
  age: number;
  gender: string;
  therapist: TherapistPersona;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [journey, setJourney] = useState<ReturnType<typeof generateMockJourney> | null>(null);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { setProfile, setJourney: setStoreJourney } = useMindCoachStore();

  useEffect(() => {
    const t = setTimeout(() => {
      setJourney(generateMockJourney(concerns));
      setLoading(false);
    }, 2000);
    return () => clearTimeout(t);
  }, [concerns]);

  const handleStart = useCallback(async () => {
    if (!journey || saving) return;
    setSaving(true);

    try {
      const { data: profileData, error: profileError } = await supabase
        .from('mind_coach_profiles')
        .insert({
          name,
          age,
          gender,
          concerns,
          therapist_persona: therapist,
        })
        .select()
        .single();

      if (profileError) throw profileError;

      const profile = profileData as MindCoachProfile;
      setProfile(profile);

      const { data: journeyData, error: journeyError } = await supabase
        .from('mind_coach_journeys')
        .insert({
          profile_id: profile.id,
          title: journey.title,
          description: journey.description,
          concerns_snapshot: concerns,
          phases: journey.phases,
          current_phase: 1,
          version: 1,
        })
        .select()
        .single();

      if (journeyError) throw journeyError;

      setStoreJourney(journeyData as MindCoachJourney);
      navigate(`/mind-coach/${profile.id}`);
    } catch (err) {
      console.error('Failed to create profile:', err);
      setSaving(false);
    }
  }, [journey, saving, name, age, gender, concerns, therapist, setProfile, setStoreJourney, navigate]);

  return (
    <StepShell step={8} onBack={loading ? undefined : onBack}>
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
          <div className="relative w-16 h-16">
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-[#6B8F71]/20"
              animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0, 0.4] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
            <div className="absolute inset-0 rounded-full border-2 border-t-[#6B8F71] border-r-transparent border-b-transparent border-l-transparent animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6B8F71" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a7 7 0 0 1 7 7c0 3-1.5 5.5-4 7.5V19a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-2.5C6.5 14.5 5 12 5 9a7 7 0 0 1 7-7z" />
              </svg>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-lg font-medium text-[#2C2A26]">
              Crafting your personalized path&hellip;
            </p>
            <p className="text-sm text-[#2C2A26]/40">
              Tailoring sessions to your unique needs
            </p>
          </div>
        </div>
      ) : journey ? (
        <div className="flex-1 flex flex-col max-w-sm mx-auto w-full space-y-6">
          <div className="space-y-2 pt-2">
            <h2 className="text-2xl font-semibold text-[#2C2A26]">
              {journey.title}
            </h2>
            <p className="text-sm text-[#2C2A26]/50">{journey.description}</p>
          </div>

          <div className="space-y-3 flex-1">
            {journey.phases.map((phase, idx) => (
              <div
                key={phase.phase_number}
                className="flex gap-3"
              >
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-[#6B8F71]/10 flex items-center justify-center text-xs font-semibold text-[#6B8F71]">
                    {phase.phase_number}
                  </div>
                  {idx < journey.phases.length - 1 && (
                    <div className="w-px flex-1 bg-[#E8E4DE] my-1" />
                  )}
                </div>
                <div className="pb-4 flex-1">
                  <p className="font-medium text-sm text-[#2C2A26]">
                    {phase.title}
                  </p>
                  <p className="text-xs text-[#2C2A26]/50 mt-0.5">
                    {phase.goal}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <PrimaryButton onClick={handleStart} disabled={saving}>
            {saving ? 'Setting up...' : 'Start Your Journey'}
          </PrimaryButton>
        </div>
      ) : null}
    </StepShell>
  );
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

const MindCoachLanding: React.FC = () => {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);

  // Onboarding data
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [concerns, setConcerns] = useState<string[]>([]);
  const [therapist, setTherapist] = useState<TherapistPersona | null>(null);

  const goForward = useCallback(() => {
    setDirection(1);
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  }, []);

  const goBack = useCallback(() => {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 1));
  }, []);

  const renderStep = () => {
    switch (step) {
      case 1:
        return <WelcomeStep onNext={goForward} />;
      case 2:
        return <SafeSpaceStep onNext={goForward} onBack={goBack} />;
      case 3:
        return (
          <NameStep
            value={name}
            onChange={setName}
            onNext={goForward}
            onBack={goBack}
          />
        );
      case 4:
        return (
          <AgeStep
            name={name}
            value={age}
            onChange={setAge}
            onNext={goForward}
            onBack={goBack}
          />
        );
      case 5:
        return (
          <GenderStep
            value={gender}
            onChange={setGender}
            onNext={goForward}
            onBack={goBack}
          />
        );
      case 6:
        return (
          <ConcernStep
            name={name}
            values={concerns}
            onChange={setConcerns}
            onNext={goForward}
            onBack={goBack}
          />
        );
      case 7:
        return (
          <TherapistStep
            value={therapist}
            onChange={setTherapist}
            onNext={goForward}
            onBack={goBack}
          />
        );
      case 8:
        return (
          <JourneyPreviewStep
            concerns={concerns}
            name={name}
            age={parseInt(age, 10)}
            gender={gender}
            therapist={therapist!}
            onBack={goBack}
          />
        );
      default:
        return null;
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
        className="min-h-screen"
      >
        {renderStep()}
      </motion.div>
    </AnimatePresence>
  );
};

export default MindCoachLanding;
