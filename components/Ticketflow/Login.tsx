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
            setError('Please enter both email and password');
            return;
        }

        try {
            // Use Supabase Auth
            const { data, error } = await supabase.auth.signInWithPassword({
                email: username, // Assuming username input is used for email in Supabase Auth
                password: password,
            });

            if (error) {
                setError(error.message); // Show actual auth error
            } else if (data.user) {
                onLogin(data.user.email || 'User');
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
                        <label className="block text-[#2C2A26] text-xs font-bold uppercase tracking-widest mb-2">Email</label>
                        <input
                            type="email"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full bg-white border border-[#D6D1C7] p-3 text-[#2C2A26] placeholder-[#2C2A26]/30 focus:outline-none focus:border-[#2C2A26] transition-colors"
                            placeholder="Enter email"
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

                    <div className="relative flex py-2 items-center">
                        <div className="flex-grow border-t border-[#D6D1C7]"></div>
                        <span className="flex-shrink-0 mx-4 text-xs text-[#2C2A26]/40 uppercase tracking-widest">Or</span>
                        <div className="flex-grow border-t border-[#D6D1C7]"></div>
                    </div>

                    <button
                        type="button"
                        onClick={async () => {
                            try {
                                const { error } = await supabase.auth.signInWithOAuth({
                                    provider: 'google',
                                    options: {
                                        redirectTo: `${window.location.origin}/ticketflow`
                                    }
                                });
                                if (error) throw error;
                            } catch (err: any) {
                                setError(err.message || 'Failed to sign in with Google');
                            }
                        }}
                        className="w-full bg-white border border-[#D6D1C7] text-[#2C2A26] py-3 text-xs font-bold uppercase tracking-widest hover:bg-[#F5F2EB] transition-all flex items-center justify-center gap-2"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" />
                            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        Sign in with Google
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
