/**
 * P1-14 — Comprehension check OverlaySheet children.
 *
 * Consumes LibertyMDOverlaySheet (P0-22) — no portal/dismiss/focus/lock rebuild.
 * Dismiss = cancel confirm only (parent onClose); Proceed / Correct advance via proxy.
 *
 * Summary / confirm copy → **REQUIRES EXPERT REVIEW**.
 */
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import {
  emitContinuationPromptActioned,
  emitContinuationPromptShown,
} from './libertymd-analytics';
import { LibertyMDOverlaySheet } from './LibertyMDOverlaySheet';

export interface ComprehensionSummaryLine {
  slot: string;
  label: string;
  value: string;
}

export interface ComprehensionCheckPayload {
  summary_lines: ComprehensionSummaryLine[];
  pending?: boolean;
  slot_count?: number;
}

export function parseComprehensionCheck(raw: unknown): ComprehensionCheckPayload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const linesRaw = record.summary_lines;
  if (!Array.isArray(linesRaw)) return null;
  const summary_lines: ComprehensionSummaryLine[] = [];
  for (const item of linesRaw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const line = item as Record<string, unknown>;
    const slot = typeof line.slot === 'string' ? line.slot.trim() : '';
    const label = typeof line.label === 'string' ? line.label.trim() : '';
    const value = typeof line.value === 'string' ? line.value.trim() : '';
    if (!slot || !label || !value) continue;
    summary_lines.push({ slot, label, value: value.slice(0, 1000) });
  }
  return {
    summary_lines,
    pending: true,
    slot_count: typeof record.slot_count === 'number'
      ? record.slot_count
      : summary_lines.length,
  };
}

interface LibertyMDComprehensionCheckProps {
  payload: ComprehensionCheckPayload;
  busy?: boolean;
  consultScroller?: HTMLElement | null;
  onDismiss: () => void;
  onProceed: () => void | Promise<void>;
  onCorrect: (text: string) => void | Promise<void>;
}

export function LibertyMDComprehensionCheck({
  payload,
  busy = false,
  consultScroller,
  onDismiss,
  onProceed,
  onCorrect,
}: LibertyMDComprehensionCheckProps) {
  const { t } = useI18n();
  const shownAtRef = useRef<number | null>(null);
  const shownOnceRef = useRef(false);
  const [correcting, setCorrecting] = useState(false);
  const [correctionText, setCorrectionText] = useState('');

  useEffect(() => {
    if (shownOnceRef.current) return;
    shownOnceRef.current = true;
    shownAtRef.current = Date.now();
    // Overlay is viewport-fixed — treat as in-viewport when painted.
    emitContinuationPromptShown('comprehension_check', true);
  }, []);

  const secondsToAction = () => {
    const started = shownAtRef.current;
    if (started == null) return 0;
    return Math.max(0, Math.round((Date.now() - started) / 1000));
  };

  const handleProceed = () => {
    emitContinuationPromptActioned('comprehension_check', secondsToAction(), {
      action: 'proceed',
      slot_name_count: payload.slot_count ?? payload.summary_lines.length,
    });
    void onProceed();
  };

  const handleCorrectSubmit = () => {
    const text = correctionText.trim();
    if (!text || busy) return;
    emitContinuationPromptActioned('comprehension_check', secondsToAction(), {
      action: 'correct',
      slot_name_count: payload.slot_count ?? payload.summary_lines.length,
    });
    void onCorrect(text);
  };

  return (
    <LibertyMDOverlaySheet
      onClose={onDismiss}
      titleId="libertymd-comprehension-title"
      ariaDescribedBy="libertymd-comprehension-desc"
      panelClassName="relative flex flex-col max-h-[85dvh] sm:max-h-[80vh] h-full"
      bodyClassName="min-h-0 flex-1 flex flex-col overflow-hidden focus:outline-none"
      consultScroller={consultScroller}
    >
      <div
        data-libertymd-comprehension-check=""
        className="flex flex-1 flex-col overflow-hidden bg-white min-h-0 h-full"
      >
        {/* Scrollable Summary Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 pb-4 min-h-0">
          <p className="text-xs font-bold uppercase tracking-wide text-libertymd-blue-600">
            {t('chatx.comprehensionEyebrow')}
          </p>
          <h2
            id="libertymd-comprehension-title"
            className="mt-1 font-serif text-2xl font-semibold leading-tight text-libertymd-ink sm:text-3xl"
          >
            {t('chatx.comprehensionTitle')}
          </h2>
          <p
            id="libertymd-comprehension-desc"
            className="mt-2 text-sm leading-relaxed text-libertymd-slate-700"
          >
            {t('chatx.comprehensionConfirm')}
          </p>

          <ul className="mt-4 space-y-2.5">
            {payload.summary_lines.map((line) => (
              <li
                key={line.slot}
                data-libertymd-comprehension-line={line.slot}
                className="rounded-xl border border-libertymd-blue-100 bg-libertymd-blue-50/70 p-3"
              >
                <p className="text-xs font-bold uppercase tracking-wide text-libertymd-blue-700">
                  {line.label}
                </p>
                <p className="mt-0.5 text-sm leading-relaxed font-medium text-libertymd-ink">{line.value}</p>
              </li>
            ))}
          </ul>

          {correcting && (
            <div className="mt-4 space-y-2">
              <label
                htmlFor="libertymd-comprehension-correction"
                className="block text-sm font-bold text-libertymd-ink"
              >
                {t('chatx.comprehensionCorrectionLabel')}
              </label>
              <textarea
                id="libertymd-comprehension-correction"
                data-libertymd-comprehension-correction=""
                value={correctionText}
                onChange={(event) => setCorrectionText(event.target.value)}
                rows={3}
                disabled={busy}
                className="w-full rounded-xl border border-libertymd-slate-200 bg-white px-3 py-2 text-sm text-libertymd-ink outline-none focus:border-libertymd-blue-600"
                placeholder={t('chatx.comprehensionCorrectionPlaceholder')}
              />
            </div>
          )}
        </div>

        {/* Fixed Action Buttons Container - Pinned at Bottom */}
        <div className="shrink-0 border-t border-libertymd-slate-200 bg-white px-4 py-3 sm:px-6 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
          {correcting ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                data-libertymd-comprehension-correct-submit=""
                disabled={busy || !correctionText.trim()}
                onClick={handleCorrectSubmit}
                className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-libertymd-blue-600 px-6 text-sm font-bold text-white transition hover:bg-libertymd-blue-700 disabled:opacity-50"
              >
                {t('chatx.comprehensionCorrectionSubmit')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setCorrecting(false);
                  setCorrectionText('');
                }}
                className="inline-flex h-12 flex-1 items-center justify-center rounded-full border border-libertymd-slate-200 bg-white px-6 text-sm font-bold text-libertymd-ink transition hover:bg-libertymd-slate-50 disabled:opacity-50"
              >
                {t('chatx.comprehensionCorrectionCancel')}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                data-libertymd-comprehension-proceed=""
                disabled={busy}
                onClick={handleProceed}
                className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-libertymd-blue-600 px-6 text-sm font-bold text-white shadow-md transition hover:bg-libertymd-blue-700 disabled:opacity-50"
              >
                {t('chatx.comprehensionProceed')}
              </button>
              <button
                type="button"
                data-libertymd-comprehension-correct=""
                disabled={busy}
                onClick={() => setCorrecting(true)}
                className="inline-flex h-12 flex-1 items-center justify-center rounded-full border border-libertymd-slate-200 bg-white px-6 text-sm font-bold text-libertymd-ink transition hover:bg-libertymd-slate-50 disabled:opacity-50"
              >
                {t('chatx.comprehensionCorrect')}
              </button>
            </div>
          )}
        </div>
      </div>
    </LibertyMDOverlaySheet>
  );
}
