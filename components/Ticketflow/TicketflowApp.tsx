import React, { useState, useEffect } from 'react';
import Login from './Login';
import Dashboard from './Dashboard';
import { supabase } from './supabaseClient';

const TicketflowApp: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const [user, setUser] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check active session on load
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user?.email ?? null);
            setLoading(false);
        });

        // Listen for auth state changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user?.email ?? null);
        });

        return () => subscription.unsubscribe();
    }, []);

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-[#F5F2EB] font-serif italic text-[#2C2A26]/50">Loading Ticketflow...</div>;
    }

    if (!user) {
        return <Login onLogin={(username) => setUser(username)} onBack={onBack} />;
    }

    return <Dashboard user={user} onLogout={async () => {
        await supabase.auth.signOut();
        setUser(null);
    }} onBack={onBack} />;
};

export default TicketflowApp;
