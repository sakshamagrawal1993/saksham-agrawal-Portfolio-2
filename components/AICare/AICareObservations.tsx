import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { ChevronLeft, Loader2, AlertCircle } from 'lucide-react';

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

    const getConfidenceColor = (scoreStr: string | number) => {
        const score = typeof scoreStr === 'string' ? parseInt(scoreStr) : scoreStr;
        if (isNaN(score)) return 'bg-gray-100 text-gray-800';
        if (score >= 90) return 'bg-orange-100 text-orange-800';
        if (score >= 60) return 'bg-blue-100 text-blue-800';
        return 'bg-gray-100 text-gray-800';
    };

    return (
        <div className="min-h-screen bg-[#FDFBF7] font-sans text-gray-900 flex flex-col">
            {/* Header */}
            <header className="border-b border-gray-100 px-4 py-4 flex items-center bg-white sticky top-0 z-10">
                <button onClick={() => navigate('/ai-care/chat')} className="mr-3 p-1">
                    <ChevronLeft className="w-6 h-6" />
                </button>
                <h1 className="text-xl font-semibold">Observations</h1>
            </header>

            <div className="p-4">
                <h2 className="text-xl font-semibold mb-4 text-gray-800">Likely issues</h2>

                {loading ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                    </div>
                ) : diagnoses.length > 0 ? (
                    <div className="space-y-4">
                        {diagnoses.map((diag, idx) => (
                            <div key={idx} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                                <div className="flex justify-between items-start mb-3">
                                    <h3 className="font-semibold text-lg text-gray-900">{diag.full_name || diag.name}</h3>
                                    {diag.confidence && (
                                        <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${getConfidenceColor(diag.confidence)}`}>
                                            {typeof diag.confidence === 'number' ? `${diag.confidence}%` : diag.confidence}
                                        </span>
                                    )}
                                </div>
                                <div className="mb-4">
                                    <h4 className="text-sm font-semibold text-gray-800 mb-1">What this means</h4>
                                    <p className="text-sm text-gray-600">{diag.description}</p>
                                </div>
                                
                                {diag.reason && (
                                    <div className="bg-orange-50 text-orange-900 text-sm p-4 rounded-xl mb-4 border border-orange-100">
                                        <div className="flex gap-2 items-start mb-1">
                                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-orange-600" />
                                            <h4 className="font-semibold text-orange-800">Why this was shown to you</h4>
                                        </div>
                                        <p className="ml-6 text-orange-800/90">{diag.reason}</p>
                                    </div>
                                )}

                                <div className="flex flex-wrap gap-2 mt-4">
                                    {(diag.supporting_evidence || []).slice(0, 2).map((tag: string, i: number) => (
                                        <span key={i} className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-md">
                                            {tag}
                                        </span>
                                    ))}
                                    {diag.emergency && (
                                        <span className={`text-xs px-2 py-1 rounded-md font-medium ${
                                            diag.emergency.toLowerCase().includes('high') 
                                                ? 'bg-red-100 text-red-700' 
                                                : 'bg-yellow-100 text-yellow-700'
                                        }`}>
                                            Emergency: {diag.emergency}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-10 text-gray-500">
                        <p>No diagnosis results found for this session.</p>
                    </div>
                )}
            </div>
            
            <div className="p-4 mt-auto sticky bottom-0 bg-[#FDFBF7] border-t border-gray-100">
                 <button onClick={() => navigate('/ai-care/chat')} className="w-full bg-white border border-gray-200 py-4 rounded-full font-semibold text-gray-700 hover:bg-gray-50 shadow-sm transition-colors">
                     Back to Chat
                 </button>
            </div>
        </div>
    );
};
