import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Brain,
  FileText,
  Loader2,
  Menu,
  MessageCircle,
  Plus,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useI18n } from '../../i18n';
import LibertyMDLanguageSwitcher from './LibertyMDLanguageSwitcher';
import {
  LibertyMDAbandonedRecoveryPrompt,
  LibertyMDAccountDrawer,
  LibertyMDDemographicsPrompt,
  LibertyMDReportGate,
  type LibertyMDHistoryItem,
} from './LibertyMDCareControls';
import { LibertyMDCareOrb } from './LibertyMDCareOrb';

type ChatPhase =
  | 'loading'
  | 'recovery_required'
  | 'demographics_required'
  | 'intake'
  | 'report_gate'
  | 'report_ready'
  | 'emergency_end'
  | 'clinical_review_needed'
  | 'error';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  options?: string[];
  kind?: 'normal' | 'demographics' | 'emergency' | 'report';
}

interface LibertyMDProfile {
  display_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  age?: number | null;
  sex_at_birth?: string | null;
}

interface LibertyReport {
  summary: string;
  differentials: Array<{
    name: string;
    confidence?: string;
    description?: string;
    reason?: string;
  }>;
  plan: string[];
  redFlags: string[];
  soap: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  };
}

const asText = (value: unknown, fallback = '') => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(Boolean).join('\n');
  if (value && typeof value === 'object') return JSON.stringify(value, null, 2);
  return fallback;
};

const listFrom = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'string' ? item : asText(item))).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(/\n|;|\.\s+/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
};

const normalizeReport = (raw: any): LibertyReport => {
  const data = raw?.report || raw?.output || raw || {};
  const differentials = Array.isArray(data?.differential_diagnosis)
    ? data.differential_diagnosis
    : Array.isArray(data?.diagnoses)
      ? data.diagnoses
      : Array.isArray(data)
        ? data
        : [];
  const normalizedDifferentials = differentials.slice(0, 4).map((item: any) => ({
    name: item?.full_name || item?.name || item?.condition || item?.diagnosis || 'Clinical consideration',
    confidence: item?.confidence || item?.confidence_score || item?.likelihood,
    description: item?.description || item?.summary,
    reason: item?.reason || item?.rationale || item?.supporting_reason,
  }));
  const soap = data?.soap || data?.soap_note || data?.SOAP || {};

  return {
    summary: asText(
      data?.patient_summary || data?.summary || data?.share_report || data?.report_summary,
      'LibertyMD completed the intake and generated a doctor-ready report.',
    ),
    differentials: normalizedDifferentials,
    plan: listFrom(data?.plan || data?.care_plan || data?.assessment_plan || data?.recommendations).slice(0, 6),
    redFlags: listFrom(data?.red_flags || data?.warning_signs || data?.seek_care_if).slice(0, 6),
    soap: {
      subjective: asText(soap?.subjective || data?.subjective, 'Symptoms and history captured during chat.'),
      objective: asText(soap?.objective || data?.objective, 'No vitals or physical exam were directly measured.'),
      assessment: asText(
        soap?.assessment || data?.assessment || normalizedDifferentials.map((item) => item.name).join(', '),
        'Assessment generated from the clinical intake.',
      ),
      plan: asText(soap?.plan || data?.plan || data?.care_plan, 'Follow the care plan and seek help if red flags appear.'),
    },
  };
};

const phaseFromStatus = (status: string): ChatPhase => {
  if (status === 'abandoned') return 'recovery_required';
  if (status === 'awaiting_demographics') return 'demographics_required';
  if (status === 'report_pending_auth') return 'report_gate';
  if (status === 'completed') return 'report_ready';
  if (status === 'emergency_stopped') return 'emergency_end';
  if (status === 'clinical_review_needed') return 'clinical_review_needed';
  return 'intake';
};

const statusCopy: Record<ChatPhase, string> = {
  loading: 'Opening your private consultation...',
  recovery_required: 'This consultation is paused',
  demographics_required: 'A little context helps us ask safer questions',
  intake: 'Focused clinical follow-up',
  report_gate: 'Your doctor-ready report is prepared',
  report_ready: 'Your report is ready',
  emergency_end: 'Safety guidance shown',
  clinical_review_needed: 'A clinician should review your symptoms',
  error: 'Connection interrupted',
};

const RESPONSE_STAGES = ['Understanding', 'Mulling', 'Correlating', 'Typing'] as const;
const RESPONSE_STAGE_MS = 500;

function ResponseStageAnimation({ stageIndex }: { stageIndex: number }) {
  if (stageIndex === 0) {
    return (
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
        <Loader2 className="h-[18px] w-[18px] animate-spin text-[#2563EB] [animation-duration:500ms] motion-reduce:animate-none" />
      </span>
    );
  }

  if (stageIndex === 1) {
    return (
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
        <Brain className="h-[18px] w-[18px] animate-pulse text-[#2563EB] [animation-duration:500ms] motion-reduce:animate-none" strokeWidth={1.8} />
      </span>
    );
  }

  if (stageIndex === 2) {
    return (
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="h-[18px] w-[18px] overflow-visible text-[#2563EB]"
          fill="none"
        >
          <g className="animate-pulse motion-reduce:animate-none" style={{ animationDuration: `${RESPONSE_STAGE_MS}ms` }}>
            {[
              [10, 2.2],
              [16.8, 6.1],
              [16.8, 13.9],
              [10, 17.8],
              [3.2, 13.9],
              [3.2, 6.1],
            ].map(([x, y], index) => (
              <g key={`${x}-${y}`}>
                <line
                  x1="10"
                  y1="10"
                  x2={x}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth="1.15"
                  strokeLinecap="round"
                  opacity={0.35 + index * 0.09}
                />
                <circle cx={x} cy={y} r="1.25" fill="currentColor" opacity={0.55 + index * 0.07} />
              </g>
            ))}
            <circle cx="10" cy="10" r="2.15" fill="currentColor" />
            <circle cx="10" cy="10" r="3.6" stroke="currentColor" strokeWidth="0.9" opacity="0.28" />
          </g>
        </svg>
      </span>
    );
  }

  return (
    <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
      <MessageCircle className="h-[18px] w-[18px] text-[#2563EB]" strokeWidth={1.8} />
      <span className="absolute left-[5px] top-[8px] flex gap-[1.5px]">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-[2px] w-[2px] animate-bounce rounded-full bg-[#2563EB] [animation-duration:500ms] motion-reduce:animate-none"
            style={{ animationDelay: `${index * 70}ms` }}
          />
        ))}
      </span>
    </span>
  );
}

function LibertyMDReportView({ report, saved }: { report: LibertyReport; saved: boolean }) {
  const { t, language } = useI18n();
  const plan = report.plan.length
    ? report.plan
    : ['Monitor your symptoms and follow up with a licensed clinician if they persist or worsen.'];
  const redFlags = report.redFlags.length
    ? report.redFlags
    : ['Seek urgent care for trouble breathing, chest pain, confusion, fainting, or rapidly worsening symptoms.'];

  return (
    <section className="mt-3 overflow-hidden rounded-lg border border-[#C9D9E9] bg-white shadow-[0_20px_65px_rgba(23,50,95,0.09)]">
      <div className="border-b border-[#DDE7EE] bg-[linear-gradient(120deg,#F4F8FF,#F2FAF6)] px-5 py-5 sm:px-7">
        <div className="flex items-center gap-2 text-xs font-bold uppercase text-[#2563EB]">
          <FileText className="h-4 w-4" /> Doctor-ready report
        </div>
        <h2 className="mt-2 font-serif text-2xl font-semibold text-[#111827] sm:text-3xl">{t('chatx.assessment')}</h2>
        <p className="mt-3 text-sm leading-7 text-[#435775]">{report.summary}</p>
      </div>

      <div className="space-y-7 px-5 py-6 sm:px-7">
        {report.differentials.length > 0 && (
          <div>
            <h3 className="text-xs font-bold uppercase text-[#64748B]">{t('chatx.clinical')}</h3>
            <div className="mt-3 divide-y divide-[#E2E8F0]">
              {report.differentials.map((item, index) => (
                <div key={`${item.name}-${index}`} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-4">
                    <p className="font-bold text-[#111827]">{item.name}</p>
                    {item.confidence && <span className="shrink-0 text-xs font-bold text-[#2563EB]">{item.confidence}</span>}
                  </div>
                  {(item.description || item.reason) && (
                    <p className="mt-1 text-sm leading-6 text-[#64748B]">{item.description || item.reason}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-black text-[#166534]">{t('chatx.carePlan')}</h3>
            <ul className="mt-2 space-y-2 text-sm leading-6 text-[#435775]">
              {plan.map((item, index) => <li key={index}>- {item}</li>)}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-black text-[#991B1B]">{t('chatx.redFlags')}</h3>
            <ul className="mt-2 space-y-2 text-sm leading-6 text-[#435775]">
              {redFlags.map((item, index) => <li key={index}>- {item}</li>)}
            </ul>
          </div>
        </div>

        <div className="border-t border-[#E2E8F0] pt-6">
          <h3 className="font-bold text-[#111827]">{t('chatx.soap')}</h3>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {[
              ['Subjective', report.soap.subjective],
              ['Objective', report.soap.objective],
              ['Assessment', report.soap.assessment],
              ['Plan', report.soap.plan],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs font-bold uppercase text-[#64748B]">{label}</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-6 text-[#435775]">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-[#E2E8F0] pt-5 text-xs font-semibold text-[#435775]">
          <ShieldCheck className="h-4 w-4 text-[#2563EB]" />
          {saved ? 'Saved privately to your LibertyMD history.' : 'Guest access expires after seven days.'}
        </div>
      </div>
    </section>
  );
}

export default function LibertyMDChat() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const consultationId = searchParams.get('consultationId');
  const draftId = searchParams.get('draftId');
  const authComplete = searchParams.get('auth') === 'complete';
  const authMerge = searchParams.get('auth') === 'merge';
  const oauthErrorCode = searchParams.get('error_code') || searchParams.get('error');
  const oauthErrorDescription = searchParams.get('error_description');
  const initialStartRequestRef = useRef<any>((location.state as any)?.libertyMDStartRequest || null);
  const [phase, setPhase] = useState<ChatPhase>('loading');
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const symptom = String(initialStartRequestRef.current?.symptom || '').trim();
    return symptom ? [{ id: `${initialStartRequestRef.current?.draftId || 'draft'}-user`, sender: 'user', text: symptom }] : [];
  });
  const [input, setInput] = useState('');
  const [demographics, setDemographics] = useState({ age: '', sex: '' });
  const [report, setReport] = useState<LibertyReport | null>(null);
  const [error, setError] = useState('');
  const [safetyNotice, setSafetyNotice] = useState('');
  const [isBusy, setIsBusy] = useState(Boolean(initialStartRequestRef.current));
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [profile, setProfile] = useState<LibertyMDProfile | null>(null);
  const [history, setHistory] = useState<LibertyMDHistoryItem[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isReportGateOpen, setIsReportGateOpen] = useState(false);
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [hasIdentityConflict, setHasIdentityConflict] = useState(false);
  const [accountLoading, setAccountLoading] = useState(false);
  const [consultationVersion, setConsultationVersion] = useState<number | null>(null);
  const [responseStageIndex, setResponseStageIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const identityPromiseRef = useRef<Promise<any> | null>(null);
  const startConsultationPromiseRef = useRef<Promise<any> | null>(null);
  const resolvedDraftConsultationIdRef = useRef<string | null>(null);
  const initialStartRef = useRef<any>((location.state as any)?.libertyMDStart || null);
  const initialStartConsultationIdRef = useRef<string | null>(
    (location.state as any)?.libertyMDStart?.consultationId
      ? String((location.state as any).libertyMDStart.consultationId)
      : null,
  );

  const ensureIdentity = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) return sessionData.session;
    if (!identityPromiseRef.current) {
      identityPromiseRef.current = supabase.auth.signInAnonymously().then(({ data, error: authError }) => {
        if (authError || !data.session) {
          throw authError || new Error('Unable to create a private LibertyMD session.');
        }
        return data.session;
      });
    }
    return identityPromiseRef.current;
  };

  const invokeCareProxy = async (body: Record<string, unknown>) => {
    await ensureIdentity();
    const { data, error: functionError } = await supabase.functions.invoke('libertymd-care-proxy', {
      body: { region: 'EU', ...body },
    });
    if (functionError) throw functionError;
    if (data?.error) throw new Error(String(data.error));
    return data;
  };

  const mapMessages = (rows: any[]): ChatMessage[] => rows.map((item, index) => ({
    id: String(item.id || `${consultationId}-${index}`),
    sender: item.role === 'user' ? 'user' : 'ai',
    text: String(item.content || ''),
    options: Array.isArray(item.options) ? item.options.map(String) : [],
    kind: item.message_type === 'safety'
      ? 'emergency'
      : item.message_type === 'report_gate'
        ? 'report'
        : item.message_type === 'demographics'
          ? 'demographics'
          : 'normal',
  }));

  const refreshAccount = async () => {
    setAccountLoading(true);
    try {
      const data = await invokeCareProxy({ action: 'bootstrap' });
      setIsAnonymous(Boolean(data?.is_anonymous));
      setProfile(data?.profile || null);
      setHistory(Array.isArray(data?.history) ? data.history : []);
    } finally {
      setAccountLoading(false);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isBusy, report, phase]);

  useEffect(() => {
    if (!isBusy) {
      setResponseStageIndex(0);
      return undefined;
    }
    const timer = window.setInterval(() => {
      setResponseStageIndex((current) => (current === 0 || current === RESPONSE_STAGES.length - 1 ? 1 : current + 1));
    }, RESPONSE_STAGE_MS);
    return () => window.clearInterval(timer);
  }, [isBusy]);

  useEffect(() => {
    const initialRequest = initialStartRequestRef.current;
    const isDraftStart = Boolean(
      !consultationId
      && draftId
      && initialRequest?.draftId
      && String(initialRequest.draftId) === draftId,
    );

    if (!consultationId && !isDraftStart) {
      navigate(`/liberty-md?lang=${language}`, { replace: true });
      return;
    }

    let cancelled = false;

    void (async () => {
      setError('');
      setReport(null);
      try {
        if (isDraftStart) {
          const symptom = String(initialRequest.symptom || '').trim();
          if (!symptom) throw new Error('Please describe the symptom.');

          setPhase('loading');
          setIsBusy(true);
          setProfile(initialRequest.profile || null);
          setIsAnonymous(Boolean(initialRequest.isAnonymous));
          setHistory(Array.isArray(initialRequest.history) ? initialRequest.history : []);
          setDemographics({
            age: String(initialRequest.demographics?.age || initialRequest.profile?.age || ''),
            sex: String(initialRequest.demographics?.sex || initialRequest.profile?.sex_at_birth || ''),
          });
          setMessages([{ id: `${draftId}-user`, sender: 'user', text: symptom }]);

          if (!startConsultationPromiseRef.current) {
            startConsultationPromiseRef.current = invokeCareProxy({
              action: 'start_consultation',
              message: symptom,
            });
          }
          const data = await startConsultationPromiseRef.current;
          if (cancelled) return;
          if (!data?.consultation_id) throw new Error('Unable to start LibertyMD consultation.');

          const nextConsultationId = String(data.consultation_id);
          const nextPhase = phaseFromStatus(String(data.emergency ? 'emergency_stopped' : data.state || 'awaiting_demographics'));
          const acknowledgement = String(data.acknowledgement || data.message || '').trim();
          setMessages([
            { id: `${nextConsultationId}-initial-user`, sender: 'user', text: symptom },
            {
              id: `${nextConsultationId}-initial-assistant`,
              sender: 'ai',
              kind: nextPhase === 'emergency_end' ? 'emergency' : 'demographics',
              text: acknowledgement,
            },
          ].filter((message) => message.text));
          setPhase(nextPhase);
          setIsReportGateOpen(nextPhase === 'report_gate');
          setSafetyNotice(data.safety?.message ? String(data.safety.message) : '');
          setConsultationVersion(Number.isInteger(data.version) ? Number(data.version) : null);
          resolvedDraftConsultationIdRef.current = nextConsultationId;
          initialStartRequestRef.current = null;
          setIsBusy(false);
          navigate(`/liberty-md/chat?consultationId=${encodeURIComponent(nextConsultationId)}`, {
            replace: true,
            state: null,
          });
          return;
        }

        if (resolvedDraftConsultationIdRef.current === consultationId) {
          resolvedDraftConsultationIdRef.current = null;
          return;
        }

        const initialStart = initialStartRef.current;
        if (
          initialStartConsultationIdRef.current === consultationId
          && !authComplete
          && !authMerge
          && !oauthErrorCode
        ) {
          if (!initialStart) return;
          initialStartRef.current = null;
          const initialPhase = phaseFromStatus(String(initialStart.state || 'awaiting_demographics'));
          setMessages([
            {
              id: `${consultationId}-initial-user`,
              sender: 'user',
              text: String(initialStart.symptom || ''),
            },
            {
              id: `${consultationId}-initial-assistant`,
              sender: 'ai',
              kind: initialPhase === 'emergency_end' ? 'emergency' : 'demographics',
              text: String(initialStart.acknowledgement || ''),
            },
          ].filter((message) => message.text));
          setPhase(initialPhase);
          setIsReportGateOpen(initialPhase === 'report_gate');
          setSafetyNotice(initialStart.safety?.message ? String(initialStart.safety.message) : '');
          setConsultationVersion(Number.isInteger(initialStart.version) ? Number(initialStart.version) : null);
          setProfile(initialStart.profile || null);
          setIsAnonymous(Boolean(initialStart.isAnonymous));
          setHistory(Array.isArray(initialStart.history) ? initialStart.history : []);
          setDemographics({
            age: String(initialStart.demographics?.age || initialStart.profile?.age || ''),
            sex: String(initialStart.demographics?.sex || initialStart.profile?.sex_at_birth || ''),
          });
          navigate(`/liberty-md/chat?consultationId=${encodeURIComponent(consultationId)}`, {
            replace: true,
            state: null,
          });
          return;
        }

        setPhase('loading');

        if (oauthErrorCode) {
          await invokeCareProxy({
            action: 'record_identity_event',
            consultation_id: consultationId,
            identity_event: oauthErrorCode.includes('identity') ? 'google_link_conflict' : 'google_link_cancelled',
          });
        }
        const transferKey = `libertymd-transfer:${consultationId}`;
        const transferToken = window.sessionStorage.getItem(transferKey);
        let account;
        if (authMerge && !oauthErrorCode) {
          if (!transferToken) throw new Error('The account-transfer session expired. Please try Google sign in again.');
          account = await invokeCareProxy({
            action: 'complete_account_merge',
            consultation_id: consultationId,
            transfer_token: transferToken,
          });
          window.sessionStorage.removeItem(transferKey);
        } else {
          account = await invokeCareProxy({
            action: authComplete && !oauthErrorCode ? 'sync_identity' : 'bootstrap',
            consultation_id: authComplete ? consultationId : undefined,
            transfer_token: authComplete ? transferToken || undefined : undefined,
          });
          if (authComplete && !oauthErrorCode) window.sessionStorage.removeItem(transferKey);
        }
        if (cancelled) return;

        setIsAnonymous(Boolean(account?.is_anonymous));
        setProfile(account?.profile || null);
        setHistory(Array.isArray(account?.history) ? account.history : []);
        setDemographics({
          age: account?.profile?.age ? String(account.profile.age) : '',
          sex: String(account?.profile?.sex_at_birth || ''),
        });

        const data = await invokeCareProxy({ action: 'get_consultation', consultation_id: consultationId });
        if (cancelled) return;
        const nextPhase = phaseFromStatus(String(data?.consultation?.status || 'interviewing'));
        setConsultationVersion(Number.isInteger(data?.consultation?.version) ? Number(data.consultation.version) : null);
        setMessages(mapMessages(Array.isArray(data?.messages) ? data.messages : []));
        setPhase(nextPhase);
        setIsReportGateOpen(nextPhase === 'report_gate');
        if (data?.report) setReport(normalizeReport(data.report));
        if (oauthErrorCode) {
          setHasIdentityConflict(oauthErrorCode.includes('identity'));
          setError(oauthErrorDescription || 'Google sign in was not completed. Your consultation is still available.');
        }

        if (authComplete || authMerge || oauthErrorCode) {
          setSearchParams({ consultationId }, { replace: true });
        }
      } catch (initializationError) {
        if (!cancelled) {
          setError(initializationError instanceof Error ? initializationError.message : 'Unable to open this consultation.');
          setPhase('error');
          setIsBusy(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [authComplete, authMerge, consultationId, draftId, navigate, oauthErrorCode, oauthErrorDescription, setSearchParams]);

  const currentOptions = useMemo(() => {
    if (isBusy || phase !== 'intake') return [];
    const latest = messages[messages.length - 1];
    return latest?.sender === 'ai' && Array.isArray(latest.options) ? latest.options : [];
  }, [isBusy, messages, phase]);

  const submitDemographics = async () => {
    if (!consultationId || isBusy) return;
    setIsBusy(true);
    setError('');
    try {
      const data = await invokeCareProxy({
        action: 'save_demographics',
        consultation_id: consultationId,
        age: Number(demographics.age),
        sex_at_birth: demographics.sex,
      });
      setProfile((current) => ({
        ...current,
        age: Number(demographics.age),
        sex_at_birth: demographics.sex,
      }));
      setMessages((current) => [...current,
        {
          id: `${Date.now()}-demographics-user`,
          sender: 'user',
          kind: 'demographics',
          text: `Age ${demographics.age}; ${demographics.sex.replaceAll('_', ' ')}`,
        },
        {
          id: `${Date.now()}-demographics-ai`,
          sender: 'ai',
          text: String(data?.next_question || 'When did this symptom begin?'),
          options: Array.isArray(data?.options) ? data.options.map(String) : [],
        },
      ]);
      setPhase('intake');
    } catch (demographicsError) {
      setError(demographicsError instanceof Error ? demographicsError.message : 'Unable to save this information.');
    } finally {
      setIsBusy(false);
    }
  };

  const applyWorkflowResult = async (data: any) => {
    if (Number.isInteger(data?.version)) setConsultationVersion(Number(data.version));
    if (data?.emergency || data?.state === 'emergency_stopped') {
      setMessages((current) => [...current, {
        id: `${Date.now()}-emergency`,
        sender: 'ai',
        kind: 'emergency',
        text: String(data?.message || 'These symptoms may be an emergency. Seek emergency care now.'),
      }]);
      setPhase('emergency_end');
      return;
    }

    if (data?.clinical_review_needed || data?.state === 'clinical_review_needed') {
      setMessages((current) => [...current, {
        id: `${Date.now()}-review`,
        sender: 'ai',
        kind: 'emergency',
        text: String(data?.message || 'A reliable report could not be generated. Please continue with a licensed clinician.'),
      }]);
      setPhase('clinical_review_needed');
      return;
    }

    if (data?.report_ready) {
      setMessages((current) => [...current, {
        id: `${Date.now()}-report`,
        sender: 'ai',
        kind: 'report',
        text: data?.auth_required
          ? 'Your report is ready. Link Google to save it, or continue without saving.'
          : 'Your report is ready and saved in your consultation history.',
      }]);
      if (data?.auth_required) {
        setPhase('report_gate');
        setIsReportGateOpen(true);
      } else {
        setReport(normalizeReport(data.report));
        setPhase('report_ready');
        await refreshAccount();
      }
      return;
    }

    const nextQuestion = String(data?.next_question || data?.message || 'Could you tell me more about that?');
    setSafetyNotice(data?.safety?.message ? String(data.safety.message) : '');
    setMessages((current) => [...current, {
      id: `${Date.now()}-assistant`,
      sender: 'ai',
      text: nextQuestion,
      options: Array.isArray(data?.options) ? data.options.map(String) : [],
    }]);
    setPhase('intake');
  };

  const sendMessage = async (value?: string) => {
    const message = String(value ?? input).trim();
    if (!consultationId || !message || isBusy || phase !== 'intake') return;

    const optimisticId = `${Date.now()}-user`;
    setMessages((current) => [...current, { id: optimisticId, sender: 'user', text: message }]);
    setInput('');
    setError('');
    setIsBusy(true);
    try {
      const clientMessageId = crypto.randomUUID();
      let data: any;
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          data = await invokeCareProxy({
            action: 'send_message',
            consultation_id: consultationId,
            message,
            client_message_id: clientMessageId,
            expected_version: consultationVersion,
          });
          lastError = null;
          break;
        } catch (requestError) {
          lastError = requestError;
          if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 500));
        }
      }
      if (lastError) throw lastError;
      await applyWorkflowResult(data);
    } catch (sendError) {
      setMessages((current) => current.filter((item) => item.id !== optimisticId));
      setInput(message);
      setError(sendError instanceof Error ? sendError.message : 'LibertyMD is temporarily unavailable.');
    } finally {
      setIsBusy(false);
    }
  };

  const startGoogleLink = async () => {
    if (!consultationId) return;
    setIsAuthBusy(true);
    setError('');
    try {
      await ensureIdentity();
      const transfer = await invokeCareProxy({
        action: 'prepare_account_merge',
        consultation_id: consultationId,
      });
      if (!transfer?.transfer_token) throw new Error('Unable to prepare secure Google linking.');
      window.sessionStorage.setItem(`libertymd-transfer:${consultationId}`, String(transfer.transfer_token));
      await invokeCareProxy({
        action: 'record_identity_event',
        consultation_id: consultationId,
        identity_event: 'google_link_started',
      });
      const query = new URLSearchParams({ consultationId, auth: 'complete' });
      const { error: linkError } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/liberty-md/chat?${query.toString()}` },
      });
      if (linkError) throw linkError;
    } catch (linkError) {
      const message = linkError instanceof Error ? linkError.message : 'Unable to start Google sign in.';
      const isIdentityConflict = /identity|already|exists/i.test(message);
      try {
        await invokeCareProxy({
          action: 'record_identity_event',
          consultation_id: consultationId,
          identity_event: isIdentityConflict ? 'google_link_conflict' : 'google_link_cancelled',
        });
      } catch {
        // Preserve the authentication error even if audit logging is unavailable.
      }
      setHasIdentityConflict(isIdentityConflict);
      setError(message);
      setIsAuthBusy(false);
    }
  };

  const signInExistingGoogle = async () => {
    if (!consultationId) return;
    const transferKey = `libertymd-transfer:${consultationId}`;
    if (!window.sessionStorage.getItem(transferKey)) {
      setError('The secure transfer expired. Choose Continue with Google to try again.');
      setHasIdentityConflict(false);
      return;
    }
    setIsAuthBusy(true);
    setError('');
    try {
      await supabase.auth.signOut({ scope: 'local' });
      const query = new URLSearchParams({ consultationId, auth: 'merge' });
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/liberty-md/chat?${query.toString()}` },
      });
      if (signInError) throw signInError;
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'Unable to sign in to the existing Google account.');
      setIsAuthBusy(false);
    }
  };

  const skipReportGate = async () => {
    if (!consultationId) return;
    setIsAuthBusy(true);
    setError('');
    try {
      const data = await invokeCareProxy({
        action: 'release_report',
        consultation_id: consultationId,
        mode: 'skip',
      });
      setReport(normalizeReport(data.report));
      setPhase('report_ready');
      setIsReportGateOpen(false);
    } catch (releaseError) {
      setError(releaseError instanceof Error ? releaseError.message : 'Unable to release the report.');
    } finally {
      setIsAuthBusy(false);
    }
  };

  const resumeAbandonedConsultation = async () => {
    if (!consultationId || isBusy || phase !== 'recovery_required') return;
    setIsBusy(true);
    setError('');
    try {
      const data = await invokeCareProxy({
        action: 'resume_consultation',
        consultation_id: consultationId,
      });
      setConsultationVersion(Number.isInteger(data?.version) ? Number(data.version) : consultationVersion);
      setPhase(phaseFromStatus(String(data?.state || 'interviewing')));
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : 'Unable to resume this consultation.');
    } finally {
      setIsBusy(false);
    }
  };

  const startOver = async () => {
    if (!consultationId || isBusy) return;
    if (phase === 'recovery_required' || ['report_gate', 'report_ready', 'emergency_end', 'clinical_review_needed', 'error'].includes(phase)) {
      navigate(`/liberty-md?lang=${language}`);
      return;
    }

    setIsBusy(true);
    setError('');
    try {
      await invokeCareProxy({
        action: 'abandon_consultation',
        consultation_id: consultationId,
      });
      navigate(`/liberty-md?lang=${language}`);
    } catch (abandonError) {
      setError(abandonError instanceof Error ? abandonError.message : 'Unable to start over right now.');
      setIsBusy(false);
    }
  };

  const selectConsultation = (id: string) => {
    setIsMenuOpen(false);
    setSearchParams({ consultationId: id });
  };

  const composerLocked = isBusy || phase !== 'intake';
  const emergencyMessage = phase === 'emergency_end'
    ? [...messages].reverse().find((item) => item.kind === 'emergency')?.text
    : null;

  return (
    <div className="flex h-[100svh] flex-col overflow-hidden bg-[linear-gradient(180deg,#FBFCFF_0%,#F3F8FF_52%,#F1F8F3_100%)] font-sans text-[#111827] selection:bg-[#2563EB] selection:text-white">
      <header className="z-30 shrink-0 border-b border-white/80 bg-white/75 px-3 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => navigate(`/liberty-md?lang=${language}`)}
              aria-label="Back to LibertyMD"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#64748B] transition hover:bg-[#EFF6FF] hover:text-[#2563EB]"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <img
              src="/images/libertymd-logo-mark.svg"
              alt=""
              aria-hidden="true"
              className="h-9 w-9 shrink-0 object-contain"
            />
            <div className="min-w-0">
              <p className="truncate font-serif text-lg font-semibold leading-5 text-[#111827] sm:text-xl">LibertyMD</p>
              <p className="mt-0.5 truncate text-[11px] font-semibold text-[#64748B]">{t('chatx.privateConsult')}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <LibertyMDLanguageSwitcher />
            <button
              type="button"
              onClick={() => void startOver()}
              disabled={isBusy || phase === 'loading'}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-[#17325F] transition hover:bg-[#EFF6FF] hover:text-[#2563EB] sm:px-4"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">{t('chatx.newChat')}</span>
            </button>
            <button
              type="button"
              aria-label="Open profile and consultation history"
              onClick={() => {
                setIsMenuOpen(true);
                if (!isAnonymous) void refreshAccount();
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#17325F] transition hover:bg-[#EFF6FF] hover:text-[#2563EB]"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6 sm:py-8">
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-6 flex items-center justify-center gap-2 text-center text-xs font-semibold text-[#64748B]" aria-live="polite">
            <span className={`h-2 w-2 rounded-full ${phase === 'error' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            {statusCopy[phase]}
          </div>

          {emergencyMessage && (
            <section className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-left shadow-sm">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                <div>
                  <h2 className="font-bold text-red-900">{t('chatx.emergencyNow')}</h2>
                  <p className="mt-1 text-sm leading-6 text-red-800">{emergencyMessage}</p>
                  <p className="mt-2 text-sm font-bold text-red-900">Call local emergency services or go to the nearest emergency department.</p>
                </div>
              </div>
            </section>
          )}

          <div className="space-y-5">
            {messages.map((message, messageIndex) => (
              <div key={message.id} className={`flex items-end gap-2.5 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                {message.sender === 'ai' && (
                  <span className="mb-1 shrink-0">
                    <LibertyMDCareOrb
                      state={message.kind === 'emergency' ? 'alert' : message.kind === 'report' ? 'report' : 'idle'}
                      size="lg"
                      animated={messageIndex === messages.length - 1}
                      waiting={
                        messageIndex === messages.length - 1
                        && !isBusy
                        && (phase === 'intake' || phase === 'demographics_required')
                      }
                    />
                  </span>
                )}
                <div className={`max-w-[84%] whitespace-pre-line rounded-2xl px-4 py-3 text-left text-[15px] leading-6 shadow-sm sm:max-w-[76%] sm:px-5 sm:py-4 ${
                  message.sender === 'user'
                    ? 'rounded-br-sm bg-[#2563EB] text-white'
                    : message.kind === 'emergency'
                      ? 'rounded-bl-sm border border-red-200 bg-red-50 text-red-900'
                      : message.kind === 'report'
                        ? 'rounded-bl-sm border border-emerald-200 bg-emerald-50 text-emerald-900'
                        : 'rounded-bl-sm border border-[#DCE6F1] bg-white text-[#334155]'
                }`}>
                  {message.text}
                </div>
              </div>
            ))}

            {phase === 'demographics_required' && (
              <div className="rounded-lg border border-[#DCE6F1] bg-white p-4 shadow-sm sm:p-6">
                <LibertyMDDemographicsPrompt
                  age={demographics.age}
                  sex={demographics.sex}
                  loading={isBusy}
                  error={error}
                  onAgeChange={(age) => setDemographics((current) => ({ ...current, age }))}
                  onSexChange={(sex) => setDemographics((current) => ({ ...current, sex }))}
                  onSubmit={submitDemographics}
                />
              </div>
            )}

            {safetyNotice && phase === 'intake' && (
              <div className="ml-10 rounded-md border-l-2 border-amber-500 bg-amber-50 px-4 py-3 text-left text-sm leading-6 text-amber-900">
                {safetyNotice}
              </div>
            )}

            {isBusy && (
              <div className="flex items-end gap-2.5">
                <span className="mb-1 shrink-0">
                  <LibertyMDCareOrb state="thinking" size="lg" />
                </span>
                <div
                  className="flex min-w-[10rem] items-center gap-2.5 rounded-2xl rounded-bl-sm border border-[#DCE6F1] bg-white px-4 py-3 text-sm text-[#64748B] shadow-sm"
                  role="status"
                  aria-live="polite"
                >
                  <span className="sr-only">Preparing a response.</span>
                  <span key={responseStageIndex} aria-hidden="true" className="contents">
                    <ResponseStageAnimation stageIndex={responseStageIndex} />
                    <span className="min-w-[5.75rem] text-left transition-opacity duration-150">
                      {RESPONSE_STAGES[responseStageIndex].toLowerCase()}...
                    </span>
                  </span>
                </div>
              </div>
            )}

            {error && phase !== 'demographics_required' && (
              <div className="ml-10 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900">
                {error}
              </div>
            )}

            {phase === 'report_gate' && !isReportGateOpen && (
              <button
                type="button"
                onClick={() => setIsReportGateOpen(true)}
                className="mx-auto block rounded-full bg-[#2563EB] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-[#1D4ED8]"
              >
                View report options
              </button>
            )}

            {report && <LibertyMDReportView report={report} saved={!isAnonymous} />}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </main>

      <footer className="z-20 shrink-0 border-t border-white/80 bg-white/72 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:px-6 sm:pb-4">
        <div className="mx-auto max-w-3xl">
          {currentOptions.length > 0 && (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap">
              {currentOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => void sendMessage(option)}
                  disabled={isBusy}
                  className="shrink-0 rounded-full border border-[#BFD0EE] bg-white px-4 py-2.5 text-left text-sm font-semibold text-[#17325F] shadow-sm transition hover:border-[#2563EB] hover:text-[#2563EB] disabled:opacity-50"
                >
                  {option}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
            className="flex min-h-14 items-center gap-2 rounded-full border border-[#BFD0EE] bg-white p-2 pl-5 shadow-[0_14px_40px_rgba(23,50,95,0.13)] ring-1 ring-[#2563EB]/5"
          >
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={composerLocked}
              placeholder={phase === 'loading'
                ? t('chatx.phOpening')
                : phase === 'demographics_required'
                  ? t('chatx.phDemo')
                  : phase === 'report_gate'
                    ? t('chatx.phReportGate')
                    : phase === 'report_ready'
                      ? t('chatx.phReportReady')
                      : phase === 'emergency_end'
                        ? t('chatx.phEnded')
                        : t('chatx.phAnswer')}
              aria-label="Message LibertyMD"
              className="min-w-0 flex-1 bg-transparent text-left text-sm text-[#111827] outline-none placeholder:text-[#94A3B8] disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              aria-label={t('chatx.sendMessage')}
              disabled={composerLocked || !input.trim()}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2563EB] text-white shadow-md shadow-blue-600/20 transition hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:bg-[#CBD5E1] disabled:shadow-none"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          <p className="mt-2 text-center text-[10px] leading-4 text-[#64748B]">
            LibertyMD provides AI guidance, not a diagnosis or emergency service.
          </p>
        </div>
      </footer>

      {phase === 'report_gate' && isReportGateOpen && (
        <LibertyMDReportGate
          loading={isAuthBusy}
          identityConflict={hasIdentityConflict}
          onGoogle={startGoogleLink}
          onExistingGoogle={signInExistingGoogle}
          onSkip={skipReportGate}
          onClose={() => setIsReportGateOpen(false)}
        />
      )}

      {phase === 'recovery_required' && (
        <LibertyMDAbandonedRecoveryPrompt
          loading={isBusy}
          error={error}
          onResume={() => void resumeAbandonedConsultation()}
          onStartOver={() => navigate(`/liberty-md?lang=${language}`)}
        />
      )}

      <LibertyMDAccountDrawer
        open={isMenuOpen}
        isAnonymous={isAnonymous}
        displayName={profile?.display_name}
        email={profile?.email}
        avatarUrl={profile?.avatar_url}
        age={profile?.age}
        sexAtBirth={profile?.sex_at_birth}
        history={history}
        loading={accountLoading}
        onClose={() => setIsMenuOpen(false)}
        onSelectConsultation={selectConsultation}
      />
    </div>
  );
}
