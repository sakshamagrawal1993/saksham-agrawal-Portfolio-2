import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import {
    ChevronLeft,
    Loader2,
    AlertCircle,
    ShieldAlert,
    CheckCircle2,
    Stethoscope,
    Sparkles,
    HeartPulse,
    ClipboardList,
    Phone,
} from 'lucide-react';

interface DiagnosisItem {
    rank?: number;
    full_name?: string;
    name?: string;
    common_name?: string;
    confidence?: string | number;
    reason?: string;
    description?: string;
    emergency?: string;
    supporting_evidence?: string[];
}

interface DoctorHandoff {
    recommended?: boolean;
    required?: boolean;
    reason?: string;
    cta?: string;
    specialty?: string;
}

interface ReportData {
    headline?: string;
    patient_summary?: string;
    differential_diagnosis?: DiagnosisItem[];
    diagnoses?: DiagnosisItem[];
    assessment_and_plan?: {
        assessment?: string;
        plan?: string[];
        self_care?: string[];
        red_flags_to_watch?: string[];
        when_to_seek_care?: string;
    };
    doctor_handoff?: DoctorHandoff;
    confidence_score?: number;
}

function parseReport(raw: unknown): {
    diagnoses: DiagnosisItem[];
    report: ReportData;
} {
    if (!raw) return { diagnoses: [], report: {} };
    if (Array.isArray(raw)) {
        return { diagnoses: raw as DiagnosisItem[], report: { differential_diagnosis: raw as DiagnosisItem[] } };
    }
    const report = raw as ReportData;
    const list = report.differential_diagnosis || report.diagnoses || [];
    return { diagnoses: list, report };
}

function confidenceNum(score: string | number | undefined): number {
    if (typeof score === 'number') return score;
    const m = String(score || '').match(/(\d{1,3})/);
    return m ? parseInt(m[1], 10) : 0;
}

function inferSpecialty(name: string): string {
    const n = name.toLowerCase();
    if (/headache|migraine|neuro|seizure|dizzy/.test(n)) return 'Neurology';
    if (/skin|rash|eczema|acne|dermat|stye|hordeolum|eyelid/.test(n)) return 'Dermatology / Ophthalmology';
    if (/heart|chest|cardiac|palpitation|hypertension/.test(n)) return 'Cardiology';
    if (/lung|asthma|copd|cough|breath|respiratory/.test(n)) return 'Pulmonology';
    if (/stomach|abdominal|gi|bowel|append|nausea|reflux/.test(n)) return 'Gastroenterology';
    if (/diabetes|thyroid|endocrine|hormone/.test(n)) return 'Endocrinology';
    if (/joint|muscle|back|msk|arthritis|sprain/.test(n)) return 'Orthopedics';
    if (/anxiety|depression|mental|mood/.test(n)) return 'Psychiatry';
    if (/urin|kidney|bladder|uti/.test(n)) return 'Urology';
    return 'Primary Care';
}

export const AICareObservations: React.FC = () => {
    const navigate = useNavigate();
    const [diagnoses, setDiagnoses] = useState<DiagnosisItem[]>([]);
    const [report, setReport] = useState<ReportData>({});
    const [profileLabel, setProfileLabel] = useState<string | null>(null);
    const [sessionStatus, setSessionStatus] = useState<string | null>(null);
    const [emergencyMessage, setEmergencyMessage] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [showDoctorModal, setShowDoctorModal] = useState(false);

    useEffect(() => {
        const fetchDiagnosis = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                navigate('/login?redirect=/ai-care');
                return;
            }

            const urlParams = new URLSearchParams(window.location.search);
            const specificSessionId = urlParams.get('sessionId');
            let activeSessionId = specificSessionId;

            if (!activeSessionId) {
                const { data: activeSession } = await supabase
                    .from('jivi_chat_sessions')
                    .select('id')
                    .eq('user_id', session.user.id)
                    .eq('status', 'completed')
                    .order('updated_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (activeSession) activeSessionId = activeSession.id;
            }

            if (activeSessionId) {
                setSessionId(activeSessionId);

                const [{ data: chatSession }, { data: profile }] = await Promise.all([
                    supabase
                        .from('jivi_chat_sessions')
                        .select('status')
                        .eq('id', activeSessionId)
                        .eq('user_id', session.user.id)
                        .maybeSingle(),
                    supabase
                        .from('jivi_profiles')
                        .select('name, age, gender, comorbidities')
                        .eq('user_id', session.user.id)
                        .limit(1)
                        .maybeSingle(),
                ]);

                if (profile) {
                    const comorb = (profile.comorbidities || []).slice(0, 2).join(', ');
                    setProfileLabel(
                        [profile.name, profile.age ? `${profile.age}y` : null, profile.gender, comorb || null]
                            .filter(Boolean)
                            .join(' · '),
                    );
                }

                if (chatSession?.status) setSessionStatus(chatSession.status);

                if (chatSession?.status === 'emergency_stopped') {
                    const { data: alert } = await supabase
                        .from('jivi_alerts')
                        .select('message')
                        .eq('session_id', activeSessionId)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    setEmergencyMessage(
                        alert?.message ||
                            'This evaluation was stopped for safety. Please seek emergency care if symptoms persist.',
                    );
                    setLoading(false);
                    return;
                }

                const { data: diagData } = await supabase
                    .from('jivi_diagnoses')
                    .select('*')
                    .eq('session_id', activeSessionId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (diagData?.diagnosis_data) {
                    const parsed = parseReport(diagData.diagnosis_data);
                    const sorted = [...parsed.diagnoses].sort(
                        (a, b) => confidenceNum(b.confidence) - confidenceNum(a.confidence),
                    );
                    setDiagnoses(sorted.slice(0, 3));
                    setReport({
                        ...parsed.report,
                        confidence_score: diagData.confidence_score ?? parsed.report.confidence_score,
                    });
                }
            }
            setLoading(false);
        };
        fetchDiagnosis();
    }, [navigate]);

    const topDx = diagnoses[0];
    const handoff = report.doctor_handoff || {};
    const specialty =
        handoff.specialty ||
        inferSpecialty(topDx?.full_name || topDx?.name || topDx?.common_name || '');
    const showDoctorCta = handoff.recommended !== false && diagnoses.length > 0;
    const plan = report.assessment_and_plan;

    const likelihoodStyle = (score: number) => {
        if (score >= 80) return { label: 'High likelihood', bar: 'bg-[#A84A00]', text: 'text-[#A84A00]' };
        if (score >= 60) return { label: 'Moderate likelihood', bar: 'bg-amber-500', text: 'text-amber-700' };
        return { label: 'Lower likelihood', bar: 'bg-stone-400', text: 'text-stone-600' };
    };

    return (
        <div className="min-h-screen bg-[#F7F3EC] font-sans text-[#2C2A26] flex flex-col antialiased">
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute -top-24 right-0 h-72 w-72 rounded-full bg-orange-200/30 blur-3xl" />
                <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-rose-100/40 blur-3xl" />
            </div>

            <header className="sticky top-0 z-50 bg-[#F7F3EC]/85 backdrop-blur-md border-b border-[#EBE7DE]">
                <div className="max-w-3xl mx-auto flex items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-2">
                        <button onClick={() => navigate('/ai-care')} className="mr-1 p-1">
                            <ChevronLeft className="w-5 h-5 text-[#A8A29E]" />
                        </button>
                        <div className="bg-[#2C2A26] rounded-sm text-[#F5F2EB] font-serif w-8 h-8 flex items-center justify-center font-bold">
                            J
                        </div>
                        <span className="font-serif text-lg font-bold tracking-tight">Clinical Report</span>
                    </div>
                    <button
                        onClick={() => navigate('/portfolio')}
                        className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#A8A29E] hidden sm:block"
                    >
                        Portfolio
                    </button>
                </div>
            </header>

            <div className="relative flex-1 max-w-3xl w-full mx-auto px-6 py-8 pb-32">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-3">
                        <Loader2 className="w-10 h-10 animate-spin text-[#A84A00]" />
                        <span className="text-sm text-[#A8A29E]">Preparing your clinical report...</span>
                    </div>
                ) : emergencyMessage ? (
                    <div className="bg-white/90 border border-rose-200 rounded-2xl p-8 shadow-lg shadow-rose-100/50">
                        <div className="flex gap-4 items-start">
                            <div className="p-3 rounded-xl bg-rose-100">
                                <ShieldAlert className="w-8 h-8 text-rose-600" />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-rose-600 mb-2">Safety alert</p>
                                <h2 className="font-serif text-2xl font-bold text-rose-950 mb-3">Seek emergency care now</h2>
                                <p className="text-rose-900/90 leading-relaxed mb-4">{emergencyMessage}</p>
                                <p className="text-sm font-semibold text-rose-800">
                                    Call your local emergency number or go to the nearest ER. Do not wait for an online report.
                                </p>
                                <button
                                    onClick={() => navigate(`/ai-care/chat?sessionId=${sessionId || ''}`)}
                                    className="mt-6 text-sm font-semibold text-rose-700 underline"
                                >
                                    View chat transcript
                                </button>
                            </div>
                        </div>
                    </div>
                ) : diagnoses.length > 0 ? (
                    <div className="space-y-6">
                        {/* Hero */}
                        <section className="bg-gradient-to-br from-white via-white to-[#FFF8F0] border border-[#EBE7DE] rounded-2xl p-7 shadow-sm">
                            <div className="flex items-center gap-2 mb-4">
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#A84A00] bg-[#FFF3E8] border border-[#F0DFC8] px-3 py-1 rounded-full">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Screening complete
                                </span>
                                {profileLabel && (
                                    <span className="text-[10px] text-[#A8A29E] font-medium truncate">{profileLabel}</span>
                                )}
                            </div>
                            <h1 className="font-serif text-3xl font-bold tracking-tight text-[#2C2A26] mb-3 leading-tight">
                                {report.headline || topDx?.common_name || topDx?.full_name || 'Your differential diagnosis'}
                            </h1>
                            <p className="text-[15px] text-[#5D5A53] leading-relaxed">
                                {report.patient_summary ||
                                    'Based on your symptom interview, these are the most likely conditions. This is not a formal diagnosis — please consult a licensed clinician.'}
                            </p>
                            {typeof report.confidence_score === 'number' && (
                                <div className="mt-5 flex items-center gap-3">
                                    <Sparkles className="w-4 h-4 text-[#A84A00]" />
                                    <span className="text-sm font-semibold text-[#2C2A26]">
                                        Top match confidence: {Math.round(report.confidence_score)}%
                                    </span>
                                </div>
                            )}
                        </section>

                        {/* Differentials */}
                        <section>
                            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#A8A29E] mb-4 flex items-center gap-2">
                                <HeartPulse className="w-4 h-4" /> Differential diagnosis
                            </h2>
                            <div className="space-y-4">
                                {diagnoses.map((diag, idx) => {
                                    const score = confidenceNum(diag.confidence);
                                    const style = likelihoodStyle(score);
                                    const title = diag.full_name || diag.name || diag.common_name || 'Condition';
                                    return (
                                        <article
                                            key={idx}
                                            className="bg-white border border-[#EBE7DE] rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow"
                                        >
                                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                                                <div>
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#A8A29E] mb-1">
                                                        #{diag.rank || idx + 1} · {diag.common_name || title}
                                                    </p>
                                                    <h3 className="font-serif text-xl font-bold text-[#2C2A26]">{title}</h3>
                                                </div>
                                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border bg-white ${style.text} border-current/20`}>
                                                    {style.label}
                                                </span>
                                            </div>

                                            <div className="mb-4">
                                                <div className="h-2 rounded-full bg-[#F0EBE3] overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all ${style.bar}`}
                                                        style={{ width: `${Math.min(100, score)}%` }}
                                                    />
                                                </div>
                                                <p className="text-xs text-[#A8A29E] mt-1">{score}% match</p>
                                            </div>

                                            {diag.description && (
                                                <p className="text-[14px] text-[#5D5A53] leading-relaxed mb-4">{diag.description}</p>
                                            )}

                                            {diag.reason && (
                                                <div className="bg-[#FAF6EF] border border-[#EBE7DE] rounded-xl p-4 mb-4">
                                                    <div className="flex gap-2 items-start">
                                                        <AlertCircle className="w-4 h-4 text-[#A84A00] shrink-0 mt-0.5" />
                                                        <div>
                                                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#A8A29E] mb-1">
                                                                Why we think this
                                                            </p>
                                                            <p className="text-[13px] text-[#2C2A26] leading-relaxed font-medium">{diag.reason}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {diag.supporting_evidence && diag.supporting_evidence.length > 0 && (
                                                <div className="flex flex-wrap gap-2">
                                                    {diag.supporting_evidence.map((tag, i) => (
                                                        <span
                                                            key={i}
                                                            className="text-[11px] px-3 py-1.5 rounded-full bg-[#F7F3EC] border border-[#EBE7DE] text-[#5D5A53]"
                                                        >
                                                            {tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </article>
                                    );
                                })}
                            </div>
                        </section>

                        {/* Assessment & plan */}
                        {plan && (plan.assessment || (plan.plan && plan.plan.length > 0)) && (
                            <section className="bg-white border border-[#EBE7DE] rounded-2xl p-6 shadow-sm">
                                <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#A8A29E] mb-4 flex items-center gap-2">
                                    <ClipboardList className="w-4 h-4" /> Assessment & care plan
                                </h2>
                                {plan.assessment && (
                                    <p className="text-[14px] text-[#2C2A26] leading-relaxed mb-4">{plan.assessment}</p>
                                )}
                                {plan.plan && plan.plan.length > 0 && (
                                    <ul className="space-y-2 mb-4">
                                        {plan.plan.map((item, i) => (
                                            <li key={i} className="flex gap-2 text-sm text-[#5D5A53]">
                                                <span className="text-[#A84A00] font-bold">•</span>
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {plan.self_care && plan.self_care.length > 0 && (
                                    <div className="border-t border-[#EBE7DE] pt-4 mt-4">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#A8A29E] mb-2">Self-care</p>
                                        <ul className="space-y-1">
                                            {plan.self_care.map((item, i) => (
                                                <li key={i} className="text-sm text-[#5D5A53]">— {item}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {plan.red_flags_to_watch && plan.red_flags_to_watch.length > 0 && (
                                    <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-100">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-800 mb-2">Red flags</p>
                                        <ul className="space-y-1">
                                            {plan.red_flags_to_watch.map((item, i) => (
                                                <li key={i} className="text-sm text-amber-900">• {item}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </section>
                        )}

                        {/* Doctor handoff */}
                        {showDoctorCta && (
                            <section className="bg-gradient-to-r from-[#2C2A26] to-[#3D3830] rounded-2xl p-6 text-white shadow-lg">
                                <div className="flex gap-4 items-start">
                                    <div className="p-3 rounded-xl bg-white/10">
                                        <Stethoscope className="w-7 h-7" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1">
                                            Recommended next step
                                        </p>
                                        <h3 className="font-serif text-xl font-bold mb-2">
                                            Connect with a {specialty} specialist
                                        </h3>
                                        <p className="text-sm text-white/80 leading-relaxed mb-5">
                                            {handoff.reason ||
                                                'A licensed clinician can confirm this assessment, order tests if needed, and prescribe treatment.'}
                                        </p>
                                        <button
                                            onClick={() => setShowDoctorModal(true)}
                                            className="inline-flex items-center gap-2 bg-[#A84A00] hover:bg-[#8A3D00] text-white text-sm font-semibold px-6 py-3 rounded-full transition-colors"
                                        >
                                            <Phone className="w-4 h-4" />
                                            {handoff.cta || `Book ${specialty} consult`}
                                        </button>
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <AlertCircle className="w-12 h-12 text-[#D6D0C4] mb-3" />
                        <p className="font-serif text-xl font-bold text-[#2C2A26] mb-1">No report yet</p>
                        <p className="text-sm text-[#A8A29E] max-w-xs">
                            Complete a symptom screening to generate your differential diagnosis report.
                        </p>
                    </div>
                )}
            </div>

            <div className="fixed bottom-0 inset-x-0 z-40 bg-[#F7F3EC]/95 backdrop-blur border-t border-[#EBE7DE] p-4">
                <div className="max-w-3xl mx-auto">
                    <button
                        onClick={() => navigate('/ai-care/chat?new=1')}
                        className="w-full bg-gradient-to-r from-[#A84A00] to-[#C45C1A] text-white py-4 rounded-full font-semibold shadow-lg shadow-orange-900/10 hover:brightness-105 transition-all"
                    >
                        Start new assessment
                    </button>
                </div>
            </div>

            {showDoctorModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
                        <h3 className="font-serif text-xl font-bold mb-2">Connect with a doctor</h3>
                        <p className="text-sm text-[#5D5A53] mb-4">
                            We recommend a <strong>{specialty}</strong> consultation for your top differential:{' '}
                            <strong>{topDx?.common_name || topDx?.full_name}</strong>.
                        </p>
                        <p className="text-xs text-[#A8A29E] mb-6">
                            Demo mode: in production this would open telehealth scheduling with a matched specialist.
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowDoctorModal(false)}
                                className="flex-1 py-3 rounded-full border border-[#EBE7DE] text-sm font-semibold"
                            >
                                Not now
                            </button>
                            <button
                                onClick={() => {
                                    setShowDoctorModal(false);
                                    window.open(`mailto:care@saksham-experiments.com?subject=${encodeURIComponent(`${specialty} consult request`)}`, '_blank');
                                }}
                                className="flex-1 py-3 rounded-full bg-[#A84A00] text-white text-sm font-semibold"
                            >
                                Request consult
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
