import React, { useState } from 'react';
import Login from './Login';
import Dashboard from './Dashboard';

const TicketflowApp: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const [user, setUser] = useState<string | null>(null);

    if (!user) {
        return <Login onLogin={(username) => setUser(username)} onBack={onBack} />;
    }

    return <Dashboard user={user} onLogout={() => setUser(null)} onBack={onBack} />;
};

export default TicketflowApp;
