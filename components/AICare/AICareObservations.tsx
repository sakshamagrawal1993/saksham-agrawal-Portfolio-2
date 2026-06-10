import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { ChevronLeft, Loader2, AlertCircle, ShieldAlert, CheckCircle2 } from 'lucide-react';

export const AICareObservations: React.FC = () => {
    const navigate = useNavigate();
    const [diagnoses, setDiagnoses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDiagnosis = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                navigate('/login?redirect=/ai-care');
                return;
            }

            // Check if there is a specific session ID in URL
            const urlParams = new URLSearchParams(window.location.search);
            const specificSessionId = urlParams.get('sessionId');

            let activeSessionId = specificSessionId;

            if (!activeSessionId) {
                // Get latest completed session if no specific session is requested
                const { data: activeSession } = await supabase
                    .from('jivi_chat_sessions')
                    .select('id')
                    .eq('user_id', session.user.id)
                    .order('updated_at', { ascending: false })
                    .limit(1)
                    .single();
                
                if (activeSession) {
                    activeSessionId = activeSession.id;
                }
            }

            if (activeSessionId) {
                const { data: diagData } = await supabase
                    .from('jivi_diagnoses')
                    .select('*')
                    .eq('session_id', activeSessionId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (diagData && diagData.diagnosis_data) {
                    // Normalize data structure if needed
                    let list = Array.isArray(diagData.diagnosis_data) 
                        ? diagData.diagnosis_data 
                        : diagData.diagnosis_data.diagnoses || [];
                    
                    // Sort by confidence descending and take top 3
                    list.sort((a: any, b: any) => {
                        const scoreA = parseInt(String(a.confidence).replace('%', '')) || 0;
                        const scoreB = parseInt(String(b.confidence).replace('%', '')) || 0;
                        return scoreB - scoreA;
                    });
                    
                    setDiagnoses(list.slice(0, 3));
                }
            }
            setLoading(false);
        };
        fetchDiagnosis();
    }, [navigate]);

    const getLikelihoodInfo = (scoreStr: string | number) => {
        const score = typeof scoreStr === 'string' ? parseInt(scoreStr.replace('%', '')) : scoreStr;
        if (isNaN(score)) {
            return {
                label: 'Likelihood - Low',
                badgeClass: 'bg-gray-50 text-gray-600 border-gray-200/60',
                barClass: 'before:bg-gray-300'
            };
        }
        if (score >= 80) {
            return {
                label: 'Likelihood - High',
                badgeClass: 'bg-rose-50 text-rose-700 border-rose-200/60',
                barClass: 'before:bg-rose-500'
            };
        }
        if (score >= 60) {
            return {
                label: 'Likelihood - Medium',
                badgeClass: 'bg-amber-50 text-amber-700 border-amber-200/60',
                barClass: 'before:bg-amber-500'
            };
        }
        return {
            label: 'Likelihood - Low',
            badgeClass: 'bg-slate-50 text-slate-600 border-slate-200/60',
            barClass: 'before:bg-slate-400'
        };
    };

    return (
        <div className="min-h-screen bg-[#FDFBF9] font-sans text-gray-900 flex flex-col antialiased">
            {/* Sticky Header */}
            <header className="border-b border-gray-100 px-6 py-5 flex items-center bg-white/85 backdrop-blur-md sticky top-0 z-10 shadow-sm shadow-gray-100/10">
                <button 
                    onClick={() => navigate('/ai-care/chat')} 
                    className="mr-4 p-2 rounded-full hover:bg-gray-50 transition-colors text-gray-600 hover:text-gray-900"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <h1 className="text-xl font-bold tracking-tight text-gray-950">Diagnosis Summary</h1>
            </header>

            <div className="flex-1 max-w-3xl w-full mx-auto px-6 py-8 flex flex-col">
                {/* Visual Header Banner */}
                <div className="bg-gradient-to-br from-orange-500 via-orange-600 to-pink-600 text-white rounded-3xl p-6 mb-8 shadow-lg shadow-orange-500/10 relative overflow-hidden animate-fade-in">
                    <div className="absolute top-0 right-0 w-36 h-36 bg-white/10 rounded-full blur-2xl -mr-6 -mt-6"></div>
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-pink-500/20 rounded-full blur-xl -ml-4 -mb-4"></div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-3 bg-white/15 px-3 py-1 rounded-full w-max text-xs font-semibold uppercase tracking-wider backdrop-blur-sm">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Screening Complete
                        </div>
                        <h2 className="text-2xl font-extrabold tracking-tight mb-2">Observations Summary</h2>
                        <p className="text-sm text-orange-50/90 leading-relaxed">
                            Based on your symptoms and clinical interaction, our agent has generated these potential conditions. Please consult a qualified professional for formal medical advice.
                        </p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
                        <Loader2 className="w-10 h-10 animate-spin text-orange-500" />
                        <span className="text-sm font-medium text-gray-400">Analyzing clinical results...</span>
                    </div>
                ) : diagnoses.length > 0 ? (
                    <div className="space-y-6">
                        {diagnoses.map((diag, idx) => {
                            const likelihood = getLikelihoodInfo(diag.confidence);
                            return (
                                <div 
                                    key={idx} 
                                    className={`relative bg-white border border-gray-200/70 rounded-3xl p-6 shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md hover:border-orange-200/50 hover:-translate-y-1 pl-8 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 ${likelihood.barClass} animate-fade-in-up`}
                                    style={{ animationDelay: `${idx * 150}ms`, animationFillMode: 'both' }}
                                >
                                    {/* Header Row */}
                                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
                                        <h3 className="font-extrabold text-xl text-gray-900 leading-snug">{diag.full_name || diag.name}</h3>
                                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                                            {diag.emergency && (
                                                <span className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border flex items-center gap-1 ${
                                                    diag.emergency.toLowerCase().includes('high') 
                                                        ? 'bg-red-50 text-red-700 border-red-100/60' 
                                                        : diag.emergency.toLowerCase().includes('medium')
                                                            ? 'bg-amber-50 text-amber-700 border-amber-100/60'
                                                            : 'bg-blue-50 text-blue-700 border-blue-100/60'
                                                }`}>
                                                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                                                    Emergency: {diag.emergency.charAt(0).toUpperCase() + diag.emergency.slice(1).toLowerCase()}
                                                </span>
                                            )}
                                            {diag.confidence && (
                                                <span className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${likelihood.badgeClass}`}>
                                                    {likelihood.label}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Description */}
                                    <div className="mb-5">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Condition Description</h4>
                                        <p className="text-[14px] text-gray-600 leading-relaxed">{diag.description}</p>
                                    </div>
                                    
                                    {/* Clinical Reason */}
                                    {diag.reason && (
                                        <div className="bg-orange-50/35 border border-orange-100/40 rounded-2xl p-4 mb-5 flex gap-3 items-start">
                                            <AlertCircle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                                            <div>
                                                <h4 className="text-xs font-bold uppercase tracking-wider text-orange-950 mb-1">Why this was detected</h4>
                                                <p className="text-[13px] text-orange-850/95 leading-relaxed font-semibold">{diag.reason}</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Supporting Evidence Tags */}
                                    {(diag.supporting_evidence && diag.supporting_evidence.length > 0) && (
                                        <div className="pt-3 border-t border-gray-100 flex flex-wrap gap-2">
                                            {diag.supporting_evidence.map((tag: string, i: number) => (
                                                <span key={i} className="bg-gray-50 border border-gray-100 hover:border-gray-200 text-gray-500 text-xs px-3 py-1.5 rounded-full font-medium transition-colors duration-250 flex items-center gap-1.5">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0"></span>
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center py-20 text-center text-gray-500">
                        <AlertCircle className="w-12 h-12 text-gray-300 mb-3" />
                        <p className="font-semibold text-lg text-gray-700 mb-1">No observations found</p>
                        <p className="text-sm text-gray-400 max-w-xs">There are no completed screening reports available for this session.</p>
                    </div>
                )}
            </div>
            
            {/* Sticky Action Footer */}
            <div className="p-6 mt-auto sticky bottom-0 bg-[#FDFBF9] border-t border-gray-100 shadow-md shadow-gray-100/10">
                 <button 
                     onClick={() => navigate('/ai-care/chat')} 
                     className="w-full bg-gradient-to-r from-orange-500 to-pink-600 hover:from-orange-600 hover:to-pink-700 text-white py-4 rounded-full font-semibold shadow-lg shadow-orange-500/10 hover:shadow-orange-500/20 hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-2"
                 >
                     Start New Assessment
                 </button>
            </div>
        </div>
    );
};
