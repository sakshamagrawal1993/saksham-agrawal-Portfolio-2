import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { useAuth } from '../../../context/AuthContext';

const CONCERN_OPTIONS = [
  'Anxiety', 'Depression', 'Stress', 'Sleep Issues', 'Panic Attacks',
  'Low Self-Esteem', 'Relationship Issues', 'Grief & Loss', 'Burnout',
  'Anger Issues', 'Loneliness', 'Trauma', 'Family Conflict',
  'Overthinking', 'Body Image', 'Life Transitions', 'Identity',
];

const THERAPISTS = [
  {
    id: 'maya' as const,
    name: 'Maya',
    style: 'Warm & Empathetic',
    description: 'Gentle, validating, and deeply personal. Maya sits with you in your feelings before offering guidance.',
    color: '#B4A7D6',
    emoji: '💜',
  },
  {
    id: 'alex' as const,
    name: 'Alex',
    style: 'Direct & Solution-focused',
    description: 'Warm but efficient — validates quickly then guides you toward concrete actions and reframes.',
    color: '#D4A574',
    emoji: '🧡',
  },
  {
    id: 'sage' as const,
    name: 'Sage',
    style: 'Calm & Mindful',
    description: 'Measured and grounding. Sage draws from mindfulness and helps you observe without judgment.',
    color: '#6B8F71',
    emoji: '💚',
  },
];

interface OnboardingFlowProps {
  onComplete: (profileId: string) => void;
}

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onComplete }) => {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1 fields
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');

  // Step 2 fields
  const [selectedConcerns, setSelectedConcerns] = useState<string[]>([]);

  // Step 3 fields
  const [selectedTherapist, setSelectedTherapist] = useState<'maya' | 'alex' | 'sage'>('maya');

  const toggleConcern = (c: string) => {
    setSelectedConcerns((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  };

  const canProceed = (): boolean => {
    switch (step) {
      case 0: return name.trim().length >= 2 && age.trim().length > 0;
      case 1: return selectedConcerns.length >= 1;
      case 2: return true;
      case 3: return true;
      default: return false;
    }
  };

  const handleFinish = useCallback(async () => {
    if (!user || saving) return;
    setSaving(true);

    try {
      // 1. Create profile
      const { data: profile, error: profileErr } = await supabase
        .from('mind_coach_profiles')
        .insert({
          user_id: user.id,
          name: name.trim(),
          age: parseInt(age) || null,
          gender: gender || null,
          concerns: selectedConcerns,
          therapist_persona: selectedTherapist,
        })
        .select()
        .single();

      if (profileErr || !profile) throw new Error(profileErr?.message || 'Failed to create profile');

      // 2. Create initial journey (engagement phase)
      await supabase.from('mind_coach_journeys').insert({
        profile_id: profile.id,
        pathway: 'engagement_rapport_and_assessment',
        title: 'First Steps Plan',
        phases: [
          { name: 'Discovery & Context', goal: 'Share your story so we can understand your concerns and identify the best clinical path forward for you.', sessions: 3 },
        ],
        current_phase_index: 0,
        sessions_completed: 0,
        active: true,
      });

      onComplete(profile.id);
    } catch (err) {
      console.error('Onboarding error:', err);
    } finally {
      setSaving(false);
    }
  }, [user, name, age, gender, selectedConcerns, selectedTherapist, saving, onComplete]);

  const therapist = THERAPISTS.find((t) => t.id === selectedTherapist)!;

  return (
    <div className="flex flex-col h-full bg-[#FAFAF7]">
      {/* Progress bar */}
      <div className="px-5 pt-4 pb-2 shrink-0">
        <div className="flex gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-colors duration-300"
              style={{ backgroundColor: i <= step ? '#6B8F71' : '#E8E4DE' }}
            />
          ))}
        </div>
      </div>

      {/* Back button */}
      {step > 0 && (
        <button
          onClick={() => setStep(step - 1)}
          className="flex items-center gap-1 px-5 py-2 text-sm text-[#2C2A26]/50 hover:text-[#2C2A26] transition-colors self-start"
        >
          <ArrowLeft size={14} /> Back
        </button>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <AnimatePresence mode="wait">
          {/* Step 0: Name, Age, Gender */}
          {step === 0 && (
            <motion.div key="s0" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-[#2C2A26]">Welcome to Mind Coach</h2>
                <p className="text-sm text-[#2C2A26]/50 mt-1">Let's get to know you a little</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-[#2C2A26]/60 uppercase tracking-wide">Your Name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="What should we call you?"
                    className="mt-1.5 w-full px-4 py-3 text-sm bg-white border border-[#E8E4DE] rounded-xl outline-none focus:border-[#6B8F71] transition-colors text-[#2C2A26] placeholder:text-[#2C2A26]/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#2C2A26]/60 uppercase tracking-wide">Age</label>
                  <input
                    type="number"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="Your age"
                    className="mt-1.5 w-full px-4 py-3 text-sm bg-white border border-[#E8E4DE] rounded-xl outline-none focus:border-[#6B8F71] transition-colors text-[#2C2A26] placeholder:text-[#2C2A26]/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#2C2A26]/60 uppercase tracking-wide">Gender</label>
                  <div className="flex gap-2 mt-1.5">
                    {['Male', 'Female', 'Non-binary', 'Prefer not to say'].map((g) => (
                      <button
                        key={g}
                        onClick={() => setGender(g)}
                        className={`px-3 py-2 text-xs font-medium rounded-xl border transition-colors ${
                          gender === g
                            ? 'bg-[#6B8F71] text-white border-[#6B8F71]'
                            : 'bg-white text-[#2C2A26]/60 border-[#E8E4DE] hover:border-[#6B8F71]/30'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 1: Concerns */}
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-5">
              <div>
                <h2 className="text-2xl font-semibold text-[#2C2A26]">What brings you here?</h2>
                <p className="text-sm text-[#2C2A26]/50 mt-1">Select all that apply — you can always update these</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {CONCERN_OPTIONS.map((c) => {
                  const selected = selectedConcerns.includes(c);
                  return (
                    <button
                      key={c}
                      onClick={() => toggleConcern(c)}
                      className={`px-3.5 py-2 text-xs font-medium rounded-full border transition-all ${
                        selected
                          ? 'bg-[#6B8F71] text-white border-[#6B8F71] scale-105'
                          : 'bg-white text-[#2C2A26]/60 border-[#E8E4DE] hover:border-[#6B8F71]/30'
                      }`}
                    >
                      {selected && <Check size={11} className="inline mr-1 -mt-0.5" />}
                      {c}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Step 2: Choose Therapist */}
          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-5">
              <div>
                <h2 className="text-2xl font-semibold text-[#2C2A26]">Choose your therapist</h2>
                <p className="text-sm text-[#2C2A26]/50 mt-1">Each has a unique style — pick who resonates with you</p>
              </div>
              <div className="space-y-3">
                {THERAPISTS.map((t) => {
                  const selected = selectedTherapist === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTherapist(t.id)}
                      className={`w-full p-4 rounded-2xl border text-left transition-all ${
                        selected
                          ? 'border-2 shadow-md'
                          : 'border border-[#E8E4DE] hover:border-[#D6D1C7]'
                      }`}
                      style={selected ? { borderColor: t.color } : {}}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-11 h-11 rounded-full flex items-center justify-center text-white text-lg font-semibold"
                          style={{ backgroundColor: t.color }}
                        >
                          {t.name[0]}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-[#2C2A26]">{t.name}</p>
                          <p className="text-xs text-[#2C2A26]/50">{t.style}</p>
                        </div>
                        {selected && (
                          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: t.color }}>
                            <Check size={14} className="text-white" />
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-[#2C2A26]/60 mt-2 leading-relaxed">{t.description}</p>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Step 3: Welcome */}
          {step === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-6 text-center pt-8">
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring' }}
                className="w-20 h-20 rounded-full flex items-center justify-center mx-auto text-3xl"
                style={{ backgroundColor: therapist.color + '20' }}
              >
                {therapist.emoji}
              </motion.div>
              <div>
                <h2 className="text-2xl font-semibold text-[#2C2A26]">
                  You're all set, {name.split(' ')[0]}!
                </h2>
                <p className="text-sm text-[#2C2A26]/50 mt-2 leading-relaxed max-w-[260px] mx-auto">
                  {therapist.name} is ready to begin your journey. You're in the{' '}
                  <span className="font-medium text-[#6B8F71]">Engagement & Rapport Building</span> phase.
                </p>
              </div>
              <div className="bg-white rounded-2xl p-4 border border-[#E8E4DE] text-left">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={14} className="text-[#D4A574]" />
                  <p className="text-xs font-medium text-[#2C2A26]/60 uppercase tracking-wide">Your Concerns</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedConcerns.map((c) => (
                    <span key={c} className="text-xs px-2.5 py-1 bg-[#F5F0EB] rounded-full text-[#2C2A26]/70">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom CTA */}
      <div className="px-5 py-4 shrink-0">
        {step < 3 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
            className="w-full py-3 bg-[#6B8F71] text-white text-sm font-semibold rounded-xl hover:bg-[#5A7D60] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            Continue <ArrowRight size={16} />
          </button>
        ) : (
          <button
            onClick={handleFinish}
            disabled={saving}
            className="w-full py-3 bg-[#2C2A26] text-white text-sm font-semibold rounded-xl hover:bg-[#2C2A26]/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Setting up…
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Start My Journey
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
