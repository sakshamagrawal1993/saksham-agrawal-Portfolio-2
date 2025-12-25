
import React, { useState } from 'react';
import { supabase } from '../../services/journal';
import { useNavigate } from 'react-router-dom';
import Analytics from '../../services/analytics'; // Assuming analytics service exists since it was in InsightsLM

interface LoginProps {
    redirectPath?: string;
    title?: string;
    subtitle?: string;
}

const Login: React.FC<LoginProps> = ({
    redirectPath = '/dashboard',
    title = 'Journal Admin',
    subtitle = 'Sign in to manage content'
}) => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;
            if (data.user) {
                Analytics.identify(data.user.id, email);
                Analytics.track('Sign In', { login_method: 'otp', success: true });
            }
            navigate(redirectPath);
        } catch (error: any) {
            console.error('Login error:', error);
            Analytics.track('Sign In', { login_method: 'otp', success: false });
            Analytics.track('Error', { error_type: 'auth', error_message: error.message });
            setError(error.message || 'Failed to login');
        } finally {
            setLoading(false);
        }
    };

    const handleOAuthLogin = async (provider: 'google' | 'github') => {
        setLoading(true);
        setError(null);
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: provider,
                options: {
                    redirectTo: `${window.location.origin}${redirectPath}`
                }
            });
            if (error) throw error;
        } catch (err: any) {
            setError(err.message || `Failed to sign in with ${provider}`);
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F5F2EB] flex flex-col justify-center items-center p-4 animate-fade-in-up">
            <button
                onClick={() => navigate('/')}
                className="absolute top-8 left-8 text-[#2C2A26]/50 hover:text-[#2C2A26] font-serif italic transition-colors"
            >
                ← Back to Portfolio
            </button>

            <div className="w-full max-w-md bg-white border border-[#D6D1C7] shadow-xl p-8 md:p-12 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500"></div>

                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-serif text-[#2C2A26] mb-2">{title === 'Journal Admin' ? 'Experiments login' : title}</h1>
                    <p className="text-[#2C2A26]/60 font-sans text-sm">{subtitle === 'Sign in to manage content' ? 'Log into a world of AI knowledge' : subtitle}</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-[#2C2A26]/60 mb-2">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-[#F5F2EB] border-b border-[#D6D1C7] px-3 py-2 text-[#2C2A26] focus:outline-none focus:border-[#2C2A26] transition-colors font-serif"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-[#2C2A26]/60 mb-2">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-[#F5F2EB] border-b border-[#D6D1C7] px-3 py-2 text-[#2C2A26] focus:outline-none focus:border-[#2C2A26] transition-colors font-serif"
                            required
                        />
                    </div>

                    {error && <div className="text-red-800 text-xs bg-red-100 p-3 rounded">{error}</div>}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-[#2C2A26] text-[#F5F2EB] py-3 text-xs font-bold uppercase tracking-widest hover:bg-[#2C2A26]/90 transition-all disabled:opacity-50"
                    >
                        {loading ? 'Authenticating...' : 'Sign In with Email'}
                    </button>

                    <div className="relative flex py-2 items-center">
                        <div className="flex-grow border-t border-[#D6D1C7]"></div>
                        <span className="flex-shrink-0 mx-4 text-xs text-[#2C2A26]/40 uppercase tracking-widest">Or</span>
                        <div className="flex-grow border-t border-[#D6D1C7]"></div>
                    </div>

                    <div className="flex flex-col space-y-3">
                        <button
                            type="button"
                            onClick={() => handleOAuthLogin('google')}
                            className="w-full bg-white border border-[#D6D1C7] text-[#2C2A26] py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-[#F5F2EB] transition-all flex items-center justify-center gap-2"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" />
                                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            Google
                        </button>
                        <button
                            type="button"
                            onClick={() => handleOAuthLogin('github')}
                            className="w-full bg-[#24292F] text-white py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-[#24292F]/90 transition-all flex items-center justify-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                            </svg>
                            GitHub
                        </button>
                    </div>

                    <div className="text-center text-[10px] text-[#2C2A26]/40 mt-4">
                        (Authentication Managed by Supabase)
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Login;
