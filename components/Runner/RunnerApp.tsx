import React, { useEffect } from 'react';
import { useRunnerStore } from './store';
import { Canvas } from '@react-three/fiber';
// Game Component
import RunnerScene from './RunnerScene';

interface RunnerAppProps {
    onBack: () => void;
}

const RunnerApp: React.FC<RunnerAppProps> = ({ onBack }) => {
    const { status, startGame, resetGame, score, lives, highScore, distance } = useRunnerStore();

    useEffect(() => {
        // Reset game on unmount
        return () => resetGame();
    }, [resetGame]);

    // Touch Handling
    const touchStart = React.useRef<{ x: number, y: number } | null>(null);

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (!touchStart.current) return;
        const diffX = e.changedTouches[0].clientX - touchStart.current.x;
        const diffY = e.changedTouches[0].clientY - touchStart.current.y;
        touchStart.current = null;

        // Determine swipe direction
        if (Math.abs(diffX) > Math.abs(diffY)) {
            // Horizontal Swipe
            if (Math.abs(diffX) > 30) { // Threshold
                const { playerLane, setPlayerLane } = useRunnerStore.getState();
                if (diffX > 0 && playerLane < 1) setPlayerLane(playerLane + 1);
                if (diffX < 0 && playerLane > -1) setPlayerLane(playerLane - 1);
            }
        } else {
            // Vertical Swipe
            if (diffY < -30) { // Swipe Up
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
            }
        }
    };

    return (
        <div
            className="w-full h-screen bg-slate-900 text-white relative overflow-hidden font-mono touch-none"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            {/* HUD - Head Up Display */}
            {status !== 'idle' && (
                <div className="absolute top-24 left-0 w-full px-8 py-2 flex justify-between items-start z-10 pointer-events-none">
                    <div className="flex flex-col gap-1 bg-slate-900/50 p-2 rounded-lg border border-slate-700/50 backdrop-blur-sm">
                        <div className="flex items-baseline gap-2">
                            <h2 className="text-2xl font-bold text-yellow-400 drop-shadow-md">SCORE</h2>
                            <span className="text-3xl text-white font-bold">{Math.floor(score)}</span>
                        </div>
                        <p className="text-xs text-slate-400 font-bold tracking-wider">HI {Math.floor(highScore)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <div className="flex gap-1 text-2xl text-red-500 drop-shadow-sm filter">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <span key={i} className={`transition-opacity ${i < lives ? 'opacity-100' : 'opacity-20'}`}>♥</span>
                            ))}
                        </div>
                        <div className="px-3 py-1 bg-blue-900/50 rounded text-blue-200 font-bold border border-blue-500/30">
                            {Math.floor(distance)}m
                        </div>
                    </div>
                </div>
            )}

            {/* Back Button */}
            <button
                onClick={onBack}
                className="absolute top-24 right-4 md:right-8 z-50 px-4 py-2 bg-red-500/80 hover:bg-red-600 text-white rounded-lg font-bold text-xs md:text-sm transition-colors shadow-lg pointer-events-auto backdrop-blur-sm border border-red-400/30"
            >
                EXIT
            </button>

            {/* Main Content */}
            <div className="w-full h-full">
                {status === 'idle' && <LandingScreen onPlay={startGame} highScore={highScore} />}
                {status === 'playing' && <GameContent />}
                {status === 'gameover' && <GameOverScreen score={score} highScore={highScore} onRestart={startGame} />}
            </div>
        </div>
    );
};

const LandingScreen = ({ onPlay, highScore }: { onPlay: () => void, highScore: number }) => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-10">
        <h1 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 mb-2">RUNNER</h1>
        <p className="text-slate-400 mb-8 tracking-widest text-sm">ENDLESS DIMENSION JUMPER</p>

        <div className="space-y-4 text-center mb-12">
            <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700 max-w-sm">
                <h3 className="text-yellow-400 mb-4 font-bold tracking-wider">CONTROLS</h3>
                <div className="grid grid-cols-2 gap-4 text-sm text-slate-300">
                    <div className="flex flex-col items-center">
                        <div className="flex gap-1 mb-2">
                            <span className="p-1.5 bg-slate-700 rounded">←</span>
                            <span className="p-1.5 bg-slate-700 rounded">→</span>
                        </div>
                        <span>Switch Lane</span>
                    </div>
                    <div className="flex flex-col items-center">
                        <div className="mb-2">
                            <span className="p-1.5 bg-slate-700 rounded">↑</span>
                        </div>
                        <span>Jump Gap</span>
                    </div>
                </div>
            </div>
        </div>

        <button
            onClick={onPlay}
            className="px-8 py-4 bg-yellow-400 hover:bg-yellow-300 text-slate-900 rounded-full font-bold text-xl transition-transform hover:scale-105 active:scale-95 shadow-lg shadow-yellow-400/20"
        >
            START RUNNING
        </button>

        {highScore > 0 && <p className="mt-6 text-slate-500">Best Run: {Math.floor(highScore)}</p>}
    </div>
);

import Leaderboard from './Leaderboard';

const GameOverScreen = ({ score, highScore, onRestart }: { score: number, highScore: number, onRestart: () => void }) => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 backdrop-blur-md z-10 p-4">
        <h2 className="text-5xl font-bold text-red-500 mb-2 drop-shadow-md">GAME OVER</h2>
        <p className="text-slate-400 mb-8 uppercase tracking-widest text-xs">Run Complete</p>

        <div className="flex gap-12 mb-8">
            <div className="text-center">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Score</p>
                <p className="text-4xl text-white font-bold">{Math.floor(score)}</p>
            </div>
            <div className="text-center">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Session Best</p>
                <p className="text-4xl text-yellow-400 font-bold">{Math.floor(highScore)}</p>
            </div>
        </div>

        {/* Leaderboard Section handles the rest (Celebration or List) */}
        <Leaderboard currentScore={score} onRestart={onRestart} />
    </div>
);

const GameContent = () => (
    <Canvas shadows camera={{ position: [0, 2, 5], fov: 60 }}>
        <color attach="background" args={['#0f172a']} />
        <fog attach="fog" args={['#0f172a', 5, 20]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 10, 5]} intensity={1} castShadow />

        <React.Suspense fallback={null}>
            <RunnerScene />
        </React.Suspense>
    </Canvas>
);

export default RunnerApp;
