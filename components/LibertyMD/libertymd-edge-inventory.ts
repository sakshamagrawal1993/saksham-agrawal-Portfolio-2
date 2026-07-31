/**
 * P4-10 — Register §9 edge-state inventory (CARE mirror + AC5 snapshot ids).
 *
 * Approach A: document Done | Cut(residual) for every Register id + not_yet_eligible.
 * Not a redesign of Phase 0–2 edge systems.
 */

export { LIBERTYMD_MAX_ACTIVE_PATIENTS_CLIENT } from './libertymd-care-proxy-client.ts';

export type EdgeInventoryStatus = 'Done' | 'Cut';

export interface EdgeInventoryRow {
  /** Stable id: `{surface}.{state}` */
  id: string;
  surface:
    | 'landing'
    | 'entry'
    | 'interview'
    | 'interview_exit'
    | 'emergency'
    | 'report'
    | 'report_actions'
    | 'doctor'
    | 'history'
    | 'auth';
  state: string;
  status: EdgeInventoryStatus;
  /** Residual owner when Cut; omit when Done. */
  residual?: string;
  /** Staging / fixture reachability method (no PHI). */
  reachability: string;
  /** Snapshot / data-libertymd contract id when Done; omit when Cut. */
  snapshotId?: string;
}

const CARE_INTEREST_JOINED_PREFIX = 'libertymd:care-interest-joined:';

/** Consult-scoped non-PHI flag for doctor already-joined thin ack (Q4). */
export function careInterestJoinedStorageKey(consultationId: string): string {
  return `${CARE_INTEREST_JOINED_PREFIX}${consultationId}`;
}

export function readCareInterestJoined(consultationId: string | undefined | null): boolean {
  if (!consultationId || typeof sessionStorage === 'undefined') return false;
  try {
    return sessionStorage.getItem(careInterestJoinedStorageKey(consultationId)) === '1';
  } catch {
    return false;
  }
}

export function writeCareInterestJoined(consultationId: string | undefined | null): void {
  if (!consultationId || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(careInterestJoinedStorageKey(consultationId), '1');
  } catch {
    // quota / private mode — ack still shows for this mount
  }
}

/**
 * Master Register §9 (43) + product `not_yet_eligible` (P2-13) = 44 rows.
 * Cuts honour Q1/Q2 Tech defaults; never claim Cut as Done.
 */
export const EDGE_STATE_INVENTORY: readonly EdgeInventoryRow[] = [
  // Landing (4)
  {
    id: 'landing.first',
    surface: 'landing',
    state: 'first',
    status: 'Done',
    reachability: 'Cold /liberty-md with empty session — unified entry + complaint chips',
    snapshotId: 'landing-first',
  },
  {
    id: 'landing.returning',
    surface: 'landing',
    state: 'returning',
    status: 'Done',
    reachability: 'Bootstrap with linked profile / greeting_name path',
    snapshotId: 'landing-returning',
  },
  {
    id: 'landing.mid_consult',
    surface: 'landing',
    state: 'mid-consult',
    status: 'Done',
    reachability: 'Soft-leave recoverable consultationId + Chat resume / abandoned recovery gates',
    snapshotId: 'landing-mid-consult',
  },
  {
    id: 'landing.locale_mismatch',
    surface: 'landing',
    state: 'locale mismatch',
    status: 'Cut',
    residual: 'Lane C / P3-07 clinicalLock + LanguageSwitcher (no dedicated interstitial)',
    reachability: 'Cut — LanguageSwitcher + journey-locale clinicalLock interim only',
  },

  // Entry (4)
  {
    id: 'entry.consent_demo',
    surface: 'entry',
    state: 'consent+demo',
    status: 'Done',
    reachability: 'Unified entry demographics gate before interview',
    snapshotId: 'entry-consent-demo',
  },
  {
    id: 'entry.single',
    surface: 'entry',
    state: 'single',
    status: 'Done',
    reachability: 'Linked single complete patient → start without picker',
    snapshotId: 'entry-single',
  },
  {
    id: 'entry.multi',
    surface: 'entry',
    state: 'multi',
    status: 'Done',
    reachability: 'Multi-profile → patient_selection_required / picker',
    snapshotId: 'entry-multi',
  },
  {
    id: 'entry.at_profile_limit',
    surface: 'entry',
    state: 'at profile limit',
    status: 'Done',
    reachability: 'AccountDrawer profiles at cap=5 → Add disabled + next-action copy',
    snapshotId: 'entry-at-profile-limit',
  },

  // Interview (6)
  {
    id: 'interview.thinking',
    surface: 'interview',
    state: 'thinking',
    status: 'Done',
    reachability: 'WaitingIndicator typing mode during send',
    snapshotId: 'interview-thinking',
  },
  {
    id: 'interview.diagnosis_running',
    surface: 'interview',
    state: 'diagnosis running',
    status: 'Done',
    reachability: 'WaitingIndicator reviewing + generating ≤65s ceiling',
    snapshotId: 'interview-diagnosis-running',
  },
  {
    id: 'interview.retrying',
    surface: 'interview',
    state: 'retrying',
    status: 'Done',
    reachability: 'Taxonomy showRetry + holding cooldown unlock',
    snapshotId: 'interview-retrying',
  },
  {
    id: 'interview.offline',
    surface: 'interview',
    state: 'offline',
    status: 'Done',
    reachability: 'navigator.onLine false → OfflineBanner + queue; failure-taxonomy offline class',
    snapshotId: 'interview-offline',
  },
  {
    id: 'interview.off_topic',
    surface: 'interview',
    state: 'off-topic',
    status: 'Done',
    reachability: 'Warm off-topic recovery path / guardrail continue',
    snapshotId: 'interview-off-topic',
  },
  {
    id: 'interview.rate_limited',
    surface: 'interview',
    state: 'rate limited',
    status: 'Done',
    reachability: 'HTTP 429 → rate_limited technical copy + formatRateLimitCopy',
    snapshotId: 'interview-rate-limited',
  },

  // Interview exit (3)
  {
    id: 'interview_exit.abandon_confirm',
    surface: 'interview_exit',
    state: 'abandon confirm',
    status: 'Done',
    reachability: 'Start-over / leave designed path (no native confirm)',
    snapshotId: 'interview-exit-abandon',
  },
  {
    id: 'interview_exit.partial_outcome',
    surface: 'interview_exit',
    state: 'partial outcome',
    status: 'Done',
    reachability: 'OverlaySheet partial outcome on abandon/soft-leave when eligible',
    snapshotId: 'interview-exit-partial',
  },
  {
    id: 'interview_exit.resume',
    surface: 'interview_exit',
    state: 'resume',
    status: 'Done',
    reachability: 'Abandoned recovery prompt / resume_consultation',
    snapshotId: 'interview-exit-resume',
  },

  // Emergency (3)
  {
    id: 'emergency.force_end',
    surface: 'emergency',
    state: 'force-end',
    status: 'Done',
    reachability: 'crisis force_end → emergency chrome (z-120)',
    snapshotId: 'emergency-force-end',
  },
  {
    id: 'emergency.caution',
    surface: 'emergency',
    state: 'caution',
    status: 'Done',
    reachability: 'Inline caution severity notice (non-force-end)',
    snapshotId: 'emergency-caution',
  },
  {
    id: 'emergency.technical',
    surface: 'emergency',
    state: 'technical',
    status: 'Done',
    reachability: 'Technical severity via failure taxonomy (never clinical clothing)',
    snapshotId: 'emergency-technical',
  },

  // Report (5 Register + not_yet_eligible)
  {
    id: 'report.generating',
    surface: 'report',
    state: 'generating',
    status: 'Done',
    reachability: 'deriveReportLifecycleState generating + WaitingIndicator reviewing',
    snapshotId: 'report-generating',
  },
  {
    id: 'report.ready',
    surface: 'report',
    state: 'ready',
    status: 'Done',
    reachability: 'ReportView + lifecycle ready shell',
    snapshotId: 'report-ready',
  },
  {
    id: 'report.partial',
    surface: 'report',
    state: 'partial',
    status: 'Done',
    reachability: 'clinical_review_needed / lifecycle partial shell',
    snapshotId: 'report-partial',
  },
  {
    id: 'report.generation_failed',
    surface: 'report',
    state: 'generation failed',
    status: 'Done',
    reachability: '65s timeout or generationFailed → lifecycle generation_failed',
    snapshotId: 'report-generation-failed',
  },
  {
    id: 'report.guest_expired',
    surface: 'report',
    state: 'guest expired',
    status: 'Done',
    reachability: 'report_omitted_reason retention_expired → guest_expired shell',
    snapshotId: 'report-guest-expired',
  },
  {
    id: 'report.not_yet_eligible',
    surface: 'report',
    state: 'not_yet_eligible',
    status: 'Done',
    reachability: 'Low turn_count / evidence → not_yet_eligible (Register omit = doc bug)',
    snapshotId: 'report-not-yet-eligible',
  },

  // Report actions (5)
  {
    id: 'report_actions.emailing',
    surface: 'report_actions',
    state: 'emailing',
    status: 'Done',
    reachability: 'EmailDelivery sending=true + data-libertymd-email-delivery-sending',
    snapshotId: 'report-actions-emailing',
  },
  {
    id: 'report_actions.emailed',
    surface: 'report_actions',
    state: 'emailed',
    status: 'Done',
    reachability: 'EmailDelivery success ack',
    snapshotId: 'report-actions-emailed',
  },
  {
    id: 'report_actions.downloading',
    surface: 'report_actions',
    state: 'downloading',
    status: 'Done',
    reachability: 'PDF download busy chrome (≠ generating)',
    snapshotId: 'report-actions-downloading',
  },
  {
    id: 'report_actions.save_prompt',
    surface: 'report_actions',
    state: 'save prompt',
    status: 'Done',
    reachability: 'Soft-gate save prompt on report',
    snapshotId: 'report-actions-save-prompt',
  },
  {
    id: 'report_actions.dismissed',
    surface: 'report_actions',
    state: 'dismissed',
    status: 'Done',
    reachability: 'Soft-gate dismiss without blocking report',
    snapshotId: 'report-actions-dismissed',
  },

  // Doctor (3)
  {
    id: 'doctor.waitlist_offer',
    surface: 'doctor',
    state: 'waitlist offer',
    status: 'Done',
    reachability: 'DoctorHandoffPanel waitlist mode idle form',
    snapshotId: 'doctor-waitlist-offer',
  },
  {
    id: 'doctor.joined',
    surface: 'doctor',
    state: 'joined',
    status: 'Done',
    reachability: 'Successful record_care_interest → joinAck',
    snapshotId: 'doctor-joined',
  },
  {
    id: 'doctor.already_joined',
    surface: 'doctor',
    state: 'already joined',
    status: 'Done',
    reachability: 'sessionStorage care-interest-joined flag → remount ack (no new telemetry)',
    snapshotId: 'doctor-already-joined',
  },

  // History (5)
  {
    id: 'history.empty',
    surface: 'history',
    state: 'empty',
    status: 'Done',
    reachability: 'AccountDrawer linked + empty history → CTA closes drawer',
    snapshotId: 'history-empty',
  },
  {
    id: 'history.loading',
    surface: 'history',
    state: 'loading',
    status: 'Done',
    reachability: 'AccountDrawer history loading + drawer Close escape',
    snapshotId: 'history-loading',
  },
  {
    id: 'history.single',
    surface: 'history',
    state: 'single',
    status: 'Cut',
    residual: 'P4-03 / Lane E history enrichment',
    reachability: 'Cut — enrichment owned by P4-03',
  },
  {
    id: 'history.many',
    surface: 'history',
    state: 'many',
    status: 'Cut',
    residual: 'P4-03 / Lane E history enrichment',
    reachability: 'Cut — enrichment owned by P4-03',
  },
  {
    id: 'history.expired',
    surface: 'history',
    state: 'expired',
    status: 'Cut',
    residual: 'P4-03 / Lane E history enrichment',
    reachability: 'Cut — enrichment owned by P4-03',
  },

  // Auth (5)
  {
    id: 'auth.anonymous',
    surface: 'auth',
    state: 'anonymous',
    status: 'Done',
    reachability: 'Anonymous guest session / private guest drawer',
    snapshotId: 'auth-anonymous',
  },
  {
    id: 'auth.linking',
    surface: 'auth',
    state: 'linking',
    status: 'Done',
    reachability: 'Google link soft-gate / capability offer',
    snapshotId: 'auth-linking',
  },
  {
    id: 'auth.merge_conflict',
    surface: 'auth',
    state: 'merge conflict',
    status: 'Done',
    reachability: 'Identity conflict merge notice chrome',
    snapshotId: 'auth-merge-conflict',
  },
  {
    id: 'auth.merged',
    surface: 'auth',
    state: 'merged',
    status: 'Done',
    reachability: 'P4-05 merge outcome matched_self / distinct_profile',
    snapshotId: 'auth-merged',
  },
  {
    id: 'auth.failed',
    surface: 'auth',
    state: 'failed',
    status: 'Done',
    reachability: 'mergeOutcomeFailed / link failure technical copy',
    snapshotId: 'auth-failed',
  },
] as const;

export const EDGE_INVENTORY_EXPECTED_COUNT = 44;

export function edgeInventoryDoneRows(): EdgeInventoryRow[] {
  return EDGE_STATE_INVENTORY.filter((row) => row.status === 'Done');
}

export function edgeInventoryCutRows(): EdgeInventoryRow[] {
  return EDGE_STATE_INVENTORY.filter((row) => row.status === 'Cut');
}
