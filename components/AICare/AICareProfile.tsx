import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { ChevronLeft, ShieldCheck, Loader2 } from 'lucide-react';

const MEDICAL_HISTORY_OPTIONS = [
    'Blood Pressure', 'Heart Issues', 'Smoking',
    'Diabetes', 'Asthma/COPD', 'Immuno suppressive conditions'
];

export const AICareProfile: React.FC = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState<any>(null);
    const [name, setName] = useState('');
    const [age, setAge] = useState('');
    const [gender, setGender] = useState<'Male' | 'Female' | 'Other' | ''>('');
    const [comorbidities, setComorbidities] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                navigate('/login?redirect=/ai-care/profile');
            } else {
                setUser(session.user);
                if (session.user.user_metadata?.full_name) {
                    setName(session.user.user_metadata.full_name);
                }
            }
        };
        fetchUser();
    }, [navigate]);

    const toggleComorbidity = (condition: string) => {
        setComorbidities(prev => 
            prev.includes(condition) 
                ? prev.filter(c => c !== condition)
                : [...prev, condition]
        );
    };

    const handleContinue = async () => {
        if (!name || !age || !gender || !user) return;
        setLoading(true);

        try {
            const { error } = await supabase.from('jivi_profiles').insert({
                user_id: user.id,
                name,
                age: parseInt(age, 10),
                gender,
                comorbidities
            });

            if (error) throw error;
            navigate('/ai-care/chat?new=1');
        } catch (error) {
            console.error('Error saving profile:', error);
            alert('Could not save profile.');
        } finally {
            setLoading(false);
        }
    };

    const isFormValid = name.trim() !== '' && age.trim() !== '' && gender !== '';

    return (
        <div className="min-h-screen bg-white font-sans text-gray-900 flex flex-col">
            {/* Header */}
            <header className="border-b border-gray-100 px-4 py-4 flex items-center bg-white sticky top-0 z-10">
                <button onClick={() => navigate('/portfolio')} className="mr-3 p-1">
                    <ChevronLeft className="w-6 h-6" />
                </button>
                <h1 className="text-xl font-semibold">AI Care</h1>
            </header>

            <div className="flex-1 max-w-md w-full mx-auto p-6 flex flex-col">
                <div className="flex items-center mb-8">
                    <button onClick={() => navigate(-1)} className="mr-3">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <h2 className="text-lg font-semibold">Add Profile</h2>
                </div>

                <div className="space-y-6 flex-1">
                    {/* Name */}
                    <div className="relative">
                        <label className="absolute -top-2 left-3 bg-white px-1 text-xs text-gray-500">Your Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="w-full border border-gray-300 rounded-full px-4 py-3 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                            placeholder="e.g. Rahul Chauhan"
                        />
                    </div>

                    {/* Age */}
                    <div className="relative">
                        <label className="absolute -top-2 left-3 bg-white px-1 text-xs text-gray-500">Age (in Years)</label>
                        <input
                            type="number"
                            value={age}
                            onChange={e => setAge(e.target.value)}
                            className="w-full border border-gray-300 rounded-full px-4 py-3 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                            placeholder="e.g. 30"
                        />
                    </div>

                    {/* Gender */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">Select Gender</h3>
                        <div className="grid grid-cols-3 gap-3">
                            {['Male', 'Female', 'Other'].map(g => (
                                <button
                                    key={g}
                                    type="button"
                                    onClick={() => setGender(g as any)}
                                    className={`py-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-colors ${
                                        gender === g 
                                            ? 'border-orange-500 bg-orange-500 text-white' 
                                            : 'border-gray-200 text-gray-600 hover:border-orange-300'
                                    }`}
                                >
                                    <span className="text-2xl">
                                        {g === 'Male' ? '♂' : g === 'Female' ? '♀' : '⚧'}
                                    </span>
                                    <span className="text-sm">{g}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Medical History */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">Medical History</h3>
                        <div className="flex flex-wrap gap-2">
                            {MEDICAL_HISTORY_OPTIONS.map(condition => (
                                <button
                                    key={condition}
                                    type="button"
                                    onClick={() => toggleComorbidity(condition)}
                                    className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
                                        comorbidities.includes(condition)
                                            ? 'border-orange-500 bg-orange-500 text-white'
                                            : 'border-gray-300 text-gray-700 hover:border-gray-400'
                                    }`}
                                >
                                    {condition}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer Area */}
                <div className="mt-8">
                    <div className="flex items-center justify-center gap-2 text-gray-600 mb-6">
                        <ShieldCheck className="w-5 h-5" />
                        <span className="text-sm font-medium">Your Privacy is Protected</span>
                    </div>

                    <button
                        onClick={handleContinue}
                        disabled={!isFormValid || loading}
                        className={`w-full py-4 rounded-full font-semibold text-lg flex items-center justify-center gap-2 transition-colors ${
                            isFormValid && !loading
                                ? 'bg-orange-500 text-white hover:bg-orange-600'
                                : 'bg-gray-300 text-white cursor-not-allowed'
                        }`}
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Continue'}
                        {!loading && <ChevronLeft className="w-5 h-5 rotate-180" />}
                    </button>
                </div>
            </div>
        </div>
    );
};
