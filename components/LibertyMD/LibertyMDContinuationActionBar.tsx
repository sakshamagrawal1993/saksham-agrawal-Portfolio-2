/**
 * P0-21 · Fixed-in-viewport continuation CTAs via the shrink-0 consult footer slot
 * (not a second `position: fixed` layer). Empty → null. Hosts report-gate open,
 * Chat resume, and P1-10 clinical_review start-fresh. Telemetry:
 * continuation_prompt_shown / _actioned (categorical `type` only — no PHI).
 *
 * P2-06: after soft-gate dismiss-once, Chat/App must omit `report_gate` actions
 * (no “View report options” re-nag). This bar does not invent reopen itself.
 *
 * `was_in_viewport` uses IntersectionObserver evaluated at show/render (P1-17 AC6).
 * jsdom / environments without IO fall back to `computeContinuationWasInViewport`
 * (geometry vs visualViewport) with identical semantics — never hard-coded true.
 */
import { useLayoutEffect, useRef } from 'react';
import { useI18n } from '../../i18n';
import { LibertyMDAbandonedRecoveryPrompt } from './LibertyMDCareControls';
import {
  emitContinuationPromptActioned,
  emitContinuationPromptShown,
} from './libertymd-analytics';

export type ContinuationActionType =
  | 'report_gate'
  | 'resume'
  | 'clinical_review_start_fresh';

export type ContinuationReportGateAction = {
  type: 'report_gate';
  onOpen: () => void;
};

export type ContinuationResumeAction = {
  type: 'resume';
  loading: boolean;
  error?: string;
  /** Display-only prior complaint for invitation body. Never passed to telemetry. */
  chiefComplaint?: string | null;
  onResume: () => void;
  onStartOver: () => void;
};

/** P1-10 — start-fresh escape for every Chat `clinical_review_needed` (no true resume). */
export type ContinuationClinicalReviewStartFreshAction = {
  type: 'clinical_review_start_fresh';
  onStartFresh: () => void;
};

export type ContinuationAction =
  | ContinuationReportGateAction
  | ContinuationResumeAction
  | ContinuationClinicalReviewStartFreshAction;

/** True when the element's box intersects the visual viewport (or layout viewport fallback). */
export function computeContinuationWasInViewport(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (vv) {
    const top = vv.offsetTop;
    const left = vv.offsetLeft;
    const bottom = top + vv.height;
    const right = left + vv.width;
    return rect.bottom > top && rect.top < bottom && rect.right > left && rect.left < right;
  }
  return (
    rect.bottom > 0
    && rect.top < window.innerHeight
    && rect.right > 0
    && rect.left < window.innerWidth
  );
}

interface LibertyMDContinuationActionBarProps {
  action: ContinuationAction | null;
}

export function LibertyMDContinuationActionBar({ action }: LibertyMDContinuationActionBarProps) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLElement | null>(null);
  const shownAtRef = useRef<number | null>(null);
  const lastShownTypeRef = useRef<ContinuationActionType | null>(null);

  useLayoutEffect(() => {
    if (!action) {
      shownAtRef.current = null;
      lastShownTypeRef.current = null;
      return;
    }
    const el = rootRef.current;
    if (!el) return;
    if (lastShownTypeRef.current === action.type) return;
    lastShownTypeRef.current = action.type;
    shownAtRef.current = Date.now();

    // P1-17 AC6: IntersectionObserver at render; geometry fallback when IO unavailable (jsdom).
    if (typeof IntersectionObserver !== 'undefined') {
      let settled = false;
      const observer = new IntersectionObserver((entries) => {
        if (settled) return;
        const entry = entries[0];
        if (!entry) return;
        settled = true;
        emitContinuationPromptShown(action.type, entry.isIntersecting);
        observer.disconnect();
      }, { threshold: 0 });
      observer.observe(el);
      return () => {
        observer.disconnect();
      };
    }

    const wasInViewport = computeContinuationWasInViewport(el);
    emitContinuationPromptShown(action.type, wasInViewport);
    return undefined;
  }, [action]);

  if (!action) return null;

  const secondsToAction = () => {
    const started = shownAtRef.current;
    if (started == null) return 0;
    return Math.max(0, Math.round((Date.now() - started) / 1000));
  };

  const onReportOpen = () => {
    if (action.type !== 'report_gate') return;
    emitContinuationPromptActioned('report_gate', secondsToAction());
    action.onOpen();
  };

  const onResume = () => {
    if (action.type !== 'resume') return;
    emitContinuationPromptActioned('resume', secondsToAction());
    action.onResume();
  };

  const onStartOver = () => {
    if (action.type !== 'resume') return;
    emitContinuationPromptActioned('resume', secondsToAction());
    action.onStartOver();
  };

  const onStartFresh = () => {
    if (action.type !== 'clinical_review_start_fresh') return;
    emitContinuationPromptActioned('clinical_review_start_fresh', secondsToAction());
    action.onStartFresh();
  };

  return (
    <section
      ref={rootRef}
      data-libertymd-continuation-action-bar
      aria-label="Continue consultation"
      className="mb-libertymd-sm"
    >
      {action.type === 'report_gate' ? (
        <button
          type="button"
          onClick={onReportOpen}
          className="mx-auto flex h-12 w-full max-w-md items-center justify-center rounded-full bg-libertymd-blue-600 px-6 text-sm font-bold text-white shadow-lg shadow-libertymd-blue-600/20 transition hover:bg-libertymd-blue-700"
        >
          View report options
        </button>
      ) : action.type === 'clinical_review_start_fresh' ? (
        <button
          type="button"
          onClick={onStartFresh}
          data-libertymd-clinical-review-start-fresh
          className="mx-auto flex h-12 w-full max-w-md items-center justify-center rounded-full bg-libertymd-blue-600 px-6 text-sm font-bold text-white shadow-lg shadow-libertymd-blue-600/20 transition hover:bg-libertymd-blue-700"
        >
          {t('chatx.startNewConsult')}
        </button>
      ) : (
        <LibertyMDAbandonedRecoveryPrompt
          loading={action.loading}
          error={action.error}
          chiefComplaint={action.chiefComplaint}
          onResume={onResume}
          onStartOver={onStartOver}
        />
      )}
    </section>
  );
}
