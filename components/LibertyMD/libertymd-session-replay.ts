/**
 * P1-18 — Session Replay + clinical autocapture gate for `/liberty-md*`.
 *
 * Clinical surface = pathname prefix `/liberty-md` and `/liberty-md/*`
 * (landing hero, App residual consult shell, Chat interview / demographics / report).
 *
 * On enter: stop recording + `record_sessions_percent: 0` + autocapture `input: false`.
 * On leave: restore portfolio sampling / autocapture and re-allow recording.
 * Best-effort: SDK absence / throws never block consult UX.
 */

export type LibertyMdSessionReplayAnalytics = {
  stopSessionRecording: () => void
  startSessionRecording: () => void
  setConfig: (config: Record<string, unknown>) => void
}

/** Portfolio non-clinical sample rate (init default; do not redesign portfolio sampling). */
export const LIBERTYMD_NON_CLINICAL_RECORD_SESSIONS_PERCENT = 100

/**
 * Autocapture while on `/liberty-md*`: disable input events only.
 * Preserve click / pageview / scroll / submit (and related) defaults explicitly —
 * do not use `block_url_regexes` (that opts out all autocapture).
 */
export const LIBERTYMD_CLINICAL_AUTOCAPTURE = {
  input: false,
  click: true,
  pageview: 'full-url' as const,
  scroll: true,
  submit: true,
  rage_click: true,
  dead_click: true,
  capture_text_content: false,
}

/** Restored autocapture when leaving the clinical prefix. */
export const LIBERTYMD_PORTFOLIO_AUTOCAPTURE = {
  input: true,
  click: true,
  pageview: 'full-url' as const,
  scroll: true,
  submit: true,
  rage_click: true,
  dead_click: true,
  capture_text_content: false,
}

let clinicalActive = false
let testAnalyticsOverride: LibertyMdSessionReplayAnalytics | null = null

/** Test-only inject; production uses lazy portfolio `Analytics` wrappers. */
export function __setLibertyMdSessionReplayAnalyticsForTests(
  analytics: LibertyMdSessionReplayAnalytics | null,
): void {
  testAnalyticsOverride = analytics
}

/** Test-only: reset module gate state between cases. */
export function __resetLibertyMdSessionReplayStateForTests(): void {
  clinicalActive = false
}

export function __isLibertyMdClinicalReplayActiveForTests(): boolean {
  return clinicalActive
}

/**
 * Clinical Replay gate pathname prefix.
 * Extensible for future clinical report routes under `/liberty-md*`.
 */
export function isLibertyMdClinicalPath(pathname: string): boolean {
  const path = String(pathname || '').split('?')[0].split('#')[0]
  return path === '/liberty-md' || path.startsWith('/liberty-md/')
}

function applyClinicalGuard(analytics: LibertyMdSessionReplayAnalytics): void {
  analytics.stopSessionRecording()
  analytics.setConfig({
    record_sessions_percent: 0,
    autocapture: { ...LIBERTYMD_CLINICAL_AUTOCAPTURE },
  })
  clinicalActive = true
}

function restoreNonClinical(analytics: LibertyMdSessionReplayAnalytics): void {
  analytics.setConfig({
    record_sessions_percent: LIBERTYMD_NON_CLINICAL_RECORD_SESSIONS_PERCENT,
    autocapture: { ...LIBERTYMD_PORTFOLIO_AUTOCAPTURE },
  })
  analytics.startSessionRecording()
  clinicalActive = false
}

function syncWithAnalytics(
  pathname: string,
  analytics: LibertyMdSessionReplayAnalytics,
): void {
  const clinical = isLibertyMdClinicalPath(pathname)
  if (clinical) {
    // Re-apply stop + sampling 0 every clinical navigate (idempotent; covers reset races).
    applyClinicalGuard(analytics)
    return
  }
  if (clinicalActive) {
    restoreNonClinical(analytics)
  }
}

/**
 * Idempotent pathname sync — App.tsx is SoT; Chat mount may call again.
 * No-ops when analytics SDK wrappers are unavailable.
 */
export function syncLibertyMdSessionReplayForPath(pathname: string): void {
  if (testAnalyticsOverride) {
    try {
      syncWithAnalytics(pathname, testAnalyticsOverride)
    } catch {
      // Consult UX must not depend on Mixpanel.
    }
    return
  }

  void (async () => {
    try {
      const { Analytics } = await import('../../services/analytics')
      syncWithAnalytics(pathname, Analytics)
    } catch {
      // Analytics is best-effort; never block the consult path.
    }
  })()
}
