import React from 'react';
import Login from '../auth/Login';
import Dashboard from './Dashboard';
import { useAuth } from '../../context/AuthContext';

const TicketflowApp: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { user, loading, signOut } = useAuth();

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-[#F5F2EB] font-serif italic text-[#2C2A26]/50">Loading Ticketflow...</div>;
    }

    if (!user) {
        return <Login redirectPath="/ticketflow" title="Ticketflow Login" subtitle="Sign in to manage tickets" />;
    }

    // Dashboard expects just a username string (email), which we have in user.email
    return <Dashboard user={user.email || 'User'} onLogout={async () => {
        await signOut();
        onBack();
    }} onBack={onBack} />;
};

export default TicketflowApp;
