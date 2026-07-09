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
                badgeClass: 'bg-[#F5F2EB] text-[#A84A00] border-[#EBE7DE]',
                barClass: 'before:bg-[#A84A00]'
            };
        }
        if (score >= 60) {
            return {
                label: 'Likelihood - Medium',
                badgeClass: 'bg-[#F5F2EB] text-[#D97706] border-[#EBE7DE]',
                barClass: 'before:bg-[#D97706]'
            };
        }
        return {
            label: 'Likelihood - Low',
            badgeClass: 'bg-[#F5F2EB] text-[#A8A29E] border-[#EBE7DE]',
            barClass: 'before:bg-[#A8A29E]'
        };
    };

    return (
        <div className="min-h-screen bg-[#FAF9F6] font-sans text-[#2C2A26] flex flex-col antialiased">
            {/* Sticky Header */}
            <header className="sticky top-0 z-50 bg-[#F5F2EB]/90 backdrop-blur-md border-b flex items-center justify-between px-6 py-4 border-[#EBE7DE]">
                <div className="flex items-center gap-2">
                    <button onClick={() => navigate('/portfolio')} className="mr-2 p-1">
                        <ChevronLeft className="w-5 h-5 text-[#A8A29E] hover:text-[#2C2A26] transition-colors" />
                    </button>
                    <div className="bg-[#2C2A26] rounded-sm text-[#F5F2EB] font-serif w-8 h-8 flex items-center justify-center font-bold">
                        J
                    </div>
                    <span className="font-serif text-lg font-bold tracking-tight text-[#2C2A26]">Dr. Jivi</span>
                </div>

                <div className="flex items-center gap-6">
                    <button
                        onClick={() => navigate('/portfolio')}
                        className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#A8A29E] hover:text-[#2C2A26] transition-colors hidden sm:block"
                    >
                        BACK TO PORTFOLIO
                    </button>
                </div>
            </header>

            <div className="flex-1 max-w-3xl w-full mx-auto px-6 py-8 flex flex-col">
                {/* Visual Header Banner */}
                <div className="bg-white border border-[#EBE7DE] border-l-4 border-l-[#A84A00] rounded-xl p-6 mb-8 shadow-sm relative overflow-hidden animate-fade-in-up">
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-3 bg-[#F5F2EB] text-[#2C2A26] px-3 py-1 rounded-sm w-max text-[10px] font-bold uppercase tracking-widest border border-[#EBE7DE]">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#A84A00]" /> Screening Complete
                        </div>
                        <h2 className="text-2xl font-serif font-bold tracking-tight mb-2 text-[#2C2A26]">Observations Summary</h2>
                        <p className="text-sm text-[#A8A29E] leading-relaxed">
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
                                    className={`relative bg-white border border-[#EBE7DE] rounded-xl p-6 shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md pl-8 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 ${likelihood.barClass} animate-fade-in-up`}
                                    style={{ animationDelay: `${idx * 150}ms`, animationFillMode: 'both' }}
                                >
                                    {/* Header Row */}
                                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
                                        <h3 className="font-serif font-bold text-xl text-[#2C2A26] leading-snug">{diag.full_name || diag.name}</h3>
                                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                                            {diag.emergency && (
                                                <span className={`text-[10px] font-bold uppercase tracking-[0.1em] px-2.5 py-1 rounded-sm border flex items-center gap-1 ${
                                                    diag.emergency.toLowerCase().includes('high') 
                                                        ? 'bg-rose-50 text-rose-700 border-rose-200' 
                                                        : diag.emergency.toLowerCase().includes('medium')
                                                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                            : 'bg-[#F5F2EB] text-[#2C2A26] border-[#EBE7DE]'
                                                }`}>
                                                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                                                    Emergency: {diag.emergency.charAt(0).toUpperCase() + diag.emergency.slice(1).toLowerCase()}
                                                </span>
                                            )}
                                            {diag.confidence && (
                                                <span className={`text-[10px] font-bold uppercase tracking-[0.1em] px-2.5 py-1 rounded-sm border ${likelihood.badgeClass}`}>
                                                    {likelihood.label}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Description */}
                                    <div className="mb-5">
                                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#A8A29E] mb-1">Condition Description</h4>
                                        <p className="text-[14px] text-[#2C2A26] leading-relaxed">{diag.description}</p>
                                    </div>
                                    
                                    {/* Clinical Reason */}
                                    {diag.reason && (
                                        <div className="bg-[#F5F2EB] border border-[#EBE7DE] rounded-lg p-4 mb-5 flex gap-3 items-start">
                                            <AlertCircle className="w-5 h-5 text-[#A84A00] shrink-0 mt-0.5" />
                                            <div>
                                                <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#A8A29E] mb-1">Why this was detected</h4>
                                                <p className="text-[13px] text-[#2C2A26] leading-relaxed font-medium">{diag.reason}</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Supporting Evidence Tags */}
                                    {(diag.supporting_evidence && diag.supporting_evidence.length > 0) && (
                                        <div className="pt-3 border-t border-[#EBE7DE] flex flex-wrap gap-2">
                                            {diag.supporting_evidence.map((tag: string, i: number) => (
                                                <span key={i} className="bg-white border border-[#EBE7DE] text-[#5D5A53] text-[11px] px-3 py-1.5 rounded-sm font-medium flex items-center gap-1.5">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-[#A8A29E] shrink-0"></span>
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
                     onClick={() => navigate('/ai-care/chat?new=1')} 
                     className="w-full bg-gradient-to-r from-orange-500 to-pink-600 hover:from-orange-600 hover:to-pink-700 text-white py-4 rounded-full font-semibold shadow-lg shadow-orange-500/10 hover:shadow-orange-500/20 hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-2"
                 >
                     Start New Assessment
                 </button>
            </div>
        </div>
    );
};
