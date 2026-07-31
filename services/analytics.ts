import mixpanel from 'mixpanel-browser';

const MIXPANEL_TOKEN = import.meta.env.VITE_MIXPANEL_TOKEN || 'YOUR_MIXPANEL_TOKEN';

// Initialize Mixpanel
// Initialize Mixpanel safely
if (MIXPANEL_TOKEN && MIXPANEL_TOKEN !== 'YOUR_MIXPANEL_TOKEN' && MIXPANEL_TOKEN !== 'INSERT_MIXPANEL_TOKEN_HERE') {
    mixpanel.init(MIXPANEL_TOKEN, {
        debug: false,
        ignore_dnt: true,
        track_pageview: true,
        persistence: 'localStorage',
        autocapture: true, // @ts-ignore
        record_sessions_percent: 100,
        // P1-18 defense-in-depth (not AC1): pin SDK text mask for non-clinical pages / races.
        // Clinical AC1 is pathname stop + record_sessions_percent: 0 via libertymd-session-replay.
        record_mask_text_selector: '*',
    });
} else {
    console.warn('Mixpanel Token missing or invalid. Analytics disabled.');
}

export const Analytics = {
    identify: (id: string, email?: string) => {
        mixpanel.identify(id);
        if (email) {
            mixpanel.people.set({
                $email: email,
                $last_login: new Date(),
            });
        }
    },

    /** Read Mixpanel distinct_id (post-identify = Supabase user id for LibertyMD). */
    getDistinctId: (): string | undefined => {
        try {
            return mixpanel.get_distinct_id?.();
        } catch {
            return undefined;
        }
    },

    /**
     * Read SDK `$device_id` (localStorage persistence). Used by LibertyMD Simplified
     * ID Merge before identify — never invent a second durable person-key cookie.
     */
    getDeviceId: (): string | undefined => {
        try {
            const value = mixpanel.get_property?.('$device_id');
            return value == null || value === '' ? undefined : String(value);
        } catch {
            return undefined;
        }
    },

    /**
     * If `$device_id` is absent (mocked / edge SDK), register once via `register`.
     * Does not displace Supabase `user.id` as distinct_id after identify.
     */
    ensureDeviceId: (): string | undefined => {
        try {
            const existing = Analytics.getDeviceId();
            if (existing) return existing;
            const generated =
                (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
                    ? crypto.randomUUID()
                    : `mp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            mixpanel.register?.({ $device_id: generated });
            return Analytics.getDeviceId() || generated;
        } catch {
            return undefined;
        }
    },

    reset: () => {
        mixpanel.reset();
    },

    track: (name: string, properties: Record<string, any> = {}) => {
        try {
            mixpanel.track(name, properties);
        } catch (error) {
            console.error('Mixpanel track error:', error);
        }
    },

    trackPageView: (path: string) => {
        mixpanel.track('Page View', {
            page_url: window.location.href,
            page_title: document.title,
            path: path,
        });
    },

    /** Soft-fail Mixpanel `set_config` — LibertyMD clinical Replay / autocapture gate (P1-18). */
    setConfig: (config: Record<string, unknown>) => {
        try {
            mixpanel.set_config?.(config as Parameters<typeof mixpanel.set_config>[0]);
        } catch {
            // best-effort
        }
    },

    /** Soft-fail stop — clinical surfaces call via libertymd-session-replay. */
    stopSessionRecording: () => {
        try {
            mixpanel.stop_session_recording?.();
        } catch {
            // best-effort
        }
    },

    /** Soft-fail start — restore non-clinical portfolio Replay after leaving `/liberty-md*`. */
    startSessionRecording: () => {
        try {
            mixpanel.start_session_recording?.();
        } catch {
            // best-effort
        }
    },
};

export default Analytics;
