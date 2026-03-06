import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../../lib/supabaseClient';
import { useMindCoachStore } from '../../../store/mindCoachStore';
import { DYNAMIC_ASSESSMENTS } from '../../../lib/dynamicContentLibrary';

interface DynamicAssessmentRendererProps {
    payload: string; // The assessment ID, e.g., 'GAD-7'
}

export const DynamicAssessmentRenderer: React.FC<DynamicAssessmentRendererProps> = ({ payload }) => {
    const profile = useMindCoachStore((s) => s.profile);
    const activeSession = useMindCoachStore((s) => s.activeSession);
    const assessmentDef = DYNAMIC_ASSESSMENTS[payload];

    const [answers, setAnswers] = useState<Record<string, number>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [score, setScore] = useState<number | null>(null);

    if (!assessmentDef) {
        return (
            <div className="p-3 bg-[#F5F0EB] text-[#2C2A26] rounded-xl text-xs italic opacity-70">
                Assessment unavailable.
            </div>
        );
    }

    const handleSelect = (questionId: string, value: number) => {
        if (isSubmitted) return;
        setAnswers((prev) => ({ ...prev, [questionId]: value }));
    };

    const allAnswered = assessmentDef.questions.every((q) => answers[q.id] !== undefined);

    const handleSubmit = async () => {
        if (!allAnswered || !profile || !activeSession || isSubmitting) return;
        setIsSubmitting(true);

        // Calculate total score
        const totalScore = Object.values(answers).reduce((sum, val) => sum + val, 0);

        try {
            const { error } = await supabase.from('mind_coach_assessments').insert({
                profile_id: profile.id,
                session_id: activeSession.id,
                assessment_type: payload,
                score: totalScore,
                details: answers,
            });

            if (error) throw error;

            setScore(totalScore);
            setIsSubmitted(true);

            // We don't need to manually push a message to n8n here immediately, 
            // but it will be picked up seamlessly next time the user texts something,
            // or we could trigger a silent background update if needed.
        } catch (err) {
            console.error('Failed to submit assessment:', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-2 w-[280px] md:w-[350px] rounded-2xl border border-[#E8E4DE] bg-white shadow-sm overflow-hidden"
        >
            <div className="bg-[#FAF9F7] px-4 py-3 border-b border-[#E8E4DE]">
                <h4 className="text-sm font-bold text-[#2C2A26]">{assessmentDef.title}</h4>
                <p className="text-xs text-[#2C2A26]/70 mt-0.5 leading-relaxed">{assessmentDef.description}</p>
            </div>

            <AnimatePresence mode="wait">
                {!isSubmitted ? (
                    <motion.div
                        key="form"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="p-4"
                    >
                        <div className="space-y-6 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                            {assessmentDef.questions.map((q, idx) => (
                                <div key={q.id} className="space-y-2">
                                    <p className="text-sm font-medium text-[#2C2A26] leading-snug">
                                        <span className="text-[#6B8F71] font-bold mr-1">{idx + 1}.</span>
                                        {q.text}
                                    </p>
                                    <div className="space-y-1.5 ml-4">
                                        {q.options.map((opt) => (
                                            <label
                                                key={`${q.id}-${opt.value}`}
                                                onClick={() => handleSelect(q.id, opt.value)}
                                                className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-colors ${answers[q.id] === opt.value
                                                    ? 'bg-[#6B8F71]/10 border border-[#6B8F71]/30'
                                                    : 'hover:bg-[#F9F6F2] border border-transparent'
                                                    }`}
                                            >
                                                <div
                                                    className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${answers[q.id] === opt.value
                                                        ? 'border-[#6B8F71] bg-[#6B8F71]'
                                                        : 'border-[#2C2A26]/30'
                                                        }`}
                                                >
                                                    {answers[q.id] === opt.value && (
                                                        <div className="w-1.5 h-1.5 bg-white rounded-full" />
                                                    )}
                                                </div>
                                                <span className={`text-xs ${answers[q.id] === opt.value ? 'font-medium text-[#2C2A26]' : 'text-[#2C2A26]/80'}`}>
                                                    {opt.label}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-4 pt-4 border-t border-[#E8E4DE]">
                            <button
                                onClick={handleSubmit}
                                disabled={!allAnswered || isSubmitting}
                                className="w-full py-2.5 bg-[#2C2A26] text-white text-sm font-medium rounded-xl disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#2C2A26]/90 transition-colors"
                            >
                                {isSubmitting ? 'Saving...' : 'Submit Assessment'}
                            </button>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="result"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="p-6 text-center"
                    >
                        <div className="w-12 h-12 bg-[#6B8F71]/10 rounded-full flex items-center justify-center mx-auto mb-3">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6B8F71" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </div>
                        <h3 className="text-lg font-bold text-[#2C2A26] mb-1">Assessment Saved</h3>
                        <p className="text-sm text-[#2C2A26]/70 mb-4">
                            Thank you for sharing. Your score is <span className="font-bold text-[#6B8F71]">{score}</span>.
                        </p>
                        <p className="text-xs text-[#2C2A26]/50 italic">
                            Your therapist will be able to review these results.
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};
