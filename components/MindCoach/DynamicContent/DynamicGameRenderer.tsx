import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DYNAMIC_GAMES } from '../../../lib/dynamicContentLibrary';

interface DynamicGameRendererProps {
    payload: string; // The game ID
}

export const DynamicGameRenderer: React.FC<DynamicGameRendererProps> = ({ payload }) => {
    const gameDef = DYNAMIC_GAMES[payload];

    if (!gameDef) {
        return (
            <div className="p-3 bg-[#F5F0EB] text-[#2C2A26] rounded-xl text-xs italic opacity-70">
                Exercise unavailable.
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-2 w-[260px] md:w-[320px] rounded-2xl overflow-hidden border border-[#E8E4DE] bg-white shadow-sm p-4"
        >
            <h4 className="text-sm font-semibold text-[#2C2A26] mb-1">{gameDef.title}</h4>
            <p className="text-xs text-[#2C2A26]/70 mb-4">{gameDef.description}</p>

            {gameDef.type === 'box_breathing' && <BoxBreathingGame />}
            {gameDef.type === 'senses_54321' && <SensesGame />}
        </motion.div>
    );
};

// --- BOX BREATHING ---
const BoxBreathingGame = () => {
    const [phase, setPhase] = useState<'Inhale' | 'Hold (Full)' | 'Exhale' | 'Hold (Empty)'>('Inhale');
    const [isActive, setIsActive] = useState(false);

    useEffect(() => {
        if (!isActive) return;

        let currentPhase = 0;
        const phases: typeof phase[] = ['Inhale', 'Hold (Full)', 'Exhale', 'Hold (Empty)'];

        const interval = setInterval(() => {
            currentPhase = (currentPhase + 1) % phases.length;
            setPhase(phases[currentPhase]);
        }, 4000); // 4 seconds per phase

        return () => clearInterval(interval);
    }, [isActive]);

    const getScale = () => {
        switch (phase) {
            case 'Inhale': return 1.5;
            case 'Hold (Full)': return 1.5;
            case 'Exhale': return 1;
            case 'Hold (Empty)': return 1;
            default: return 1;
        }
    };

    return (
        <div className="flex flex-col items-center justify-center py-6">
            <div className="relative w-32 h-32 flex items-center justify-center">
                {/* Breathing Circle */}
                <motion.div
                    animate={{ scale: isActive ? getScale() : 1 }}
                    transition={{ duration: 4, ease: "linear" }}
                    className="w-16 h-16 rounded-full bg-[#6B8F71]/20 border-2 border-[#6B8F71]"
                />
                {/* Core Dot */}
                <div className="absolute w-2 h-2 rounded-full bg-[#6B8F71]" />

                {isActive && (
                    <motion.div
                        key={phase}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute -bottom-8 text-sm font-semibold text-[#6B8F71] tracking-widest uppercase"
                    >
                        {phase}
                    </motion.div>
                )}
            </div>

            <button
                onClick={() => setIsActive(!isActive)}
                className="mt-10 px-6 py-2 bg-[#6B8F71] text-white text-xs font-semibold rounded-full hover:bg-[#5A7A5F] transition-colors"
            >
                {isActive ? 'Stop' : 'Start Exercise'}
            </button>
        </div>
    );
};

// --- 5-4-3-2-1 SENSES ---
const SensesGame = () => {
    const prompts = [
        { num: 5, label: "Things you can see", id: "see" },
        { num: 4, label: "Things you can physically feel", id: "feel" },
        { num: 3, label: "Things you can hear", id: "hear" },
        { num: 2, label: "Things you can smell", id: "smell" },
        { num: 1, label: "Thing you can taste", id: "taste" },
    ];

    const [completed, setCompleted] = useState<Record<string, boolean>>({});

    const toggle = (id: string) => {
        setCompleted(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const allDone = prompts.every(p => completed[p.id]);

    return (
        <div className="flex flex-col gap-3 mt-4">
            {prompts.map((p) => (
                <button
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${completed[p.id]
                            ? 'bg-[#6B8F71]/10 border-[#6B8F71]/30 opacity-60'
                            : 'bg-[#F9F6F2] border-[#E8E4DE] hover:border-[#6B8F71]/50'
                        }`}
                >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${completed[p.id] ? 'bg-[#6B8F71] text-white' : 'bg-white text-[#2C2A26] shadow-sm'
                        }`}>
                        {completed[p.id] ? '✓' : p.num}
                    </div>
                    <span className={`text-sm ${completed[p.id] ? 'line-through text-[#2C2A26]/50' : 'text-[#2C2A26] font-medium'}`}>
                        {p.label}
                    </span>
                </button>
            ))}

            <AnimatePresence>
                {allDone && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mt-2 text-center text-xs font-semibold text-[#6B8F71] py-2 bg-[#6B8F71]/10 rounded-lg"
                    >
                        Excellent job grounding yourself.
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
