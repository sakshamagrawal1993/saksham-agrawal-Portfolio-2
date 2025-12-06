import React, { useState } from 'react';
import { supabase } from './supabaseClient';

interface LoginProps {
    onLogin: (username: string) => void;
    onBack: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin, onBack }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!username || !password) {
            setError('Please enter both username and password');
            return;
        }

        try {
            const { data, error } = await supabase
                .from('users')
                .select('username')
                .eq('username', username)
                .eq('password', password)
                .single();

            if (error || !data) {
                setError('Invalid username or password');
            } else {
                onLogin(data.username);
            }
        } catch (err) {
            setError('Login failed. Please check connection.');
            console.error(err);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#F5F2EB] p-4 text-[#2C2A26]">
            <button
                onClick={onBack}
                className="absolute top-6 left-6 text-[#2C2A26]/60 hover:text-[#2C2A26] font-medium transition-colors font-serif italic text-lg"
            >
                ← Back to Portfolio
            </button>
            <div className="w-full max-w-md">
                <div className="text-center mb-10">
                    <h1 className="text-4xl md:text-5xl font-serif text-[#2C2A26] mb-3">Ticketflow</h1>
                    <p className="text-[#2C2A26]/70 uppercase tracking-widest text-xs font-bold">Operator Access</p>
                </div>

                {error && <div className="bg-red-50 border border-red-100 text-red-900/80 text-sm p-4 mb-6 font-medium text-center">{error}</div>}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-1">
                        <label className="block text-[#2C2A26] text-xs font-bold uppercase tracking-widest mb-2">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full bg-white border border-[#D6D1C7] p-3 text-[#2C2A26] placeholder-[#2C2A26]/30 focus:outline-none focus:border-[#2C2A26] transition-colors"
                            placeholder="Enter username"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="block text-[#2C2A26] text-xs font-bold uppercase tracking-widest mb-2">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-white border border-[#D6D1C7] p-3 text-[#2C2A26] placeholder-[#2C2A26]/30 focus:outline-none focus:border-[#2C2A26] transition-colors"
                            placeholder="Enter password"
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full bg-[#2C2A26] text-[#F5F2EB] p-3.5 hover:bg-[#45423C] transition-colors font-medium text-sm uppercase tracking-wide mt-4"
                    >
                        Login
                    </button>

                    <p className="text-center text-xs text-[#2C2A26]/40 mt-8 font-serif italic">
                        Secured by Supabase
                    </p>
                </form>
            </div>
        </div>
    );
};

export default Login;
