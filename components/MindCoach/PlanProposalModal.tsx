import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { MIND_COACH_PROPOSAL_DRAWER_IMAGE } from './MindCoachConstants';
import {
    useMindCoachStore,
    type JourneyPhase,
    UNLOCK_MAP,
} from '../../store/mindCoachStore';

const PATHWAY_PLAYBOOKS: Record<string, { name: string; phases: { name: string; goal: string; sessions: number }[] }> = {
    crisis_intervention_and_suicide_prevention: {
        name: 'Safety & Connection Plan',
        phases: [
            { name: 'Safety First', goal: "Reduce access to means; know your warning signs and use your safety plan.", sessions: 3 },
            { name: 'Stay Connected', goal: "Identify 2–3 people or resources you will contact when you feel at risk.", sessions: 3 },
            { name: 'Daily Anchors', goal: "Keep 1–2 small non-negotiable daily actions (e.g. one call, one short walk).", sessions: 3 },
            { name: 'When to Reach Out', goal: "Know when to use your safety plan or crisis line.", sessions: 3 },
        ],
    },
    grief_and_loss_processing: {
        name: 'Healing Through Grief Plan',
        phases: [
            { name: 'Honour the Loss', goal: "Allow space to feel and talk about the loss; no fixed timeline.", sessions: 3 },
            { name: 'Feel & Process', goal: "Notice and name emotions; allow memories and meaning-making.", sessions: 3 },
            { name: 'Re-engage Gently', goal: "Choose one or two small valued activities to return to.", sessions: 3 },
            { name: 'Carry Forward', goal: "Keep a way to remember and stay connected to what matters.", sessions: 3 },
        ],
    },
    depression_and_behavioral_activation: {
        name: 'Re-engagement & Mood Plan',
        phases: [
            { name: 'Understand the Cycle', goal: "Notice how withdrawal and low activity affect your mood.", sessions: 3 },
            { name: 'Small Steps Back', goal: "Schedule 1–2 very small, achievable activities each day.", sessions: 3 },
            { name: 'Build Momentum', goal: "Gradually add variety and a bit more challenge.", sessions: 3 },
            { name: 'Keep Going', goal: "Keep a simple routine of activities; when you slip, return to small steps.", sessions: 3 },
        ],
    },
    anxiety_and_stress_management: {
        name: 'Calm & Coping Plan',
        phases: [
            { name: 'Understand Your Anxiety', goal: "Notice what triggers worry and stress; see how avoidance keeps anxiety going.", sessions: 3 },
            { name: 'Ground & Breathe', goal: "Practice grounding and slow breathing when anxious.", sessions: 3 },
            { name: 'Face Fears Gradually', goal: "Take one small step toward a situation you avoid.", sessions: 3 },
            { name: 'Stay Steady', goal: "Keep using grounding and exposure; return to the plan without judgment.", sessions: 3 },
        ],
    },
    emotion_regulation_and_distress_tolerance: {
        name: 'Emotional Balance Plan',
        phases: [
            { name: 'Notice & Name', goal: "Pause to notice and name emotions without judging them.", sessions: 3 },
            { name: 'Tolerate Distress', goal: "Use distress tolerance when emotions are intense.", sessions: 3 },
            { name: 'Regulate & Choose', goal: "Check the facts and try opposite action when emotions don't fit the situation.", sessions: 3 },
            { name: 'Practice Daily', goal: "Use one skill each day; notice what helps.", sessions: 3 },
        ],
    },
    trauma_processing_and_ptsd: {
        name: 'Safety to Healing Plan',
        phases: [
            { name: 'Safety & Stability', goal: "Focus on feeling safe in the here and now.", sessions: 3 },
            { name: 'Understand Trauma', goal: "Learn how trauma affects mind and body.", sessions: 3 },
            { name: 'Process at Your Pace', goal: "Process trauma memories in a structured way when stable.", sessions: 3 },
            { name: 'Live Beyond Triggers', goal: "Plan for triggers and setbacks; keep using grounding.", sessions: 3 },
        ],
    },
    relationship_conflict_and_interpersonal: {
        name: 'Connection & Communication Plan',
        phases: [
            { name: 'See the Pattern', goal: "Notice how you and the other person interact in conflict.", sessions: 3 },
            { name: 'Communicate Clearly', goal: "Practice I-statements and listening.", sessions: 3 },
            { name: 'Try New Ways', goal: "Try one new way of responding in a real situation.", sessions: 3 },
            { name: 'Nurture the Relationship', goal: "Keep using clear communication and boundaries.", sessions: 3 },
        ],
    },
    self_worth_and_self_esteem: {
        name: 'Self-Worth Building Plan',
        phases: [
            { name: 'Challenge the Inner Critic', goal: "Notice negative self-talk; gather evidence.", sessions: 3 },
            { name: 'Act As If', goal: "Do one small thing 'as if' you believe you have value.", sessions: 3 },
            { name: 'Self-Compassion', goal: "Offer yourself the same kindness you'd give a friend.", sessions: 3 },
            { name: 'Own Your Story', goal: "Build a fairer story about yourself.", sessions: 3 },
        ],
    },
    boundary_setting_and_assertiveness: {
        name: 'Boundaries & Respect Plan',
        phases: [
            { name: 'Know Your Limits', goal: "Clarify what you're okay with and what you're not.", sessions: 3 },
            { name: 'Say It Clearly', goal: "Practice one clear, calm, assertive statement.", sessions: 3 },
            { name: 'Start Small', goal: "Use your boundary in one lower-stakes situation.", sessions: 3 },
            { name: 'Hold Steady', goal: "Reinforce boundaries without apologising for your needs.", sessions: 3 },
        ],
    },
    overthinking_rumination_and_cognitive_restructuring: {
        name: 'Quiet Mind Plan',
        phases: [
            { name: 'Catch the Loop', goal: "Notice when you're overthinking or ruminating.", sessions: 3 },
            { name: 'Question Thoughts', goal: "Use a thought record: situation, thought, emotion.", sessions: 3 },
            { name: 'Worry Time Only', goal: "Postpone worry to a short daily 'worry time'.", sessions: 3 },
            { name: 'Distance & Let Go', goal: "See thoughts as just thoughts.", sessions: 3 },
        ],
    },
    sleep_and_insomnia: {
        name: 'Restful Sleep Plan',
        phases: [
            { name: 'Sleep Habits', goal: "Keep a consistent wake time; use the bed only for sleep.", sessions: 3 },
            { name: 'Wind Down', goal: "Do a short relaxation or wind-down routine before bed.", sessions: 3 },
            { name: 'Bed for Sleep Only', goal: "If awake 20 minutes, get up and do something calm.", sessions: 3 },
            { name: 'Track & Adjust', goal: "Keep a simple sleep diary.", sessions: 3 },
        ],
    },
    panic_and_physical_anxiety_symptoms: {
        name: 'Calm Body & Mind Plan',
        phases: [
            { name: 'Understand Panic', goal: "Learn that panic is the body's alarm.", sessions: 3 },
            { name: 'Breathe & Ground', goal: "Practise slow breathing and grounding.", sessions: 3 },
            { name: 'Face Sensations', goal: "Practise interoceptive exposure.", sessions: 3 },
            { name: 'Stay Calm in Life', goal: "Gradually enter situations you've avoided.", sessions: 3 },
        ],
    },
    family_conflict_and_dynamics: {
        name: 'Family Calm & Boundaries Plan',
        phases: [
            { name: 'Map the Dynamics', goal: "Notice who's involved and what triggers conflict.", sessions: 3 },
            { name: 'Regulate & Communicate', goal: "Use emotion regulation when triggered.", sessions: 3 },
            { name: 'Set Boundaries', goal: "Choose one boundary with family; state it and keep it.", sessions: 3 },
            { name: 'Stay Steady with Family', goal: "Plan for difficult conversations or events.", sessions: 3 },
        ],
    },
    abuse_and_safety: {
        name: 'Safety First Plan',
        phases: [
            { name: 'Safety Now', goal: "Know where you're safe; reduce immediate risk.", sessions: 3 },
            { name: 'Plan Your Exit', goal: "Make a practical exit plan.", sessions: 3 },
            { name: 'Connect to Support', goal: "Reach out to services when you're ready.", sessions: 3 },
            { name: 'Heal When Safe', goal: "Focus on trauma and emotional healing when safe.", sessions: 3 },
        ],
    },
    life_transition_and_adjustment: {
        name: 'Transition & Adjustment Plan',
        phases: [
            { name: 'Acknowledge the Change', goal: "Name what has changed and allow mixed feelings.", sessions: 3 },
            { name: 'Cope Day to Day', goal: "Use coping strategies that work for you.", sessions: 3 },
            { name: 'Rebuild Routines', goal: "Re-establish small daily routines.", sessions: 3 },
            { name: 'Find New Meaning', goal: "Set short-term goals in this chapter of life.", sessions: 3 },
        ],
    },
    identity_and_self_concept: {
        name: 'Discovering Yourself Plan',
        phases: [
            { name: 'Explore Without Judgment', goal: "Notice what you value and how you want to be.", sessions: 3 },
            { name: 'Clarify Values', goal: "Name what matters in different life areas.", sessions: 3 },
            { name: 'Try On Who You Are', goal: "Do one small experiment in self-expression.", sessions: 3 },
            { name: 'Own Your Story', goal: "Gradually build a story about yourself.", sessions: 3 },
        ],
    },
    social_anxiety_and_isolation: {
        name: 'Reconnect & Comfort Plan',
        phases: [
            { name: 'Understand Your Fears', goal: "Notice automatic thoughts and safety behaviours.", sessions: 3 },
            { name: 'Challenge Thoughts', goal: "Question thoughts about judgment or rejection.", sessions: 3 },
            { name: 'Step Out Gently', goal: "Do one small social step.", sessions: 3 },
            { name: 'Build Connection', goal: "Keep taking small steps toward connection.", sessions: 3 },
        ],
    },
    anger_management: {
        name: 'Calm Response Plan',
        phases: [
            { name: 'Spot the Triggers', goal: "Notice what triggers anger and signs in your body.", sessions: 3 },
            { name: 'Pause & Ground', goal: "Pause; use breathing before reacting.", sessions: 3 },
            { name: "Respond, Don't React", goal: "Choose an assertive response instead of aggression.", sessions: 3 },
            { name: 'Keep Your Cool', goal: "Plan for high-trigger moments.", sessions: 3 },
        ],
    },
    health_anxiety_and_somatic_symptoms: {
        name: 'Body-Mind Calm Plan',
        phases: [
            { name: 'Understand the Link', goal: "Learn how worry affects body sensations.", sessions: 3 },
            { name: 'Less Reassurance', goal: "Cut down on checking or asking others.", sessions: 3 },
            { name: 'Face Health Fears', goal: "Gradually face health-related triggers.", sessions: 3 },
            { name: 'Live Fully', goal: "Shift attention to valued activities.", sessions: 3 },
        ],
    },
    engagement_rapport_and_assessment: {
        name: 'General Wellness',
        phases: [
            { name: 'Engagement', goal: "Establish trust and safe space.", sessions: 3 },
            { name: 'Awareness', goal: "Recognize patterns.", sessions: 3 },
            { name: 'Strategies', goal: "Identify coping mechanisms.", sessions: 3 },
            { name: 'Growth', goal: "Apply strategies to daily life.", sessions: 3 },
        ]
    }
};

interface PlanProposalModalProps {
    onClose: () => void;
    onAccept: () => void;
}

type PathwayPhaseRow = {
    pathway_name: string;
    pathway_description: string | null;
    phase_number: number;
    phase_name: string;
    phase_description: string | null;
};

type SessionTemplateRow = {
    id: string;
    pathway_name: string;
    phase_number: number;
    session_order: number;
    title: string;
    goal: string;
    description: string;
    min_completion_score: number | null;
    fallback_strategy: string;
};

type PostAcceptDetails = {
    pathwayName: string;
    activePhaseTitle: string;
    nextSessionTitle: string;
    toolsNow: string[];
    nextUnlocks: string[];
};

const FEATURE_LABELS: Record<string, string> = {
    chat: 'Guided Chat',
    journal: 'Journal',
    assessments: 'Assessments',
    exercises: 'Exercises',
    meditation: 'Meditation',
};

export const PlanProposalModal: React.FC<PlanProposalModalProps> = ({ onClose, onAccept }) => {
    const profile = useMindCoachStore((s) => s.profile);
    const activeSession = useMindCoachStore((s) => s.activeSession);
    const journey = useMindCoachStore((s) => s.journey);
    const setJourney = useMindCoachStore((s) => s.setJourney);
    const updateActiveSession = useMindCoachStore((s) => s.updateActiveSession);

    const [saving, setSaving] = useState(false);
    const [showPostAccept, setShowPostAccept] = useState(false);
    const [postAcceptDetails, setPostAcceptDetails] = useState<PostAcceptDetails | null>(null);
    const [acceptError, setAcceptError] = useState<string | null>(null);
    const [dbPhases, setDbPhases] = useState<PathwayPhaseRow[] | null>(null);
    const [sessionTemplates, setSessionTemplates] = useState<SessionTemplateRow[] | null>(null);

    const suggestedPathwayId = useMemo(() => {
        if (activeSession?.pathway && activeSession.pathway !== 'engagement_rapport_and_assessment') {
            return activeSession.pathway;
        }
        return journey?.discovery_state?.suggested_pathway ?? 'engagement_rapport_and_assessment';
    }, [activeSession?.pathway, journey?.discovery_state?.suggested_pathway]);
    const [selectedPathwayId, setSelectedPathwayId] = useState(suggestedPathwayId);

    useEffect(() => {
        if (!showPostAccept) {
            setSelectedPathwayId(suggestedPathwayId);
        }
    }, [suggestedPathwayId, showPostAccept]);

    const playbookDirect = PATHWAY_PLAYBOOKS[selectedPathwayId];
    const playbook = playbookDirect || PATHWAY_PLAYBOOKS.engagement_rapport_and_assessment;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data, error } = await supabase
                .from('mind_coach_pathway_phases')
                .select(
                    'pathway_name, pathway_description, phase_number, phase_name, phase_description',
                )
                .eq('pathway_name', selectedPathwayId)
                .order('phase_number', { ascending: true });
            if (cancelled) return;
            if (error || !data?.length) {
                setDbPhases([]);
                return;
            }
            setDbPhases(data as PathwayPhaseRow[]);
        })();
        return () => {
            cancelled = true;
        };
    }, [selectedPathwayId]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data, error } = await supabase
                .from('mind_coach_session_templates')
                .select(
                    'id,pathway_name,phase_number,session_order,title,goal,description,min_completion_score,fallback_strategy',
                )
                .eq('pathway_name', selectedPathwayId)
                .eq('is_active', true)
                .order('phase_number', { ascending: true })
                .order('session_order', { ascending: true });
            if (cancelled) return;
            if (error || !data?.length) {
                setSessionTemplates([]);
                return;
            }
            setSessionTemplates(data as SessionTemplateRow[]);
        })();
        return () => {
            cancelled = true;
        };
    }, [selectedPathwayId]);

    const templatesByPhase = useMemo(() => {
        const map = new Map<number, SessionTemplateRow[]>();
        for (const row of sessionTemplates ?? []) {
            const existing = map.get(row.phase_number) ?? [];
            existing.push(row);
            map.set(row.phase_number, existing);
        }
        return map;
    }, [sessionTemplates]);

    const displayPhases =
        dbPhases && dbPhases.length > 0
            ? dbPhases.map((r) => ({
                  name: r.phase_name,
                  goal: r.phase_description || '',
              }))
            : playbook.phases.map((p) => ({ name: p.name, goal: p.goal }));

    const planTitle =
        playbookDirect?.name ||
        (dbPhases && dbPhases.length > 0 && dbPhases[0].pathway_description
            ? dbPhases[0].pathway_description
            : playbook.name);

    const handleAcceptProposal = async () => {
        if (!profile || !journey || saving) return;
        setSaving(true);
        setAcceptError(null);

        try {
            const acceptedPathwayId = selectedPathwayId;
            setSelectedPathwayId(acceptedPathwayId);
            await supabase
                .from('mind_coach_journeys')
                .update({ active: false })
                .eq('id', journey.id);

            const phasesForJourney =
                dbPhases && dbPhases.length > 0
                    ? dbPhases.map((r) => ({
                          phaseNumber: r.phase_number,
                          title: r.phase_name,
                          goal: r.phase_description || '',
                          sessions: Math.max(1, templatesByPhase.get(r.phase_number)?.length ?? 3),
                      }))
                    : playbook.phases.map((p) => ({
                          phaseNumber: undefined,
                          title: p.name,
                          goal: p.goal,
                          sessions: p.sessions,
                      }));

            const customPhases: JourneyPhase[] = phasesForJourney.map((p, i) => ({
                phase_number: Number.isFinite(p.phaseNumber) ? Number(p.phaseNumber) : i + 1,
                title: p.title,
                goal: p.goal,
                sessions: (() => {
                    const phaseNumber = Number.isFinite(p.phaseNumber) ? Number(p.phaseNumber) : i + 1;
                    const phaseTemplates = templatesByPhase.get(phaseNumber) ?? [];
                    if (phaseTemplates.length > 0) {
                        return phaseTemplates.map((tpl) => ({
                            session_number: tpl.session_order,
                            topic: tpl.title,
                            title: tpl.title,
                            objective: tpl.goal,
                            description: tpl.description,
                            success_signal: `Completion score at or above ${
                                tpl.min_completion_score != null ? Math.round(tpl.min_completion_score * 100) : 70
                            }%.`,
                            fallback_strategy: tpl.fallback_strategy,
                        }));
                    }
                    return Array.from({ length: p.sessions }, (_, si) => ({
                        session_number: si + 1,
                        topic: `Session ${si + 1}`,
                        description: p.goal,
                    }));
                })(),
            }));

            const { data: routeData, error: err } = await supabase
                .from('mind_coach_journeys')
                .insert({
                    profile_id: profile.id,
                    pathway: acceptedPathwayId,
                    title: planTitle,
                    phases: customPhases,
                    current_phase: 1,
                    current_phase_index: 0,
                    sessions_completed: 0,
                    active: true,
                    version: 1,
                })
                .select()
                .single();

            if (err) throw err;

            const templateRowsForJourney =
                (sessionTemplates ?? [])
                    .map((tpl) => ({
                        journey_id: routeData.id,
                        profile_id: profile.id,
                        pathway_name: selectedPathwayId,
                        session_template_id: tpl.id,
                        phase_number: tpl.phase_number,
                        session_order: tpl.session_order,
                        status: tpl.phase_number === 1 && tpl.session_order === 1 ? 'in_progress' : 'planned',
                        attempt_count: 1,
                        source: 'template',
                        generated_title: tpl.title,
                        generated_goal: tpl.goal,
                        generated_description: tpl.description,
                        activated_at: tpl.phase_number === 1 && tpl.session_order === 1 ? new Date().toISOString() : null,
                    }));

            if (templateRowsForJourney.length > 0) {
                await supabase.from('mind_coach_journey_sessions').insert(templateRowsForJourney);
            }

            const firstPhaseTemplates = (sessionTemplates ?? []).filter(
                (tpl) => Number(tpl.phase_number) === 1,
            );
            const firstSessionTemplate = firstPhaseTemplates.sort(
                (a, b) => Number(a.session_order) - Number(b.session_order),
            )[0];
            const phaseOneTitle =
                customPhases.find((phase) => Number(phase.phase_number) === 1)?.title ??
                displayPhases[0]?.name ??
                'Engagement & Rapport';
            const toolsNow = (UNLOCK_MAP[1] ?? []).map((key) => FEATURE_LABELS[key] ?? key);
            const nextUnlocks = (UNLOCK_MAP[2] ?? [])
                .filter((key) => !(UNLOCK_MAP[1] ?? []).includes(key))
                .map((key) => FEATURE_LABELS[key] ?? key);
            setPostAcceptDetails({
                pathwayName: planTitle,
                activePhaseTitle: phaseOneTitle,
                nextSessionTitle: firstSessionTemplate?.title ?? 'Session 1',
                toolsNow,
                nextUnlocks,
            });

            if (activeSession) {
                await supabase
                    .from('mind_coach_sessions')
                    .update({ session_state: 'completed', ended_at: new Date().toISOString() })
                    .eq('id', activeSession.id);
                updateActiveSession({ session_state: 'completed' });
            }

            setJourney(routeData as any);
            setShowPostAccept(true);
        } catch (err) {
            console.error('Failed to accept proposal', err);
            setAcceptError('We could not save your new pathway. Check your connection and try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end md:justify-center md:items-center md:p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-[#2C2A26]/10 backdrop-blur-[6px]"
                onClick={onClose}
                aria-hidden
            />
            <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                className="relative w-full max-w-lg max-h-[88vh] md:max-h-[85vh] rounded-t-2xl md:rounded-2xl zen-glass-heavy shadow-2xl overflow-hidden flex flex-col border border-white/60"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Zen Atmospheric Aura */}
                <div className="absolute inset-0 pointer-events-none opacity-[0.3] z-0">
                    <div className="absolute top-[-10%] right-[-10%] w-[100%] h-[30%] bg-[#E8F3E9] blur-[60px]" />
                </div>
                <div className="flex justify-center pt-2 pb-1 md:hidden shrink-0">
                    <div className="w-10 h-1 rounded-full bg-[#2C2A26]/15" aria-hidden />
                </div>

                <button
                    type="button"
                    onClick={onClose}
                    disabled={saving}
                    className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-white/90 border border-[#E8E4DE] flex items-center justify-center text-[#2C2A26]/50 hover:text-[#2C2A26] shadow-sm transition-colors disabled:opacity-40"
                    aria-label="Close"
                >
                    <X size={18} />
                </button>

                <div className="relative h-24 shrink-0 bg-[#E8E4DE]">
                    <img
                        src={MIND_COACH_PROPOSAL_DRAWER_IMAGE}
                        alt=""
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#FAFAF7] via-transparent to-transparent pointer-events-none" />
                </div>

                <div className="px-5 pt-2 pb-4 bg-[#FAFAF7] shrink-0 -mt-6 relative">
                    <p className="text-[11px] font-semibold text-[#6B8F71] uppercase tracking-wide mb-1.5">Suggested pathway</p>
                    <h2 className="text-xl font-semibold text-[#2C2A26] leading-snug mb-2">
                        {planTitle}
                    </h2>
                    <p className="text-sm text-[#2C2A26]/70 leading-relaxed">
                        Based on what you&apos;ve shared about{' '}
                        <span className="font-medium text-[#2C2A26]">
                            {activeSession?.dynamic_theme || 'your experiences'}
                        </span>
                        , here is a gentle, structured path we could take together—only if it feels right for you.
                    </p>
                </div>

                <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-3 min-h-0 bg-[#FAF9F7]">
                    <div className="rounded-xl border border-[#E8E4DE] bg-white p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#2C2A26]/45">
                            5-phase journey roadmap
                        </p>
                        <div className="mt-2 flex items-center gap-1.5">
                            {Array.from({ length: 5 }, (_, idx) => {
                                const phaseNum = idx + 1;
                                const isEngagement = phaseNum === 1;
                                return (
                                    <React.Fragment key={`proposal-phase-preview-${phaseNum}`}>
                                        <span
                                            className={`h-6 min-w-6 px-1 rounded-full border text-[10px] font-semibold flex items-center justify-center ${
                                                isEngagement
                                                    ? 'bg-[#6B8F71] border-[#6B8F71] text-white'
                                                    : 'bg-[#F5F0EB]/70 border-[#E8E4DE] text-[#2C2A26]/35'
                                            }`}
                                        >
                                            {phaseNum}
                                        </span>
                                        {phaseNum < 5 && (
                                            <span className="h-[2px] flex-1 rounded-full bg-[#E8E4DE]/70" />
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>
                        <p className="mt-2 text-[11px] text-[#2C2A26]/55 leading-relaxed">
                            You are currently in Phase 1 (Engagement & Rapport). This pathway will shape Phases 2-5.
                        </p>
                    </div>
                    <p className="text-[11px] font-semibold text-[#2C2A26]/45 uppercase tracking-wide">
                        Pathway phases (2-5)
                    </p>
                    <div className="space-y-2.5">
                        {displayPhases.map((phase, i) => (
                            <div
                                key={i}
                                className="bg-white border border-[#E8E4DE] p-3.5 rounded-2xl flex gap-3"
                            >
                                <div className="shrink-0 w-7 h-7 rounded-full bg-[#6B8F71]/12 flex items-center justify-center text-xs font-bold text-[#6B8F71]">
                                    {i + 1}
                                </div>
                                <div>
                                    <h4 className="text-sm font-semibold text-[#2C2A26] mb-0.5">{phase.name}</h4>
                                    <p className="text-xs text-[#2C2A26]/60 leading-relaxed">{phase.goal}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-white border-t border-[#E8E4DE] shrink-0 space-y-2.5">
                    {acceptError && (
                        <p className="text-xs text-center text-red-700/90 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                            {acceptError}
                        </p>
                    )}
                    {showPostAccept ? (
                        <>
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4 }}
                                className="relative overflow-hidden rounded-2xl border border-[#DDEBDD] bg-gradient-to-br from-[#F3FAF3] via-white to-[#F7FBF7] px-4 py-4"
                            >
                                <motion.div
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1.12, opacity: 0 }}
                                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                                    className="absolute left-1/2 top-6 h-12 w-12 -translate-x-1/2 rounded-full bg-[#6B8F71]/20"
                                />
                                <div className="relative flex flex-col items-center text-center">
                                    <motion.div
                                        initial={{ scale: 0.9, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ duration: 0.45, delay: 0.05 }}
                                        className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#6B8F71] text-white shadow-sm"
                                    >
                                        ✓
                                    </motion.div>
                                    <p className="text-sm font-semibold text-[#2C2A26]">
                                        You&apos;re on your way
                                    </p>
                                    <p className="mt-1 text-xs leading-relaxed text-[#2C2A26]/65">
                                        Beautiful step. Your pathway is now active, and we&apos;ll walk it one calm session at a time.
                                    </p>
                                </div>
                            </motion.div>
                            <p className="text-sm text-[#2C2A26]/75 leading-relaxed text-center px-1">
                                Your new pathway is active. Upcoming sessions will follow these phases; journal and tools
                                unlock as you progress through each phase on Home.
                            </p>
                            {postAcceptDetails && (
                                <div className="rounded-2xl border border-[#E8E4DE] bg-[#FAF9F7] p-3 text-left space-y-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#2C2A26]/45">
                                        What changes now
                                    </p>
                                    <p className="text-xs text-[#2C2A26]/75">
                                        <span className="font-medium text-[#2C2A26]">Pathway:</span> {postAcceptDetails.pathwayName}
                                    </p>
                                    <p className="text-xs text-[#2C2A26]/75">
                                        <span className="font-medium text-[#2C2A26]">Active phase:</span>{' '}
                                        {postAcceptDetails.activePhaseTitle} •{' '}
                                        <span className="font-medium text-[#2C2A26]">Next session:</span>{' '}
                                        {postAcceptDetails.nextSessionTitle}
                                    </p>
                                    <p className="text-xs text-[#2C2A26]/75">
                                        <span className="font-medium text-[#2C2A26]">Tools available now:</span>{' '}
                                        {postAcceptDetails.toolsNow.join(', ')}
                                    </p>
                                    {postAcceptDetails.nextUnlocks.length > 0 && (
                                        <p className="text-xs text-[#2C2A26]/60">
                                            Next unlocks (Phase 2): {postAcceptDetails.nextUnlocks.join(', ')}
                                        </p>
                                    )}
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={() => onAccept()}
                                className="w-full py-3.5 bg-[#2C2A26] text-white text-sm font-semibold rounded-2xl hover:bg-[#2C2A26]/90 transition-colors shadow-sm"
                            >
                                Continue
                            </button>
                        </>
                    ) : (
                        <>
                            <p className="text-[11px] text-center text-[#2C2A26]/45 leading-snug px-1">
                                You can keep chatting for as long as you need—or step into this pathway when you feel ready.
                            </p>
                            <button
                                onClick={handleAcceptProposal}
                                disabled={saving}
                                className="w-full py-3.5 bg-[#6B8F71] text-white text-sm font-semibold rounded-2xl hover:bg-[#5A7D60] transition-colors disabled:opacity-50 shadow-sm"
                            >
                                {saving ? 'Preparing your plan…' : 'Follow this pathway'}
                            </button>
                            <button
                                onClick={onClose}
                                disabled={saving}
                                className="w-full py-3 text-sm font-medium text-[#2C2A26]/70 rounded-2xl hover:bg-[#F5F0EB] transition-colors disabled:opacity-50 border border-transparent hover:border-[#E8E4DE]"
                            >
                                I&apos;d like to talk more first
                            </button>
                        </>
                    )}
                </div>
            </motion.div>
        </div>
    );
};
