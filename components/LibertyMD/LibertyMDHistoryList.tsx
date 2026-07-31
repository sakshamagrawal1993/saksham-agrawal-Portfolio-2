/**
 * P4-03 — AccountDrawer history section (enriched rows, empty/single/many, profile groups).
 * Profile management CRUD stays in LibertyMDProfileManagementPanel — out of scope here.
 */
import { Loader2 } from 'lucide-react';
import { useI18n } from '../../i18n';
import { mapCareSettingToTriage, type TriageDisplayTier } from './libertymd-report';
import { formatRetentionRemaining, isRetentionStillValid } from './libertymd-report-lifecycle';

export interface LibertyMDHistoryItem {
  id: string;
  status: string;
  chief_complaint: string | null;
  created_at: string;
  patient_id?: string | null;
  patient_display_label?: string | null;
  headline?: string | null;
  triage_tier?: string | null;
  retention_expires_at?: string | null;
}

function triageLabelKey(tier: TriageDisplayTier): string {
  return `report.triage.${tier}`;
}

/** Mirrors CareControls `formatLibertyMdHistoryStatus` (avoid circular import). */
function formatHistoryStatus(status: string): string {
  if (status === 'abandoned') return 'Incomplete';
  return String(status || '').replace(/_/g, ' ');
}

function truncateHeadline(raw: string, maxChars = 72): string {
  const text = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > Math.floor(maxChars * 0.6) ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

function historyHeadline(item: LibertyMDHistoryItem): string {
  const fromReport = typeof item.headline === 'string' ? item.headline.trim() : '';
  if (fromReport) return fromReport;
  const complaint = truncateHeadline(item.chief_complaint || '');
  return complaint || 'LibertyMD consultation';
}

function historyDateLabel(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  return new Date(ms).toLocaleDateString();
}

export function groupHistoryByProfile(items: LibertyMDHistoryItem[]): Array<{
  key: string;
  label: string;
  items: LibertyMDHistoryItem[];
}> {
  const distinct = new Set(
    items.map((item) => String(item.patient_id || '').trim()).filter(Boolean),
  );
  if (distinct.size <= 1) {
    return [{ key: 'flat', label: '', items }];
  }
  const groups = new Map<string, { label: string; items: LibertyMDHistoryItem[] }>();
  for (const item of items) {
    const key = String(item.patient_id || '').trim() || 'unknown';
    const label =
      (typeof item.patient_display_label === 'string' && item.patient_display_label.trim())
      || (key === 'unknown' ? 'Profile' : key);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(key, { label, items: [item] });
    }
  }
  return [...groups.entries()].map(([key, value]) => ({
    key,
    label: value.label,
    items: value.items,
  }));
}

interface HistoryRowProps {
  item: LibertyMDHistoryItem;
  onSelect: (id: string) => void;
}

function LibertyMDHistoryRow({ item, onSelect }: HistoryRowProps) {
  const { t } = useI18n();
  const tierRaw = typeof item.triage_tier === 'string' ? item.triage_tier.trim() : '';
  const triageTier = tierRaw ? mapCareSettingToTriage(tierRaw) : null;
  const showTriage = Boolean(triageTier && triageTier !== 'unknown');
  const retention = item.retention_expires_at;
  const showTtl = Boolean(retention && isRetentionStillValid(retention));
  const dateLabel = historyDateLabel(item.created_at);
  const statusLabel = formatHistoryStatus(item.status);

  return (
    <button
      type="button"
      data-libertymd-history-row
      data-libertymd-history-id={item.id}
      data-libertymd-history-triage={showTriage ? triageTier : undefined}
      data-libertymd-history-has-ttl={showTtl ? 'true' : undefined}
      onClick={() => onSelect(item.id)}
      className="w-full py-4 text-left transition hover:text-libertymd-blue-600"
    >
      {showTriage && triageTier ? (
        <p
          className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-libertymd-blue-700"
          data-libertymd-history-triage-label
        >
          {t(triageLabelKey(triageTier))}
        </p>
      ) : null}
      <p className="line-clamp-2 text-sm font-bold text-libertymd-ink">{historyHeadline(item)}</p>
      <p className="mt-1 text-xs text-libertymd-slate-500">
        {[dateLabel, statusLabel].filter(Boolean).join(' · ')}
      </p>
      {showTtl && retention ? (
        <p
          className="mt-1 text-xs font-semibold text-libertymd-slate-600"
          data-libertymd-history-ttl
        >
          {t('careControls.historyRetentionRemaining', {
            remaining: formatRetentionRemaining(retention),
          })}
        </p>
      ) : null}
    </button>
  );
}

interface LibertyMDHistoryListProps {
  history: LibertyMDHistoryItem[];
  loading: boolean;
  onSelectConsultation: (id: string) => void;
  /** P4-10 — empty (+ loading escape) next action; typically closes AccountDrawer. */
  onContinue?: () => void;
}

export function LibertyMDHistoryList({
  history,
  loading,
  onSelectConsultation,
  onContinue,
}: LibertyMDHistoryListProps) {
  const { t } = useI18n();

  if (loading) {
    return (
      <div
        className="mt-libertymd-lg space-y-libertymd-sm text-sm text-libertymd-slate-500"
        data-libertymd-history-state="loading"
        data-libertymd-edge="history-loading"
      >
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('careControls.historyLoading')}
        </div>
        {onContinue ? (
          <button
            type="button"
            data-libertymd-history-loading-escape=""
            onClick={onContinue}
            className="text-sm font-semibold text-libertymd-blue-700 underline"
          >
            {t('careControls.historyLoadingEscape')}
          </button>
        ) : null}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div
        className="mt-libertymd-lg space-y-libertymd-sm"
        data-libertymd-history-state="empty"
        data-libertymd-edge="history-empty"
      >
        <p className="text-sm text-libertymd-slate-500">
          {t('careControls.emptyHistory')}
        </p>
        {onContinue ? (
          <button
            type="button"
            data-libertymd-history-empty-cta=""
            onClick={onContinue}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-libertymd-blue-600 px-4 text-sm font-bold text-white hover:bg-libertymd-blue-700"
          >
            {t('careControls.emptyHistoryCta')}
          </button>
        ) : null}
      </div>
    );
  }

  const state = history.length === 1 ? 'single' : 'many';
  const groups = groupHistoryByProfile(history);
  const grouped = groups.length > 1 || (groups.length === 1 && groups[0].key !== 'flat');

  return (
    <div
      className="mt-libertymd-md"
      data-libertymd-history-state={state}
      data-libertymd-history-grouped={grouped ? 'true' : 'false'}
    >
      {grouped ? (
        <div className="space-y-libertymd-md">
          {groups.map((group) => (
            <section
              key={group.key}
              data-libertymd-history-group={group.key}
              aria-label={group.label}
            >
              <h3 className="text-xs font-bold uppercase tracking-wide text-libertymd-slate-500">
                {t('careControls.historyGroupHeading', { label: group.label })}
              </h3>
              <div className="mt-1 divide-y divide-libertymd-slate-200">
                {group.items.map((item) => (
                  <LibertyMDHistoryRow
                    key={item.id}
                    item={item}
                    onSelect={onSelectConsultation}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-libertymd-slate-200">
          {history.map((item) => (
            <LibertyMDHistoryRow
              key={item.id}
              item={item}
              onSelect={onSelectConsultation}
            />
          ))}
        </div>
      )}
    </div>
  );
}
