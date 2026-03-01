import React, { useState, useCallback } from 'react';
import { useHealthTwinStore, WellnessProgram } from '../../store/healthTwin';
import { supabase } from '../../lib/supabaseClient';
import { Heart, Dumbbell, Moon, Utensils, Brain, Shield, Eye, Wind, Bone, Droplet, ChevronDown, ChevronUp, RefreshCw, Target, Calendar, TrendingUp, Loader2 } from 'lucide-react';

// ─── Icon Mapping ─────────────────────────────────────────────
const ICON_MAP: Record<string, React.FC<any>> = {
    heart: Heart, dumbbell: Dumbbell, moon: Moon, utensils: Utensils,
    brain: Brain, shield: Shield, eye: Eye, lungs: Wind, bone: Bone, droplet: Droplet,
};

const PRIORITY_STYLES = {
    high: { bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-100 text-red-700', accent: 'bg-red-500' },
    medium: { bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700', accent: 'bg-amber-500' },
    low: { bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700', accent: 'bg-emerald-500' },
};

// ─── Single Program Card ──────────────────────────────────────
const ProgramCard: React.FC<{ program: WellnessProgram }> = ({ program }) => {
    const [expanded, setExpanded] = useState(false);
    const IconComp = ICON_MAP[program.icon] || Heart;
    const styles = PRIORITY_STYLES[program.priority] || PRIORITY_STYLES.medium;

    return (
        <div className={`rounded-xl border ${styles.border} overflow-hidden shadow-sm transition-all duration-300 ${expanded ? 'ring-1 ring-[#A84A00]/20' : ''}`}>
            {/* Accent bar */}
            <div className={`h-1 ${styles.accent}`} />

            {/* Header (always visible) */}
            <div
                className="p-4 cursor-pointer hover:bg-[#F5F2EB]/30 transition-colors"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`p-2 rounded-lg ${styles.bg} flex-shrink-0`}>
                            <IconComp size={18} className="text-[#A84A00]" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-sm text-[#2C2A26] leading-tight">{program.title}</h4>
                            <div className="flex items-center gap-2 mt-1.5">
                                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${styles.badge}`}>
                                    {program.priority}
                                </span>
                                <span className="text-[10px] text-[#A8A29E]">
                                    {program.duration}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button className="text-[#A8A29E] hover:text-[#A84A00] transition-colors flex-shrink-0 mt-0.5">
                        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                </div>

                {/* Reason (always visible, truncated when collapsed) */}
                <p className={`text-xs text-[#5D5A53] mt-3 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
                    {program.reason}
                </p>
            </div>

            {/* Expandable content */}
            <div className={`overflow-hidden transition-all duration-300 ${expanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="px-4 pb-4 space-y-4 border-t border-[#EBE7DE]">

                    {/* Data Connections */}
                    {program.data_connections && program.data_connections.length > 0 && (
                        <div className="pt-3">
                            <h5 className="text-[10px] font-bold uppercase tracking-wider text-[#A8A29E] mb-2 flex items-center gap-1.5">
                                <Target size={11} />
                                Data Connections
                            </h5>
                            <div className="space-y-2">
                                {program.data_connections.map((dc, i) => (
                                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-[#F5F2EB]/60">
                                        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${['bg-[#A84A00]', 'bg-[#D97706]', 'bg-[#059669]', 'bg-[#2563EB]'][i % 4]}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline justify-between gap-2">
                                                <span className="text-xs font-medium text-[#2C2A26]">{dc.metric}</span>
                                                <span className="text-xs font-bold text-[#A84A00] flex-shrink-0">{dc.value}</span>
                                            </div>
                                            <p className="text-[10px] text-[#5D5A53] mt-0.5">{dc.insight}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Weekly Plan */}
                    {program.weekly_plan && program.weekly_plan.length > 0 && (
                        <div>
                            <h5 className="text-[10px] font-bold uppercase tracking-wider text-[#A8A29E] mb-2 flex items-center gap-1.5">
                                <Calendar size={11} />
                                Weekly Plan
                            </h5>
                            <div className="space-y-1.5">
                                {program.weekly_plan.map((wp, i) => (
                                    <div key={i} className="flex items-start gap-3 p-2 rounded-lg bg-white border border-[#EBE7DE]">
                                        <span className="text-[10px] font-bold text-[#A84A00] bg-[#A84A00]/10 px-2 py-1 rounded flex-shrink-0 min-w-[70px] text-center">
                                            {wp.day}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-[#2C2A26] font-medium">{wp.activity}</p>
                                            {(wp.target_hr || wp.goal) && (
                                                <p className="text-[10px] text-[#A8A29E] mt-0.5">
                                                    {wp.target_hr && wp.target_hr !== '' && `HR: ${wp.target_hr}`}
                                                    {wp.target_hr && wp.target_hr !== '' && wp.goal && wp.goal !== '' && ' · '}
                                                    {wp.goal && wp.goal !== '' && wp.goal}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Expected Outcomes */}
                    {program.expected_outcomes && program.expected_outcomes.length > 0 && (
                        <div>
                            <h5 className="text-[10px] font-bold uppercase tracking-wider text-[#A8A29E] mb-2 flex items-center gap-1.5">
                                <TrendingUp size={11} />
                                Expected Outcomes
                            </h5>
                            <div className="space-y-1.5">
                                {program.expected_outcomes.map((outcome, i) => (
                                    <div key={i} className="flex items-start gap-2">
                                        <span className="text-[10px] text-emerald-600 mt-0.5">✓</span>
                                        <p className="text-xs text-[#5D5A53] leading-relaxed">{outcome}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── Skeleton Loader ──────────────────────────────────────────
const ProgramSkeleton: React.FC = () => (
    <div className="rounded-xl border border-[#EBE7DE] overflow-hidden shadow-sm animate-pulse">
        <div className="h-1 bg-[#EBE7DE]" />
        <div className="p-4 space-y-3">
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-[#EBE7DE] rounded-lg" />
                <div className="flex-1">
                    <div className="h-3.5 bg-[#EBE7DE] rounded w-3/4" />
                    <div className="h-2.5 bg-[#EBE7DE] rounded w-1/3 mt-2" />
                </div>
            </div>
            <div className="h-2.5 bg-[#EBE7DE] rounded w-full" />
            <div className="h-2.5 bg-[#EBE7DE] rounded w-5/6" />
        </div>
    </div>
);

// ─── Main Component ───────────────────────────────────────────
export const WellnessPrograms: React.FC = () => {
    const { wellnessPrograms, isLoadingWellness, setWellnessPrograms, setIsLoadingWellness, activeTwinId } = useHealthTwinStore();

    const handleRefresh = useCallback(async () => {
        if (!activeTwinId || isLoadingWellness) return;
        setIsLoadingWellness(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-wellness`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({ twin_id: activeTwinId }),
            });

            if (res.ok) {
                const data = await res.json();
                setWellnessPrograms(data.programs || []);
            }
        } catch (err) {
            console.error('Failed to generate wellness programs:', err);
        } finally {
            setIsLoadingWellness(false);
        }
    }, [activeTwinId, isLoadingWellness, setWellnessPrograms, setIsLoadingWellness]);

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-[#A8A29E]">
                    Wellness Programs for You
                </h3>
                <button
                    onClick={handleRefresh}
                    disabled={isLoadingWellness}
                    className="text-[#A8A29E] hover:text-[#A84A00] disabled:opacity-40 transition-colors p-1 rounded-lg hover:bg-[#F5F2EB]"
                    title="Regenerate programs"
                >
                    {isLoadingWellness ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                </button>
            </div>

            <div className="space-y-3">
                {isLoadingWellness && wellnessPrograms.length === 0 ? (
                    <>
                        <ProgramSkeleton />
                        <ProgramSkeleton />
                        <ProgramSkeleton />
                    </>
                ) : wellnessPrograms.length > 0 ? (
                    wellnessPrograms.map(program => (
                        <ProgramCard key={program.id} program={program} />
                    ))
                ) : (
                    <div className="text-center py-6">
                        <p className="text-xs text-[#A8A29E] mb-3">No wellness programs generated yet.</p>
                        <button
                            onClick={handleRefresh}
                            className="text-xs font-medium text-[#A84A00] hover:text-[#8A3D00] bg-[#A84A00]/10 hover:bg-[#A84A00]/20 px-4 py-2 rounded-lg transition-colors"
                        >
                            Generate Programs
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
