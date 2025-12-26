
import React from 'react';
import Login from '../auth/Login'; // Use main Login
import Dashboard from './Dashboard';
import { useAuth } from '../../context/AuthContext';

const InsightsLMApp: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { session, loading, signOut } = useAuth();

    // Redirect logic on logout is handled by state change, but here we just need to pass signOut
    const handleLogout = async () => {
        await signOut();
        onBack();
    };

    if (loading) {
        return <div className="h-screen flex items-center justify-center bg-[#F5F2EB] font-serif italic text-[#2C2A26]/50">Loading InsightsLM...</div>;
    }

    if (!session) {
        // Reuse the main Login component but configured for inline use if necessary,
        // or just render it. The main Login component uses navigation, so we might need to adjust it
        // OR we can just pass a callback/prop if Login supports it. 
        // Looking at Login.tsx, it redirects to /dashboard.
        // We want it to stay here. 
        // Let's check Login.tsx again. It takes redirectPath.
        return <Login redirectPath="/insightslm" title="InsightsLM Login" subtitle="Sign in to access AI features" />;
    }

    return <Dashboard onLogout={handleLogout} onBack={onBack} />;
};

export default InsightsLMApp;
