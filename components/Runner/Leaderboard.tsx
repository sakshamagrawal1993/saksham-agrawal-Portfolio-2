import React, { useState, useEffect } from 'react';
import { LeaderboardEntry, LeaderboardService } from '../../services/leaderboardService';

interface LeaderboardProps {
    currentScore: number;
    onRestart: () => void;
}

const Leaderboard: React.FC<LeaderboardProps> = ({ currentScore, onRestart }) => {
    const [scores, setScores] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [isTopScore, setIsTopScore] = useState(false);
    const [name, setName] = useState('');
    const [submitted, setSubmitted] = useState(false);

    useEffect(() => {
        const checkScore = async () => {
            setLoading(true);
            const isTop = await LeaderboardService.isTopScore(currentScore);
            setIsTopScore(isTop);

            if (!isTop) {
                // Just fetch list
                refreshScores();
            } else {
                setLoading(false);
            }
        };
        checkScore();
    }, [currentScore]);

    const refreshScores = async () => {
        setLoading(true);
        const data = await LeaderboardService.getTopScores();
        setScores(data);
        setLoading(false);
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setLoading(true);
        try {
            // Ensure score is an integer
            await LeaderboardService.submitScore(name, Math.floor(currentScore));
            setSubmitted(true);
            setIsTopScore(false); // Hide input
            refreshScores(); // Show table
        } catch (error: any) {
            console.error(error);
            alert('Failed to submit score: ' + (error.message || 'Unknown error'));
            setLoading(false);
        }
    };

    if (loading && scores.length === 0 && !isTopScore) {
        return <div className="text-white text-xl animate-pulse">Checking records...</div>;
    }

    if (isTopScore && !submitted) {
        return (
            <div className="flex flex-col items-center animate-fade-in-up">
                <div className="text-6xl mb-4">🏆</div>
                <h2 className="text-4xl font-bold text-yellow-400 mb-2 text-center">NEW RECORD!</h2>
                <p className="text-slate-300 mb-6 text-center">You placed in the top 10!</p>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-xs">
                    <input
                        type="text"
                        placeholder="Enter your name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="px-4 py-3 bg-slate-800 border border-yellow-400/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-yellow-400 text-center uppercase tracking-widest font-bold"
                        maxLength={10}
                        autoFocus
                    />
                    <button
                        type="submit"
                        disabled={!name.trim() || loading}
                        className="px-6 py-3 bg-yellow-400 text-slate-900 font-bold rounded-lg hover:bg-yellow-300 disabled:opacity-50 transition-colors uppercase tracking-wider"
                    >
                        {loading ? 'Saving...' : 'Submit Score'}
                    </button>
                    <button
                        type="button"
                        onClick={() => { setIsTopScore(false); refreshScores(); }}
                        className="text-slate-500 text-xs hover:text-slate-300 underline"
                    >
                        Skip
                    </button>
                </form>
            </div>
        )
    }

    return (
        <div className="flex flex-col items-center w-full max-w-md animate-fade-in-up">
            <h2 className="text-2xl font-bold text-slate-200 mb-6 uppercase tracking-widest border-b-2 border-slate-700 pb-2">Top Runners</h2>

            <div className="w-full bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden mb-8">
                {scores.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">No records yet. Be the first!</div>
                ) : (
                    <div className="flex flex-col">
                        {scores.map((entry, idx) => (
                            <div
                                key={entry.id}
                                className={`flex justify-between items-center p-3 border-b border-slate-700/50 last:border-0 ${entry.score === currentScore && submitted ? 'bg-yellow-400/20' : ''}`}
                            >
                                <div className="flex items-center gap-4">
                                    <span className={`font-bold w-6 text-right ${idx < 3 ? 'text-yellow-400' : 'text-slate-500'}`}>
                                        #{idx + 1}
                                    </span>
                                    <span className="text-white font-medium uppercase tracking-wide">
                                        {entry.player_name}
                                    </span>
                                </div>
                                <span className={`font-mono font-bold ${idx < 3 ? 'text-white' : 'text-slate-400'}`}>
                                    {Math.floor(entry.score)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <button
                onClick={onRestart}
                className="px-8 py-3 bg-white text-slate-900 rounded-full font-bold text-lg hover:bg-slate-200 transition-colors shadow-lg"
            >
                PLAY AGAIN
            </button>
        </div>
    );
};

export default Leaderboard;
