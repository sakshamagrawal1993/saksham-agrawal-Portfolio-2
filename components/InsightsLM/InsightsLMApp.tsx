
import React, { useState, useEffect } from 'react';
import Login from './Login';
import Dashboard from './Dashboard';
import { supabase } from './supabaseClient';
import Analytics from '../../services/analytics';

const InsightsLMApp: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const [session, setSession] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check active session
        supabase.auth.getSession().then(({ data: { session } }: { data: { session: any } }) => {
            setSession(session);
            // If logged in, track user
            if (session?.user?.id) {
                Analytics.identify(session.user.id, session.user.email);
            }
            setLoading(false);
        });

        // Listen for auth changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
            setSession(session);
            if (session?.user?.id) {
                Analytics.identify(session.user.id, session.user.email);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        setSession(null);
        onBack(); // Redirect to the previous screen (InsightsLM Product Detail)
    };

    if (loading) {
        return <div className="h-screen flex items-center justify-center bg-[#F5F2EB] font-serif italic text-[#2C2A26]/50">Loading InsightsLM...</div>;
    }

    if (!session) {
        return <Login onLogin={() => { }} onBack={onBack} />;
    }

    return <Dashboard onLogout={handleLogout} onBack={onBack} />;
};

export default InsightsLMApp;
