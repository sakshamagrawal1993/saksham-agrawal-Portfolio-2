/**
 * P0-12 / P1-17 — thin LibertyMD analytics wrapper.
 *
 * All Mixpanel event names must use the `LibertyMd ` prefix (DECISIONS.md —
 * portfolio project is shared across six products). Call sites pass the suffix
 * only; never hand-type a full event name.
 *
 * Properties must never include PHI, raw message text, or offline-queue contents.
 *
 * Analytics is loaded lazily so Deno can import this module and spy `track`
 * without pulling `mixpanel-browser`.
 *
 * Identity stitch (`identify` / `$device_id`) lives in `libertymd-mixpanel-identity.ts`.
 * Client-only `identity_linked` — Postgres emit residual (P1-15) stays open.
 */

export const LIBERTYMD_EVENT_PREFIX = 'LibertyMd ';

/**
 * P3-07 Q3 — clinical journey language for client Mixpanel supers.
 * Never chrome-only `es` while AC6 gate keeps clinical `en`.
 */
export const LIBERTYMD_CLINICAL_LANGUAGES = ['en', 'es', 'hi', 'hi-Latn', 'fr', 'de', 'pt'] as const;
export type LibertyMdClinicalLanguage = (typeof LIBERTYMD_CLINICAL_LANGUAGES)[number];

export function normalizeClinicalLocale(language: string | null | undefined): LibertyMdClinicalLanguage {
  const value = String(language || 'en').trim().replace(/_/g, '-').toLowerCase();
  if (value === 'hinglish' || value === 'hi-latn') return 'hi-Latn';
  if (value === 'es' || value.startsWith('es-')) return 'es';
  if (value === 'hi' || value.startsWith('hi-')) return 'hi';
  if (value === 'fr' || value.startsWith('fr-')) return 'fr';
  if (value === 'de' || value.startsWith('de-')) return 'de';
  if (value === 'pt' || value.startsWith('pt-')) return 'pt';
  return 'en';
}

let clinicalLocaleSuper: LibertyMdClinicalLanguage = 'en';

export function setClinicalLocaleSuper(language: string | null | undefined): void {
  clinicalLocaleSuper = normalizeClinicalLocale(language);
}

export function getClinicalLocaleSuper(): LibertyMdClinicalLanguage {
  return clinicalLocaleSuper;
}

/** Keys forbidden on any LibertyMD client event property bag (AC7). */
export const LIBERTYMD_CLIENT_PHI_FORBIDDEN_KEYS = [
  'email',
  '$email',
  'name',
  'full_name',
  'display_name',
  'greeting_name',
  'symptom',
  'symptoms',
  'message',
  'message_text',
  'diagnosis',
  'report',
  'report_body',
  'age',
  'sex',
  'sex_at_birth',
  // P2-10 — free-text feedback must never ride Mixpanel props
  'comment',
  'feedback_comment',
] as const;

export type LibertyMdTrackProperties = Record<string, string | number | boolean | null | undefined>;

export type LibertyMdTrackFn = (
  name: string,
  properties: Record<string, string | number | boolean | null>,
) => void;

let testTrackOverride: LibertyMdTrackFn | null = null;

/** Test-only inject; production always uses lazy `Analytics.track`. */
export function __setLibertyMdTrackForTests(track: LibertyMdTrackFn | null): void {
  testTrackOverride = track;
}

/** Build the canonical `LibertyMd …` event name from a suffix. */
export function libertyMdEventName(eventSuffix: string): string {
  const suffix = String(eventSuffix || '').trim();
  if (!suffix) return '';
  return suffix.startsWith(LIBERTYMD_EVENT_PREFIX) ? suffix : `${LIBERTYMD_EVENT_PREFIX}${suffix}`;
}

/** Track a LibertyMD event. `eventSuffix` is the part after `LibertyMd `. */
export function trackLibertyMd(eventSuffix: string, properties: LibertyMdTrackProperties = {}): void {
  const name = libertyMdEventName(eventSuffix);
  if (!name) return;
  const safe: Record<string, string | number | boolean | null> = {
    locale: clinicalLocaleSuper,
  };
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined) continue;
    safe[key] = value;
  }
  // Explicit properties.locale wins only after closed-set clinical normalization.
  if (typeof properties.locale === 'string') {
    safe.locale = normalizeClinicalLocale(properties.locale);
  }
  if (testTrackOverride) {
    testTrackOverride(name, safe);
    return;
  }
  void import('../../services/analytics')
    .then(({ Analytics }) => {
      Analytics.track(name, safe);
    })
    .catch(() => {
      // Analytics is best-effort; never block the send path.
    });
}

/**
 * P3-07 Q1 — Spanish selected while clinical journey stays `en` (AC6 path 2).
 * Key/locale only — never PHI.
 */
export function emitClinicalLocaleBlocked(props: {
  candidate: 'es';
  clinical_locale: 'en' | 'es';
}): void {
  trackLibertyMd('clinical_locale_blocked', {
    candidate: props.candidate,
    clinical_locale: props.clinical_locale,
    locale: props.clinical_locale,
  });
}

/**
 * Emit once per shown technical request-error episode (AC11).
 * Call only beside the show path — never from classify alone.
 */
export function emitAppErrorShown(errorClass: string): void {
  trackLibertyMd('app_error_shown', {
    error_class: errorClass,
    stage: 'send_message',
  });
}

/**
 * P0-10 — thin turn-level retry signal (Mixpanel client only).
 *
 * Props are numerics/booleans only — never PHI, message text, or consultation id.
 * Coexists with `app_error_shown` on exhaustion; does not replace it.
 * Server fan-out of the same display name uses `emit_origin: 'server'` — see
 * `docs/libertymd/CARE-ARCHITECTURE.md` collision table (P1-16).
 * Client payloads carry `emit_origin: 'client'` (P1-17 Q9).
 *
 * `retry_count` = automatic re-invokes after the first for-loop attempt
 * (success on attempt index 1 → 1; full 3-attempt exhaustion → 2).
 */
export function emitTurnFailed(props: {
  retry_count: number;
  resolved_silently: boolean;
}): void {
  trackLibertyMd('turn_failed', {
    retry_count: props.retry_count,
    resolved_silently: props.resolved_silently,
    emit_origin: 'client',
  });
}

/**
 * P1-07 — client Mixpanel TTFT only (not P1-15 server drop-off `turn_completed`).
 *
 * `latency_bucket` is a §1 band string — never raw ms. Discriminator
 * `latency_bucket_source: 'client_ttft'` keeps this distinct from server fan-out
 * (`emit_origin: 'server'`) — see CARE-ARCHITECTURE collision table (P1-16).
 * Client payloads also carry `emit_origin: 'client'` (P1-17 Q9).
 * Never PHI / message text.
 */
export function emitTurnCompletedTtft(props: {
  latency_bucket: string;
}): void {
  trackLibertyMd('turn_completed', {
    latency_bucket: props.latency_bucket,
    latency_bucket_source: 'client_ttft',
    emit_origin: 'client',
  });
}

export type IdentityLinkedMethod = 'google_link' | 'account_merge';

/**
 * P1-17 — client-only Mixpanel `identity_linked` on durable consult-save success.
 *
 * Success-only categorical props — never email/name/raw error text.
 * Postgres `identity_linked` product-event emit remains deferred (P1-15 residual).
 * Do not dual-emit from the server in this ticket.
 */
export function emitIdentityLinked(props: {
  was_merge: boolean;
  merge_outcome: 'success';
  method: IdentityLinkedMethod;
}): void {
  trackLibertyMd('identity_linked', {
    was_merge: props.was_merge,
    merge_outcome: props.merge_outcome,
    method: props.method,
    emit_origin: 'client',
  });
}

/** P0-21 — continuation CTA shown (no PHI). `was_in_viewport` must be measured, never hard-coded. */
export function emitContinuationPromptShown(type: string, wasInViewport: boolean): void {
  trackLibertyMd('continuation_prompt_shown', {
    type,
    was_in_viewport: wasInViewport,
  });
}

/** P0-21 — continuation CTA acted on (no PHI). Optional `action` for P1-14 comprehension. */
export function emitContinuationPromptActioned(
  type: string,
  secondsToAction: number,
  props?: {
    action?: 'proceed' | 'correct';
    /** Categorical count of echoed slot *names* only — never values / free text. */
    slot_name_count?: number;
  },
): void {
  trackLibertyMd('continuation_prompt_actioned', {
    type,
    seconds_to_action: secondsToAction,
    ...(props?.action ? { action: props.action } : {}),
    ...(typeof props?.slot_name_count === 'number'
      ? { slot_name_count: props.slot_name_count }
      : {}),
  });
}

/**
 * P1-09 — partial-outcome sheet painted (client Mixpanel).
 * Soft leave included (no server abandon). Props categorical only — no PHI / guidance text.
 */
export function emitPartialOutcomeShown(props: {
  trigger: 'abandon' | 'soft_leave';
  bucket: string;
}): void {
  trackLibertyMd('partial_outcome_shown', {
    trigger: props.trigger,
    bucket: props.bucket,
    emit_origin: 'client',
  });
}

/**
 * P1-09 — explicit CTA on partial-outcome surface (S1A).
 * Backdrop-only dismiss = shown, not engaged.
 */
export function emitPartialOutcomeEngaged(props: {
  trigger: 'abandon' | 'soft_leave';
  bucket: string;
}): void {
  trackLibertyMd('partial_outcome_engaged', {
    trigger: props.trigger,
    bucket: props.bucket,
    emit_origin: 'client',
  });
}

/** P1-04 — capability offer impression (no PHI). */
export function emitProfileCapabilityOfferShown(
  source: 'drawer' | 'unified_entry' | 'create_reject',
): void {
  trackLibertyMd('profile_capability_offer_shown', { source });
}

/** P1-04 — capability offer Google CTA tapped (no PHI). */
export function emitProfileCapabilityOfferCta(
  source: 'drawer' | 'unified_entry' | 'create_reject',
): void {
  trackLibertyMd('profile_capability_offer_cta', { source });
}

/** Closed set for `report_section_expanded` (P2-02 Q8) — never free-text / diagnoses. */
export type ReportSectionExpandedId =
  | 'assessment_and_plan'
  | 'differential'
  | 'soap'
  | 'red_flags';

/**
 * P2-02 — H1 instrument: section expand only (not collapse).
 * Props: categorical `section` only — no PHI / report body.
 */
export function emitReportSectionExpanded(section: ReportSectionExpandedId): void {
  trackLibertyMd('report_section_expanded', { section });
}

/**
 * P2-02 — H1 instrument: scroll depth once per bucket (monotonic).
 * Props: `pct_bucket` ∈ {0,25,50,75,100} only — no raw px / PHI.
 */
export function emitReportScrollDepth(pctBucket: 0 | 25 | 50 | 75 | 100): void {
  trackLibertyMd('report_scroll_depth', { pct_bucket: pctBucket });
}

/** Closed set for `sample_report_viewed` scroll buckets (P3-02) — same numeric set as report scroll. */
export type SampleReportScrollBucket = 0 | 25 | 50 | 75 | 100;

/**
 * P3-02 — Landing sample-report engagement (client Mixpanel only).
 * Props: allow-listed `condition_cluster_id` + bucketed `scroll_depth_bucket` only —
 * no PHI / consult id / report body. Do **not** overload `report_scroll_depth`.
 * Not on Postgres PRODUCT_EVENT_NAMES.
 */
export function emitSampleReportViewed(props: {
  condition_cluster_id: string;
  scroll_depth_bucket: SampleReportScrollBucket;
}): void {
  trackLibertyMd('sample_report_viewed', {
    condition_cluster_id: props.condition_cluster_id,
    scroll_depth_bucket: props.scroll_depth_bucket,
    emit_origin: 'client',
  });
}

/**
 * P2-10 — H1 instrument: report feedback submitted (client Mixpanel only).
 * Props: categorical `helpful` + `has_comment` only — never free text / comment body.
 * Not on Postgres PRODUCT_EVENT_NAMES.
 */
export function emitFeedbackSubmitted(props: {
  helpful: boolean
  has_comment: boolean
}): void {
  trackLibertyMd('feedback_submitted', {
    helpful: props.helpful,
    has_comment: props.has_comment,
    emit_origin: 'client',
  })
}

/** Closed set for `report_delivery_requested` method (P2-09 / P2-08). */
export type ReportDeliveryMethod = 'email' | 'download';

/**
 * P2-09 / P2-08 — H1 leave-browser instrument (client Mixpanel only).
 * Lexicon-promoted; **do not** widen Postgres PRODUCT_EVENT_NAMES.
 * Props: categorical `method` + `emit_origin: 'client'` — never email / report body / PHI.
 * P2-09 emits `method: 'download'` after ≥1 PDF Blob succeeds; P2-08 uses `email`.
 */
export function emitReportDeliveryRequested(props: {
  method: ReportDeliveryMethod;
}): void {
  trackLibertyMd('report_delivery_requested', {
    method: props.method,
    emit_origin: 'client',
  });
}

/** Closed set for doctor CTA `position` (P2-11). */
export type DoctorCtaTrackPosition = 'footer' | 'card';

/** Closed set for doctor CTA `cta_mode` (P2-11). */
export type DoctorCtaTrackMode = 'waitlist' | 'booking';

/**
 * P2-11 — once-per-session viewed guard (footer once + card aggregate once).
 * Keyed by opaque session id + position. Test reset via `__resetDoctorCtaViewedForTests`.
 */
const doctorCtaViewedKeys = new Set<string>();

export function __resetDoctorCtaViewedForTests(): void {
  doctorCtaViewedKeys.clear();
}

function doctorCtaViewedKey(sessionKey: string, position: DoctorCtaTrackPosition): string {
  return `${sessionKey || 'anon'}::${position}`;
}

/**
 * P2-11 — H4 instrument: doctor CTA painted (client Mixpanel only).
 * Spec suffix `doctor_cta_viewed` (never invent `shown`). Same name in both modes.
 * Props: categorical `triage_tier` + `cta_mode` + `position` only — never email / diagnosis.
 * Fires at most once per report session per `position`.
 */
export function emitDoctorCtaViewed(props: {
  triage_tier: string;
  cta_mode: DoctorCtaTrackMode;
  position: DoctorCtaTrackPosition;
  /** Opaque consult id or stable report-session key for once-guard. */
  session_key?: string;
}): void {
  const key = doctorCtaViewedKey(props.session_key || '', props.position);
  if (doctorCtaViewedKeys.has(key)) return;
  doctorCtaViewedKeys.add(key);
  trackLibertyMd('doctor_cta_viewed', {
    triage_tier: props.triage_tier,
    cta_mode: props.cta_mode,
    position: props.position,
    emit_origin: 'client',
  });
}

/**
 * P2-11 — H4 instrument: doctor CTA clicked (client Mixpanel only).
 * Same suffix in waitlist and booking (`cta_mode` prop discriminates).
 */
export function emitDoctorCtaClicked(props: {
  triage_tier: string;
  cta_mode: DoctorCtaTrackMode;
  position: DoctorCtaTrackPosition;
}): void {
  trackLibertyMd('doctor_cta_clicked', {
    triage_tier: props.triage_tier,
    cta_mode: props.cta_mode,
    position: props.position,
    emit_origin: 'client',
  });
}

/**
 * P2-11 — H4 instrument: waitlist intent registered (client Mixpanel only).
 * Emit after local ack / successful proxy join — never include email / contact.
 */
export function emitWaitlistJoined(props: {
  triage_tier: string;
  cta_mode: DoctorCtaTrackMode;
  position: DoctorCtaTrackPosition;
}): void {
  trackLibertyMd('waitlist_joined', {
    triage_tier: props.triage_tier,
    cta_mode: props.cta_mode,
    position: props.position,
    emit_origin: 'client',
  });
}

/** Closed set for P4-01 feeling check-in answers. */
export type FollowupRespondAnswer = 'better' | 'same' | 'worse';

/** P4-02 — categorical doctor-visit answer (never boolean). */
export type FollowupSawDoctor = 'yes' | 'no' | 'not_yet';

/** P4-02 — optional product-feedback match when saw_doctor=yes. */
export type FollowupReportMatch = 'yes' | 'no' | 'unsure';

/**
 * P4-01/P4-02 — client Mixpanel only after successful server record.
 * Lexicon-promoted `followup_responded`. **Do not** widen Postgres PRODUCT_EVENT_NAMES.
 * Two-fire (≤2 per check-in): (1) `{ answer }` on feeling success;
 * (2) on doctor answer `{ answer, saw_doctor [, report_match] }`.
 * Never email / complaint / PHI / triage free-text in props.
 */
export function emitFollowupResponded(props: {
  answer: FollowupRespondAnswer;
  saw_doctor?: FollowupSawDoctor;
  report_match?: FollowupReportMatch;
}): void {
  const payload: LibertyMdTrackProperties = {
    answer: props.answer,
    emit_origin: 'client',
  };
  if (props.saw_doctor) {
    payload.saw_doctor = props.saw_doctor;
  }
  if (props.report_match) {
    payload.report_match = props.report_match;
  }
  trackLibertyMd('followup_responded', payload);
}
