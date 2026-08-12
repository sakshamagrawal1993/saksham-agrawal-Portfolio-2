import { useState, useEffect, useRef } from 'react';
import {
  buildLandingAttributionPayload,
  parseLandingQueryParams,
  rememberLandingSessionId,
} from './libertymd-landing-attribution';
import { resolveKeywordLandingCluster } from './libertymd-keyword-content';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../../i18n';
import LibertyMDLanguageSwitcher from './LibertyMDLanguageSwitcher';
import {
  ShieldCheck,
  Star,
  UsersRound,
  Send,
  ArrowRight,
  Loader2,
  Menu,
  RotateCcw,
  LogIn,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import LibertyMDFooterRibbon from './LibertyMDFooterRibbon';
import { PatientOathEmblem } from './LibertyMDFooterBadges';
import LibertyMDPremiumLogo from './LibertyMDPremiumLogo';
import LibertyMDParticleWaveSeparator from './LibertyMDParticleWaveSeparator';
import {
  LibertyMDHealthLibrarySection,
  LibertyMDPatientStoriesSection,
  LibertyMDPhoneCareSection,
  LibertyMDPricingSection,
} from './LibertyMDMarketingSections';
import { LibertyMDPhaseStack } from './LibertyMDPhaseStack';
import { LibertyMDScrollFilmSection } from './LibertyMDScrollFilmSection';
import { LibertyMDProgressIndicator } from './LibertyMDProgressIndicator';
import { LibertyMDReportView } from './LibertyMDReportView';
import { LibertyMDSampleReport } from './LibertyMDSampleReport';
import {
  LibertyMDGuestRetentionWarning,
  LibertyMDReportLifecycleShell,
} from './LibertyMDReportLifecycleShell';
import { LibertyMDDoctorHandoffCta } from './LibertyMDDoctorHandoffCta';
import { LibertyMDDoctorHandoffPanel } from './LibertyMDDoctorHandoffPanel';
import {
  shouldShowDoctorHandoff,
} from './libertymd-doctor-cta-config';
import {
  LibertyMDTypingWaitRow,
  LibertyMDWaitingIndicator,
} from './LibertyMDWaitingIndicator';
import {
  normalizeReportData,
  type LibertyMdNormalizedReport,
} from './libertymd-report';
import {
  deriveReportLifecycleState,
  formatRetentionRemaining,
  GENERATING_WAIT_TIMEOUT_MS,
  shouldClearStaleReportOnHydrate,
  shouldShowGuestRetentionWarning,
  type ReportOmittedReason,
} from './libertymd-report-lifecycle';
import {
  predictWaitModeFromLastKnown,
  type WaitMode,
} from './libertymd-waiting';
import {
  isSoftGateDismissed,
  markSoftGateDismissed,
  shouldOpenSoftGate,
} from './libertymd-soft-gate';
import {
  buildProgressView,
  nextHighWater,
  normalizeMissingSlots,
  shouldShowInterviewProgress,
} from './libertymd-progress';
import {
  LibertyMDAccountDrawer,
  LibertyMDDemographicsPrompt,
  LibertyMDProfileCapabilityOffer,
  LibertyMDReportGate,
  LibertyMDRequestErrorNotice,
  LibertyMDSeverityNotice,
  entryProfilesFromPatients,
  libertyMDSafetyNoticeFromResponse,
  type LibertyMDHistoryItem,
  type LibertyMDSafetyNoticeContent,
} from './LibertyMDCareControls';
import { LibertyMDContinuationActionBar } from './LibertyMDContinuationActionBar';
import { LibertyMDEmergencyAlert } from './LibertyMDEmergencyAlert';
import {
  emergencyCopyFromPayload,
  pickEmergencyCopyForDisplay,
  resolveLibertyMdEmergencyCopy,
  type LibertyMdEmergencyCopyWire,
} from './libertymd-emergency-copy';
import {
  anonymousAddProfileProbeBody,
  deletePatientBody,
  listOwnedPatientsBody,
  normalizeManagedPatientList,
  normalizePatientList,
  normalizeHistorySummary,
  requestReportEmailBody,
  someoneElseCreateBody,
  updatePatientBody,
  type LibertyMDPatientListItem,
} from './libertymd-care-proxy-client';
import {
  emitIdentityLinked,
  emitProfileCapabilityOfferCta,
  emitProfileCapabilityOfferShown,
  emitReportDeliveryRequested,
} from './libertymd-analytics';
import { identifyLibertyMdUser } from './libertymd-mixpanel-identity';
import {
  classifyProfileManagementFailure,
  patientFacingTechnicalMessage,
  readFunctionsErrorPayload,
  resolveProfileCapabilityOffer,
} from './libertymd-failure-taxonomy';
import {
  LibertyMDNewMessagePill,
  TRANSCRIPT_BOTTOM_CLEARANCE_CLASS,
  useLibertyMDChatScroll,
} from './LibertyMDChatScroll';


interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  options?: string[];
  kind?: 'normal' | 'system' | 'emergency' | 'report';
  triageData?: {
    severity: 'low' | 'moderate' | 'urgent';
    possibleCauses: string[];
    actionPlan: string[];
    redFlags: string[];
  };
}

type ChatPhase =
  | 'initial'
  | 'demographics_required'
  | 'intake'
  | 'report_gate'
  | 'report_ready'
  | 'emergency_end'
  | 'clinical_review_needed'
  | 'error';

interface LibertyMDProfile {
  display_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  age?: number | null;
  sex_at_birth?: string | null;
}

const EMERGENCY_ACKNOWLEDGE_LABEL = 'I understand';
const EMERGENCY_PERSISTENCE_NOTE = 'This guidance stays pinned to the bottom of the screen after you acknowledge it.';

function crisisTypeFromSafetyPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const safety = record.safety && typeof record.safety === 'object'
    ? record.safety as Record<string, unknown>
    : null
  const fromSafety = safety?.crisis_type
  if (typeof fromSafety === 'string' && fromSafety.trim()) return fromSafety.trim()
  const topLevel = record.crisis_type
  if (typeof topLevel === 'string' && topLevel.trim()) return topLevel.trim()
  return null
}


export default function LibertyMDApp() {
  const navigate = useNavigate();
  const { topicSlug: topicSlugParam } = useParams<{ topicSlug?: string }>();
  const { t, language } = useI18n();
  // P3-06 — allow-list framing from opaque URL tokens only (unmatched → generic).
  const keywordCluster = (() => {
    if (typeof window === 'undefined') {
      return resolveKeywordLandingCluster({ pathname: topicSlugParam ? `/liberty-md/t/${topicSlugParam}` : undefined });
    }
    const fromQuery = parseLandingQueryParams(window.location.search);
    return resolveKeywordLandingCluster({
      pathname: window.location.pathname,
      keyword_id: fromQuery.keyword_id,
      matched_topic_slug: fromQuery.matched_topic_slug ?? topicSlugParam,
    });
  })();
  const keywordHeroTitle = keywordCluster
    ? t(`keywordLanding.${keywordCluster.framingKeySlug}.title`)
    : null;
  const keywordHeroSubtitle = keywordCluster
    ? t(`keywordLanding.${keywordCluster.framingKeySlug}.subtitle`)
    : null;
  const [region] = useState<'EU' | 'US'>('EU');
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<ChatPhase>('initial');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [demographics, setDemographics] = useState({ age: '', sex: '' });
  // P1-01 — shared unified control + AC0 parity on residual demographics branch (Q3A).
  const [, setEntryQuestion] = useState('');
  const [, setEntryOptions] = useState<string[]>([]);
  const [clinicalAnswer, setClinicalAnswer] = useState('');
  const [consentChecked, setConsentChecked] = useState(true);
  const [report, setReport] = useState<LibertyMdNormalizedReport | null>(null);
  // P2-13 — App lifecycle parity (L9).
  const [retentionExpiresAt, setRetentionExpiresAt] = useState<string | null>(null);
  const [reportOmittedReason, setReportOmittedReason] = useState<ReportOmittedReason | null>(null);
  const [generationFailed, setGenerationFailed] = useState(false);
  const [waitMode, setWaitMode] = useState<WaitMode>('typing');
  const [lastTurnCount, setLastTurnCount] = useState(0);
  const [lastEvidenceScore, setLastEvidenceScore] = useState(0);
  const [error, setError] = useState('');
  const [safetyNotice, setSafetyNotice] = useState<LibertyMDSafetyNoticeContent | null>(null);
  const [isEmergencyAcknowledged, setIsEmergencyAcknowledged] = useState(false);
  // P0-17 — terminal classification for condition-specific heading/standing/detail.
  const [emergencyCrisisType, setEmergencyCrisisType] = useState<string | null>(null);
  const [emergencyCopyWire, setEmergencyCopyWire] = useState<LibertyMdEmergencyCopyWire | null>(null);
  const applyEmergencyFromPayload = (payload: unknown) => {
    setEmergencyCrisisType(crisisTypeFromSafetyPayload(payload));
    setEmergencyCopyWire(emergencyCopyFromPayload(payload));
  };
  const clearEmergencyPresentation = () => {
    setEmergencyCrisisType(null);
    setEmergencyCopyWire(null);
  };
  // P1-06 — residual intake progress (same helper as Chat).
  const [missingSlots, setMissingSlots] = useState<string[] | null>(null);
  const [progressHighWater, setProgressHighWater] = useState<number | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [linkedEmail, setLinkedEmail] = useState('');
  const [greetingName, setGreetingName] = useState('');
  const [profile, setProfile] = useState<LibertyMDProfile | null>(null);
  const [history, setHistory] = useState<LibertyMDHistoryItem[]>([]);
  const [entryPatients, setEntryPatients] = useState<LibertyMDPatientListItem[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isReportGateOpen, setIsReportGateOpen] = useState(false);
  const [isAccountLoading, setIsAccountLoading] = useState(true);
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [isProfileCapabilityOfferOpen, setIsProfileCapabilityOfferOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      sender: 'ai',
      kind: 'system',
      text: `Tell me what is happening, when it started, and what worries you most. I'll ask a few focused questions and flag urgent warning signs.`
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'chat' | 'doctors'>('chat');
  const [isFloatingComposerVisible, setIsFloatingComposerVisible] = useState(false);
  const [isFloatingInputFocused, setIsFloatingInputFocused] = useState(false);
  const [isHeroInputFocused, setIsHeroInputFocused] = useState(false);
  // P3-02 — landing sample report OverlaySheet (synthetic uri_mundane).
  const [isSampleReportOpen, setIsSampleReportOpen] = useState(false);
  const chatPanelRef = useRef<HTMLDivElement | null>(null);
  const logoDockHeadlineRef = useRef<HTMLDivElement | null>(null);
  const heroComposerRef = useRef<HTMLFormElement | null>(null);
  const heroSymptomsRef = useRef<HTMLTextAreaElement | null>(null);
  const hasActiveConsultRef = useRef(false);
  const demographicsReady = demographics.age.trim() && demographics.sex && clinicalAnswer.trim() && consentChecked;
  const shouldShowFloatingComposer = isFloatingComposerVisible && phase === 'initial';
  const identityPromiseRef = useRef<Promise<unknown> | null>(null);

  /** P1-06 — seed/advance high-water from server `missing_slots`. */
  const observeMissingSlots = (value: unknown) => {
    const normalized = normalizeMissingSlots(value);
    if (normalized == null) return;
    setMissingSlots(normalized);
    setProgressHighWater((prev) => nextHighWater(prev, normalized));
  };

  // P0-19 · post-layout anchor via shared hook (same contract as Chat). Bump revision on
  // transcript-affecting state; the hook schedules after layout and re-anchors on late growth.
  const [transcriptRevision, setTranscriptRevision] = useState(0);
  useEffect(() => {
    setTranscriptRevision((current) => current + 1);
  }, [messages, isTyping, report, phase, error, safetyNotice, generationFailed]);

  // P2-13 L2 — App generating wait escape (parity with Chat).
  useEffect(() => {
    if (!isTyping || waitMode !== 'reviewing') return undefined;
    const timer = window.setTimeout(() => {
      setIsTyping(false);
      setGenerationFailed(true);
      setError('');
    }, GENERATING_WAIT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [isTyping, waitMode]);

  // scrollerKey rebinds RO / pin listeners once the consult shell mounts (phase leaves
  // 'initial'). Without this the hook's mount-time effects see null refs forever.
  // P0-20: also consume showJumpToLatest / jumpToLatest for the shared pill (P0-19 deferred).
  const { scrollRef, contentRef, footerRef, showJumpToLatest, jumpToLatest } = useLibertyMDChatScroll({
    revision: transcriptRevision,
    messageRevision: messages.length,
    force: phase === 'emergency_end',
    scrollerKey: phase !== 'initial',
  });

  useEffect(() => {
    const composer = heroComposerRef.current;
    if (!composer) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsFloatingComposerVisible(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0);
      },
      { threshold: [0, 0.01] }
    );

    observer.observe(composer);
    return () => observer.disconnect();
  }, []);

  const ensureIdentity = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) {
      // P1-17: stitch device history → anon/linked Supabase id (id-only).
      const authUser = sessionData.session.user;
      identifyLibertyMdUser(authUser.id);
      const userIsAnon = authUser.is_anonymous === true
        || (!authUser.email && authUser.app_metadata?.provider === 'anonymous');
      // Local Supabase session state is authoritative enough for immediate
      // header chrome; bootstrap may enrich it but must not delay recognition.
      setIsAnonymous(userIsAnon);
      if (typeof authUser.email === 'string' && authUser.email) {
        setLinkedEmail(authUser.email);
      }
      if (!userIsAnon) {
        const metadataName = String(authUser.user_metadata?.full_name || authUser.user_metadata?.name || '').trim();
        const firstName = metadataName.split(/\s+/)[0] || String(authUser.email || '').split('@')[0];
        if (firstName) setGreetingName((current) => current || firstName);
      }
      return sessionData.session;
    }
    if (!identityPromiseRef.current) {
      identityPromiseRef.current = supabase.auth.signInAnonymously().then(({ data, error: authError }) => {
        if (authError || !data.session) throw authError || new Error('Unable to create a private LibertyMD session.');
        identifyLibertyMdUser(data.session.user.id);
        return data.session;
      });
    }
    return identityPromiseRef.current;
  };

  const invokeCareProxy = async (body: Record<string, unknown>, isRetry = false): Promise<any> => {
    await ensureIdentity();
    const { data, error: fnError } = await supabase.functions.invoke('libertymd-care-proxy', {
      body: { region, ...body }
    });
    if (fnError) {
      const errStr = String((fnError as any)?.message || fnError);
      if (!isRetry && (errStr.includes('UNAUTHORIZED_LEGACY_JWT') || errStr.includes('Invalid JWT') || (fnError as any)?.status === 401)) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (!refreshed?.session) {
          identityPromiseRef.current = null;
          await supabase.auth.signInAnonymously();
        }
        return invokeCareProxy(body, true);
      }
      if (data && typeof data === 'object') {
        Object.assign(fnError, { body: data });
      }
      throw fnError;
    }
    if (data?.error) {
      const err = new Error(String(data.error)) as Error & { status?: number; body?: unknown };
      err.body = data;
      if (data.code === 'sign_in_required') err.status = 403;
      throw err;
    }
    return data;
  };

  const refreshHistory = async () => {
    if (isAnonymous) return;
    setIsAccountLoading(true);
    try {
      const data = await invokeCareProxy({ action: 'get_history' });
      setHistory(normalizeHistorySummary(data?.history));
    } catch (historyError) {
      console.error('Unable to refresh LibertyMD history', historyError);
    } finally {
      setIsAccountLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setIsAccountLoading(true);
      try {
        const params = new URLSearchParams(window.location.search);
        const oauthConsultation = params.get('consultation');
        if (params.get('auth') === 'complete' && oauthConsultation) {
          navigate(`/liberty-md/chat?consultationId=${encodeURIComponent(oauthConsultation)}&auth=complete&lang=${language}`, { replace: true });
          return;
        }
        const action = params.get('auth') === 'complete' ? 'sync_identity' : 'bootstrap';
        // P1-19 — capture allow-listed URL attribution + mint session key before App→Chat drop.
        const landingAttribution = buildLandingAttributionPayload({
          search: params,
          pathname: window.location.pathname,
          locale: language,
          captureUrl: true,
        });
        const data = await invokeCareProxy({
          action,
          consultation_id: oauthConsultation || undefined,
          ...landingAttribution,
        });
        if (typeof data?.landing_session_id === 'string') {
          rememberLandingSessionId(data.landing_session_id);
        }
        if (cancelled) return;
        if (action === 'sync_identity') {
          // P1-17: same-id Google link stitch + client-only identity_linked.
          const { data: linkSession } = await supabase.auth.getSession();
          const linkedId = linkSession?.session?.user?.id;
          if (linkedId) identifyLibertyMdUser(linkedId);
          emitIdentityLinked({
            was_merge: false,
            merge_outcome: 'success',
            method: 'google_link',
          });
        }
        setIsAnonymous(Boolean(data?.is_anonymous));
        setGreetingName(String(data?.greeting_name || ''));
        setProfile(data?.profile || null);
        if (data?.profile?.age || data?.profile?.sex_at_birth) {
          setDemographics({
            age: data.profile.age ? String(data.profile.age) : '',
            sex: String(data.profile.sex_at_birth || ''),
          });
        }
        setHistory(normalizeHistorySummary(data?.history));
        setEntryPatients(normalizePatientList(data?.patients));
        if (data?.report && oauthConsultation) {
          setSessionId(oauthConsultation);
          setReport(normalizeReportData(data.report));
          setPhase('report_ready');
          hasActiveConsultRef.current = true;
          const consult = await invokeCareProxy({ action: 'get_consultation', consultation_id: oauthConsultation });
          if (!cancelled) {
            const nextPhase = String(consult?.consultation?.status || '') === 'emergency_stopped'
              ? 'emergency_end'
              : 'report_ready';
            if (Array.isArray(consult?.messages)) {
              const emergencyStopped = nextPhase === 'emergency_end';
              setMessages(consult.messages.map((item: any, index: number) => ({
                id: `${oauthConsultation}-${index}`,
                sender: item.role === 'user' ? 'user' : 'ai',
                text: item.content,
                options: Array.isArray(item.options) ? item.options : [],
                kind: item.message_type === 'report_gate'
                  ? 'report'
                  : item.message_type === 'safety' && emergencyStopped
                    ? 'emergency'
                    : 'normal',
              })));
              // P0-17 AC14: get_consultation returns top-level crisis_type / care_setting.
              if (emergencyStopped) {
                applyEmergencyFromPayload(consult);
                setPhase('emergency_end');
              }
            }
            // P2-13 L5/L6 — retention + omit honesty on App hydrate.
            const expires = typeof consult?.retention_expires_at === 'string'
              ? consult.retention_expires_at
              : null;
            const omitted = consult?.report_omitted_reason === 'retention_expired'
              ? 'retention_expired' as const
              : null;
            setRetentionExpiresAt(expires);
            setReportOmittedReason(omitted);
            if (consult?.report) {
              setReport(normalizeReportData(consult.report));
            } else if (shouldClearStaleReportOnHydrate({
              phase: nextPhase === 'emergency_end' ? 'report_ready' : nextPhase,
              hasIncomingReport: false,
              reportOmittedReason: omitted,
              retentionExpiresAt: expires,
            })) {
              setReport(null);
              setPhase('report_ready');
            }
          }
        } else if (data?.greeting_name) {
          setMessages([{
            id: '1',
            sender: 'ai',
            kind: 'system',
            text: `Hi ${data.greeting_name}, tell me what is happening, when it started, and what worries you most.`,
          }]);
        }
        if (params.has('auth')) {
          window.history.replaceState({}, '', window.location.pathname);
        }
      } catch (bootstrapError) {
        if (!cancelled) setError(patientFacingTechnicalMessage(bootstrapError, 'Unable to initialize LibertyMD.'));
      } finally {
        if (!cancelled) setIsAccountLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const beginConsultation = (
    symptom: string,
    entry?: { entry_type?: 'chip' | 'freetext'; chip_id?: string },
  ) => {
    const cleanedSymptom = symptom.trim();
    if (!cleanedSymptom) return;

    setError('');
    setSafetyNotice(null);
    const draftId = crypto.randomUUID();
    const entryType = entry?.entry_type === 'chip' && entry.chip_id ? 'chip' : 'freetext';
    navigate(`/liberty-md/chat?draftId=${encodeURIComponent(draftId)}`, {
      state: {
        libertyMDStartRequest: {
          draftId,
          symptom: cleanedSymptom,
          entry_type: entryType,
          ...(entryType === 'chip' && entry?.chip_id ? { chip_id: entry.chip_id } : {}),
          profile,
          isAnonymous,
          history,
          demographics,
          patients: entryPatients,
        },
      },
    });
  };

  const sendToWorkflow = async (text: string, activeSessionId?: string) => {
    const sid = activeSessionId || sessionId;
    if (!sid) return;
    const nextWait = predictWaitModeFromLastKnown({
      lastTurnCount,
      evidenceScore: lastEvidenceScore,
    });
    setWaitMode(nextWait);
    setGenerationFailed(false);
    setIsTyping(true);
    setError('');
    try {
      const clientMessageId = crypto.randomUUID();
      let data: any = null;
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          data = await invokeCareProxy({
            action: 'send_message',
            consultation_id: sid,
            message: text,
            client_message_id: clientMessageId,
          });
          lastError = null;
          break;
        } catch (invokeError) {
          lastError = invokeError;
          if (attempt === 0) await new Promise(resolve => window.setTimeout(resolve, 500));
        }
      }
      if (lastError) throw lastError;

      if (Number.isFinite(Number(data?.turn_count))) {
        setLastTurnCount(Math.max(0, Math.floor(Number(data.turn_count))));
      }
      if (Number.isFinite(Number(data?.evidence_score))) {
        setLastEvidenceScore(Number(data.evidence_score));
      }

      if (data?.emergency || data?.state === 'emergency_stopped') {
        applyEmergencyFromPayload(data);
        setPhase('emergency_end');
        setSafetyNotice(null);
        setMessages(prev => [...prev, {
          id: `${Date.now()}-emergency`,
          sender: 'ai',
          kind: 'emergency',
          text: String(data?.message || resolveLibertyMdEmergencyCopy(crisisTypeFromSafetyPayload(data)).detail),
        }]);
        return;
      }

      if (data?.clinical_review_needed) {
        setGenerationFailed(false);
        setPhase('clinical_review_needed');
        setMessages(prev => [...prev, {
          id: `${Date.now()}-review`,
          sender: 'ai',
          kind: 'system',
          text: data.message || t('report.lifecycle.partialBody'),
        }]);
        return;
      }

      if (data?.report_ready) {
        setGenerationFailed(false);
        // P2-02 Q3: setReport under soft gate before release.
        if (typeof data?.retention_expires_at === 'string') {
          setRetentionExpiresAt(data.retention_expires_at);
        }
        setReportOmittedReason(null);
        if (data?.report) setReport(normalizeReportData(data.report));
        if (data?.auth_required) {
          setPhase('report_gate');
          setIsReportGateOpen(shouldOpenSoftGate(true, sessionId));
        } else {
          setPhase('report_ready');
          await refreshHistory();
        }
        setMessages(prev => [...prev, {
          id: `${Date.now()}-report`,
          sender: 'ai',
          kind: 'report',
          text: data?.auth_required
            ? 'Your LibertyMD report is ready. Link Google to save it, or continue without saving.'
            : 'Your LibertyMD report is ready and saved in your consultation history.',
        }]);
        return;
      }

      setPhase('intake');
      setSafetyNotice(libertyMDSafetyNoticeFromResponse(data));
      observeMissingSlots(data?.missing_slots);
      setMessages(prev => [...prev, {
        id: `${Date.now()}-ai`,
        sender: 'ai',
        text: data?.next_question || 'Could you tell me more about that?',
        options: Array.isArray(data?.options) ? data.options : [],
      }]);
    } catch (err) {
      console.error('LibertyMD send-path failure', err);
      // P0-09 / P0-12-safe: never echo err.message or internal names into user UI.
      // P2-13 L3 — diagnosis-eligible technical miss → generation failed shell.
      if (nextWait === 'reviewing') {
        setGenerationFailed(true);
        setError('');
      } else {
        const message = 'Something went wrong on our side. Please try again.';
        setError(message);
        setPhase('error');
        setMessages(prev => [...prev, {
          id: `${Date.now()}-error`,
          sender: 'ai',
          kind: 'system',
          text: message,
        }]);
      }
    } finally {
      setIsTyping(false);
    }
  };

  const submitDemographics = async () => {
    if (!sessionId || !demographicsReady || isTyping) return;
    const answer = clinicalAnswer.trim();
    if (!answer) return;
    setIsTyping(true);
    setError('');
    try {
      const data = await invokeCareProxy({
        action: 'save_demographics',
        consultation_id: sessionId,
        age: Number(demographics.age),
        sex_at_birth: demographics.sex,
        message: answer,
      });
      setProfile(prev => ({ ...prev, age: Number(demographics.age), sex_at_birth: demographics.sex }));
      // P1-01 AC0 — same emergency early-return as interview send; never fall through to next_question.
      if (data?.emergency || data?.state === 'emergency_stopped') {
        setMessages(prev => [...prev,
          {
            id: `${Date.now()}-demographic-answer`,
            sender: 'user',
            text: `Age ${demographics.age}; ${demographics.sex}`,
          },
          {
            id: `${Date.now()}-clinical-answer`,
            sender: 'user',
            text: answer,
          },
          {
            id: `${Date.now()}-demographics-emergency`,
            sender: 'ai',
            kind: 'emergency',
            text: String(data?.message || resolveLibertyMdEmergencyCopy(crisisTypeFromSafetyPayload(data)).detail),
          },
        ]);
        setSafetyNotice(null);
        applyEmergencyFromPayload(data);
        setPhase('emergency_end');
        return;
      }
      setMessages(prev => [...prev,
        {
          id: `${Date.now()}-demographic-answer`,
          sender: 'user',
          text: `Age ${demographics.age}; ${demographics.sex}`,
        },
        {
          id: `${Date.now()}-clinical-answer`,
          sender: 'user',
          text: answer,
        },
        {
          id: `${Date.now()}-first-question`,
          sender: 'ai',
          text: data?.next_question || 'When did this symptom begin?',
          options: Array.isArray(data?.options) ? data.options : [],
        },
      ]);
      setEntryQuestion('');
      setEntryOptions([]);
      setClinicalAnswer('');
      setSafetyNotice(libertyMDSafetyNoticeFromResponse(data));
      observeMissingSlots(data?.missing_slots);
      setPhase('intake');
    } catch (demographicsError) {
      setError(patientFacingTechnicalMessage(demographicsError, 'Unable to save the clinical context.'));
      setPhase('demographics_required');
    } finally {
      setIsTyping(false);
    }
  };

  const handleSend = (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isTyping) return;
    setInput('');
    void beginConsultation(text, { entry_type: 'freetext' });
  };

  /** P3-02 — sample CTA uses freetext (not chip / not invent `sample` entry_type). */
  const handleSampleReportStart = (complaint: string) => {
    if (isTyping) return;
    void beginConsultation(complaint, { entry_type: 'freetext' });
  };

  const startGoogleLink = async () => {
    setIsAuthBusy(true);
    setError('');
    try {
      await ensureIdentity();
      const query = new URLSearchParams({ auth: 'complete' });
      if (sessionId) query.set('consultation', sessionId);
      const { error: linkError } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/liberty-md?${query.toString()}` },
      });
      if (linkError) throw linkError;
    } catch (linkError) {
      setError(patientFacingTechnicalMessage(linkError, 'Unable to start Google sign in.'));
      setIsAuthBusy(false);
    }
  };

  /**
   * Header Sign In — uses signInWithOAuth (proven to redirect).
   * The linkIdentity approach works for the in-consultation drawer (where
   * an anonymous session is already established), but silently fails on the
   * landing page before any consultation has started.
   */
  const startGoogleSignIn = async () => {
    setIsAuthBusy(true);
    setError('');
    try {
      const query = new URLSearchParams({ auth: 'complete' });
      if (sessionId) query.set('consultation', sessionId);
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/liberty-md?${query.toString()}`,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (oauthError) throw oauthError;
    } catch (oauthError) {
      setError(patientFacingTechnicalMessage(oauthError, 'Unable to start Google sign in.'));
      setIsAuthBusy(false);
    }
  };

  /** P1-04 Q4A — tap → create_patient → offer on reject. */
  const attemptAddProfile = async (source: 'drawer' | 'unified_entry') => {
    setIsMenuOpen(false);
    try {
      await invokeCareProxy(anonymousAddProfileProbeBody());
    } catch (createError) {
      const { status, body } = await readFunctionsErrorPayload(createError);
      const reason = resolveProfileCapabilityOffer(status, body);
      setIsProfileCapabilityOfferOpen(true);
      emitProfileCapabilityOfferShown(reason ? (source === 'drawer' ? 'drawer' : 'unified_entry') : 'create_reject');
    }
  };

  /** P4-04 — AccountDrawer linked profile CRUD via proxy only. */
  const profileManagementHandlers = !isAnonymous ? {
    fetchList: async () => {
      const data = await invokeCareProxy(listOwnedPatientsBody());
      return normalizeManagedPatientList(data?.patients);
    },
    create: async (input: { display_label: string; age: number; sex_at_birth: 'female' | 'male' }) => {
      try {
        await invokeCareProxy(someoneElseCreateBody(input));
      } catch (createError) {
        const { status, body } = await readFunctionsErrorPayload(createError);
        throw new Error(classifyProfileManagementFailure(status, body).message);
      }
    },
    update: async (input: {
      patient_id: string;
      display_label?: string;
      age: number;
      sex_at_birth: string;
    }) => {
      try {
        const data = await invokeCareProxy(updatePatientBody(input));
        if (data?.profile && typeof data.profile === 'object') {
          const next = data.profile as { age?: number; sex_at_birth?: string };
          setProfile((current: any) => current ? {
            ...current,
            ...(typeof next.age === 'number' ? { age: next.age } : {}),
            ...(typeof next.sex_at_birth === 'string' ? { sex_at_birth: next.sex_at_birth } : {}),
          } : current);
        }
      } catch (updateError) {
        const { status, body } = await readFunctionsErrorPayload(updateError);
        throw new Error(classifyProfileManagementFailure(status, body).message);
      }
    },
    remove: async (patientId: string) => {
      try {
        await invokeCareProxy(deletePatientBody(patientId));
      } catch (deleteError) {
        const { status, body } = await readFunctionsErrorPayload(deleteError);
        throw new Error(classifyProfileManagementFailure(status, body).message);
      }
    },
  } : null;

  const startCapabilityGoogleLink = async () => {
    emitProfileCapabilityOfferCta('create_reject');
    setIsProfileCapabilityOfferOpen(false);
    await startGoogleLink();
  };

  const skipReportGate = async () => {
    if (!sessionId) return;
    setIsAuthBusy(true);
    try {
      const data = await invokeCareProxy({ action: 'release_report', consultation_id: sessionId, mode: 'skip' });
      markSoftGateDismissed(sessionId);
      setReport(normalizeReportData(data.report));
      setPhase('report_ready');
      setIsReportGateOpen(false);
    } catch (releaseError) {
      setError(patientFacingTechnicalMessage(releaseError, 'Unable to release the report.'));
    } finally {
      setIsAuthBusy(false);
    }
  };

  const dismissReportGate = () => {
    if (sessionId) markSoftGateDismissed(sessionId);
    setIsReportGateOpen(false);
  };

  /** P2-08 — email-me mint/send; does not gate on-screen report. */
  const requestReportEmail = async (email: string) => {
    if (!sessionId) {
      throw new Error('Consultation is not ready for email delivery.');
    }
    try {
      await invokeCareProxy(requestReportEmailBody(sessionId, email));
      emitReportDeliveryRequested({ method: 'email' });
    } catch (sendError) {
      void sendError;
      throw new Error('We could not send the email right now.');
    }
  };

  const loadConsultation = async (consultationId: string) => {
    setIsMenuOpen(false);
    navigate(`/liberty-md/chat?consultationId=${encodeURIComponent(consultationId)}&lang=${language}`);
  };

  const resetConsult = () => {
    hasActiveConsultRef.current = false;
    setInput('');
    setPhase('initial');
    setSessionId(null);
    setReport(null);
    setRetentionExpiresAt(null);
    setReportOmittedReason(null);
    setGenerationFailed(false);
    setWaitMode('typing');
    setLastTurnCount(0);
    setLastEvidenceScore(0);
    setError('');
    setSafetyNotice(null);
    setIsEmergencyAcknowledged(false);
    clearEmergencyPresentation();
    setIsReportGateOpen(false);
    setMissingSlots(null);
    setProgressHighWater(null);
    setDemographics({ age: profile?.age ? String(profile.age) : '', sex: profile?.sex_at_birth || '' });
    setMessages([
      {
        id: '1',
        sender: 'ai',
        kind: 'system',
        text: `${greetingName ? `Hi ${greetingName}, ` : ''}tell me what is happening, when it started, and what worries you most.`
      }
    ]);
  };

  const activeOptions = messages[messages.length - 1]?.options || [];
  const isComposerLocked = isTyping || ['demographics_required', 'report_gate', 'report_ready', 'emergency_end', 'clinical_review_needed'].includes(phase);
  // P0-21 Q1 B1: hide locked composer while report-gate open CTA owns the footer.
  // P2-06: after soft-gate dismiss-once, do not re-nag via “View report options”.
  const softGateDismissed = Boolean(sessionId && isSoftGateDismissed(sessionId));
  const reportLifecycle = deriveReportLifecycleState({
    phase,
    isBusy: isTyping,
    waitMode,
    hasReportBody: Boolean(report),
    reportOmittedReason,
    retentionExpiresAt,
    generationFailed,
    lastTurnCount,
    evidenceScore: lastEvidenceScore,
  });
  const guestExpired = reportLifecycle === 'guest_expired';
  const continuationOwnsFooter =
    phase === 'report_gate' && !isReportGateOpen && !softGateDismissed && !guestExpired;
  const continuationAction = continuationOwnsFooter
    ? {
        type: 'report_gate' as const,
        onOpen: () => { setIsReportGateOpen(true); },
      }
    : phase === 'clinical_review_needed'
      ? {
          type: 'clinical_review_start_fresh' as const,
          onStartFresh: () => { resetConsult(); },
        }
      : null;
  const isEmergencyStopped = phase === 'emergency_end';
  const emergencyCopy = pickEmergencyCopyForDisplay(emergencyCopyWire, emergencyCrisisType);
  const emergencyDetail = isEmergencyStopped
    ? String([...messages].reverse().find((item) => item.kind === 'emergency')?.text || emergencyCopy.detail)
    : '';
  const emergencyHeading = emergencyCopy.heading;
  const emergencyStandingInstruction = emergencyCopy.standingInstruction;
  const showInterviewProgress = shouldShowInterviewProgress(phase);
  const interviewProgressView = showInterviewProgress
    ? buildProgressView({ missingSlots, highWaterRatio: progressHighWater })
    : null;

  useEffect(() => {
    if (!isEmergencyStopped) {
      setIsEmergencyAcknowledged(false);
      clearEmergencyPresentation();
    }
  }, [isEmergencyStopped, sessionId]);
  return (
    <div
      className="min-h-[100svh] text-center text-libertymd-ink font-sans selection:bg-libertymd-blue-600 selection:text-white [&_input]:text-center [&_select]:text-center [&_textarea]:text-center"
      style={{
        background:
          'var(--libertymd-surface-wash)',
      }}
    >
      <main>
        <section className="libertymd-page-gutter relative z-10 flex min-h-[100svh] flex-col overflow-visible">
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(255,255,255,0.94)_0%,rgba(247,250,255,0.9)_54%,rgba(240,248,243,0.96)_100%)]" />

          <header className="libertymd-hero-header libertymd-shell libertymd-safe-top flex min-h-16 shrink-0 items-center justify-between">
            <a
              href="/liberty-md"
              aria-label="LibertyMD home"
              className="inline-flex items-center gap-2 font-serif text-xl font-semibold text-libertymd-ink transition-colors hover:text-libertymd-blue-600 sm:gap-2.5 sm:text-2xl"
            >
              <img
                src="/images/libertymd-logo-mark.svg"
                alt=""
                aria-hidden="true"
                className="h-8 w-8 shrink-0 object-contain sm:h-9 sm:w-9"
              />
              LibertyMD
            </a>

            <div className="flex items-center gap-2 text-sm font-semibold text-libertymd-slate-700 sm:gap-3">
              {!isAnonymous && greetingName && <span className="hidden sm:inline">Hi, {greetingName}</span>}
              <LibertyMDLanguageSwitcher />
              {isAnonymous && (
                <button
                  id="libertymd-homepage-signin-btn"
                  type="button"
                  aria-label="Sign in with Google"
                  disabled={isAuthBusy}
                  onClick={() => { void startGoogleSignIn(); }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-libertymd-blue-600/30 bg-libertymd-blue-600/5 px-2.5 py-1.5 text-xs font-semibold text-libertymd-blue-600 transition-colors hover:bg-libertymd-blue-600 hover:text-white sm:px-4 sm:text-sm"
                >
                  <LogIn className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Sign in</span>
                </button>
              )}
              <button
                type="button"
                aria-label="Open profile and consultation history"
                onClick={() => {
                  setIsMenuOpen(true);
                  if (!isAnonymous) void refreshHistory();
                }}
                className="inline-flex min-h-11 min-w-11 items-center justify-center text-libertymd-ink transition-colors hover:text-libertymd-blue-600"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </header>

          <div className="libertymd-hero-content libertymd-shell flex flex-1 flex-col items-center justify-center pb-8 text-center sm:pb-0 [@media(max-height:700px)]:pb-0">
            <style>
              {`
                @keyframes libertymd-proof-reveal {
                  from { opacity: 0; transform: translateY(5px); }
                  to { opacity: 1; transform: translateY(0); }
                }

                .libertymd-tagline-word {
                  opacity: 0;
                  animation: libertymd-proof-reveal 520ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
                }

                @keyframes libertymd-placeholder-dot-pulse {
                  0%, 62%, 100% { opacity: 0.24; transform: translateY(0); }
                  28% { opacity: 1; transform: translateY(-2px); }
                }

                .libertymd-placeholder-dot {
                  display: inline-block;
                  animation: libertymd-placeholder-dot-pulse 1.5s ease-in-out infinite;
                  color: var(--libertymd-blue-600);
                  will-change: opacity, transform;
                }

                .libertymd-start-chat-cta {
                  box-shadow:
                    inset 0 1px 0 rgba(255, 255, 255, 0.44),
                    inset 0 -1px 0 rgba(15, 54, 153, 0.28),
                    0 11px 26px rgba(37, 99, 235, 0.34);
                  transform: translateY(0);
                }

                .libertymd-start-chat-cta::before {
                  content: '';
                  position: absolute;
                  top: -35%;
                  bottom: -35%;
                  left: -42%;
                  width: 24%;
                  background: linear-gradient(
                    105deg,
                    rgba(255, 255, 255, 0) 0%,
                    rgba(255, 255, 255, 0.16) 30%,
                    rgba(255, 255, 255, 0.62) 50%,
                    rgba(255, 255, 255, 0.16) 70%,
                    rgba(255, 255, 255, 0) 100%
                  );
                  filter: blur(1px);
                  pointer-events: none;
                  transform: translateX(-180%) skewX(-16deg);
                  will-change: transform;
                }

                @keyframes libertymd-start-chat-satin-shine {
                  0% { transform: translateX(-180%) skewX(-16deg); }
                  18% { transform: translateX(700%) skewX(-16deg); }
                  100% { transform: translateX(700%) skewX(-16deg); }
                }

                @keyframes libertymd-start-chat-hover-shine {
                  from { transform: translateX(-180%) skewX(-16deg); }
                  to { transform: translateX(700%) skewX(-16deg); }
                }

                .libertymd-start-chat-cta--waiting::before {
                  animation: libertymd-start-chat-satin-shine 9.6s cubic-bezier(0.4, 0, 0.2, 1) 1.2s infinite;
                }

                .libertymd-start-chat-cta:hover {
                  background-color: var(--libertymd-blue-700);
                  box-shadow:
                    inset 0 1px 0 rgba(255, 255, 255, 0.5),
                    inset 0 -1px 0 rgba(15, 54, 153, 0.3),
                    0 13px 30px rgba(37, 99, 235, 0.4);
                }

                .libertymd-start-chat-cta:hover::before {
                  animation: libertymd-start-chat-hover-shine 1.45s cubic-bezier(0.4, 0, 0.2, 1) 1;
                }

                .libertymd-start-chat-cta:active {
                  transform: translateY(1px) scale(0.99);
                  box-shadow:
                    inset 0 1px 0 rgba(255, 255, 255, 0.34),
                    inset 0 -1px 0 rgba(15, 54, 153, 0.34),
                    0 7px 18px rgba(37, 99, 235, 0.3);
                }

                .libertymd-start-chat-arrow {
                  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
                }

                .libertymd-start-chat-cta:hover .libertymd-start-chat-arrow {
                  transform: translateX(3px);
                }

                @media (prefers-reduced-motion: reduce) {
                  .libertymd-start-chat-cta,
                  .libertymd-start-chat-cta::before,
                  .libertymd-start-chat-arrow,
                  .libertymd-tagline-word,
                  .libertymd-placeholder-dot {
                    animation: none !important;
                    transform: none !important;
                  }

                  .libertymd-tagline-word,
                  .libertymd-placeholder-dot {
                    opacity: 1 !important;
                  }
                }
              `}
            </style>

            <div className="libertymd-hero-wordmark flex items-center justify-center gap-2.5 sm:gap-4">
              <img
                src="/images/libertymd-logo-mark.svg"
                alt=""
                aria-hidden="true"
                className="libertymd-hero-wordmark-icon h-9 w-9 shrink-0 translate-y-[2px] object-contain sm:h-14 sm:w-14 [@media(max-height:700px)]:h-8 [@media(max-height:700px)]:w-8"
              />
              <h1 className="libertymd-hero-title font-serif text-[56px] font-semibold leading-none text-libertymd-ink sm:text-7xl [@media(max-height:700px)]:whitespace-nowrap [@media(max-height:700px)]:text-5xl">
                LibertyMD
              </h1>
            </div>
            <p
              className="libertymd-hero-value mt-3 text-base font-semibold leading-6 text-libertymd-slate-700 sm:text-lg"
              data-libertymd-keyword-framing={keywordCluster ? keywordCluster.matched_topic_slug : 'generic'}
            >
              {keywordHeroTitle || t('hero.title')}
            </p>
            {keywordHeroSubtitle ? (
              <p className="libertymd-hero-keyword-subtitle mt-1 max-w-xl text-sm font-medium leading-5 text-libertymd-slate-500 sm:text-base">
                {keywordHeroSubtitle}
              </p>
            ) : null}
            {/* Free · Anonymous · Built by Doctors — under the title, as in the
                original design. The rating / install-base / HIPAA row sits
                beneath the composer instead (see below). */}
            <p
              className="libertymd-hero-tagline mt-2 flex min-h-6 flex-wrap items-center justify-center gap-x-2 text-sm font-bold text-libertymd-navy sm:gap-x-3 sm:text-base"
              aria-label="Free, Anonymous, Built by Doctors"
            >
              {[t('hero.taglineFree'), t('hero.taglineAnonymous'), t('hero.taglineBuiltByDoctors')].map((phrase, index) => (
                <span
                  key={phrase}
                  className="libertymd-tagline-word inline-flex items-center gap-2 sm:gap-3"
                  style={{ animationDelay: `${220 + index * 120}ms` }}
                >
                  {index > 0 && (
                    <span aria-hidden="true" className="text-libertymd-blue-600">
                      •
                    </span>
                  )}
                  <span>{phrase}</span>
                </span>
              ))}
            </p>
            {/* BO 2026-08-01: hero time promise removed. The same expectation is
                still set inside the consult (interview expectations header), so
                the promise is made where it is actionable rather than on the
                landing hero. */}

            <LibertyMDPremiumLogo
              active={phase === 'initial'}
              dockHeadlineRef={logoDockHeadlineRef}
              className="z-10 mt-[var(--libertymd-gap-tagline-logo)] mb-4 sm:mb-[var(--libertymd-gap-pedestal-input)]"
            />

            <div className="libertymd-composer-width relative z-20">
              <form
                ref={heroComposerRef}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!input.trim()) {
                    heroSymptomsRef.current?.focus();
                    return;
                  }
                  handleSend();
                }}
                className="libertymd-hero-composer relative w-full rounded-[20px] border-[1.5px] border-libertymd-mist bg-white/[0.94] p-5 pt-7 text-center shadow-[0_18px_48px_rgba(37,99,235,0.16),0_4px_14px_rgba(15,23,42,0.1),inset_0_1px_0_rgba(255,255,255,0.95)] ring-1 ring-libertymd-blue-600/10 backdrop-blur-md sm:bg-white/[0.94] sm:shadow-[0_18px_60px_rgba(15,23,42,0.1),0_4px_18px_rgba(37,99,235,0.08)]"
              >
                <label
                  htmlFor="libertymd-hero-symptoms"
                  className="absolute -top-4 left-5 rounded-full bg-libertymd-green-sage px-4 py-2 text-sm font-black text-libertymd-ink shadow-[0_4px_12px_rgba(91,125,44,0.08)] sm:left-8 sm:px-5 sm:text-base [@media(max-height:700px)]:left-5 [@media(max-height:700px)]:px-4 [@media(max-height:700px)]:py-2 [@media(max-height:700px)]:text-xs"
                >
                  {t('hero.whatBringsYouIn')}
                </label>
                <div className="libertymd-hero-composer-field relative w-full">
                  {!input && !isHeroInputFocused && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 top-0 px-4 py-2 !text-left text-base leading-7 text-libertymd-slate-500 sm:px-5 sm:py-4 sm:text-xl [@media(max-height:700px)]:px-3 [@media(max-height:700px)]:py-1 [@media(max-height:700px)]:text-xs [@media(max-height:700px)]:leading-5"
                    >
                      <span className="sm:hidden">{t('hero.placeholderShort')}</span>
                      <span className="hidden sm:inline">{t('hero.placeholderLong')}</span>
                      <span className="ml-0.5 inline-flex" aria-hidden="true">
                        {[0, 1, 2].map((dot) => (
                          <span
                            key={dot}
                            className="libertymd-placeholder-dot"
                            style={{ animationDelay: `${dot * 180}ms` }}
                          >
                            .
                          </span>
                        ))}
                      </span>
                    </div>
                  )}
                  <textarea
                    ref={heroSymptomsRef}
                    id="libertymd-hero-symptoms"
                    aria-label="Describe your symptoms or ask a health question"
                    rows={3}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    disabled={isTyping}
                    onFocus={() => setIsHeroInputFocused(true)}
                    onBlur={() => setIsHeroInputFocused(false)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        handleSend();
                      }
                    }}
                    className="libertymd-hero-symptoms h-full min-h-0 w-full resize-none overflow-y-auto bg-transparent px-4 py-2 !text-left text-base leading-7 text-libertymd-slate-700 caret-libertymd-blue-600 outline-none sm:px-5 sm:py-4 sm:text-xl [@media(max-height:700px)]:px-3 [@media(max-height:700px)]:py-1 [@media(max-height:700px)]:text-xs [@media(max-height:700px)]:leading-5"
                  />
                </div>
                <button
                  type="submit"
                  aria-label={input.trim() ? 'Start LibertyMD chat' : 'Start by describing your symptoms'}
                  disabled={isTyping}
                  className={`libertymd-start-chat-cta ${!input.trim() ? 'libertymd-start-chat-cta--waiting' : ''} absolute bottom-5 left-5 right-5 isolate inline-flex h-[52px] cursor-pointer items-center justify-center gap-3 overflow-hidden rounded-full bg-libertymd-blue-600 px-8 text-base font-bold text-white ring-1 ring-white/60 transition-[background-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-libertymd-blue-500 sm:bottom-5 sm:left-auto sm:right-5 sm:h-14 sm:w-64 [@media(max-height:700px)]:bottom-4 [@media(max-height:700px)]:left-4 [@media(max-height:700px)]:right-4 [@media(max-height:700px)]:h-12 [@media(max-height:700px)]:w-auto`}
                >
                  {isTyping ? <Loader2 className="relative z-10 h-5 w-5 animate-spin" /> : null}
                  <span className="relative z-10">{isTyping ? t('hero.startChatOpening') : t('common.startChat')}</span>
                  {!isTyping && <ArrowRight className="libertymd-start-chat-arrow relative z-10 h-5 w-5" />}
                </button>
              </form>

              {/* BO 2026-08-01: complaint chips removed from the hero; the
                  free-text composer is now the only entry control. The chip
                  catalogue and the proxy's `entry_type`/`chip_id` contract are
                  deliberately left intact so keyword landings and historic
                  funnel slices still resolve. */}

              {/* Trust row — rating, install base, HIPAA. Restored to the original
                  layout: spread edge-to-edge under the composer with
                  `justify-between`, not centred, and the rating drawn as filled
                  boxes rather than bare glyphs.

                  Figures are the operating business's, supplied by the BO; they
                  are not derived from this project's database, and they live in
                  i18n so a correction is one edit.

                  Viewport handling follows the original: the numeral and the
                  long labels are desktop-only, icons and gaps step up at `sm`,
                  and a short viewport tightens the top margin so the row never
                  pushes the composer off screen. */}
              <div className="libertymd-hero-trust-row mt-2 flex flex-row items-center justify-between gap-2 text-xs font-medium text-libertymd-slate-500 sm:text-sm [@media(max-height:700px)]:mt-0 [@media(max-height:700px)]:gap-1">
                <div className="flex flex-nowrap items-center justify-start gap-2 [@media(max-height:700px)]:gap-1">
                  <span className="hidden sm:inline">{t('app.heroTrustRatingShort')}</span>
                  <span className="inline-flex gap-0.5" aria-label={t('app.heroTrustRating')}>
                    {[0, 1, 2, 3, 4].map((item) => (
                      item === 4 ? (
                        // Half star: a token-clean 50/50 fill. The original used a
                        // raw-hex linear-gradient, which design-guard now rejects.
                        <span
                          key={item}
                          className="relative inline-flex h-5 w-5 items-center justify-center overflow-hidden bg-libertymd-slate-300"
                        >
                          <span className="absolute inset-y-0 left-0 w-1/2 bg-libertymd-green-600" aria-hidden="true" />
                          <Star className="relative h-3.5 w-3.5 fill-white text-white" aria-hidden="true" />
                        </span>
                      ) : (
                        <span
                          key={item}
                          className="inline-flex h-5 w-5 items-center justify-center bg-libertymd-green-600"
                        >
                          <Star className="h-3.5 w-3.5 fill-white text-white" aria-hidden="true" />
                        </span>
                      )
                    ))}
                  </span>
                </div>
                <span
                  className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-semibold text-libertymd-navy sm:gap-2"
                  aria-label={t('app.trustedBy')}
                >
                  <UsersRound className="h-4 w-4 shrink-0 text-libertymd-navy sm:h-5 sm:w-5" aria-hidden="true" />
                  <span className="sm:hidden">{t('app.trustedByShort')}</span>
                  <span className="hidden sm:inline">{t('app.trustedBy')}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-libertymd-navy sm:gap-2">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-libertymd-navy sm:h-5 sm:w-5" aria-hidden="true" />
                  <span className="sm:hidden">{t('app.heroTrustHipaaShort')}</span>
                  <span className="hidden sm:inline">{t('app.heroTrustHipaa')}</span>
                </span>
              </div>
              {/* P3-02 — hero-adjacent sample report entry. */}
              <div className="mt-2 flex justify-center sm:mt-3">
                <button
                  type="button"
                  data-libertymd-sample-report-entry=""
                  disabled={isTyping}
                  onClick={() => setIsSampleReportOpen(true)}
                  className="libertymd-type-body-small font-semibold text-libertymd-blue-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-libertymd-blue-600 focus-visible:ring-offset-2 disabled:opacity-50"
                >
                  {t('sampleReport.entry')}
                </button>
              </div>

              {error && phase === 'initial' && (
                <p role="alert" className="mt-2 text-center text-xs font-semibold text-amber-800">
                  {error}
                </p>
              )}
            </div>
          </div>

          <LibertyMDParticleWaveSeparator />
        </section>

        <section ref={chatPanelRef} className="libertymd-page-gutter relative z-0 bg-[linear-gradient(180deg,rgba(245,250,243,0.96),rgba(237,247,241,0.98))] pb-16 pt-[300px] sm:pt-[340px]">
          {(() => {
            const sectionHeader = (
              <div ref={logoDockHeadlineRef} className="mx-auto max-w-3xl text-center pt-24 sm:pt-28">
                <h2 className="text-4xl font-black leading-tight tracking-normal text-libertymd-ink sm:text-5xl">
                  {t('app.howItWorksTitle')}
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-base font-bold leading-7 text-libertymd-navy sm:text-lg">
                  {t('app.howItWorksSubtitle')}
                </p>
              </div>
            );
            return phase === 'initial' ? (
              <LibertyMDPhaseStack header={sectionHeader} onOpenSampleReport={() => setIsSampleReportOpen(true)} />
            ) : (
              sectionHeader
            );
          })()}

          {phase === 'initial' ? null : (
            <div className="libertymd-content-shell mx-auto mt-14 max-w-4xl text-center">
              {/*
                P0-19 · Chat-like consult shell: fixed-height flex column so the transcript
                owns overflow (internal scroller + sibling footer chrome). Keeps marketing
                page flow outside this shell.
              */}
              {/*
                P0-24 Q2A: height governed by svh — no fixed min-h-[560px] that beats short 70svh.
                Internal scroller + sibling footer (DoD+): full-bleed consult column cannot use
                document scroll without covering composer; Lenis isolation via data-lenis-prevent.
                Mid-consult browser leave drops React-only sessionId/phase — no recovery UI this
                ticket; durable resume lives on Chat / loadConsultation.
              */}
              <div className="libertymd-consult-shell flex h-[min(70svh,720px)] min-h-0 flex-col">
              <div className="mb-4 flex shrink-0 items-center justify-between border-b border-libertymd-green-sage pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-libertymd-green-600" />
                  <span className="text-sm font-bold text-libertymd-ink">{t('app.careAssistant')}</span>
                  <span className="hidden text-xs text-libertymd-slate-500 sm:inline">Private session · {region}</span>
                </div>
                <button
                  type="button"
                  onClick={resetConsult}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-2 text-xs font-semibold text-libertymd-slate-500 hover:text-libertymd-blue-600"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </button>
              </div>

              <div
                ref={(node) => {
                  scrollRef.current = node;
                }}
                data-lenis-prevent
                data-libertymd-consult-scroller
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
              >
                <div ref={contentRef} className={TRANSCRIPT_BOTTOM_CLEARANCE_CLASS}>
              {showInterviewProgress && interviewProgressView && (
                <div className="mb-4 flex justify-center" aria-live="polite">
                  <LibertyMDProgressIndicator view={interviewProgressView} />
                </div>
              )}
              <div className="space-y-5">
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[88%] rounded-[20px] px-5 py-4 text-sm leading-7 shadow-[0_14px_40px_rgba(15,23,42,0.045)] ${
                        message.sender === 'user'
                          ? 'bg-libertymd-indigo text-white'
                          : message.kind === 'emergency'
                          ? 'bg-libertymd-blue-50 text-libertymd-blue-900'
                          : message.kind === 'report'
                          ? 'bg-white text-libertymd-green-600'
                          : 'bg-white text-libertymd-slate-700'
                      }`}
                    >
                      {message.text}
                    </div>
                  </div>
                ))}

                {phase === 'demographics_required' && (
                  // The hero renders this bare in the message flow rather than
                  // in a card, so the divider from the messages above lives
                  // here — the control no longer draws its own.
                  <div className="border-t border-libertymd-green-sage pt-libertymd-lg">
                  <LibertyMDDemographicsPrompt
                    age={demographics.age}
                    sex={demographics.sex}
                    loading={isTyping}
                    error={error}
                    consentChecked={consentChecked}
                    isAnonymous={isAnonymous}
                    profiles={entryProfilesFromPatients(entryPatients).length > 1
                      ? entryProfilesFromPatients(entryPatients)
                      : []}
                    onAgeChange={(age) => setDemographics(prev => ({ ...prev, age }))}
                    onSexChange={(sex) => setDemographics(prev => ({ ...prev, sex }))}
                    onConsentChange={setConsentChecked}
                    onCareForSomeoneElse={isAnonymous ? () => void attemptAddProfile('unified_entry') : undefined}
                    onSubmit={submitDemographics}
                  />
                  </div>
                )}

                {safetyNotice && phase !== 'emergency_end' && (
                  <LibertyMDSeverityNotice
                    severity={safetyNotice.severity}
                    message={safetyNotice.message}
                    className="mx-auto max-w-2xl text-left"
                  />
                )}

                {error && phase !== 'demographics_required' && reportLifecycle !== 'generation_failed' && (
                  <LibertyMDRequestErrorNotice message={error} className="mx-auto max-w-2xl text-left" />
                )}

                {isTyping && (
                  waitMode === 'reviewing' ? (
                    <LibertyMDWaitingIndicator
                      mode="reviewing"
                      reviewingLabel={t('chatx.waitingReviewing')}
                      className="mx-auto max-w-2xl"
                    />
                  ) : (
                    <LibertyMDTypingWaitRow label={t('chat.typing')} className="mx-auto max-w-2xl" />
                  )
                )}

                {reportLifecycle === 'partial' && (
                  <LibertyMDReportLifecycleShell state="partial" className="mx-auto max-w-2xl" />
                )}

                {reportLifecycle === 'generation_failed' && (
                  <LibertyMDReportLifecycleShell
                    state="generation_failed"
                    className="mx-auto max-w-2xl"
                    onRetry={() => {
                      const lastUser = [...messages].reverse().find((m) => m.sender === 'user');
                      if (lastUser?.text) void sendToWorkflow(lastUser.text);
                    }}
                  />
                )}

                {reportLifecycle === 'guest_expired' && (
                  <LibertyMDReportLifecycleShell
                    state="guest_expired"
                    className="mx-auto max-w-2xl"
                    onSignIn={() => { void startGoogleLink(); }}
                  />
                )}

                <div data-libertymd-report-lifecycle={reportLifecycle ?? undefined} className="sr-only">
                  {reportLifecycle || 'none'}
                </div>

                {reportLifecycle === 'ready' && report && (
                  <div className="mx-auto max-w-2xl space-y-[var(--libertymd-space-sm)]">
                    {shouldShowGuestRetentionWarning({
                      hasReportBody: true,
                      saved: !isAnonymous,
                      retentionExpiresAt,
                    }) && retentionExpiresAt ? (
                      <LibertyMDGuestRetentionWarning
                        remainingLabel={formatRetentionRemaining(retentionExpiresAt)}
                      />
                    ) : null}
                    <LibertyMDReportView
                      report={report}
                      saved={!isAnonymous}
                      scrollParentRef={scrollRef}
                      consultationId={sessionId || undefined}
                      retentionExpiresAt={retentionExpiresAt}
                      onDoctorCta={
                        shouldShowDoctorHandoff(report.triageTier)
                          ? () => setSelectedTab('doctors')
                          : undefined
                      }
                      emailDelivery={sessionId ? {
                        consultationId: sessionId,
                        prefillEmail: linkedEmail,
                        onRequest: requestReportEmail,
                      } : undefined}
                      footerSlot={
                        shouldShowDoctorHandoff(report.triageTier) ? (
                          <LibertyMDDoctorHandoffCta
                            triageTier={report.triageTier}
                            position="footer"
                            sessionKey={sessionId || undefined}
                            onClick={() => setSelectedTab('doctors')}
                          />
                        ) : undefined
                      }
                    />
                  </div>
                )}
              </div>
                </div>
              </div>

              <footer ref={footerRef} className="relative z-20 shrink-0 border-t border-libertymd-green-sage pt-4 pb-[max(12px,env(safe-area-inset-bottom))]">
                {showJumpToLatest && !isEmergencyStopped && (
                  <LibertyMDNewMessagePill label="New message" onClick={jumpToLatest} />
                )}
                {/*
                  P0-21 · report-gate open CTA in observed footerRef (Q4A clearance via
                  ResizeObserver). App has no recovery_required. Safe-area parity (Q2A).
                */}
                <LibertyMDContinuationActionBar action={continuationAction} />
                {!continuationOwnsFooter && !isComposerLocked && activeOptions.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2">
                    {activeOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        disabled={isTyping}
                        onClick={() => handleSend(option)}
                        className="text-center text-xs font-semibold leading-5 text-libertymd-blue-600 hover:text-libertymd-ink disabled:opacity-50"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}

                {!continuationOwnsFooter && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleSend();
                    }}
                    className="flex items-center gap-2 rounded-full border border-white bg-white/92 px-4 py-3 shadow-[0_16px_50px_rgba(37,99,235,0.07)] backdrop-blur-xl"
                  >
                    <input
                      type="text"
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      disabled={isComposerLocked}
                      placeholder={phase === 'report_ready' ? 'Report is ready above' : phase === 'report_gate' ? t('chatx.phReportGate') : 'Answer the follow-up question...'}
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-libertymd-slate-400"
                    />
                    <button
                      type="submit"
                      aria-label="Send message"
                      disabled={!input.trim() || isComposerLocked}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-libertymd-indigo text-white hover:bg-libertymd-indigo disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </form>
                )}
              </footer>
              </div>
            </div>
          )}
        </section>

        {selectedTab === 'doctors' && (
          <section
            className="libertymd-page-gutter libertymd-section-spacing border-t border-libertymd-slate-200 bg-[linear-gradient(180deg,rgba(251,252,248,0.98),rgba(239,246,255,0.72))]"
            data-libertymd-doctors-destination=""
          >
            <div className="libertymd-content-shell max-w-xl">
              <LibertyMDDoctorHandoffPanel
                triageTier={report?.triageTier || 'unknown'}
                consultationId={sessionId || undefined}
                position="footer"
                sessionKey={sessionId || undefined}
                hideTriggerCta
              />
            </div>
          </section>
        )}

        <LibertyMDPhoneCareSection
          onStartChat={() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            window.setTimeout(() => heroSymptomsRef.current?.focus(), 650);
          }}
        />

        <LibertyMDPricingSection
          onStartChat={() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            window.setTimeout(() => heroSymptomsRef.current?.focus(), 650);
          }}
        />

        <LibertyMDPatientStoriesSection />

        <LibertyMDHealthLibrarySection />

      </main>

      {phase === 'report_gate' && isReportGateOpen && !guestExpired && (
        <LibertyMDReportGate
          loading={isAuthBusy}
          onGoogle={startGoogleLink}
          onSkip={skipReportGate}
          onClose={dismissReportGate}
        />
      )}

      <LibertyMDProfileCapabilityOffer
        open={isProfileCapabilityOfferOpen}
        loading={isAuthBusy}
        onGoogle={startCapabilityGoogleLink}
        onClose={() => setIsProfileCapabilityOfferOpen(false)}
      />

      <LibertyMDAccountDrawer
        open={isMenuOpen}
        isAnonymous={isAnonymous}
        displayName={profile?.display_name}
        email={profile?.email}
        avatarUrl={profile?.avatar_url}
        age={profile?.age}
        sexAtBirth={profile?.sex_at_birth}
        history={history}
        loading={isAccountLoading}
        onClose={() => setIsMenuOpen(false)}
        onSelectConsultation={loadConsultation}
        onCareForSomeoneElse={isAnonymous ? () => void attemptAddProfile('drawer') : undefined}
        onGoogle={isAnonymous ? startGoogleSignIn : undefined}
        profileManagement={profileManagementHandlers}
      />

      {isEmergencyStopped && !isEmergencyAcknowledged && (
        <LibertyMDEmergencyAlert
          heading={emergencyHeading}
          message={emergencyDetail}
          standingInstruction={emergencyStandingInstruction}
          acknowledgeLabel={EMERGENCY_ACKNOWLEDGE_LABEL}
          persistenceNote={EMERGENCY_PERSISTENCE_NOTE}
          onAcknowledge={() => setIsEmergencyAcknowledged(true)}
        />
      )}

      <div
        aria-hidden={!shouldShowFloatingComposer}
        style={{ transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
        className={`pointer-events-none fixed inset-x-0 bottom-[max(14px,env(safe-area-inset-bottom))] z-[70] px-3 transition-[opacity,transform] duration-500 sm:px-6 ${
          shouldShowFloatingComposer ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
        }`}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!input.trim()) {
              const floatingInput = event.currentTarget.elements.namedItem('floating-health-question');
              if (floatingInput instanceof HTMLInputElement) floatingInput.focus();
              return;
            }
            handleSend();
          }}
          className={`mx-auto flex h-16 w-full max-w-[64rem] items-center gap-2 rounded-full border border-white/75 bg-white/[0.58] p-2 pl-5 shadow-[0_22px_65px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-2xl backdrop-saturate-150 transition-[background-color,box-shadow] hover:bg-white/[0.68] hover:shadow-[0_26px_75px_rgba(15,23,42,0.22),inset_0_1px_0_rgba(255,255,255,0.9)] sm:h-20 sm:pl-8 ${
            shouldShowFloatingComposer ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <input
            name="floating-health-question"
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onFocus={() => setIsFloatingInputFocused(true)}
            onBlur={() => setIsFloatingInputFocused(false)}
            disabled={isComposerLocked}
            placeholder={isFloatingInputFocused ? '' : 'Ask about your health...'}
            aria-label="Ask LibertyMD about your health"
            tabIndex={shouldShowFloatingComposer ? 0 : -1}
            className="min-w-0 flex-1 bg-transparent px-1 !text-left text-sm font-medium text-libertymd-slate-900 outline-none placeholder:text-libertymd-slate-500 sm:text-lg"
          />
          <button
            type="submit"
            aria-label="Send health question"
            tabIndex={shouldShowFloatingComposer ? 0 : -1}
            disabled={isComposerLocked || !input.trim()}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-libertymd-blue-600 text-white shadow-[0_10px_24px_rgba(37,99,235,0.38)] transition-[background-color,box-shadow,opacity,transform] hover:bg-libertymd-blue-700 hover:shadow-[0_13px_30px_rgba(37,99,235,0.45)] active:scale-95 disabled:cursor-not-allowed disabled:bg-libertymd-slate-400 disabled:opacity-70 disabled:shadow-none sm:h-16 sm:w-16"
          >
            <Send className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        </form>
      </div>

      {/* Exact Doctronic-Style 3D Volumetric Ribbon Footer in Blue */}
      <footer className="relative mt-20 sm:mt-24 border-t border-libertymd-slate-200/80 bg-gradient-to-b from-libertymd-blue-50 via-libertymd-blue-50 to-libertymd-blue-50 text-libertymd-slate-900 overflow-hidden min-h-[720px] flex flex-col justify-between">
        {/* Three.js WebGL 3D Silk Wave Ribbon (Blue Theme) */}
        <LibertyMDFooterRibbon />

        {/* Top Content: Links + Trust Badges */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 sm:px-10 pt-16 w-full">
          <div className="flex flex-col lg:flex-row justify-between items-start gap-12">
            {/* Left Columns */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-xs font-medium text-libertymd-slate-700">
              <div className="space-y-4">
                <p className="font-semibold text-sm text-libertymd-slate-900">{t('footer.clinicalCare')}</p>
                <ul className="space-y-2.5">
                  <li className="hover:text-libertymd-blue-600 cursor-pointer">{t('footer.symptomChecker')}</li>
                  <li className="hover:text-libertymd-blue-600 cursor-pointer">{t('footer.urgentCare')}</li>
                  <li className="hover:text-libertymd-blue-600 cursor-pointer">{t('footer.primaryTelehealth')}</li>
                  <li className="hover:text-libertymd-blue-600 cursor-pointer">{t('footer.refills')}</li>
                </ul>

                <p className="font-semibold text-sm text-libertymd-slate-900 pt-4">{t('footer.helpPrivacy')}</p>
                <ul className="space-y-2.5">
                  <li className="hover:text-libertymd-blue-600 cursor-pointer">{t('footer.faqs')}</li>
                  <li className="hover:text-libertymd-blue-600 cursor-pointer">{t('footer.privacyGdpr')}</li>
                  <li className="hover:text-libertymd-blue-600 cursor-pointer">{t('footer.hipaa')}</li>
                </ul>
              </div>

              <div className="space-y-4">
                <p className="font-semibold text-sm text-libertymd-slate-900">{t('footer.company')}</p>
                <ul className="space-y-2.5">
                  <li className="hover:text-libertymd-blue-600 cursor-pointer">{t('footer.about')}</li>
                  <li className="hover:text-libertymd-blue-600 cursor-pointer">{t('footer.careers')}</li>
                  <li className="hover:text-libertymd-blue-600 cursor-pointer">{t('footer.reviewers')}</li>
                  <li className="hover:text-libertymd-blue-600 cursor-pointer">{t('footer.team')}</li>
                </ul>
              </div>

              <div className="space-y-4">
                <p className="font-semibold text-sm text-libertymd-slate-900">{t('footer.conditions')}</p>
                <ul className="space-y-2.5">
                  <li className="hover:text-libertymd-blue-600 cursor-pointer">{t('footer.respiratory')}</li>
                  <li className="hover:text-libertymd-blue-600 cursor-pointer">{t('footer.cardiovascular')}</li>
                  <li className="hover:text-libertymd-blue-600 cursor-pointer">{t('footer.neurology')}</li>
                  <li className="hover:text-libertymd-blue-600 cursor-pointer">{t('footer.allConditions')}</li>
                </ul>

                <p className="font-semibold text-sm text-libertymd-slate-900 pt-4">{t('footer.research')}</p>
                <ul className="space-y-2.5">
                  <li className="hover:text-libertymd-blue-600 cursor-pointer">{t('footer.blog')}</li>
                  <li className="hover:text-libertymd-blue-600 cursor-pointer">Peer-Reviewed RAG</li>
                </ul>
              </div>

              <div className="space-y-4">
                <p className="font-semibold text-sm text-libertymd-slate-900">{t('footer.partnerships')}</p>
                <ul className="space-y-2.5">
                  <li className="hover:text-libertymd-blue-600 cursor-pointer">{t('footer.becomePartner')}</li>
                  <li className="hover:text-libertymd-blue-600 cursor-pointer">{t('footer.euHealth')}</li>
                  <li className="hover:text-libertymd-blue-600 cursor-pointer">{t('footer.usInsurance')}</li>
                </ul>
              </div>
            </div>

            {/* Right Side: CARIN / HIPAA / LegitScript Badges using real image URLs */}
            <div className="flex items-center gap-6 shrink-0 self-start">
              <img
                src="https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/libertymd-assets/carin-accredited.png"
                alt="CARIN Accredited Code of Conduct"
                className="h-16 w-auto object-contain hover:scale-105 transition-transform drop-shadow-sm"
              />
              <img
                src="https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/libertymd-assets/hipaa-certified.png"
                alt="HIPAA Certified"
                className="h-16 w-auto object-contain hover:scale-105 transition-transform drop-shadow-sm"
              />
              <img
                src="https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/libertymd-assets/legit_script.png"
                alt="LegitScript Certified"
                className="h-16 w-auto object-contain hover:scale-105 transition-transform drop-shadow-sm"
              />
            </div>
          </div>
        </div>

        {/* Center Patient Oath Emblem and pledge */}
        <div className="relative z-10 flex flex-col items-center justify-center px-6 py-12 text-center sm:px-10 sm:py-16">
          {/* Patient Oath Circle Seal Emblem */}
          <div className="hover:scale-105 transition-transform">
            <PatientOathEmblem className="w-48 h-48" />
          </div>

          <p className="libertymd-type-footer-oath mx-auto mt-10 max-w-4xl text-balance font-medium text-libertymd-slate-900 sm:mt-12">
            <strong className="font-extrabold">
              I will first do no harm. Every response, every recommendation, and every action taken by LibertyMD will be measured against one question: does this serve the patient’s wellbeing?
            </strong>
          </p>
        </div>

        {/* Bottom Copyright */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 sm:px-10 py-6 w-full flex flex-col sm:flex-row items-center justify-between text-xs text-libertymd-slate-600 border-t border-libertymd-slate-300/60">
          <p>© {new Date().getFullYear()} LibertyMD Health Technologies. All rights reserved.</p>
          <p>Privacy-first AI triage • EU GDPR Article 9 & US HIPAA Safe Harbor</p>
        </div>
      </footer>

      {/* P3-02 — sample report OverlaySheet (synthetic only; outside footer). */}
      <LibertyMDSampleReport
        open={isSampleReportOpen && phase === 'initial'}
        onClose={() => setIsSampleReportOpen(false)}
        onStartConsult={handleSampleReportStart}
      />

    </div>
  );
}
