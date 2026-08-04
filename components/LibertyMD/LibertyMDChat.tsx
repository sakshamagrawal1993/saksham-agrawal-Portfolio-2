import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Paperclip,
  AlertTriangle,
  ArrowLeft,
  Camera,
  FileText,
  Menu,
  Send,
  LogIn,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useI18n, chromeCodeForClinicalLanguage } from '../../i18n';
import LibertyMDLanguageSwitcher from './LibertyMDLanguageSwitcher';
import {
  LibertyMDAccountDrawer,
  LibertyMDDemographicsPrompt,
  LibertyMDMergeCollisionOutcome,
  LibertyMDOfflineBanner,
  LibertyMDPreStartProfilePicker,
  LibertyMDProfileCapabilityOffer,
  LibertyMDReportGate,
  LibertyMDRequestErrorNotice,
  LibertyMDSeverityNotice,
  LibertyMDSomeoneElseCreateSheet,
  entryProfilesFromPatients,
  libertyMDSafetyNoticeFromResponse,
  resolveResumeChiefComplaint,
  type LibertyMDEntryProfile,
  type LibertyMDHistoryItem,
  type LibertyMDSafetyNoticeContent,
} from './LibertyMDCareControls';
import { LibertyMDCareOrb } from './LibertyMDCareOrb';
import { LibertyMDContinuationActionBar } from './LibertyMDContinuationActionBar';
import { LibertyMDEmergencyAlert, LibertyMDEmergencyPinnedBar } from './LibertyMDEmergencyAlert';
import {
  LibertyMDComprehensionCheck,
  parseComprehensionCheck,
  type ComprehensionCheckPayload,
} from './LibertyMDComprehensionCheck';
import { LibertyMDOverlaySheet } from './LibertyMDOverlaySheet';
import { LibertyMDProgressIndicator } from './LibertyMDProgressIndicator';
import { LibertyMDReportView } from './LibertyMDReportView';
import {
  LibertyMDGuestRetentionWarning,
  LibertyMDReportLifecycleShell,
} from './LibertyMDReportLifecycleShell';
import { LibertyMDDoctorHandoffPanel } from './LibertyMDDoctorHandoffPanel';
import { LibertyMDAttachControls, type LibertyMDPhotoChip, type LibertyMDLabChip } from './LibertyMDAttachControls';
import { LibertyMDAttachSheet } from './LibertyMDAttachSheet';
import { LibertyMDLabAttributionSheet } from './LibertyMDLabAttributionSheet';
import { shouldShowDoctorHandoff } from './libertymd-doctor-cta-config';
import {
  LibertyMDWaitingIndicator,
  WAITING_STAGE_MS,
  WAITING_TYPING_STAGE_COUNT,
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
  isSoftGateDismissed,
  markSoftGateDismissed,
  shouldOpenSoftGate,
} from './libertymd-soft-gate';
import {
  isNearBottom,
  LibertyMDNewMessagePill,
  TRANSCRIPT_BOTTOM_CLEARANCE_CLASS,
  useLibertyMDChatScroll,
} from './LibertyMDChatScroll';
import {
  emergencyCopyFromPayload,
  pickEmergencyCopyForDisplay,
  resolveLibertyMdEmergencyCopy,
  type LibertyMdEmergencyCopyWire,
} from './libertymd-emergency-copy';
import {
  buildProgressView,
  nextHighWater,
  normalizeMissingSlots,
  shouldShowInterviewProgress,
} from './libertymd-progress';
import {
  buildRevealPrefixes,
  latencyBucket,
  nextComposerInputAfterRestore,
  predictWaitModeFromLastKnown,
  prefersReducedMotion,
  REVEAL_TICK_MS,
  type WaitMode,
} from './libertymd-waiting';
import {
  anonymousAddProfileProbeBody,
  deletePatientBody,
  isPatientSelectionRequiredReject,
  isRetryableCareProxyFailure,
  listOwnedPatientsBody,
  normalizeManagedPatientList,
  normalizeHistorySummary,
  normalizePatientList,
  parseCollisionPath,
  parseHoldingFromFunctionsError,
  readPhotoFileAsBase64,
  readLabFileAsBase64,
  requestReportEmailBody,
  retryPhotoAnalysisBody,
  someoneElseCreateBody,
  statusFromFunctionsError,
  updatePatientBody,
  uploadPhotoBody,
  uploadLabBody,
  validatePhotoFileClient,
  validateLabFileClient,
  type LibertyMdCollisionPath,
  type LibertyMDHoldingState,
  type LibertyMDPatientListItem,
} from './libertymd-care-proxy-client';
import {
  emitAppErrorShown,
  emitIdentityLinked,
  emitPartialOutcomeEngaged,
  emitPartialOutcomeShown,
  emitProfileCapabilityOfferCta,
  emitProfileCapabilityOfferShown,
  emitReportDeliveryRequested,
  emitTurnCompletedTtft,
  emitTurnFailed,
  setClinicalLocaleSuper,
} from './libertymd-analytics';
import {
  parsePartialOutcome,
  type LibertyMDPartialOutcomeSheetState,
} from './libertymd-partial-outcome';
import { identifyLibertyMdUser } from './libertymd-mixpanel-identity';
import { syncLibertyMdSessionReplayForPath } from './libertymd-session-replay';
import {
  buildLandingAttributionPayload,
  rememberLandingSessionId,
} from './libertymd-landing-attribution';
import {
  classifyPhotoUploadFailure,
  classifyLabUploadFailure,
  classifyProfileManagementFailure,
  patientFacingTechnicalMessage,
  classifySendFailure,
  classifyThrownSendFailure,
  clearOfflineQueue,
  copyForErrorClass,
  copyForPhotoUploadCode,
  copyForLabUploadCode,
  enqueueOfflineMessage,
  readFunctionsErrorPayload,
  readOfflineQueue,
  resolveProfileCapabilityOffer,
  type ClassifiedFailure,
} from './libertymd-failure-taxonomy';
import {
  clearLibertyMdConsultClientPhi,
  clearLibertyMdConsultClientState,
  clearPendingOutbound,
  mergePendingIntoMessages,
  nextComposerInputAfterPendingHydrate,
  persistPendingOutbound,
  readDraft,
  readScroll,
  reconcilePendingWithServer,
  shouldClearClientPhiForPhase,
  writeDraft,
  writeScroll,
} from './libertymd-draft-persistence';

type ChatPhase =
  | 'loading'
  | 'recovery_required'
  | 'profile_pick'
  | 'demographics_required'
  | 'intake'
  | 'report_gate'
  | 'report_ready'
  | 'emergency_end'
  | 'clinical_review_needed'
  | 'error';

/** P0-24 Q1A — soft leave keeps the consult recoverable without abandon_consultation. */
const LIBERTYMD_RECOVERABLE_CONSULTATION_KEY = 'libertymd:recoverableConsultationId';

const SOFT_LEAVE_PHASES: ReadonlySet<ChatPhase> = new Set([
  'intake',
  'demographics_required',
  'report_gate',
]);

/** P1-11 — outline bordered pill for unselected interview options (≠ filled user bubble). */
const LIBERTYMD_OPTION_CHIP_CLASS =
  'shrink-0 rounded-full border border-libertymd-slate-300 bg-white px-4 py-2.5 text-left text-sm font-semibold text-libertymd-slate-700 transition hover:border-libertymd-blue-600 hover:text-libertymd-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-libertymd-blue-600 focus-visible:ring-offset-2';

/** P1-11 — filled Trust Blue partner for sent user messages (chip path + free-text). */
const LIBERTYMD_USER_BUBBLE_CLASS = 'rounded-br-sm bg-libertymd-blue-600 text-white';

function stashRecoverableConsultationId(id: string) {
  try {
    window.sessionStorage.setItem(LIBERTYMD_RECOVERABLE_CONSULTATION_KEY, id);
  } catch {
    // Private mode / quota — leave still soft; resume via history/URL if available.
  }
}

function clearRecoverableConsultationId() {
  try {
    window.sessionStorage.removeItem(LIBERTYMD_RECOVERABLE_CONSULTATION_KEY);
  } catch {
    // ignore
  }
}

/** Non-blocking one-line toast; not a native dialog (CONTEXT §4). */
function showSoftLeaveToast() {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('libertymd-soft-leave-toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'libertymd-soft-leave-toast';
  el.setAttribute('role', 'status');
  el.textContent = 'Consultation saved. Reopen Chat anytime to continue.';
  el.className =
    'pointer-events-none fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[200] mx-auto max-w-sm rounded-lg border border-libertymd-mist bg-white/95 px-4 py-3 text-center text-sm font-semibold text-libertymd-navy shadow-[0_14px_40px_rgba(23,50,95,0.16)]';
  document.body.appendChild(el);
  window.setTimeout(() => {
    el.remove();
  }, 4200);
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  options?: string[];
  kind?: 'normal' | 'demographics' | 'emergency' | 'report';
  /** When set and ≠ text, progressive reveal is in progress (partial → aria-hidden). */
  revealFullText?: string;
  /** P1-12 / P0-12 — stable outbound id for reconcile + retry. */
  clientMessageId?: string;
  mediaKind?: 'photo' | 'lab';
}

interface LibertyMDProfile {
  display_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  age?: number | null;
  sex_at_birth?: string | null;
}

function uniqueEvidenceChips<T extends { object_uuid: string }>(chips: T[]): T[] {
  const seen = new Set<string>();
  return chips.filter((chip) => {
    if (seen.has(chip.object_uuid)) return false;
    seen.add(chip.object_uuid);
    return true;
  });
}

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
  recovery_required: 'Pick up where you left off',
  profile_pick: 'Who is this consultation for?',
  demographics_required: 'A little context helps us ask safer questions',
  intake: 'Focused clinical follow-up',
  report_gate: 'Your doctor-ready report is prepared',
  report_ready: 'Your report is ready',
  emergency_end: 'Safety guidance shown',
  clinical_review_needed: 'This consultation needs clinical review',
  error: 'Connection interrupted',
};

/**
 * P3-08 · heading / standing / detail come from proxy `emergency_copy` on
 * force_end and reopen. Fixture resolve is last-resort fail-open only.
 * Acknowledge chrome labels stay shared across variants.
 */
const EMERGENCY_ACKNOWLEDGE_LABEL = 'I understand';
const EMERGENCY_PERSISTENCE_NOTE = 'This guidance stays pinned to the bottom of the screen after you acknowledge it.';
const EMERGENCY_REOPEN_LABEL = 'Show details';

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

const RESPONSE_STAGE_MS = WAITING_STAGE_MS;

export default function LibertyMDChat() {
  const { t, language, setLanguage } = useI18n();
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
  /** P3-07 — stored clinical journey language; locks chrome on this surface. */
  const [clinicalLanguage, setClinicalLanguage] = useState<'en' | 'es' | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const symptom = String(initialStartRequestRef.current?.symptom || '').trim();
    return symptom ? [{ id: `${initialStartRequestRef.current?.draftId || 'draft'}-user`, sender: 'user', text: symptom }] : [];
  });
  const [input, setInput] = useState('');
  const [demographics, setDemographics] = useState({ age: '', sex: '' });
  // P1-01 — first interview question lives in the unified control (Q6B).
  const [, setEntryQuestion] = useState('');
  const [, setEntryOptions] = useState<string[]>([]);
  const [clinicalAnswer, setClinicalAnswer] = useState('');
  const [consentChecked, setConsentChecked] = useState(true);
  const [entryPatients, setEntryPatients] = useState<LibertyMDPatientListItem[]>(() =>
    normalizePatientList(initialStartRequestRef.current?.patients),
  );
  const [showSomeoneElseCreate, setShowSomeoneElseCreate] = useState(false);
  const [pendingSymptom, setPendingSymptom] = useState(() =>
    String(initialStartRequestRef.current?.symptom || '').trim(),
  );
  /** P3-05 — survive profile-pick / someone-else before start_consultation. */
  const pendingEntryRef = useRef<{ entry_type?: 'chip' | 'freetext'; chip_id?: string }>((() => {
    const req = initialStartRequestRef.current;
    const entryType = req?.entry_type === 'chip' ? 'chip' : 'freetext';
    const chipId = typeof req?.chip_id === 'string' ? req.chip_id.trim() : '';
    return entryType === 'chip' && chipId
      ? { entry_type: 'chip' as const, chip_id: chipId }
      : { entry_type: 'freetext' as const };
  })());
  const [report, setReport] = useState<LibertyMdNormalizedReport | null>(null);
  // P2-13 — retention / omit signals from proxy (L4/L5/L6); generation-failed flag (L2/L3).
  const [retentionExpiresAt, setRetentionExpiresAt] = useState<string | null>(null);
  const [reportOmittedReason, setReportOmittedReason] = useState<ReportOmittedReason | null>(null);
  const [generationFailed, setGenerationFailed] = useState(false);
  const [error, setError] = useState('');
  const [errorRetry, setErrorRetry] = useState(false);
  const [offlineBanner, setOfflineBanner] = useState('');
  const [safetyNotice, setSafetyNotice] = useState<LibertyMDSafetyNoticeContent | null>(null);
  const [photoChips, setPhotoChips] = useState<LibertyMDPhotoChip[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoRetryingObjectUuid, setPhotoRetryingObjectUuid] = useState<string | null>(null);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [labChips, setLabChips] = useState<LibertyMDLabChip[]>([]);
  const [labUploading, setLabUploading] = useState(false);
  const [labAttributionOpen, setLabAttributionOpen] = useState(false);
  const [labProfiles, setLabProfiles] = useState<Array<{
    id: string;
    display_label: string | null;
    relationship: string;
  }>>([]);
  const [labDefaultPatientId, setLabDefaultPatientId] = useState<string | null>(null);
  const [labSelectedPatientId, setLabSelectedPatientId] = useState<string | null>(null);
  const labFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isBusy, setIsBusy] = useState(Boolean(initialStartRequestRef.current));
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [linkedEmail, setLinkedEmail] = useState('');
  const [profile, setProfile] = useState<LibertyMDProfile | null>(null);
  const [history, setHistory] = useState<LibertyMDHistoryItem[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  // P5-CHAT — WhatsApp-style attach chooser behind a single paperclip.
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
  const photoFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isReportGateOpen, setIsReportGateOpen] = useState(false);
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [hasIdentityConflict, setHasIdentityConflict] = useState(false);
  /** P4-05 — post-merge collision outcome (ReportGate / report_ready only; never intake/emergency). */
  const [mergeCollisionPath, setMergeCollisionPath] = useState<LibertyMdCollisionPath | null>(null);
  const [isProfileCapabilityOfferOpen, setIsProfileCapabilityOfferOpen] = useState(false);
  const [accountLoading, setAccountLoading] = useState(false);
  const [consultationVersion, setConsultationVersion] = useState<number | null>(null);
  // P1-13 — prior chief complaint for resume invitation body (display only; never telemetry).
  const [resumeChiefComplaint, setResumeChiefComplaint] = useState<string | null>(null);
  /**
   * P4-03 — completed reopen with non-omitted report body: collapse transcript
   * behind one explicit tap. Messages stay in state.
   */
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(false);
  const [responseStageIndex, setResponseStageIndex] = useState(0);
  // P1-07 — whole-turn wait mode + last-known gate inputs for diagnosis prediction.
  const [waitMode, setWaitMode] = useState<WaitMode>('typing');
  const [lastTurnCount, setLastTurnCount] = useState(0);
  const [lastEvidenceScore, setLastEvidenceScore] = useState(0);
  const [liveAnnounce, setLiveAnnounce] = useState('');
  // P0-18 AC4 — the *only* thing that dismisses the emergency alert. Not scroll, not a tap
  // outside, not Escape, and not navigation: nothing else writes this flag.
  const [isEmergencyAcknowledged, setIsEmergencyAcknowledged] = useState(false);
  // P0-17 / P3-08 — terminal classification + proxy-resolved emergency_copy wire.
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
  /** P3-07 Q1 — sync chrome + Mixpanel clinical locale from stored journey language. */
  const applyClinicalLanguage = (raw: unknown) => {
    const code = String(raw || 'en').trim().toLowerCase() === 'es' ? 'es' : 'en';
    setClinicalLanguage(code);
    setClinicalLocaleSuper(code);
    const chrome = chromeCodeForClinicalLanguage(code);
    if (language !== chrome) setLanguage(chrome);
  };
  // P1-06 — slot-derived progress; high-water held in React state for the mounted session.
  const [missingSlots, setMissingSlots] = useState<string[] | null>(null);
  const [progressHighWater, setProgressHighWater] = useState<number | null>(null);
  // P0-11 client half — composer locked for the server's retry_after_ms; notice stays until next send.
  const [holdingLocked, setHoldingLocked] = useState(false);
  const holdingCooldownTimerRef = useRef<number | null>(null);
  // P1-09 — exit sheet before navigate (Q4A1); never on emergency_end.
  const [partialOutcomeSheet, setPartialOutcomeSheet] =
    useState<LibertyMDPartialOutcomeSheetState | null>(null);
  const partialOutcomeShownRef = useRef(false);
  // P1-14 — pre-Diagnosis comprehension OverlaySheet (dismiss ≠ proceed).
  const [comprehensionCheck, setComprehensionCheck] = useState<ComprehensionCheckPayload | null>(null);
  const [comprehensionBusy, setComprehensionBusy] = useState(false);
  // P0-12 — held outbound for Try again / offline flush (same client_message_id).
  const heldSendRef = useRef<{ message: string; clientMessageId: string } | null>(null);
  const appErrorEpisodeRef = useRef<string | null>(null);
  const sessionRefreshAttemptedRef = useRef<boolean>(false);
  // P1-12 — gate offline flush until get_consultation → merge → draft/scroll restore.
  const [clientPersistHydrated, setClientPersistHydrated] = useState(false);
  const pendingScrollRestoreRef = useRef<{ scrollTop: number; wasNearBottom: boolean } | null>(null);
  const identityPromiseRef = useRef<Promise<any> | null>(null);
  const startConsultationPromiseRef = useRef<Promise<any> | null>(null);
  // P1-07 — TTFT start + progressive reveal timer.
  const turnStartedAtRef = useRef<number | null>(null);
  const ttftEmittedRef = useRef(false);
  const revealTimerRef = useRef<number | null>(null);
  const doctorHandoffRef = useRef<HTMLDivElement | null>(null);
  const resolvedDraftConsultationIdRef = useRef<string | null>(null);
  const initialStartRef = useRef<any>((location.state as any)?.libertyMDStart || null);
  const initialStartConsultationIdRef = useRef<string | null>(
    (location.state as any)?.libertyMDStart?.consultationId
      ? String((location.state as any).libertyMDStart.consultationId)
      : null,
  );

  const clearHoldingCooldown = () => {
    if (holdingCooldownTimerRef.current !== null) {
      window.clearTimeout(holdingCooldownTimerRef.current);
      holdingCooldownTimerRef.current = null;
    }
    setHoldingLocked(false);
  };

  const startHoldingCooldown = (retryAfterMs: number) => {
    if (holdingCooldownTimerRef.current !== null) {
      window.clearTimeout(holdingCooldownTimerRef.current);
      holdingCooldownTimerRef.current = null;
    }
    // Finite 0 unlocks immediately; no auto-resend / probe when the timer fires.
    if (retryAfterMs <= 0) {
      setHoldingLocked(false);
      return;
    }
    setHoldingLocked(true);
    holdingCooldownTimerRef.current = window.setTimeout(() => {
      holdingCooldownTimerRef.current = null;
      setHoldingLocked(false);
    }, retryAfterMs);
  };

  /** P1-06 — seed/advance high-water from server `missing_slots` (Q3A / Q7A). */
  const observeMissingSlots = (value: unknown) => {
    const normalized = normalizeMissingSlots(value);
    if (normalized == null) return;
    setMissingSlots(normalized);
    setProgressHighWater((prev) => nextHighWater(prev, normalized));
  };

  /** P1-07 — seed last-known turn/evidence for wait-mode prediction (best-effort). */
  const observeTurnGate = (data: any, consultation?: any) => {
    const turnRaw = data?.turn_count ?? consultation?.turn_count;
    if (Number.isFinite(Number(turnRaw))) {
      setLastTurnCount(Math.max(0, Math.floor(Number(turnRaw))));
    }
    const evidenceRaw = data?.evidence_score ?? consultation?.clinical_evidence_score;
    if (Number.isFinite(Number(evidenceRaw))) {
      setLastEvidenceScore(Number(evidenceRaw));
    }
  };

  /**
   * P2-13 — apply proxy report body + retention/omit honesty (L5/L6).
   * Clears stale report when report-ready/gate + omit/expiry and no body.
   */
  const applyReportLifecycleFromProxy = (data: any, nextPhase: string) => {
    const expires =
      typeof data?.retention_expires_at === 'string' && data.retention_expires_at
        ? String(data.retention_expires_at)
        : null;
    const omitted =
      data?.report_omitted_reason === 'retention_expired' ? 'retention_expired' as const : null;
    setRetentionExpiresAt(expires);
    setReportOmittedReason(omitted);
    if (data?.report) {
      setReport(normalizeReportData(data.report));
      setGenerationFailed(false);
      return;
    }
    if (shouldClearStaleReportOnHydrate({
      phase: nextPhase,
      hasIncomingReport: false,
      reportOmittedReason: omitted,
      retentionExpiresAt: expires,
    })) {
      setReport(null);
    }
  };

  const clearRevealTimer = () => {
    if (revealTimerRef.current !== null) {
      window.clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  };

  const markFirstAssistantPaint = () => {
    if (ttftEmittedRef.current) return;
    const started = turnStartedAtRef.current;
    if (started == null) return;
    ttftEmittedRef.current = true;
    emitTurnCompletedTtft({
      latency_bucket: latencyBucket(performance.now() - started),
    });
  };

  /**
   * Progressive reveal for interview / non-emergency clinical_review.
   * Emergency / reduced-motion → full text immediately. Final aria-live once.
   */
  const appendAssistantWithReveal = (message: Omit<ChatMessage, 'text'> & { text: string }, opts?: {
    instant?: boolean;
  }) => {
    clearRevealTimer();
    const full = String(message.text || '');
    const instant = Boolean(opts?.instant) || prefersReducedMotion();
    const prefixes = buildRevealPrefixes(full, { instant });
    const first = prefixes[0] ?? full;
    const id = message.id;
    setMessages((current) => [...current, {
      ...message,
      text: first,
      revealFullText: instant || prefixes.length <= 1 ? undefined : full,
    }]);
    markFirstAssistantPaint();
    if (instant || prefixes.length <= 1) {
      setLiveAnnounce(full);
      return;
    }
    let index = 0;
    revealTimerRef.current = window.setInterval(() => {
      index += 1;
      const next = prefixes[Math.min(index, prefixes.length - 1)];
      setMessages((current) => current.map((item) => (
        item.id === id
          ? {
              ...item,
              text: next,
              revealFullText: index >= prefixes.length - 1 ? undefined : full,
            }
          : item
      )));
      if (index >= prefixes.length - 1) {
        clearRevealTimer();
        setLiveAnnounce(full);
      }
    }, REVEAL_TICK_MS);
  };

  const ensureIdentity = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) {
      // P1-17: stitch device history → anon/linked Supabase id (id-only).
      identifyLibertyMdUser(sessionData.session.user.id);
      const u = sessionData.session.user;
      const userIsAnon = u.is_anonymous === true || (!u.email && u.app_metadata?.provider === 'anonymous');
      setIsAnonymous(userIsAnon);
      if (typeof u.email === 'string' && u.email) {
        setLinkedEmail(u.email);
      }
      return sessionData.session;
    }
    if (!identityPromiseRef.current) {
      identityPromiseRef.current = supabase.auth.signInAnonymously().then(({ data, error: authError }) => {
        if (authError || !data.session) {
          throw authError || new Error('Unable to create a private LibertyMD session.');
        }
        identifyLibertyMdUser(data.session.user.id);
        return data.session;
      });
    }
    return identityPromiseRef.current;
  };

  const invokeCareProxy = async (body: Record<string, unknown>, isRetry = false): Promise<any> => {
    await ensureIdentity();
    const { data, error: functionError } = await supabase.functions.invoke('libertymd-care-proxy', {
      body: { region: 'EU', ...body },
    });
    if (functionError) {
      const errStr = String((functionError as any)?.message || functionError);
      if (!isRetry && (errStr.includes('UNAUTHORIZED_LEGACY_JWT') || errStr.includes('Invalid JWT') || (functionError as any)?.status === 401)) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (!refreshed?.session) {
          identityPromiseRef.current = null;
          await supabase.auth.signInAnonymously();
        }
        return invokeCareProxy(body, true);
      }
      // P0-12: preserve decoded body (claim_rejection, etc.) when supabase returns both.
      if (data && typeof data === 'object') {
        Object.assign(functionError, { body: data });
      }
      throw functionError;
    }
    if (data?.error) {
      const err = new Error(String(data.error)) as Error & {
        status?: number;
        body?: unknown;
      };
      err.body = data;
      if (typeof data.claim_rejection === 'string') {
        // Keep machine fields for the classifier; do not scrape message text.
        err.status = 409;
      }
      if (data.code === 'sign_in_required') {
        err.status = 403;
      }
      throw err;
    }
    return data;
  };

  const mapMessages = (
    rows: any[],
    opts?: { emergencyStopped?: boolean },
  ): ChatMessage[] => rows.map((item, index) => {
    // Defect 4 / P0-16 AC4: message_type === 'safety' is also used for
    // clinical_review_needed, turn-cap close, and off-topic stop. Only a
    // force_end consult may promote those rows to emergency chrome.
    let kind: ChatMessage['kind'] = 'normal';
    if (item.message_type === 'report_gate') kind = 'report';
    else if (item.message_type === 'demographics') kind = 'demographics';
    else if (item.message_type === 'safety' && opts?.emergencyStopped) kind = 'emergency';
    const metadata = item?.metadata && typeof item.metadata === 'object'
      ? item.metadata as Record<string, unknown>
      : null;
    const mediaKind = metadata?.source === 'media_followup'
      && (metadata?.evidence_kind === 'photo' || metadata?.evidence_kind === 'lab')
      ? metadata.evidence_kind
      : undefined;
    return {
      id: String(item.id || `${consultationId}-${index}`),
      sender: item.role === 'user' ? 'user' : 'ai',
      text: String(item.content || ''),
      options: Array.isArray(item.options) ? item.options.map(String) : [],
      kind,
      ...(mediaKind ? { mediaKind } : {}),
      ...(typeof item.client_message_id === 'string' && item.client_message_id
        ? { clientMessageId: String(item.client_message_id) }
        : {}),
    };
  });

  const applyMediaEvidence = (raw: unknown) => {
    const packets = Array.isArray(raw) ? raw : [];
    const remaining = (packet: any) => Array.isArray(packet?.followups)
      ? packet.followups.filter((row: any) => row?.status === 'pending' || row?.status === 'asked').length
      : 0;
    const serverPhotos = packets
      .filter((packet: any) => packet?.kind === 'photo' && typeof packet?.evidence_id === 'string')
      .map((packet: any) => ({
        object_uuid: String(packet.evidence_id),
        content_type: String(packet.content_type || 'image/jpeg'),
        analysis_status: ['processing', 'processed', 'unusable', 'failed'].includes(String(packet.status))
          ? packet.status
          : 'processing',
        followups_remaining: remaining(packet),
      }));
    const serverLabs = packets
      .filter((packet: any) => packet?.kind === 'lab' && typeof packet?.evidence_id === 'string')
      .map((packet: any) => ({
        object_uuid: String(packet.evidence_id),
        content_type: String(packet.content_type || 'application/pdf'),
        patient_id: String(packet.patient_id || ''),
        analysis_status: ['processing', 'processed', 'unusable', 'failed'].includes(String(packet.status))
          ? packet.status
          : 'processing',
        followups_remaining: remaining(packet),
      }));
    setPhotoChips((current) => uniqueEvidenceChips([
      ...serverPhotos,
      ...current.filter((chip) => chip.object_uuid.startsWith('local-photo-')),
    ]));
    setLabChips((current) => uniqueEvidenceChips([
      ...serverLabs,
      ...current.filter((chip) => chip.object_uuid.startsWith('local-lab-')),
    ]));
  };

  const hasProcessingMedia = photoChips.some((chip) => chip.analysis_status === 'processing')
    || labChips.some((chip) => chip.analysis_status === 'processing');

  useEffect(() => {
    if (!consultationId || phase !== 'intake' || !hasProcessingMedia) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await invokeCareProxy({ action: 'get_consultation', consultation_id: consultationId });
        if (!cancelled) applyMediaEvidence(data?.media_evidence);
      } catch {
        // Upload request owns the visible failure copy. Polling stays quiet.
      }
    };
    const timer = window.setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [consultationId, hasProcessingMedia, phase]);

  const refreshAccount = async () => {
    setAccountLoading(true);
    try {
      // P1-19 — forward stashed attribution (URL already stripped on navigate).
      const landingAttribution = buildLandingAttributionPayload({
        pathname: window.location.pathname,
        locale: language,
        captureUrl: false,
      });
      const data = await invokeCareProxy({ action: 'bootstrap', ...landingAttribution });
      if (typeof data?.landing_session_id === 'string') {
        rememberLandingSessionId(data.landing_session_id);
      }
      setIsAnonymous(Boolean(data?.is_anonymous));
      setProfile(data?.profile || null);
      setHistory(normalizeHistorySummary(data?.history));
      const listed = normalizePatientList(data?.patients);
      if (listed.length > 0) setEntryPatients(listed);
    } finally {
      setAccountLoading(false);
    }
  };

  const applyStartConsultationResponse = (data: any, symptom: string) => {
    if (!data?.consultation_id) throw new Error('Unable to start LibertyMD consultation.');
    const nextConsultationId = String(data.consultation_id);
    applyClinicalLanguage(data.language ?? 'en');
    const nextPhase = phaseFromStatus(String(data.emergency ? 'emergency_stopped' : data.state || 'awaiting_demographics'));
    const acknowledgement = String(data.acknowledgement || data.message || '').trim();
    const nextQuestion = String(data.next_question || '').trim();
    const nextOptions = Array.isArray(data.options) ? data.options.map(String).filter(Boolean) : [];

    if (data?.prefill && typeof data.prefill === 'object') {
      const prefillAge = data.prefill.age != null ? String(data.prefill.age) : '';
      const prefillSex = typeof data.prefill.sex_at_birth === 'string' ? data.prefill.sex_at_birth : '';
      setDemographics((current) => ({
        age: prefillAge || current.age,
        sex: prefillSex || current.sex,
      }));
    }

    if (nextPhase === 'demographics_required') {
      setEntryQuestion(nextQuestion);
      setEntryOptions(nextOptions);
      setClinicalAnswer('');
      setConsentChecked(true);
      setMessages(([
        { id: `${nextConsultationId}-initial-user`, sender: 'user', text: symptom },
        {
          id: `${nextConsultationId}-initial-assistant`,
          sender: 'ai',
          kind: 'demographics',
          text: acknowledgement,
        },
      ] as ChatMessage[]).filter((message) => message.text));
    } else if (nextPhase === 'emergency_end') {
      setMessages(([
        { id: `${nextConsultationId}-initial-user`, sender: 'user', text: symptom },
        {
          id: `${nextConsultationId}-initial-assistant`,
          sender: 'ai',
          kind: 'emergency',
          text: acknowledgement || String(data.message || ''),
        },
      ] as ChatMessage[]).filter((message) => message.text));
    } else {
      // P1-03 skip → intake: first question answers via send_message (Q5A).
      setEntryQuestion('');
      setEntryOptions([]);
      setClinicalAnswer('');
      setMessages(([
        { id: `${nextConsultationId}-initial-user`, sender: 'user', text: symptom },
        {
          id: `${nextConsultationId}-initial-assistant`,
          sender: 'ai',
          kind: 'normal',
          text: acknowledgement,
        },
        ...(nextQuestion
          ? [{
            id: `${nextConsultationId}-first-question`,
            sender: 'ai' as const,
            kind: 'normal' as const,
            text: nextQuestion,
            options: nextOptions,
          }]
          : []),
      ] as ChatMessage[]).filter((message) => message.text));
    }

    setPhase(nextPhase);
    setIsReportGateOpen(shouldOpenSoftGate(nextPhase === 'report_gate', nextConsultationId));
    if (nextPhase === 'emergency_end') {
      applyEmergencyFromPayload(data);
    }
    setSafetyNotice(libertyMDSafetyNoticeFromResponse(data));
    setConsultationVersion(Number.isInteger(data.version) ? Number(data.version) : null);
    resolvedDraftConsultationIdRef.current = nextConsultationId;
    initialStartRequestRef.current = null;
    setShowSomeoneElseCreate(false);
    setIsBusy(false);
    navigate(`/liberty-md/chat?consultationId=${encodeURIComponent(nextConsultationId)}`, {
      replace: true,
      state: null,
    });
  };

  const runStartConsultation = async (
    symptom: string,
    patientFields?: { patient_id?: string; selection_source?: 'picker' | 'someone_else_create' },
  ) => {
    setPhase('loading');
    setIsBusy(true);
    setError('');
    try {
      const landingAttribution = buildLandingAttributionPayload({
        pathname: window.location.pathname,
        locale: language,
        captureUrl: false,
      });
      const entry = pendingEntryRef.current;
      const entryType = entry?.entry_type === 'chip' && entry.chip_id ? 'chip' : 'freetext';
      startConsultationPromiseRef.current = invokeCareProxy({
        action: 'start_consultation',
        message: symptom,
        language,
        entry_type: entryType,
        ...(entryType === 'chip' && entry?.chip_id ? { chip_id: entry.chip_id } : {}),
        ...landingAttribution,
        ...(patientFields?.patient_id ? { patient_id: patientFields.patient_id } : {}),
        ...(patientFields?.selection_source
          ? { selection_source: patientFields.selection_source }
          : {}),
      });
      const data = await startConsultationPromiseRef.current;
      applyStartConsultationResponse(data, symptom);
    } catch (startError) {
      startConsultationPromiseRef.current = null;
      const { status, body } = await readFunctionsErrorPayload(startError);
      if (isPatientSelectionRequiredReject(status, body)) {
        const listed = normalizePatientList(body?.patients);
        if (listed.length > 0) setEntryPatients(listed);
        setPendingSymptom(symptom);
        setPhase('profile_pick');
        setIsBusy(false);
        setError(typeof body?.error === 'string' ? body.error : 'Choose who this consultation is for.');
        return;
      }
      throw startError;
    }
  };

  const isEmergencyStopped = phase === 'emergency_end';

  // P1-18 — belt-and-suspenders Replay disable (App.tsx pathname effect is SoT).
  useEffect(() => {
    syncLibertyMdSessionReplayForPath(location.pathname);
  }, [location.pathname]);

  // P0-19 · the old implementation called `scrollIntoView` from this effect, i.e. in the
  // same commit that set the state — before layout, and before the footer had grown by the
  // height of any new option chips. The dependency list is kept identical so the *trigger*
  // is unchanged; only the timing moves, into `useLibertyMDChatScroll`, which anchors after
  // layout and re-anchors on late growth.
  const [transcriptRevision, setTranscriptRevision] = useState(0);
  useEffect(() => {
    setTranscriptRevision((current) => current + 1);
  }, [messages, isBusy, report, phase, error, offlineBanner, safetyNotice]);

  const { scrollRef, contentRef, footerRef, showJumpToLatest, jumpToLatest, restoreScrollPosition } = useLibertyMDChatScroll({
    revision: transcriptRevision,
    messageRevision: messages.length,
    force: isEmergencyStopped,
  });

  // P1-12 — persist intake draft (S1: input only) while interviewing.
  useEffect(() => {
    if (!consultationId || typeof window === 'undefined') return;
    if (phase !== 'intake') return;
    writeDraft(consultationId, input, window.localStorage);
  }, [consultationId, input, phase]);

  // P1-12 Q4A — clear consult-scoped client PHI on terminal leave (not soft-leave).
  // P2-05: PHI-only — keep report section expansion for reload of same report (AC4).
  useEffect(() => {
    if (!consultationId || typeof window === 'undefined') return;
    if (!shouldClearClientPhiForPhase(phase)) return;
    clearLibertyMdConsultClientPhi(consultationId, window.localStorage);
    setOfflineBanner('');
    heldSendRef.current = null;
  }, [consultationId, phase]);

  // P1-12 Q3B — restore scroll after transcript (+ pending) paints.
  useEffect(() => {
    if (!clientPersistHydrated) return;
    const pending = pendingScrollRestoreRef.current;
    if (!pending) return;
    pendingScrollRestoreRef.current = null;
    restoreScrollPosition(pending);
  }, [clientPersistHydrated, messages.length, restoreScrollPosition]);

  // P1-12 — persist scrollTop + near-bottom while intake is active.
  useEffect(() => {
    if (!consultationId || typeof window === 'undefined') return undefined;
    if (phase !== 'intake') return undefined;
    const element = scrollRef.current;
    if (!element) return undefined;
    let timer: number | null = null;
    const persist = () => {
      writeScroll(
        consultationId,
        element.scrollTop,
        isNearBottom(element),
        window.localStorage,
      );
    };
    const onScroll = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(persist, 150);
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      element.removeEventListener('scroll', onScroll);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [consultationId, phase, scrollRef, clientPersistHydrated]);

  // A fresh emergency must never inherit an earlier acknowledgement.
  useEffect(() => {
    if (!isEmergencyStopped) {
      setIsEmergencyAcknowledged(false);
      clearEmergencyPresentation();
    }
  }, [isEmergencyStopped, consultationId]);

  // P0-11 — clear holding cooldown timer on unmount so a route change cannot leave the composer locked.
  useEffect(() => () => {
    if (holdingCooldownTimerRef.current !== null) {
      window.clearTimeout(holdingCooldownTimerRef.current);
      holdingCooldownTimerRef.current = null;
    }
    if (revealTimerRef.current !== null) {
      window.clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isBusy) {
      setResponseStageIndex(0);
      return undefined;
    }
    if (waitMode === 'reviewing') {
      setResponseStageIndex(0);
      return undefined;
    }
    const timer = window.setInterval(() => {
      setResponseStageIndex((current) => (
        current === 0 || current === WAITING_TYPING_STAGE_COUNT - 1 ? 1 : current + 1
      ));
    }, RESPONSE_STAGE_MS);
    return () => window.clearInterval(timer);
  }, [isBusy, waitMode]);

  // P2-13 L2/AC6 — generating (reviewing) wait ceiling; escape → generation failed + retry.
  useEffect(() => {
    if (!isBusy || waitMode !== 'reviewing') return undefined;
    const timer = window.setTimeout(() => {
      setIsBusy(false);
      setGenerationFailed(true);
      setErrorRetry(true);
      setError('');
    }, GENERATING_WAIT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [isBusy, waitMode]);

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
    setClientPersistHydrated(false);
    pendingScrollRestoreRef.current = null;

    void (async () => {
      setError('');
      setReport(null);
      try {
        if (isDraftStart) {
          const symptom = String(initialRequest.symptom || '').trim();
          if (!symptom) throw new Error('Please describe the symptom.');

          setPendingSymptom(symptom);
          {
            const entryType = initialRequest.entry_type === 'chip' ? 'chip' : 'freetext';
            const chipId = typeof initialRequest.chip_id === 'string' ? initialRequest.chip_id.trim() : '';
            pendingEntryRef.current = entryType === 'chip' && chipId
              ? { entry_type: 'chip', chip_id: chipId }
              : { entry_type: 'freetext' };
          }
          setProfile(initialRequest.profile || null);
          setIsAnonymous(Boolean(initialRequest.isAnonymous));
          setHistory(normalizeHistorySummary(initialRequest.history));
          setDemographics({
            age: String(initialRequest.demographics?.age || initialRequest.profile?.age || ''),
            sex: String(initialRequest.demographics?.sex || initialRequest.profile?.sex_at_birth || ''),
          });
          const listed = normalizePatientList(initialRequest.patients);
          if (listed.length > 0) setEntryPatients(listed);
          setMessages([{ id: `${draftId}-user`, sender: 'user', text: symptom }]);

          // P1-03 Q1B/Q2A — picker-first when ≥2 active patients; never silent default.
          if (listed.length > 1) {
            setPhase('profile_pick');
            setIsBusy(false);
            return;
          }

          if (!startConsultationPromiseRef.current) {
            await runStartConsultation(symptom);
          } else {
            const data = await startConsultationPromiseRef.current;
            if (cancelled) return;
            applyStartConsultationResponse(data, symptom);
          }
          return;
        }

        // Past this point a consultation id is guaranteed: the null case either
        // navigated away in the guard above or returned inside the draft-start
        // branch. Restating it narrows the type and keeps a null id from ever
        // reaching invokeCareProxy / storage keys if that flow changes.
        if (!consultationId) return;

        if (resolvedDraftConsultationIdRef.current === consultationId) {
          resolvedDraftConsultationIdRef.current = null;
          if (!cancelled) setClientPersistHydrated(true);
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
          setMessages(([
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
          ] as ChatMessage[]).filter((message) => message.text));
          setPhase(initialPhase);
          setIsReportGateOpen(shouldOpenSoftGate(initialPhase === 'report_gate', consultationId));
          if (initialPhase === 'emergency_end') {
            applyEmergencyFromPayload(initialStart);
          }
          setSafetyNotice(libertyMDSafetyNoticeFromResponse(initialStart));
          setConsultationVersion(Number.isInteger(initialStart.version) ? Number(initialStart.version) : null);
          setProfile(initialStart.profile || null);
          setIsAnonymous(Boolean(initialStart.isAnonymous));
          setHistory(normalizeHistorySummary(initialStart.history));
          setDemographics({
            age: String(initialStart.demographics?.age || initialStart.profile?.age || ''),
            sex: String(initialStart.demographics?.sex || initialStart.profile?.sex_at_birth || ''),
          });
          navigate(`/liberty-md/chat?consultationId=${encodeURIComponent(consultationId)}`, {
            replace: true,
            state: null,
          });
          if (!cancelled) setClientPersistHydrated(true);
          return;
        }

        setPhase('loading');
        setTranscriptCollapsed(false);

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
          // P4-05: surface collision_path on allowed ReportGate / report_ready chrome only.
          const path = parseCollisionPath(account?.collision_path);
          if (path) setMergeCollisionPath(path);
          // P1-17: surviving-id identify + client-only identity_linked (Postgres residual open).
          // Lexicon merge_outcome stays 'success' — never Path enums (P4-05 Q3A / AC7).
          const { data: mergeSession } = await supabase.auth.getSession();
          const survivingId = mergeSession?.session?.user?.id;
          if (survivingId) identifyLibertyMdUser(survivingId);
          emitIdentityLinked({
            was_merge: true,
            merge_outcome: 'success',
            method: 'account_merge',
          });
        } else {
          const landingAttribution = buildLandingAttributionPayload({
            pathname: window.location.pathname,
            locale: language,
            captureUrl: false,
          });
          account = await invokeCareProxy({
            action: authComplete && !oauthErrorCode ? 'sync_identity' : 'bootstrap',
            consultation_id: authComplete ? consultationId : undefined,
            transfer_token: authComplete ? transferToken || undefined : undefined,
            ...landingAttribution,
          });
          if (typeof account?.landing_session_id === 'string') {
            rememberLandingSessionId(account.landing_session_id);
          }
          if (authComplete && !oauthErrorCode) {
            window.sessionStorage.removeItem(transferKey);
            const { data: linkSession } = await supabase.auth.getSession();
            const linkedId = linkSession?.session?.user?.id;
            if (linkedId) identifyLibertyMdUser(linkedId);
            emitIdentityLinked({
              was_merge: false,
              merge_outcome: 'success',
              method: 'google_link',
            });
          }
        }
        if (cancelled) return;

        setIsAnonymous(Boolean(account?.is_anonymous));
        setProfile(account?.profile || null);
        setHistory(normalizeHistorySummary(account?.history));
        setDemographics({
          age: account?.profile?.age ? String(account.profile.age) : '',
          sex: String(account?.profile?.sex_at_birth || ''),
        });

        const data = await invokeCareProxy({ action: 'get_consultation', consultation_id: consultationId });
        if (cancelled) return;
        applyClinicalLanguage(data?.consultation?.language ?? data?.language ?? 'en');
        const nextPhase = phaseFromStatus(String(data?.consultation?.status || 'interviewing'));
        setConsultationVersion(Number.isInteger(data?.consultation?.version) ? Number(data.consultation.version) : null);
        setResumeChiefComplaint(resolveResumeChiefComplaint(data?.consultation));
        applyMediaEvidence(data?.media_evidence);
        const rawMessages = Array.isArray(data?.messages) ? data.messages : [];
        const storage = typeof window !== 'undefined' ? window.localStorage : null;
        // P1-12 hydrate order: mapMessages → merge pending → restore draft/scroll → then flush.
        const pending = storage
          ? reconcilePendingWithServer(consultationId, rawMessages, storage)
          : null;
        // P1-01 resume: staged entry question is persisted as assistant+target_slot; keep it out of the transcript.
        let mapped: ChatMessage[];
        if (nextPhase === 'demographics_required') {
          const entryRow = [...rawMessages].reverse().find((row: any) => (
            row?.role === 'assistant'
            && row?.message_type !== 'demographics'
            && row?.message_type !== 'safety'
            && Boolean(row?.target_slot)
          ));
          if (entryRow) {
            setEntryQuestion(String(entryRow.content || '').trim());
            setEntryOptions(Array.isArray(entryRow.options) ? entryRow.options.map(String).filter(Boolean) : []);
            setClinicalAnswer('');
            setConsentChecked(true);
          }
          mapped = mapMessages(
            rawMessages.filter((row: any) => row !== entryRow),
            { emergencyStopped: String(data?.consultation?.status || '') === 'emergency_stopped' },
          );
        } else {
          mapped = mapMessages(
            rawMessages,
            { emergencyStopped: String(data?.consultation?.status || '') === 'emergency_stopped' },
          );
        }
        setMessages(mergePendingIntoMessages(mapped, pending));
        if (pending) {
          heldSendRef.current = {
            message: pending.message,
            clientMessageId: pending.clientMessageId,
          };
        }
        if (storage && nextPhase === 'intake') {
          const draft = readDraft(consultationId, storage);
          setInput(nextComposerInputAfterPendingHydrate(draft?.text ?? '', pending?.message));
          const scroll = readScroll(consultationId, storage);
          pendingScrollRestoreRef.current = scroll
            ? { scrollTop: scroll.scrollTop, wasNearBottom: scroll.wasNearBottom }
            : null;
        } else if (storage && shouldClearClientPhiForPhase(nextPhase)) {
          clearLibertyMdConsultClientPhi(consultationId, storage);
          heldSendRef.current = null;
        }
        observeMissingSlots(data?.consultation?.missing_slots ?? data?.missing_slots);
        observeTurnGate(data, data?.consultation);
        setPhase(nextPhase);
        if (nextPhase === 'emergency_end') {
          applyEmergencyFromPayload(data);
        }
        // P2-13 L5 — do not open soft gate when body omitted under expiry.
        const expiredOmit = data?.report_omitted_reason === 'retention_expired'
          || shouldClearStaleReportOnHydrate({
            phase: nextPhase,
            hasIncomingReport: Boolean(data?.report),
            reportOmittedReason: data?.report_omitted_reason,
            retentionExpiresAt: data?.retention_expires_at,
          });
        setIsReportGateOpen(
          shouldOpenSoftGate(nextPhase === 'report_gate' && !expiredOmit, consultationId),
        );
        applyReportLifecycleFromProxy(data, nextPhase);
        // P4-03 Q2A/Q3A — report-first only for completed + non-omitted body.
        const consultStatus = String(data?.consultation?.status || '');
        const hasReportBody = Boolean(data?.report)
          && data?.report_omitted_reason !== 'retention_expired';
        setTranscriptCollapsed(
          consultStatus === 'completed'
          && nextPhase === 'report_ready'
          && hasReportBody,
        );
        if (oauthErrorCode) {
          setHasIdentityConflict(oauthErrorCode.includes('identity'));
          setError(oauthErrorDescription || 'Google sign in was not completed. Your consultation is still available.');
        }

        if (authComplete || authMerge || oauthErrorCode) {
          setSearchParams({ consultationId }, { replace: true });
        }
        if (!cancelled) setClientPersistHydrated(true);
      } catch (initializationError) {
        if (!cancelled) {
          // P4-05: merge abort uses plain technical copy (not clinical caution).
          const mergeFailCopy = t('careControls.mergeOutcomeFailed');
          setError(
            authMerge
              ? mergeFailCopy
              : patientFacingTechnicalMessage(initializationError, 'Unable to open this consultation.'),
          );
          setPhase('error');
          setIsBusy(false);
          setClientPersistHydrated(true);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [authComplete, authMerge, consultationId, draftId, navigate, oauthErrorCode, oauthErrorDescription, setSearchParams]);

  // P1-11 Q3A — unmount chips whenever send cannot proceed (busy or holding), not opacity-disabled.
  const currentOptions = useMemo(() => {
    if (isBusy || holdingLocked || phase !== 'intake') return [];
    const latest = messages[messages.length - 1];
    return latest?.sender === 'ai' && Array.isArray(latest.options) ? latest.options : [];
  }, [holdingLocked, isBusy, messages, phase]);

  const submitDemographics = async () => {
    if (!consultationId || isBusy) return;
    // BO 2026-08-01 — the card is demographics-only, so a clinical answer is no
    // longer collected here and no longer gates submit. `clinicalAnswer` is kept
    // and still sent when non-empty so a combined layout would keep working.
    const answer = clinicalAnswer.trim();
    if (!consentChecked) return;
    setIsBusy(true);
    setError('');
    try {
      const data = await invokeCareProxy({
        action: 'save_demographics',
        consultation_id: consultationId,
        age: Number(demographics.age),
        sex_at_birth: demographics.sex,
        ...(answer ? { message: answer } : {}),
      });
      setProfile((current) => ({
        ...current,
        age: Number(demographics.age),
        sex_at_birth: demographics.sex,
      }));
      // Defect 1 / P0-14d AC2 / P1-01 AC0: force_end on this turn must reach the user.
      // Never fall through to next_question when emergency is set.
      if (data?.emergency || data?.state === 'emergency_stopped') {
        setMessages((current) => [...current,
          {
            id: `${Date.now()}-demographics-user`,
            sender: 'user',
            kind: 'demographics',
            text: `Age ${demographics.age}; ${String(demographics.sex).replace(/_/g, ' ')}`,
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
      setMessages((current) => [...current,
        {
          id: `${Date.now()}-demographics-user`,
          sender: 'user',
          kind: 'demographics',
          text: `Age ${demographics.age}; ${String(demographics.sex).replace(/_/g, ' ')}`,
        },
        {
          id: `${Date.now()}-clinical-answer`,
          sender: 'user',
          text: answer,
        },
        {
          id: `${Date.now()}-demographics-ai`,
          sender: 'ai',
          text: String(data?.next_question || 'When did this symptom begin?'),
          options: Array.isArray(data?.options) ? data.options.map(String) : [],
        },
      ]);
      setEntryQuestion('');
      setEntryOptions([]);
      setClinicalAnswer('');
      setSafetyNotice(libertyMDSafetyNoticeFromResponse(data));
      observeMissingSlots(data?.missing_slots);
      observeTurnGate(data);
      setPhase('intake');
    } catch (demographicsError) {
      setError(patientFacingTechnicalMessage(demographicsError, 'Unable to save this information.'));
    } finally {
      setIsBusy(false);
    }
  };

  const applyWorkflowResult = async (data: any) => {
    if (Number.isInteger(data?.version)) setConsultationVersion(Number(data.version));
    if (Array.isArray(data?.media_evidence)) applyMediaEvidence(data.media_evidence);
    observeTurnGate(data);
    if (data?.emergency || data?.state === 'emergency_stopped') {
      setComprehensionCheck(null);
      appendAssistantWithReveal({
        id: `${Date.now()}-emergency`,
        sender: 'ai',
        kind: 'emergency',
        text: String(data?.message || resolveLibertyMdEmergencyCopy(crisisTypeFromSafetyPayload(data)).detail),
      }, { instant: true });
      applyEmergencyFromPayload(data);
      setPhase('emergency_end');
      return;
    }

    if (data?.clinical_review_needed || data?.state === 'clinical_review_needed') {
      setComprehensionCheck(null);
      setGenerationFailed(false);
      appendAssistantWithReveal({
        id: `${Date.now()}-review`,
        sender: 'ai',
        kind: 'normal',
        text: String(data?.message || t('report.lifecycle.partialBody')),
      });
      setSafetyNotice(null);
      setPhase('clinical_review_needed');
      return;
    }

    if (data?.report_ready) {
      setComprehensionCheck(null);
      setGenerationFailed(false);
      appendAssistantWithReveal({
        id: `${Date.now()}-report`,
        sender: 'ai',
        kind: 'report',
        text: data?.auth_required
          ? 'Your report is ready. Link Google to save it, or continue without saving.'
          : 'Your report is ready and saved in your consultation history.',
      }, { instant: true });
      // P2-02 Q3: setReport before release — anonymous soft gate still shows full report.
      // P2-13 L6: also capture retention ISO when present on send response.
      if (typeof data?.retention_expires_at === 'string') {
        setRetentionExpiresAt(data.retention_expires_at);
      }
      setReportOmittedReason(null);
      if (data?.report) setReport(normalizeReportData(data.report));
      if (data?.auth_required) {
        setPhase('report_gate');
        setIsReportGateOpen(shouldOpenSoftGate(true, consultationId));
      } else {
        setPhase('report_ready');
        await refreshAccount();
      }
      return;
    }

    // P1-14 — gate short-circuit: OverlaySheet confirm before Diagnosis.
    const comprehension = parseComprehensionCheck(data?.comprehension_check);
    if (comprehension) {
      const bridge = String(data?.next_question || data?.message || '').trim();
      if (bridge) {
        appendAssistantWithReveal({
          id: `${Date.now()}-comprehension`,
          sender: 'ai',
          text: bridge,
          options: [],
        });
      }
      setSafetyNotice(libertyMDSafetyNoticeFromResponse(data));
      observeMissingSlots(data?.missing_slots);
      setComprehensionCheck(comprehension);
      setPhase('intake');
      return;
    }

    const nextQuestion = String(data?.next_question || data?.message || 'Could you tell me more about that?');
    setSafetyNotice(libertyMDSafetyNoticeFromResponse(data));
    observeMissingSlots(data?.missing_slots);
    appendAssistantWithReveal({
      id: `${Date.now()}-assistant`,
      sender: 'ai',
      text: nextQuestion,
      options: Array.isArray(data?.options) ? data.options.map(String) : [],
      ...(data?.media_followup?.kind === 'photo' || data?.media_followup?.kind === 'lab'
        ? { mediaKind: data.media_followup.kind }
        : {}),
    });
    setPhase('intake');
  };

  const showTechnicalRequestError = (classified: ClassifiedFailure) => {
    setError(classified.message);
    setErrorRetry(classified.showRetry);
    if (!classified.userVisible || !classified.message) return;
    const episode = `${classified.errorClass}:${heldSendRef.current?.clientMessageId || 'none'}`;
    if (appErrorEpisodeRef.current === episode) return;
    appErrorEpisodeRef.current = episode;
    emitAppErrorShown(classified.errorClass);
  };

  const rehydrateConsultationSilently = async () => {
    if (!consultationId) return;
    try {
      const data = await invokeCareProxy({ action: 'get_consultation', consultation_id: consultationId });
      applyClinicalLanguage(data?.consultation?.language ?? data?.language ?? 'en');
      const nextPhase = phaseFromStatus(String(data?.consultation?.status || 'interviewing'));
      setConsultationVersion(Number.isInteger(data?.consultation?.version) ? Number(data.consultation.version) : null);
      setResumeChiefComplaint(resolveResumeChiefComplaint(data?.consultation));
      applyMediaEvidence(data?.media_evidence);
      const rawMessages = Array.isArray(data?.messages) ? data.messages : [];
      const storage = typeof window !== 'undefined' ? window.localStorage : null;
      const pending = storage
        ? reconcilePendingWithServer(consultationId, rawMessages, storage)
        : null;
      setMessages(mergePendingIntoMessages(
        mapMessages(rawMessages, {
          emergencyStopped: String(data?.consultation?.status || '') === 'emergency_stopped',
        }),
        pending,
      ));
      if (pending) {
        heldSendRef.current = {
          message: pending.message,
          clientMessageId: pending.clientMessageId,
        };
      }
      observeMissingSlots(data?.consultation?.missing_slots ?? data?.missing_slots);
      setPhase(nextPhase);
      const expiredOmit = data?.report_omitted_reason === 'retention_expired'
        || shouldClearStaleReportOnHydrate({
          phase: nextPhase,
          hasIncomingReport: Boolean(data?.report),
          reportOmittedReason: data?.report_omitted_reason,
          retentionExpiresAt: data?.retention_expires_at,
        });
      setIsReportGateOpen(
        shouldOpenSoftGate(nextPhase === 'report_gate' && !expiredOmit, consultationId),
      );
      applyReportLifecycleFromProxy(data, nextPhase);
      if (String(data?.consultation?.status || '') === 'emergency_stopped') {
        // get_consultation returns top-level crisis_type (not nested under safety).
        applyEmergencyFromPayload(data);
      }
      observeTurnGate(data, data?.consultation);
    } catch {
      // Silent rehydrate failed — leave local state; no banner for version_mismatch path.
    }
  };

  /**
   * P4-06 — photo attach via proxy only. Failures are technical and never block
   * send_message / the interview continuum. No native dialogs; no clinical clothing.
   */
  const uploadPhoto = async (file: File) => {
    // Attach is allowed anytime during intake (including while the assistant is busy).
    if (!consultationId || phase !== 'intake' || photoUploading || labUploading) return;

    const localGate = validatePhotoFileClient(file);
    if (!localGate.ok) {
      setPhotoNotice(copyForPhotoUploadCode(localGate.code));
      return;
    }

    const optimisticUuid = `local-photo-${crypto.randomUUID()}`;
    const content_type = (file.type || 'image/jpeg').toLowerCase().split(';')[0]?.trim() || 'image/jpeg';
    setPhotoChips((prev) => [...prev, {
      object_uuid: optimisticUuid,
      content_type,
      analysis_status: 'processing',
    }]);
    setPhotoUploading(true);
    setPhotoNotice(null);
    try {
      const image_base64 = await readPhotoFileAsBase64(file);
      const { data, error: functionError } = await supabase.functions.invoke('libertymd-care-proxy', {
        body: uploadPhotoBody({
          consultation_id: consultationId,
          content_type,
          image_base64,
        }),
      });
      const status = statusFromFunctionsError(functionError) ?? (functionError ? undefined : 200);
      const body = (data && typeof data === 'object' ? data : null) as Record<string, unknown> | null;

      if (functionError || !body?.ok) {
        const classified = classifyPhotoUploadFailure(status, body);
        setPhotoNotice(classified.message);
        const persistedUuid = typeof body?.object_uuid === 'string' ? body.object_uuid : optimisticUuid;
        setPhotoChips((prev) => uniqueEvidenceChips(prev.map((chip) => chip.object_uuid === optimisticUuid
          ? { ...chip, object_uuid: persistedUuid, analysis_status: body?.retry_available === true ? 'retry' : 'failed' }
          : chip)));
        return;
      }

      const objectUuid = typeof body.object_uuid === 'string' ? body.object_uuid : '';
      const contentType = typeof body.content_type === 'string' ? body.content_type : content_type;
      if (objectUuid) {
        const retry = body.analysis_retry_available === true;
        setPhotoChips((prev) => uniqueEvidenceChips(prev.map((chip) => chip.object_uuid === optimisticUuid
          ? {
            object_uuid: objectUuid,
            content_type: contentType,
            analysis_status: retry ? 'retry' : 'processed',
          }
          : chip)));
        if (retry) setPhotoNotice(copyForPhotoUploadCode('analysis_failed'));
      }
    } catch {
      setPhotoNotice(copyForPhotoUploadCode('upstream_unknown'));
      setPhotoChips((prev) => prev.map((chip) => chip.object_uuid === optimisticUuid
        ? { ...chip, analysis_status: 'failed' }
        : chip));
    } finally {
      setPhotoUploading(false);
    }
  };

  const retryPhotoAnalysis = async (objectUuid: string) => {
    if (!consultationId || !objectUuid || photoRetryingObjectUuid) return;
    setPhotoRetryingObjectUuid(objectUuid);
    setPhotoChips((prev) => prev.map((chip) =>
      chip.object_uuid === objectUuid ? { ...chip, analysis_status: 'processing' } : chip));
    setPhotoNotice(null);
    try {
      const { data, error: functionError } = await supabase.functions.invoke('libertymd-care-proxy', {
        body: retryPhotoAnalysisBody({ consultation_id: consultationId, object_uuid: objectUuid }),
      });
      const status = statusFromFunctionsError(functionError) ?? (functionError ? undefined : 200);
      const body = (data && typeof data === 'object' ? data : null) as Record<string, unknown> | null;
      if (functionError || !body?.ok) {
        const classified = classifyPhotoUploadFailure(status, body);
        setPhotoNotice(classified.message);
        setPhotoChips((prev) => prev.map((chip) =>
          chip.object_uuid === objectUuid ? { ...chip, analysis_status: 'retry' } : chip));
        return;
      }
      setPhotoChips((prev) => prev.map((chip) =>
        chip.object_uuid === objectUuid ? { ...chip, analysis_status: 'processed' } : chip));
    } catch {
      setPhotoNotice(copyForPhotoUploadCode('upstream_unknown'));
      setPhotoChips((prev) => prev.map((chip) =>
        chip.object_uuid === objectUuid ? { ...chip, analysis_status: 'retry' } : chip));
    } finally {
      setPhotoRetryingObjectUuid(null);
    }
  };

  /**
   * P4-07 — lab attach via proxy only (linked + profile attribution).
   * Failures are technical and never block send_message. Soft gate untouched.
   */
  const openLabAttribution = async () => {
    if (!consultationId || phase !== 'intake' || isAnonymous || photoUploading || labUploading) return;
    setPhotoNotice(null);
    try {
      const [owned, consult] = await Promise.all([
        invokeCareProxy(listOwnedPatientsBody()),
        invokeCareProxy({ action: 'get_consultation', consultation_id: consultationId }),
      ]);
      const managed = normalizeManagedPatientList(owned?.patients);
      const allProfiles = managed.map((p) => ({
        id: p.id,
        display_label: p.display_label,
        relationship: p.relationship,
      }));
      const consultPid =
        typeof consult?.consultation?.patient_id === 'string'
          ? consult.consultation.patient_id
          : null;
      const profiles = consultPid
        ? allProfiles.filter((profile) => profile.id === consultPid)
        : allProfiles;
      const defaultId =
        (consultPid && profiles.some((p) => p.id === consultPid) ? consultPid : null)
        || profiles.find((p) => p.relationship === 'self')?.id
        || profiles[0]?.id
        || null;
      setLabProfiles(profiles);
      setLabDefaultPatientId(defaultId);
      setLabSelectedPatientId(defaultId);
      // P4-07 — a lab report may only be attributed to the patient this
      // consultation is already bound to, so `profiles` is filtered to that one
      // person above. Asking "who is this lab report for?" when exactly one
      // answer is possible is a decision the patient cannot make wrongly and
      // therefore should not be asked to make; it is pure friction in front of
      // the file picker. The sheet still opens whenever there is a real choice
      // (an unbound consultation yields the full list).
      if (profiles.length === 1 && defaultId) {
        labFileInputRef.current?.click();
        return;
      }
      setLabAttributionOpen(true);
    } catch {
      setPhotoNotice(copyForLabUploadCode('upstream_unknown'));
    }
  };

  const uploadLab = async (file: File, patientId: string) => {
    if (!consultationId || phase !== 'intake' || photoUploading || labUploading) return;
    if (isAnonymous) {
      setPhotoNotice(copyForLabUploadCode('sign_in_required'));
      return;
    }
    if (!patientId) {
      setPhotoNotice(copyForLabUploadCode('missing_patient'));
      return;
    }

    const localGate = validateLabFileClient(file);
    if (!localGate.ok) {
      setPhotoNotice(copyForLabUploadCode(localGate.code));
      return;
    }

    const optimisticUuid = `local-lab-${crypto.randomUUID()}`;
    const content_type =
      (file.type || 'application/pdf').toLowerCase().split(';')[0]?.trim() || 'application/pdf';
    setLabChips((prev) => [...prev, {
      object_uuid: optimisticUuid,
      content_type,
      patient_id: patientId,
      analysis_status: 'processing',
    }]);
    setLabUploading(true);
    setPhotoNotice(null);
    try {
      const file_base64 = await readLabFileAsBase64(file);
      const { data, error: functionError } = await supabase.functions.invoke('libertymd-care-proxy', {
        body: uploadLabBody({
          consultation_id: consultationId,
          patient_id: patientId,
          content_type,
          file_base64,
        }),
      });
      const status = statusFromFunctionsError(functionError) ?? (functionError ? undefined : 200);
      const body = (data && typeof data === 'object' ? data : null) as Record<string, unknown> | null;

      if (functionError || !body?.ok) {
        const classified = classifyLabUploadFailure(status, body);
        setPhotoNotice(classified.message);
        const persistedUuid = typeof body?.object_uuid === 'string' ? body.object_uuid : optimisticUuid;
        setLabChips((prev) => uniqueEvidenceChips(prev.map((chip) => chip.object_uuid === optimisticUuid
          ? { ...chip, object_uuid: persistedUuid, analysis_status: 'failed' }
          : chip)));
        return;
      }

      const objectUuid = typeof body.object_uuid === 'string' ? body.object_uuid : '';
      const contentType = typeof body.content_type === 'string' ? body.content_type : content_type;
      const attributed =
        typeof body.patient_id === 'string' ? body.patient_id : patientId;
      if (objectUuid) {
        setLabChips((prev) => uniqueEvidenceChips(prev.map((chip) => chip.object_uuid === optimisticUuid
          ? {
            object_uuid: objectUuid,
            content_type: contentType,
            patient_id: attributed,
            analysis_status: 'processed',
          }
          : chip)));
      }
    } catch {
      setPhotoNotice(copyForLabUploadCode('upstream_unknown'));
      setLabChips((prev) => prev.map((chip) => chip.object_uuid === optimisticUuid
        ? { ...chip, analysis_status: 'failed' }
        : chip));
    } finally {
      setLabUploading(false);
    }
  };

  const sendMessage = async (
    value?: string,
    opts?: { reuseClientMessageId?: string; fromOfflineQueue?: boolean },
  ) => {
    const message = String(value ?? input).trim();
    if (!consultationId || !message || isBusy || holdingLocked || phase !== 'intake') return;

    const optimisticId = `${Date.now()}-user`;
    const clientMessageId = opts?.reuseClientMessageId || crypto.randomUUID();
    heldSendRef.current = { message, clientMessageId };
    sessionRefreshAttemptedRef.current = false;

    // P1-12 S2 — persist pending at optimistic append (before await); single outbound writer.
    try {
      persistPendingOutbound(
        { consultationId, message, clientMessageId },
        window.localStorage,
      );
    } catch {
      // Quota / private mode — in-session optimistic still proceeds; AC5 unit covers durable path.
    }

    setMessages((current) => {
      if (current.some((item) => item.clientMessageId === clientMessageId)) {
        return current;
      }
      return [...current, { id: optimisticId, sender: 'user', text: message, clientMessageId }];
    });
    setInput('');
    setError('');
    setErrorRetry(false);
    if (!opts?.fromOfflineQueue) setOfflineBanner('');
    // P1-07 — whole-turn wait mode from last-known gate inputs (best-effort).
    const nextWait = predictWaitModeFromLastKnown({
      lastTurnCount,
      evidenceScore: lastEvidenceScore,
    });
    setWaitMode(nextWait);
    setGenerationFailed(false);
    turnStartedAtRef.current = performance.now();
    ttftEmittedRef.current = false;
    setIsBusy(true);

    const restoreDraft = (optsRestore?: { keepPending?: boolean }) => {
      setMessages((current) => current.filter((item) => (
        item.id !== optimisticId && item.id !== `pending:${clientMessageId}`
      )));
      // Q3 — never clobber a mid-wait draft that differs from the sent message.
      setInput((current) => {
        const next = nextComposerInputAfterRestore(current, message);
        try {
          writeDraft(consultationId, next, window.localStorage);
        } catch {
          // ignore storage failures
        }
        return next;
      });
      if (!optsRestore?.keepPending) {
        try {
          clearPendingOutbound(consultationId, window.localStorage);
        } catch {
          // ignore
        }
      }
    };

    const persistOfflineAndBanner = () => {
      try {
        enqueueOfflineMessage(
          { consultationId, message, clientMessageId },
          window.localStorage,
        );
        setOfflineBanner(copyForErrorClass('offline', { offlinePersisted: true }));
        if (appErrorEpisodeRef.current !== `offline:${consultationId}`) {
          appErrorEpisodeRef.current = `offline:${consultationId}`;
          emitAppErrorShown('offline');
        }
      } catch {
        setOfflineBanner(copyForErrorClass('offline'));
        if (appErrorEpisodeRef.current !== `offline:${consultationId}:unpersisted`) {
          appErrorEpisodeRef.current = `offline:${consultationId}:unpersisted`;
          emitAppErrorShown('offline');
        }
      }
    };

    // Last for-loop attempt index (= automatic re-invokes after the first).
    // P0-10 turn_failed retry_count: success on index 1 → 1; full exhaustion → 2.
    let loopAttempt = 0;

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        restoreDraft({ keepPending: true });
        persistOfflineAndBanner();
        return;
      }

      let data: any;
      let lastError: unknown;
      let holding: LibertyMDHoldingState | null = null;
      // Retry only retryable failures. 4xx will never succeed on retry.
      // client_message_id makes retries idempotent. Holding 503 is exempt (P0-11).
      for (let attempt = 0; attempt < 3; attempt += 1) {
        loopAttempt = attempt;
        try {
          data = await invokeCareProxy({
            action: 'send_message',
            consultation_id: consultationId,
            message,
            client_message_id: clientMessageId,
            expected_version: consultationVersion,
            media_upload_in_progress: photoUploading || labUploading,
          });
          lastError = null;
          break;
        } catch (requestError) {
          lastError = requestError;
          holding = await parseHoldingFromFunctionsError(requestError);
          if (holding || !isRetryableCareProxyFailure(requestError, holding) || attempt === 2) break;
          await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 1000 : 3000));
        }
      }

      if (holding) {
        // No turn_failed — holding is exempt from the silent-retry episode (Q3).
        restoreDraft();
        setErrorRetry(false);
        // P2-13 L3 — diagnosis-stage holding after reviewing → generation failed shell.
        if (nextWait === 'reviewing') {
          setGenerationFailed(true);
          setError('');
        } else {
          setError(holding.message);
          startHoldingCooldown(holding.retry_after_ms);
        }
        return;
      }

      if (lastError) {
        const online = typeof navigator === 'undefined' ? true : navigator.onLine;
        let classified = await classifyThrownSendFailure(lastError, { online, holding: null });

        // Session expired: silent refresh once, then retry same client_message_id.
        if (classified?.errorClass === 'session_expired' && !sessionRefreshAttemptedRef.current) {
          sessionRefreshAttemptedRef.current = true;
          const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError && refreshed.session) {
            try {
              data = await invokeCareProxy({
                action: 'send_message',
                consultation_id: consultationId,
                message,
                client_message_id: clientMessageId,
                expected_version: consultationVersion,
              });
              lastError = null;
              classified = null;
            } catch (retryError) {
              lastError = retryError;
              classified = await classifyThrownSendFailure(retryError, {
                online: typeof navigator === 'undefined' ? true : navigator.onLine,
                holding: null,
              });
            }
          }
        }

        if (!lastError) {
          // Session-refresh-only recovery — no turn_failed (Q3).
          clearHoldingCooldown();
          clearOfflineQueue(consultationId, window.localStorage);
          setOfflineBanner('');
          heldSendRef.current = null;
          await applyWorkflowResult(data);
          return;
        }

        if (!classified) {
          classified = classifySendFailure({
            online,
            status: undefined,
          })!;
        }

        if (classified.errorClass === 'lease_conflict') {
          restoreDraft();
          return;
        }

        if (classified.errorClass === 'version_mismatch') {
          restoreDraft();
          await rehydrateConsultationSilently();
          return;
        }

        if (classified.errorClass === 'offline' || !online) {
          restoreDraft({ keepPending: true });
          persistOfflineAndBanner();
          return;
        }

        restoreDraft();
        // Exhaustion → visible technical notice: one turn_failed per episode (Q3).
        // Coexists with app_error_shown inside showTechnicalRequestError (Q2).
        emitTurnFailed({ retry_count: loopAttempt, resolved_silently: false });

        if (classified.errorClass === 'rate_limited') {
          showTechnicalRequestError(classified);
          startHoldingCooldown(classified.retryAfterMs ?? 60_000);
          return;
        }

        if (classified.errorClass === 'session_expired') {
          showTechnicalRequestError(classified);
          return;
        }

        if (classified.errorClass === 'n8n_timeout' || classified.errorClass === 'n8n_upstream') {
          // P2-13 L3 — technical failure on diagnosis-eligible turn → generation failed.
          if (nextWait === 'reviewing') {
            setGenerationFailed(true);
            setError('');
            setErrorRetry(true);
          } else {
            showTechnicalRequestError(classified);
          }
          return;
        }

        // upstream_unknown and any other visible technical class
        if (nextWait === 'reviewing' && classified.showRetry) {
          setGenerationFailed(true);
          setError('');
          setErrorRetry(true);
        } else {
          showTechnicalRequestError(classified);
        }
        return;
      }

      clearHoldingCooldown();
      clearOfflineQueue(consultationId, window.localStorage);
      setOfflineBanner('');
      heldSendRef.current = null;
      await applyWorkflowResult(data);
      // Silent success after retry — emit once; first-attempt success does not emit (Q3).
      if (loopAttempt > 0) {
        emitTurnFailed({ retry_count: loopAttempt, resolved_silently: true });
      }
    } catch (sendError) {
      const online = typeof navigator === 'undefined' ? true : navigator.onLine;
      if (!online) {
        restoreDraft({ keepPending: true });
        persistOfflineAndBanner();
        return;
      }
      restoreDraft();
      const classified = await classifyThrownSendFailure(sendError, { online, holding: null })
        ?? classifySendFailure({ online, status: undefined })!;
      if (classified.errorClass === 'lease_conflict' || classified.errorClass === 'version_mismatch') {
        if (classified.errorClass === 'version_mismatch') await rehydrateConsultationSilently();
        return;
      }
      emitTurnFailed({ retry_count: loopAttempt, resolved_silently: false });
      showTechnicalRequestError(classified);
    } finally {
      setIsBusy(false);
    }
  };

  const retryHeldSend = () => {
    const held = heldSendRef.current;
    if (!held) return;
    void sendMessage(held.message, { reuseClientMessageId: held.clientMessageId });
  };

  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  // P0-12 — restore offline queue banner for this consult; auto-send on `online`.
  // P1-12 — runs only after hydrate (get → map → merge pending → draft/scroll).
  useEffect(() => {
    if (!consultationId || typeof window === 'undefined') return undefined;
    if (!clientPersistHydrated) return undefined;
    const storage = window.localStorage;
    const queued = readOfflineQueue(consultationId, storage);
    if (queued) {
      heldSendRef.current = { message: queued.message, clientMessageId: queued.clientMessageId };
      setOfflineBanner(copyForErrorClass('offline', { offlinePersisted: true }));
      if (appErrorEpisodeRef.current !== `offline:${consultationId}`) {
        appErrorEpisodeRef.current = `offline:${consultationId}`;
        emitAppErrorShown('offline');
      }
    } else {
      setOfflineBanner('');
    }

    const flushOfflineQueue = () => {
      if (!navigator.onLine) return;
      const entry = readOfflineQueue(consultationId, storage);
      if (!entry) return;
      setOfflineBanner('');
      void sendMessageRef.current(entry.message, {
        reuseClientMessageId: entry.clientMessageId,
        fromOfflineQueue: true,
      });
    };

    window.addEventListener('online', flushOfflineQueue);
    let flushTimer: number | null = null;
    if (navigator.onLine && queued) {
      flushTimer = window.setTimeout(flushOfflineQueue, 0);
    }
    return () => {
      window.removeEventListener('online', flushOfflineQueue);
      if (flushTimer !== null) window.clearTimeout(flushTimer);
    };
  }, [consultationId, clientPersistHydrated]);

  /**
   * Header Sign In button — uses signInWithOAuth (always redirects to Google).
   * Does not require an existing consultation or anonymous session.
   */
  const startGoogleSignIn = async () => {
    setIsAuthBusy(true);
    setError('');
    try {
      const query = new URLSearchParams({ auth: 'complete' });
      if (consultationId) query.set('consultationId', consultationId);
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: consultationId
            ? `${window.location.origin}/liberty-md/chat?${query.toString()}`
            : `${window.location.origin}/liberty-md?${query.toString()}`,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (oauthError) throw oauthError;
    } catch (oauthError) {
      setError(patientFacingTechnicalMessage(oauthError, 'Unable to start Google sign in.'));
      setIsAuthBusy(false);
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
      const message = patientFacingTechnicalMessage(linkError, 'Unable to start Google sign in.');
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

  /** P1-04 Q4A — tap → create_patient → offer on reject; never invent a patient. */
  const attemptAddProfile = async (source: 'drawer' | 'unified_entry') => {
    setIsMenuOpen(false);
    try {
      await invokeCareProxy(anonymousAddProfileProbeBody());
      // Linked success is P4-04 UX; do not open multi-profile CRUD here.
    } catch (createError) {
      const { status, body } = await readFunctionsErrorPayload(createError);
      const reason = resolveProfileCapabilityOffer(status, body);
      if (reason) {
        setIsProfileCapabilityOfferOpen(true);
        emitProfileCapabilityOfferShown(source === 'drawer' ? 'drawer' : 'unified_entry');
        return;
      }
      // Fall through: still show capability offer rather than inventing a patient (Q4A).
      setIsProfileCapabilityOfferOpen(true);
      emitProfileCapabilityOfferShown('create_reject');
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
        const classified = classifyProfileManagementFailure(status, body);
        throw new Error(classified.message);
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
        const classified = classifyProfileManagementFailure(status, body);
        throw new Error(classified.message);
      }
    },
    remove: async (patientId: string) => {
      try {
        await invokeCareProxy(deletePatientBody(patientId));
      } catch (deleteError) {
        const { status, body } = await readFunctionsErrorPayload(deleteError);
        const classified = classifyProfileManagementFailure(status, body);
        throw new Error(classified.message);
      }
    },
  } : null;

  const entryProfileRows: LibertyMDEntryProfile[] = entryProfilesFromPatients(entryPatients);

  const handlePreStartProfileSelect = (profileId: string) => {
    const symptom = pendingSymptom.trim();
    if (!symptom || isBusy) return;
    void runStartConsultation(symptom, {
      patient_id: profileId,
      selection_source: 'picker',
    }).catch((startError) => {
      setError(patientFacingTechnicalMessage(startError, 'Unable to start LibertyMD consultation.'));
      setPhase('profile_pick');
      setIsBusy(false);
    });
  };

  const handleSomeoneElseFromPicker = () => {
    if (isAnonymous) {
      void attemptAddProfile('unified_entry');
      return;
    }
    setShowSomeoneElseCreate(true);
  };

  const handleSomeoneElseCreate = async (input: {
    display_label: string;
    age: number;
    sex_at_birth: 'female' | 'male';
  }) => {
    const symptom = pendingSymptom.trim();
    if (!symptom || isBusy) return;
    setIsBusy(true);
    setError('');
    try {
      const created = await invokeCareProxy(someoneElseCreateBody(input));
      const newId = String(created?.patient?.id || '').trim();
      if (!newId) throw new Error('Unable to create profile.');
      await runStartConsultation(symptom, {
        patient_id: newId,
        selection_source: 'someone_else_create',
      });
    } catch (createError) {
      const { status, body } = await readFunctionsErrorPayload(createError);
      if (isPatientSelectionRequiredReject(status, body)) {
        const listed = normalizePatientList(body?.patients);
        if (listed.length > 0) setEntryPatients(listed);
        setShowSomeoneElseCreate(false);
        setPhase('profile_pick');
        setIsBusy(false);
        return;
      }
      setError(patientFacingTechnicalMessage(createError, 'Unable to add this profile.'));
      setIsBusy(false);
    }
  };

  const startCapabilityGoogleLink = async () => {
    emitProfileCapabilityOfferCta('create_reject');
    setIsAuthBusy(true);
    setError('');
    try {
      await ensureIdentity();
      const query = new URLSearchParams({ auth: 'complete' });
      if (consultationId) query.set('consultationId', consultationId);
      const { error: linkError } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/liberty-md/chat?${query.toString()}` },
      });
      if (linkError) throw linkError;
    } catch (linkError) {
      setError(patientFacingTechnicalMessage(linkError, 'Unable to start Google sign in.'));
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
      setError(patientFacingTechnicalMessage(signInError, 'Unable to sign in to the existing Google account.'));
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
      markSoftGateDismissed(consultationId);
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
    if (consultationId) markSoftGateDismissed(consultationId);
    setIsReportGateOpen(false);
  };

  /** P2-08 — email-me mint/send; does not gate on-screen report; no clinical writes. */
  const requestReportEmail = async (email: string) => {
    if (!consultationId) {
      throw new Error('Consultation is not ready for email delivery.');
    }
    try {
      await invokeCareProxy(requestReportEmailBody(consultationId, email));
      emitReportDeliveryRequested({ method: 'email' });
    } catch (sendError) {
      void sendError;
      throw new Error('We could not send the email right now.');
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
      setError(patientFacingTechnicalMessage(resumeError, 'Unable to resume this consultation.'));
    } finally {
      setIsBusy(false);
    }
  };

  const startOver = async () => {
    if (!consultationId || isBusy || partialOutcomeSheet) return;
    clearRecoverableConsultationId();
    if (phase === 'recovery_required' || ['report_gate', 'report_ready', 'emergency_end', 'clinical_review_needed', 'error'].includes(phase)) {
      clearLibertyMdConsultClientState(consultationId, window.localStorage);
      navigate(`/liberty-md?lang=${language}`);
      return;
    }

    setIsBusy(true);
    setError('');
    setErrorRetry(false);
    try {
      // P1-09 Q4A1 — abandon first; show partial-outcome sheet before navigate when payload attached.
      const data = await invokeCareProxy({
        action: 'abandon_consultation',
        consultation_id: consultationId,
      });
      clearLibertyMdConsultClientState(consultationId, window.localStorage);
      setOfflineBanner('');
      heldSendRef.current = null;
      const outcome = phase === 'emergency_end' ? null : parsePartialOutcome(data?.partial_outcome);
      if (outcome) {
        setPartialOutcomeSheet({ outcome, trigger: 'abandon' });
        setIsBusy(false);
        return;
      }
      navigate(`/liberty-md?lang=${language}`);
    } catch (abandonError) {
      setError(patientFacingTechnicalMessage(abandonError, 'Unable to start over right now.'));
      setIsBusy(false);
    }
  };

  /**
   * P0-24 Q1A — soft leave: no abandon_consultation, no window.confirm, no history trap.
   * Stash recoverable id so Chat can resume via sessionStorage / consultationId query.
   * P1-09 Q1A/Q2A+S1 — when eligible, fetch partial outcome then sheet before navigate.
   */
  const softLeaveConsult = async () => {
    if (partialOutcomeSheet || phase === 'emergency_end') {
      navigate(`/liberty-md?lang=${language}`);
      return;
    }
    if (consultationId && SOFT_LEAVE_PHASES.has(phase)) {
      stashRecoverableConsultationId(consultationId);
      setIsBusy(true);
      try {
        const data = await invokeCareProxy({
          action: 'get_partial_outcome',
          consultation_id: consultationId,
        });
        const outcome = parsePartialOutcome(data?.partial_outcome);
        if (outcome) {
          setPartialOutcomeSheet({ outcome, trigger: 'soft_leave' });
          setIsBusy(false);
          return;
        }
      } catch {
        // Soft leave must still complete — sheet is additive, not a gate.
      } finally {
        setIsBusy(false);
      }
      showSoftLeaveToast();
    }
    navigate(`/liberty-md?lang=${language}`);
  };

  const finishPartialOutcomeLeave = (engaged: boolean) => {
    const sheet = partialOutcomeSheet;
    if (!sheet) return;
    if (engaged) {
      emitPartialOutcomeEngaged({
        trigger: sheet.trigger,
        bucket: sheet.outcome.bucket,
      });
    }
    const trigger = sheet.trigger;
    setPartialOutcomeSheet(null);
    if (trigger === 'soft_leave') showSoftLeaveToast();
    navigate(`/liberty-md?lang=${language}`);
  };

  /**
   * P1-14 — proceed ack → Diagnosis/report path (proxy flag). Dismiss must not call this.
   */
  const proceedComprehensionCheck = async () => {
    if (!consultationId || comprehensionBusy) return;
    const ack = String(t('chatx.comprehensionProceedAck') || 'Looks good').trim() || 'Looks good';
    const clientMessageId = crypto.randomUUID();
    setComprehensionBusy(true);
    setIsBusy(true);
    setError('');
    try {
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-comprehension-ack`, sender: 'user', text: ack, clientMessageId },
      ]);
      const request = invokeCareProxy({
        action: 'send_message',
        consultation_id: consultationId,
        message: ack,
        client_message_id: clientMessageId,
        expected_version: consultationVersion,
        comprehension_ack: true,
      });
      // BO 2026-08-02 — leave for the report surface as soon as the patient
      // confirms, rather than after a report body exists.
      //
      // Diagnosis takes tens of seconds. Waiting for `report` before navigating
      // meant the report page's loader could never appear in the natural flow,
      // and the patient sat on a finished transcript with no indication that
      // anything was happening — or, when generation did not land, no
      // indication that it never would. The wait now has a home.
      //
      // `awaiting` carries the turn we left on, so the report page can tell
      // "still generating" apart from "the interview asked something else" and
      // send the patient back rather than spin. See LibertyMDReportPage.
      navigate(
        `/liberty-md/report/${encodeURIComponent(consultationId)}`,
        { replace: true },
      );
      reportRedirectedRef.current = true;
      const data = await request;
      setComprehensionCheck(null);
      await applyWorkflowResult(data);
    } catch (requestError) {
      setError(patientFacingTechnicalMessage(requestError, 'Unable to continue right now.'));
    } finally {
      setComprehensionBusy(false);
      setIsBusy(false);
    }
  };

  /**
   * P1-14 — free-text correction → proxy-tagged merge → Diagnosis (no second sheet).
   */
  const correctComprehensionCheck = async (text: string) => {
    const message = text.trim();
    if (!consultationId || !message || comprehensionBusy) return;
    const clientMessageId = crypto.randomUUID();
    setComprehensionBusy(true);
    setIsBusy(true);
    setError('');
    try {
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-comprehension-correct`, sender: 'user', text: message, clientMessageId },
      ]);
      const data = await invokeCareProxy({
        action: 'send_message',
        consultation_id: consultationId,
        message,
        client_message_id: clientMessageId,
        expected_version: consultationVersion,
        comprehension_correction: true,
      });
      setComprehensionCheck(null);
      await applyWorkflowResult(data);
    } catch (requestError) {
      setError(patientFacingTechnicalMessage(requestError, 'Unable to apply that correction.'));
    } finally {
      setComprehensionBusy(false);
      setIsBusy(false);
    }
  };

  // P1-09 S3A — client shown on paint (incl. soft leave); no PHI.
  useEffect(() => {
    if (!partialOutcomeSheet) {
      partialOutcomeShownRef.current = false;
      return;
    }
    if (partialOutcomeShownRef.current) return;
    partialOutcomeShownRef.current = true;
    emitPartialOutcomeShown({
      trigger: partialOutcomeSheet.trigger,
      bucket: partialOutcomeSheet.outcome.bucket,
    });
  }, [partialOutcomeSheet]);

  // Soft-resume entry: empty Chat URL with a stashed id restores the consultation query.
  useEffect(() => {
    if (consultationId || draftId || authComplete || authMerge || oauthErrorCode) return;
    try {
      const stashed = window.sessionStorage.getItem(LIBERTYMD_RECOVERABLE_CONSULTATION_KEY);
      if (!stashed) return;
      window.sessionStorage.removeItem(LIBERTYMD_RECOVERABLE_CONSULTATION_KEY);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('consultationId', stashed);
        return next;
      }, { replace: true });
    } catch {
      // ignore
    }
  }, [authComplete, authMerge, consultationId, draftId, oauthErrorCode, setSearchParams]);

  // Browser back / edge-swipe: stash before React Router unmounts; do not pushState-trap.
  useEffect(() => {
    if (!consultationId || !SOFT_LEAVE_PHASES.has(phase)) return;
    const onPopState = () => {
      stashRecoverableConsultationId(consultationId);
      showSoftLeaveToast();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [consultationId, phase]);

  const selectConsultation = (id: string) => {
    setIsMenuOpen(false);
    setSearchParams({ consultationId: id });
  };

  const composerSendLocked = isBusy || holdingLocked || phase !== 'intake';
  // Attach stays available throughout intake — including while the assistant is
  // thinking or the turn is held. Send still uses composerSendLocked above.
  const composerAttachLocked = !consultationId || phase !== 'intake' || photoUploading || labUploading;
  // P1-07 AC4 / Q6 — during isBusy intake (not holding), draft field stays editable.
  const composerInputLocked = holdingLocked || phase !== 'intake';
  // P0-21 Q1 B1: continuation slot owns the footer for resume / report-gate-open CTA.
  // P1-10: also clinical_review_needed start-fresh (reason-agnostic; no true resume).
  // P2-06: after soft-gate dismiss-once, do not re-nag via “View report options”.
  const softGateDismissed = Boolean(consultationId && isSoftGateDismissed(consultationId));
  const reportLifecycle = deriveReportLifecycleState({
    phase,
    isBusy,
    waitMode,
    hasReportBody: Boolean(report),
    reportOmittedReason,
    retentionExpiresAt,
    generationFailed,
    lastTurnCount,
    evidenceScore: lastEvidenceScore,
  });
  const guestExpired = reportLifecycle === 'guest_expired';

  // P5-REPORT — the finished report lives on its own page, not in the transcript.
  //
  // Navigation waits for the soft gate to resolve rather than firing the moment
  // the body exists. P2-06's benefits sheet is shown in the consult, and jumping
  // away underneath it would delete that step; Gate B still holds either way,
  // because the gate is dismissible and the body is never withheld.
  //
  // `replace` so Back returns to the consult rather than bouncing between the
  // two surfaces.
  const reportRedirectedRef = useRef(false);
  useEffect(() => {
    if (reportLifecycle !== 'ready' || !report || !consultationId) return;
    if (isReportGateOpen) return;
    if (reportRedirectedRef.current) return;
    reportRedirectedRef.current = true;
    navigate(`/liberty-md/report/${encodeURIComponent(consultationId)}`, { replace: true });
  }, [reportLifecycle, report, consultationId, isReportGateOpen, navigate]);

  const continuationOwnsFooter =
    phase === 'recovery_required'
    || (phase === 'report_gate' && !isReportGateOpen && !softGateDismissed && !guestExpired)
    || phase === 'clinical_review_needed';
  const continuationAction = phase === 'recovery_required'
    ? {
        type: 'resume' as const,
        loading: isBusy,
        error: error || undefined,
        chiefComplaint: resumeChiefComplaint,
        onResume: () => { void resumeAbandonedConsultation(); },
        onStartOver: () => { navigate(`/liberty-md?lang=${language}`); },
      }
    : phase === 'report_gate' && !isReportGateOpen && !softGateDismissed && !guestExpired
      ? {
          type: 'report_gate' as const,
          onOpen: () => { setIsReportGateOpen(true); },
        }
      : phase === 'clinical_review_needed'
        ? {
            type: 'clinical_review_start_fresh' as const,
            onStartFresh: () => { navigate(`/liberty-md?lang=${language}`); },
          }
        : null;
  // Safety-grade: the trigger is the consult *state*, never the presence of a
  // correctly-tagged message. Previously a persisted emergency whose row was not typed
  // `safety` rendered no emergency UI at all. The detail text is best-effort; the standing
  // instruction is unconditional, so the alert is never empty.
  // Defect 4: never fall back to safetyNotice — that can hold technical copy and would
  // put an app fault into the red role=alert emergency panel.
  // P3-08: prefer proxy emergency_copy; fixture is last-resort fail-open only.
  // Detail prefers transcript message, else resolved detail.
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

  return (
    <div className="libertymd-consult-shell flex h-[100svh] min-w-0 flex-col overflow-hidden bg-[image:var(--libertymd-surface-wash)] font-sans text-libertymd-ink selection:bg-libertymd-blue-600 selection:text-white">
      {/*
        Internal transcript scroller (DoD+): full-bleed `100svh` column + sibling footer
        chrome + Lenis isolation (`data-lenis-prevent`) require overflow-y on main, not the
        document. Soft leave (Back / popstate) stashes consultationId without abandon;
        browser scroll-restore for document/overlays remains P0-22 lock release.
      */}
      <header className="libertymd-safe-top z-30 shrink-0 border-b border-white/80 bg-white/75 px-3 pb-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsLeaveConfirmOpen(true)}
              aria-label="Back to LibertyMD"
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-libertymd-slate-500 transition hover:bg-libertymd-blue-50 hover:text-libertymd-blue-600"
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
              <p className="truncate font-serif text-lg font-semibold leading-5 text-libertymd-ink sm:text-xl">LibertyMD Consultation</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <LibertyMDLanguageSwitcher clinicalLock={clinicalLanguage} />
            {isAnonymous && (
              <button
                id="libertymd-chat-signin-btn"
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
            {/* BO 2026-08-01 — "+ New chat" removed from the consult header.
                Starting over mid-consult is still reachable from the menu; it
                does not belong next to an in-progress clinical conversation. */}
            <button
              type="button"
              aria-label="Open profile and consultation history"
              onClick={() => {
                setIsMenuOpen(true);
                if (!isAnonymous) void refreshAccount();
              }}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-libertymd-navy transition hover:bg-libertymd-blue-50 hover:text-libertymd-blue-600"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/*
          P5-CHAT — interview progress pinned to the header.

          Mind Coach keeps its phase stepper in the fixed region directly under
          the header rather than in the scroll area, so the reader never loses
          their place indicator by scrolling. Same here: a full-bleed hairline
          flush to the header's bottom edge, negative-margined out of the
          header's horizontal padding so it spans the full width.

          Rendered only while interviewing; the report and terminal phases have
          no progress to show.
        */}
        {showInterviewProgress && interviewProgressView ? (
          <div className="-mx-3 -mb-3 mt-3 sm:-mx-6">
            <LibertyMDProgressIndicator view={interviewProgressView} />
          </div>
        ) : null}
      </header>

      <main
        ref={scrollRef}
        // `data-lenis-prevent` keeps the site-wide Lenis instance from swallowing wheel and
        // touch events over the transcript. Lenis is mounted at the app root, hijacks wheel
        // on `window`, and the chat shell is `h-[100svh] overflow-hidden`, so without this
        // the wheel gesture is spent on a page that cannot scroll instead of on the
        // transcript. It also opts the container into `overscroll-behavior: contain`.
        data-lenis-prevent
        data-libertymd-consult-scroller
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-5 sm:px-6 sm:pt-8"
      >
        <div ref={contentRef} className={`mx-auto w-full max-w-3xl ${TRANSCRIPT_BOTTOM_CLEARANCE_CLASS}`}>
          <div
            className="mb-6 flex items-center justify-center gap-2 text-center text-xs font-semibold text-libertymd-slate-500"
            aria-live="polite"
            data-libertymd-report-lifecycle={reportLifecycle ?? undefined}
          >
            {showInterviewProgress && interviewProgressView ? null : (
              <>
                <span className={`h-2 w-2 rounded-full ${phase === 'error' || reportLifecycle === 'generation_failed' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                {/* P2-13 lifecycle labels; default branch keeps statusCopy[phase] (P1-06 strip contract). */}
                {reportLifecycle === 'partial' ? t('report.lifecycle.partialTitle')
                  : reportLifecycle === 'generation_failed' ? t('report.lifecycle.failedTitle')
                  : reportLifecycle === 'guest_expired' ? t('report.lifecycle.expiredTitle')
                  : reportLifecycle === 'not_yet_eligible' ? t('report.lifecycle.notYetEligible')
                  : reportLifecycle === 'generating' ? t('chatx.waitingReviewing')
                  : statusCopy[phase]}
              </>
            )}
          </div>

          {isEmergencyStopped && (
            // The transcript copy is the durable record (P0-18 AC5): it stays in the consult
            // after acknowledgement and is what a user finds when they scroll back. It is
            // explicitly *not* the mechanism that gets the instruction into the viewport —
            // that is `LibertyMDEmergencyAlert` below. It is deliberately left visible to
            // assistive tech: it carries no live region, so it is never announced
            // spontaneously and cannot double-speak over the alert, but it does keep the
            // detail text reachable by browsing after the alert has been acknowledged.
            <section className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-left shadow-sm">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                <div>
                  <h2 className="font-bold text-red-900">{emergencyHeading}</h2>
                  {emergencyDetail && <p className="mt-1 text-sm leading-6 text-red-800">{emergencyDetail}</p>}
                  <p className="mt-2 text-sm font-bold text-red-900">{emergencyStandingInstruction}</p>
                </div>
              </div>
            </section>
          )}

          <div className="space-y-5">
            <span className="sr-only" aria-live="polite">{liveAnnounce}</span>
            {transcriptCollapsed ? (
              <div className="flex justify-center" data-libertymd-transcript-collapsed="true">
                <button
                  type="button"
                  data-libertymd-view-conversation
                  onClick={() => setTranscriptCollapsed(false)}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-libertymd-slate-200 bg-white px-4 text-sm font-bold text-libertymd-navy transition hover:border-libertymd-blue-600 hover:text-libertymd-blue-700"
                >
                  {t('chatx.viewConversation')}
                </button>
              </div>
            ) : (
              messages.map((message, messageIndex) => {
              const revealPartial = Boolean(
                message.revealFullText
                && message.revealFullText !== message.text,
              );
              return (
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
                <div
                  aria-hidden={revealPartial || undefined}
                  className={`max-w-[84%] whitespace-pre-line rounded-2xl px-4 py-3 text-left text-[15px] leading-6 shadow-sm sm:max-w-[76%] sm:px-5 sm:py-4 ${
                  message.sender === 'user'
                    ? LIBERTYMD_USER_BUBBLE_CLASS
                    : message.kind === 'emergency'
                      ? 'rounded-bl-sm border border-red-200 bg-red-50 text-red-900'
                      : message.kind === 'report'
                        ? 'rounded-bl-sm border border-emerald-200 bg-emerald-50 text-emerald-900'
                        : 'rounded-bl-sm border border-libertymd-mist bg-white text-libertymd-slate-700'
                }`}>
                  {message.sender === 'ai' && message.mediaKind ? (
                    <span className="mb-[var(--libertymd-space-xs)] inline-flex items-center gap-1 rounded-full bg-libertymd-blue-50 px-[var(--libertymd-space-sm)] py-1 libertymd-type-label font-semibold text-libertymd-blue-700">
                      {message.mediaKind === 'photo'
                        ? <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                        : <FileText className="h-3.5 w-3.5" aria-hidden="true" />}
                      {message.mediaKind === 'photo'
                        ? t('chatx.mediaQuestionPhoto')
                        : t('chatx.mediaQuestionLab')}
                    </span>
                  ) : null}
                  <span className="block">{message.text}</span>
                </div>
              </div>
              );
            })
            )}

            {phase === 'profile_pick' && (
              <div className="rounded-lg border border-libertymd-mist bg-white p-4 shadow-sm sm:p-6">
                {showSomeoneElseCreate ? (
                  <LibertyMDSomeoneElseCreateSheet
                    loading={isBusy}
                    error={error}
                    onCancel={() => setShowSomeoneElseCreate(false)}
                    onSubmit={(input) => void handleSomeoneElseCreate(input)}
                  />
                ) : (
                  <LibertyMDPreStartProfilePicker
                    profiles={entryProfileRows}
                    loading={isBusy}
                    error={error}
                    showSomeoneElse
                    onSelect={handlePreStartProfileSelect}
                    onSomeoneElse={handleSomeoneElseFromPicker}
                  />
                )}
              </div>
            )}

            {phase === 'demographics_required' && (
              <div className="rounded-lg border border-libertymd-mist bg-white p-4 shadow-sm sm:p-6">
                <LibertyMDDemographicsPrompt
                  age={demographics.age}
                  sex={demographics.sex}
                  loading={isBusy}
                  error={error}
                  consentChecked={consentChecked}
                  isAnonymous={isAnonymous}
                  profiles={entryProfileRows.length > 1 ? entryProfileRows : []}
                  onAgeChange={(age) => setDemographics((current) => ({ ...current, age }))}
                  onSexChange={(sex) => setDemographics((current) => ({ ...current, sex }))}
                  onConsentChange={setConsentChecked}
                  onCareForSomeoneElse={isAnonymous ? () => void attemptAddProfile('unified_entry') : undefined}
                  onSubmit={submitDemographics}
                />
              </div>
            )}

            {safetyNotice && phase === 'intake' && (
              <LibertyMDSeverityNotice
                severity={safetyNotice.severity}
                message={safetyNotice.message}
                className="ml-10"
              />
            )}

            {isBusy && (
              <div className="flex items-end gap-2.5">
                <span className="mb-1 shrink-0">
                  <LibertyMDCareOrb state="thinking" size="lg" />
                </span>
                <LibertyMDWaitingIndicator
                  mode={waitMode}
                  reviewingLabel={t('chatx.waitingReviewing')}
                  stageIndex={responseStageIndex}
                />
              </div>
            )}

            {offlineBanner && phase === 'intake' && (
              <LibertyMDOfflineBanner message={offlineBanner} className="ml-10" />
            )}

            {error && phase !== 'demographics_required' && phase !== 'profile_pick' && reportLifecycle !== 'generation_failed' && (
              <LibertyMDRequestErrorNotice
                message={error}
                className="ml-10"
                onRetry={errorRetry ? retryHeldSend : undefined}
              />
            )}

            {reportLifecycle === 'partial' && (
              <LibertyMDReportLifecycleShell
                state="partial"
                className="ml-10"
              />
            )}

            {reportLifecycle === 'generation_failed' && (
              <LibertyMDReportLifecycleShell
                state="generation_failed"
                className="ml-10"
                onRetry={retryHeldSend}
              />
            )}

            {reportLifecycle === 'guest_expired' && (
              <LibertyMDReportLifecycleShell
                state="guest_expired"
                className="ml-10"
                onSignIn={() => { void startGoogleLink(); }}
              />
            )}

            {reportLifecycle === 'ready' && report && (
              <div className="space-y-[var(--libertymd-space-sm)]">
                {mergeCollisionPath && phase !== 'emergency_end' ? (
                  <LibertyMDMergeCollisionOutcome
                    collisionPath={mergeCollisionPath}
                    onDismiss={() => setMergeCollisionPath(null)}
                  />
                ) : null}
                {shouldShowGuestRetentionWarning({
                  hasReportBody: true,
                  saved: !isAnonymous,
                  retentionExpiresAt,
                }) && retentionExpiresAt ? (
                  <LibertyMDGuestRetentionWarning
                    remainingLabel={formatRetentionRemaining(retentionExpiresAt)}
                    className="ml-10"
                  />
                ) : null}
                <LibertyMDReportView
                  report={report}
                  saved={!isAnonymous}
                  scrollParentRef={scrollRef}
                  consultationId={consultationId || undefined}
                  retentionExpiresAt={retentionExpiresAt}
                  emailDelivery={consultationId ? {
                    consultationId,
                    prefillEmail: linkedEmail,
                    onRequest: requestReportEmail,
                  } : undefined}
                  onDoctorCta={
                    shouldShowDoctorHandoff(report.triageTier)
                      ? () => {
                          doctorHandoffRef.current?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'nearest',
                          })
                        }
                      : undefined
                  }
                  footerSlot={
                    shouldShowDoctorHandoff(report.triageTier) ? (
                      <div ref={doctorHandoffRef}>
                        <LibertyMDDoctorHandoffPanel
                          triageTier={report.triageTier}
                          consultationId={consultationId || undefined}
                          position="footer"
                          sessionKey={consultationId || undefined}
                          hideTriggerCta
                        />
                      </div>
                    ) : undefined
                  }
                />
              </div>
            )}
          </div>
        </div>
      </main>

      {/*
        The footer is a `shrink-0` flex sibling of the scrolling transcript inside a
        `h-[100svh] overflow-hidden` column, so everything in it holds viewport space that
        the transcript cannot scroll over. That is why the acknowledged emergency bar and
        the "new message" pill live here rather than in the transcript. `relative` is the
        positioning context for the pill.
      */}
      <footer
        ref={footerRef}
        className="relative z-20 shrink-0 border-t border-white/80 bg-white/72 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:px-6 sm:pb-4"
      >
        {showJumpToLatest && !isEmergencyStopped && (
          <LibertyMDNewMessagePill label="New message" onClick={jumpToLatest} />
        )}
        <div className="mx-auto max-w-3xl">
          {isEmergencyStopped && isEmergencyAcknowledged && (
            <LibertyMDEmergencyPinnedBar
              heading={emergencyHeading}
              standingInstruction={emergencyStandingInstruction}
              reopenLabel={EMERGENCY_REOPEN_LABEL}
              onReopen={() => setIsEmergencyAcknowledged(false)}
            />
          )}

          {/*
            P0-21 · continuation CTAs (report-gate open / resume) live in this observed
            footerRef slot. Clearance when present = footer height + ResizeObserver
            (Q4A); baseline TRANSCRIPT_BOTTOM_CLEARANCE_CLASS when absent.
          */}
          <LibertyMDContinuationActionBar action={continuationAction} />

          {!continuationOwnsFooter && currentOptions.length > 0 && (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap">
              {currentOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => void sendMessage(option)}
                  disabled={composerSendLocked}
                  className={LIBERTYMD_OPTION_CHIP_CLASS}
                >
                  {option}
                </button>
              ))}
            </div>
          )}

          {!continuationOwnsFooter && (
            <>
              <LibertyMDAttachControls
                hideTriggers
                disabled={composerAttachLocked}
                uploading={photoUploading}
                labUploading={labUploading}
                chips={photoChips}
                labChips={labChips}
                technicalNotice={photoNotice}
                labLinked={!isAnonymous}
                onPhotoFile={(file) => { void uploadPhoto(file); }}
                onLabClick={() => { void openLabAttribution(); }}
                onLabSignInRequired={() => { void startGoogleLink(); }}
                onDismissNotice={() => setPhotoNotice(null)}
                onRemoveChip={(objectUuid) => {
                  setPhotoChips((prev) => prev.filter((c) => c.object_uuid !== objectUuid));
                }}
                onRetryChip={(objectUuid) => { void retryPhotoAnalysis(objectUuid); }}
                retryingObjectUuid={photoRetryingObjectUuid}
                onRemoveLabChip={(objectUuid) => {
                  setLabChips((prev) => prev.filter((c) => c.object_uuid !== objectUuid));
                }}
              />
              <input
                ref={labFileInputRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="sr-only"
                tabIndex={-1}
                data-libertymd-attach-lab-input=""
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  const patientId = labSelectedPatientId || labDefaultPatientId;
                  if (file && patientId) {
                    void uploadLab(file, patientId);
                  }
                }}
              />
              <LibertyMDLabAttributionSheet
                open={labAttributionOpen}
                profiles={labProfiles}
                defaultPatientId={labDefaultPatientId}
                selectedPatientId={labSelectedPatientId}
                onSelect={(patientId) => setLabSelectedPatientId(patientId)}
                onConfirm={() => {
                  setLabAttributionOpen(false);
                  labFileInputRef.current?.click();
                }}
                onClose={() => setLabAttributionOpen(false)}
              />
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage();
                }}
                className="relative flex min-h-14 items-center gap-2 rounded-full border border-libertymd-mist bg-white p-2 pl-2 shadow-[0_14px_40px_rgba(23,50,95,0.13)] ring-1 ring-libertymd-blue-600/5"
              >
                {/* P5-CHAT — one paperclip, WhatsApp-style. The chooser decides
                    photo vs lab; two permanent buttons made attaching look like
                    the primary action of a clinical conversation. */}
                <button
                  type="button"
                  data-libertymd-attach-trigger=""
                  aria-haspopup="dialog"
                  aria-expanded={attachSheetOpen}
                  aria-label={t('attach.title')}
                  disabled={composerAttachLocked}
                  onClick={() => setAttachSheetOpen((open) => !open)}
                  className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-libertymd-slate-500 transition hover:bg-libertymd-blue-50 hover:text-libertymd-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-libertymd-blue-600 disabled:opacity-40"
                >
                  <Paperclip className="h-5 w-5" aria-hidden="true" />
                </button>
                <LibertyMDAttachSheet
                  open={attachSheetOpen}
                  labLinked={!isAnonymous}
                  onClose={() => setAttachSheetOpen(false)}
                  onChoosePhoto={() => photoFileInputRef.current?.click()}
                  onChooseLab={() => { void openLabAttribution(); }}
                  onLabSignInRequired={() => { void startGoogleLink(); }}
                />
                <input
                  ref={photoFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  tabIndex={-1}
                  data-libertymd-attach-photo-input=""
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) void uploadPhoto(file);
                  }}
                />
                <input
                  type="text"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  disabled={composerInputLocked}
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
                  className="min-w-0 flex-1 bg-transparent text-left text-sm text-libertymd-ink outline-none placeholder:text-libertymd-slate-400 disabled:cursor-not-allowed"
                />
                <button
                  type="submit"
                  aria-label={t('chatx.sendMessage')}
                  disabled={composerSendLocked || !input.trim()}
                  className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full bg-libertymd-blue-600 text-white shadow-md shadow-blue-600/20 transition hover:bg-libertymd-blue-700 disabled:cursor-not-allowed disabled:bg-libertymd-slate-300 disabled:shadow-none"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
              <p className="mt-2 text-center text-[10px] leading-4 text-libertymd-slate-500">
                LibertyMD provides AI guidance, not a diagnosis or emergency service.
              </p>
            </>
          )}
        </div>
      </footer>

      {/*
        P0-18 · rendered last and portalled to `document.body` at z-120, so it sits above
        the report gate (z-90) and the account drawer (z-85). An emergency outranks every
        other surface, including any gate — "emergency guidance precedes everything".
      */}
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

      {phase === 'report_gate' && isReportGateOpen && (
        !guestExpired ? (
          <LibertyMDReportGate
            loading={isAuthBusy}
            // P1-25 S3: mergeNotice only when a prepare transfer token exists (no dead CTA).
            identityConflict={Boolean(
              hasIdentityConflict
              && consultationId
              && typeof window !== 'undefined'
              && window.sessionStorage.getItem(`libertymd-transfer:${consultationId}`),
            )}
            collisionPath={mergeCollisionPath}
            onDismissCollisionOutcome={() => setMergeCollisionPath(null)}
            onGoogle={startGoogleLink}
            onExistingGoogle={signInExistingGoogle}
            onSkip={skipReportGate}
            onClose={dismissReportGate}
          />
        ) : null
      )}

      {/*
        P1-09 — partial outcome exit sheet (Q4A1). OverlaySheet z-90 stays below emergency z-120.
        Backdrop dismiss = shown only; Got it CTA = engaged (S1A). Never mounts on emergency_end.
      */}
      {partialOutcomeSheet && phase !== 'emergency_end' && (
        <LibertyMDOverlaySheet
          onClose={() => finishPartialOutcomeLeave(false)}
          titleId="libertymd-partial-outcome-title"
          ariaDescribedBy="libertymd-partial-outcome-desc"
          panelClassName="relative"
          consultScroller={scrollRef.current}
        >
          <div
            data-libertymd-partial-outcome=""
            className="relative p-libertymd-lg sm:p-libertymd-xl"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-libertymd-blue-600">
              {t('chatx.partialOutcomeEyebrow')}
            </p>
            <h2
              id="libertymd-partial-outcome-title"
              className="mt-libertymd-sm font-serif text-2xl font-semibold leading-tight text-libertymd-ink sm:text-3xl"
            >
              {t('chatx.partialOutcomeTitle')}
            </h2>
            <p
              id="libertymd-partial-outcome-incomplete"
              className="mt-libertymd-sm inline-flex rounded-lg bg-libertymd-blue-50 px-3 py-1.5 text-xs font-bold text-libertymd-blue-700"
            >
              {partialOutcomeSheet.outcome.incomplete_label}
            </p>
            <p
              id="libertymd-partial-outcome-desc"
              className="mt-libertymd-md text-base leading-relaxed text-libertymd-slate-700"
            >
              {partialOutcomeSheet.outcome.general_guidance}
            </p>
            <div className="mt-libertymd-lg">
              <p className="text-sm font-bold text-libertymd-ink">
                {t('chatx.partialOutcomeSeeToday')}
              </p>
              <ul className="mt-libertymd-sm list-disc space-y-2 pl-5 text-sm leading-relaxed text-libertymd-slate-700">
                {partialOutcomeSheet.outcome.see_today_signs.map((sign) => (
                  <li key={sign}>{sign}</li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              data-libertymd-partial-outcome-cta=""
              onClick={() => finishPartialOutcomeLeave(true)}
              className="mt-libertymd-xl inline-flex h-12 w-full items-center justify-center rounded-full bg-libertymd-blue-600 px-6 text-sm font-bold text-white transition hover:bg-libertymd-blue-700"
            >
              {t('chatx.partialOutcomeGotIt')}
            </button>
          </div>
        </LibertyMDOverlaySheet>
      )}

      {/*
        P1-14 — comprehension check before Diagnosis. OverlaySheet z-90 < emergency z-120.
        Dismiss = cancel only (no Diagnosis). Proceed / correct → flagged send_message.
        Summary/confirm copy REQUIRES EXPERT REVIEW.
      */}
      {comprehensionCheck && phase !== 'emergency_end' && !partialOutcomeSheet && (
        <LibertyMDComprehensionCheck
          payload={comprehensionCheck}
          busy={comprehensionBusy || isBusy}
          consultScroller={scrollRef.current}
          onDismiss={() => setComprehensionCheck(null)}
          onProceed={() => void proceedComprehensionCheck()}
          onCorrect={(text) => void correctComprehensionCheck(text)}
        />
      )}

      {/* End Consultation Confirmation Bottom Drawer */}
      {isLeaveConfirmOpen && (
        <LibertyMDOverlaySheet
          onClose={() => setIsLeaveConfirmOpen(false)}
          titleId="libertymd-end-consult-title"
          ariaDescribedBy="libertymd-end-consult-desc"
          panelClassName="relative flex flex-col max-h-[80dvh]"
          consultScroller={scrollRef.current}
        >
          <div
            data-libertymd-end-consult-drawer=""
            className="flex flex-col p-5 sm:p-6 text-center"
          >
            <h2
              id="libertymd-end-consult-title"
              className="font-serif text-2xl font-semibold leading-tight text-libertymd-ink sm:text-3xl"
            >
              End Consultation?
            </h2>
            <p
              id="libertymd-end-consult-desc"
              className="mt-3 text-sm leading-relaxed text-libertymd-slate-600 sm:text-base"
            >
              Are you sure you want to end this consultation? Your progress will be saved so you can return anytime.
            </p>

            <div className="mt-6 flex flex-col items-center gap-3">
              {/* Primary option: Continue button */}
              <button
                type="button"
                data-libertymd-continue-consult=""
                onClick={() => setIsLeaveConfirmOpen(false)}
                className="inline-flex h-12 w-full items-center justify-center rounded-full bg-libertymd-blue-600 px-8 text-base font-bold text-white shadow-md transition hover:bg-libertymd-blue-700 active:scale-[0.99]"
              >
                Continue Consultation
              </button>

              {/* Secondary option: End Consultation text (not a button) */}
              <button
                type="button"
                data-libertymd-end-consult-text=""
                onClick={() => {
                  setIsLeaveConfirmOpen(false);
                  void softLeaveConsult();
                }}
                className="py-2 text-sm font-semibold text-libertymd-slate-600 transition hover:text-red-600 hover:underline cursor-pointer"
              >
                End Consultation
              </button>
            </div>
          </div>
        </LibertyMDOverlaySheet>
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
        loading={accountLoading}
        onClose={() => setIsMenuOpen(false)}
        onSelectConsultation={selectConsultation}
        onCareForSomeoneElse={isAnonymous ? () => void attemptAddProfile('drawer') : undefined}
        onGoogle={isAnonymous ? startGoogleSignIn : undefined}
        onStartOver={() => void startOver()}
        profileManagement={profileManagementHandlers}
      />
    </div>
  );
}
