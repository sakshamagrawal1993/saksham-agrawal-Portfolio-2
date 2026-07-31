/**
 * P0-16 — the client mirror of the proxy's four-severity taxonomy.
 *
 * This module is the **only** place in the LibertyMD client allowed to decide
 * what a safety signal or an app failure looks like. Components read the
 * presentation table; they never branch on `status`, `source`, or a colour
 * themselves (P0-16 AC2).
 *
 * ## Why there are two copies of the mapping
 *
 * The authority lives in
 * `supabase/functions/libertymd-care-proxy/lib/types.ts`
 * (`severityForSafetySignal`). The client cannot import it: that module is
 * Deno/edge code, `tsconfig.json` excludes `supabase/`, and pulling it into the
 * browser bundle would couple the front end to the edge runtime. So this is a
 * deliberate mirror, and `tests/libertymd/severity-mapping.test.ts` imports both
 * and asserts they agree across the entire `status` × `source` matrix. Change a
 * rule in one and that test fails until the other matches. Two copies with a
 * proof of equality beat one copy in the wrong runtime.
 *
 * ## Why the client re-derives instead of trusting `safety.severity`
 *
 * The proxy publishes `severity` on the payload, and it would be shorter to
 * render it directly. It is not read as authoritative, because P0-16 AC4 is an
 * *unreachability* claim: emergency chrome must be impossible for anything that
 * is not a `force_end`. A claim that depends on the server never sending a wrong
 * string is not unreachability, it is trust. The severity is re-derived here from
 * `status` + `source`, so the guarantee holds locally and is testable locally.
 */

/** The four user-visible tiers. Mirrors `CareSeverity` in the proxy. */
export type LibertyMDSeverity = 'info' | 'caution' | 'emergency' | 'technical';

/** A safety signal as it arrives on a proxy response or is read back from a row. */
export interface LibertyMDSafetySignal {
  status?: string | null;
  source?: string | null;
}

/**
 * `source` values that mean the app failed rather than the body being at risk.
 * Mirrors `TECHNICAL_SAFETY_SOURCES` in the proxy — kept in the same order so
 * the two lists diff cleanly by eye as well as by test.
 *
 * `error_fail_cautious` is the live value: it is what the guardrail's catch
 * branch writes, and what the two production rows behind P0-14f carry.
 */
export const LIBERTYMD_TECHNICAL_SAFETY_SOURCES: readonly string[] = [
  'error_fail_cautious',
  'guardrail_unavailable',
  'guardrail_timeout',
  'transport_error',
  // NOTE: deliberately does NOT include generic 'error' or 'timeout'.
  // `source` is `String(raw.source || 'n8n')` — an n8n-supplied value for any
  // verdict that came back from the workflow. A generic entry here would make an
  // n8n response carrying source:'error' alongside a genuine `high_risk_continue`
  // render as an app fault, silently swallowing a real clinical caution — P0-14f's
  // defect running the other way. See the full reasoning on TECHNICAL_SAFETY_SOURCES
  // in the proxy's lib/types.ts; these two lists must stay identical.
];

/** True when a persisted safety `source` denotes an app failure. */
export function isLibertyMDTechnicalSafetySource(source: string | null | undefined): boolean {
  return typeof source === 'string' && LIBERTYMD_TECHNICAL_SAFETY_SOURCES.indexOf(source) !== -1;
}

/**
 * The mapping. Precedence is load-bearing and must match the proxy exactly:
 *
 *   1. `force_end`                  → emergency  (and nothing else, ever)
 *   2. technical `source`           → technical  (P0-14f: transport ≠ clinical)
 *   3. `high_risk_continue`         → caution
 *   4. anything else                → info
 */
export function libertyMDSeverityForSignal(
  signal: LibertyMDSafetySignal | null | undefined,
): LibertyMDSeverity {
  if (!signal) return 'info';
  if (signal.status === 'force_end') return 'emergency';
  if (isLibertyMDTechnicalSafetySource(signal.source)) return 'technical';
  if (signal.status === 'high_risk_continue') return 'caution';
  return 'info';
}

/**
 * A client-side request failure — network error, timeout, non-2xx from the
 * proxy. Always technical: the app broke, and the app is what should be
 * described. This exists so no call site has to remember which literal to pass.
 */
export function libertyMDSeverityForRequestFailure(): LibertyMDSeverity {
  return 'technical';
}

/**
 * The inline notice a turn should render, if any.
 *
 * Named `...Content` rather than `...Notice` because `LibertyMDSafetyNotice` is
 * the component in `LibertyMDCareControls.tsx`; keeping the two names apart stops
 * an adopter importing both and shadowing one.
 */
export interface LibertyMDSafetyNoticeContent {
  severity: LibertyMDSeverity;
  message: string;
}

/**
 * Derive the inline notice from a proxy response.
 *
 * Reads **only** the `safety` object, never `emergency` / `state`. The pinned
 * terminal emergency banner is driven by the consultation phase and lives in the
 * chat's render tree; this is the in-transcript note that sits beside the
 * conversation. Keeping the two apart is what stops a caution or a technical
 * fault from ever borrowing terminal-emergency chrome.
 *
 * Returns `null` for `info` — the info tier is "plain, no chrome", which means
 * rendering nothing at all rather than rendering an empty box.
 */
export function libertyMDSafetyNoticeFromResponse(response: unknown): LibertyMDSafetyNoticeContent | null {
  if (!response || typeof response !== 'object') return null;
  const safety = (response as { safety?: unknown }).safety;
  if (!safety || typeof safety !== 'object') return null;
  const signal = safety as { status?: unknown; source?: unknown; message?: unknown };
  const severity = libertyMDSeverityForSignal({
    status: typeof signal.status === 'string' ? signal.status : null,
    source: typeof signal.source === 'string' ? signal.source : null,
  });
  if (severity === 'info') return null;
  const message = typeof signal.message === 'string' ? signal.message.trim() : '';
  if (!message) return null;
  return { severity, message };
}

/**
 * How each tier is presented. The whole visual difference between the four
 * severities is here, and nowhere else.
 *
 * P0-16 AC5, contrast and non-colour cues:
 *   - every tier carries a text `label` and an icon, so the tier survives
 *     greyscale, colour blindness, and a forced-colours stylesheet;
 *   - text/background pairs are all well above WCAG AA 4.5:1 —
 *     amber-900 (#78350F) on amber-50 (#FFFBEB) ≈ 9.4:1,
 *     red-900 (#7F1D1D) on red-50 (#FEF2F2) ≈ 10.2:1,
 *     libertymd-slate-700 (#334155) on libertymd-slate-200 (#E2E8F0) ≈ 8.5:1;
 *   - `caution` and `technical` differ in hue *and* in shape: caution keeps the
 *     left rule of an inline annotation, technical is a full-bordered system
 *     card. A user who cannot see the difference between amber and grey can
 *     still see that one is part of the conversation and one is about the app.
 */
export interface LibertyMDSeverityPresentation {
  /** Visible tier label. Never omit it — colour alone is not a signal. */
  label: string;
  /** Container classes. */
  container: string;
  /** Icon classes (colour + size). */
  icon: string;
  /** Label classes. */
  labelClass: string;
  /** Body-text classes. */
  body: string;
  /** ARIA role for the container. */
  role: 'status' | 'alert' | 'note';
  /** `aria-live` politeness. */
  live: 'polite' | 'assertive' | 'off';
  /** Which icon the component should draw. */
  iconName: 'info' | 'alert-triangle' | 'shield-alert' | 'wrench';
}

export const LIBERTYMD_SEVERITY_PRESENTATION: Record<LibertyMDSeverity, LibertyMDSeverityPresentation> = {
  // Plain assistant content. No chrome at all — callers should render the text
  // in the normal message bubble rather than in a notice.
  info: {
    label: '',
    container: 'text-left text-[15px] leading-6 text-libertymd-slate-700',
    icon: 'h-4 w-4 text-libertymd-slate-500',
    labelClass: 'sr-only',
    body: '',
    role: 'note',
    live: 'off',
    iconName: 'info',
  },
  // Genuine `high_risk_continue`. Calm, inline, conversational: the consult
  // continues, so this must not read as an interruption.
  caution: {
    label: 'Worth keeping an eye on',
    container: 'rounded-md border-l-2 border-amber-500 bg-amber-50 px-4 py-3 text-left',
    icon: 'mt-0.5 h-4 w-4 shrink-0 text-amber-700',
    labelClass: 'text-xs font-bold uppercase tracking-wide text-amber-900',
    body: 'mt-0.5 text-sm leading-6 text-amber-900',
    role: 'status',
    live: 'polite',
    iconName: 'alert-triangle',
  },
  // `force_end` only. Assertive and terminal. Reachable from exactly one signal.
  emergency: {
    label: 'Emergency — act now',
    container: 'rounded-lg border-2 border-red-300 bg-red-50 p-4 text-left shadow-sm',
    icon: 'mt-0.5 h-5 w-5 shrink-0 text-red-700',
    labelClass: 'text-sm font-bold uppercase tracking-wide text-red-900',
    body: 'mt-1 text-sm leading-6 text-red-900',
    role: 'alert',
    live: 'assertive',
    iconName: 'shield-alert',
  },
  // Error / timeout / `error_fail_cautious`. Neutral, unmistakably about the
  // app. No red, no amber, no clinical vocabulary.
  technical: {
    label: 'App issue, not a health finding',
    container: 'rounded-md border border-libertymd-slate-300 bg-libertymd-slate-200 px-4 py-3 text-left',
    icon: 'mt-0.5 h-4 w-4 shrink-0 text-libertymd-slate-700',
    labelClass: 'text-xs font-bold uppercase tracking-wide text-libertymd-slate-700',
    body: 'mt-0.5 text-sm leading-6 text-libertymd-slate-700',
    role: 'status',
    live: 'polite',
    iconName: 'wrench',
  },
};
