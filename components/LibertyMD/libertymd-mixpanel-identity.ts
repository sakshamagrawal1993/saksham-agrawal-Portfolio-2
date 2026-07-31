/**
 * P1-17 — LibertyMD-scoped Mixpanel identity stitch.
 *
 * Owns `identify(user.id)` timing for anonymous-first consults (id-only, no email).
 * Leaves portfolio `AuthContext` unchanged. Never identifies on profile/patient ids.
 * Best-effort: SDK absence / throws never block consult UX.
 *
 * Simplified ID Merge: SDK `$device_id` (localStorage persistence) + later
 * `identify(supabaseUserId)`. Do not invent a second durable cookie person key.
 */

export type LibertyMdIdentifyFn = (userId: string) => void;
export type LibertyMdDeviceIdReader = () => string | null | undefined;

let testIdentifyOverride: LibertyMdIdentifyFn | null = null;
let testDeviceIdOverride: LibertyMdDeviceIdReader | null = null;

/** Test-only inject; production uses lazy `Analytics.identify` (id-only). */
export function __setLibertyMdIdentifyForTests(fn: LibertyMdIdentifyFn | null): void {
  testIdentifyOverride = fn;
}

/** Test-only inject for `$device_id` assert. */
export function __setLibertyMdDeviceIdReaderForTests(fn: LibertyMdDeviceIdReader | null): void {
  testDeviceIdOverride = fn;
}

/**
 * Ban list — never pass these as the Mixpanel person key from LibertyMD paths.
 * Profiles / patients are event props only (AC4).
 */
export function isForbiddenLibertyMdIdentifyTarget(id: string): boolean {
  const trimmed = String(id || '').trim();
  if (!trimmed) return true;
  // Opaque UUIDs are fine for users; this guards against accidental profile-shaped callsites
  // that pass empty / "profile:" prefixes if introduced later.
  if (trimmed.startsWith('profile:') || trimmed.startsWith('patient:')) return true;
  return false;
}

/**
 * Read Mixpanel `$device_id` (SDK persistence). Optional thin helper for tests / assert.
 * Returns null when SDK absent or property missing.
 */
export async function readLibertyMdDeviceId(): Promise<string | null> {
  if (testDeviceIdOverride) {
    const value = testDeviceIdOverride();
    return value == null || value === '' ? null : String(value);
  }
  try {
    const { Analytics } = await import('../../services/analytics');
    const id = Analytics.getDeviceId?.();
    return id == null || id === '' ? null : String(id);
  } catch {
    return null;
  }
}

/**
 * Ensure SDK `$device_id` is present before identify (Simplified ID Merge).
 * Registers only when the property is absent — never replaces Supabase user.id
 * as the durable person key.
 */
export async function ensureLibertyMdDeviceId(): Promise<string | null> {
  const existing = await readLibertyMdDeviceId();
  if (existing) return existing;
  try {
    const { Analytics } = await import('../../services/analytics');
    if (typeof Analytics.ensureDeviceId === 'function') {
      const registered = Analytics.ensureDeviceId();
      return registered == null || registered === '' ? null : String(registered);
    }
  } catch {
    // best-effort
  }
  return null;
}

/**
 * LibertyMD id-only identify. Skips People `$email`. No-op on empty / forbidden ids.
 * Call after anon session success and again after sync_identity / complete_account_merge
 * (surviving id). Do **not** call Analytics.reset() on merge signOut without a
 * guaranteed same-tick re-identify.
 */
export function identifyLibertyMdUser(userId: string): void {
  const id = String(userId || '').trim();
  if (!id || isForbiddenLibertyMdIdentifyTarget(id)) return;

  if (testIdentifyOverride) {
    testIdentifyOverride(id);
    return;
  }

  void (async () => {
    try {
      await ensureLibertyMdDeviceId();
      const { Analytics } = await import('../../services/analytics');
      // Id-only — never pass email (Q8A). Shared AuthContext may still set People $email.
      Analytics.identify(id);
    } catch {
      // Analytics is best-effort; never block the consult path.
    }
  })();
}
