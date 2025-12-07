import React, { useEffect } from 'react';
import { useRunnerStore } from './store';
import { Canvas } from '@react-three/fiber';
import Game from './Game';

interface RunnerAppProps {
    onBack: () => void;
}

const RunnerApp: React.FC<RunnerAppProps> = ({ onBack }) => {
    const { status, startGame, resetGame, score, lives, highScore, distance } = useRunnerStore();

    useEffect(() => {
        // Reset game on unmount
        return () => resetGame();
    }, [resetGame]);

    return (
        <div className="w-full h-screen bg-slate-900 text-white relative overflow-hidden font-mono">
            {/* HUD - Head Up Display */}
            {status !== 'idle' && (
                <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start z-10 pointer-events-none">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-3xl font-bold text-yellow-400 drop-shadow-md">SCORE: {Math.floor(score)}</h2>
                        <p className="text-sm text-slate-400">HI: {Math.floor(highScore)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <div className="flex gap-1 text-2xl text-red-500">
                            {Array.from({ length: Math.max(0, lives) }).map((_, i) => (
                                <span key={i}>♥</span>
                            ))}
                        </div>
                        <p className="text-xl text-blue-300 font-bold">{Math.floor(distance)}m</p>
                    </div>
                </div>
            )}

            {/* Back Button */}
            <button
                onClick={onBack}
                className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1 bg-white/10 hover:bg-white/20 backdrop-blur rounded-full text-xs text-white/50 transition-colors"
            >
                Exit Game
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

const GameOverScreen = ({ score, highScore, onRestart }: { score: number, highScore: number, onRestart: () => void }) => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-10">
        <h2 className="text-5xl font-bold text-red-500 mb-2">GAME OVER</h2>
        <p className="text-slate-400 mb-8">You hit an obstacle!</p>

        <div className="flex gap-12 mb-12">
            <div className="text-center">
                <p className="text-sm text-slate-500 uppercase tracking-wider mb-1">Score</p>
                <p className="text-4xl text-white font-bold">{Math.floor(score)}</p>
            </div>
            <div className="text-center">
                <p className="text-sm text-slate-500 uppercase tracking-wider mb-1">Best</p>
                <p className="text-4xl text-yellow-400 font-bold">{Math.floor(highScore)}</p>
            </div>
        </div>

        <button
            onClick={onRestart}
            className="px-8 py-3 bg-white text-slate-900 rounded-full font-bold text-lg hover:bg-slate-200 transition-colors"
        >
            TRY AGAIN
        </button>
    </div>
);

const GameContent = () => (
    <Canvas shadows camera={{ position: [0, 2, 5], fov: 60 }}>
        <color attach="background" args={['#0f172a']} />
        <fog attach="fog" args={['#0f172a', 5, 20]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 10, 5]} intensity={1} castShadow />

        <React.Suspense fallback={null}>
            <Game />
        </React.Suspense>
    </Canvas>
);

export default RunnerApp;
