import mixpanel from 'mixpanel-browser';

const MIXPANEL_TOKEN = import.meta.env.VITE_MIXPANEL_TOKEN || 'YOUR_MIXPANEL_TOKEN';

// Initialize Mixpanel
// Initialize Mixpanel safely
if (MIXPANEL_TOKEN && MIXPANEL_TOKEN !== 'YOUR_MIXPANEL_TOKEN' && MIXPANEL_TOKEN !== 'INSERT_MIXPANEL_TOKEN_HERE') {
    mixpanel.init(MIXPANEL_TOKEN, {
        debug: true,
        track_pageview: true,
        persistence: 'localStorage',
        autocapture: true, // @ts-ignore
        record_sessions_percent: 100,
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
    }
};

export default Analytics;
