import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface BreathingGuideProps {
  instruction: string;
  duration: number;
  timeLeft: number;
  phase: 'inhale' | 'exhale' | 'hold';
}

export const BreathingGuide: React.FC<BreathingGuideProps> = ({ instruction, duration, timeLeft, phase }) => {
  // Calculate scale based on phase
  // Inhale: starts small, goes large
  // Exhale: starts large, goes small
  // Hold: stays at current size
  
  const getScale = () => {
    if (phase === 'inhale') return [1, 1.5];
    if (phase === 'exhale') return [1.5, 1];
    return 1; // Hold or default
  };

  const currentScale = phase === 'inhale' ? 1 + (1 - timeLeft / duration) * 0.5 :
                       phase === 'exhale' ? 1 + (timeLeft / duration) * 0.5 : 
                       instruction.toLowerCase().includes('empty') ? 1 : 1.5;

  return (
    <div className="flex flex-col items-center justify-center space-y-12 py-8">
      <div className="relative flex items-center justify-center">
        {/* Outer pulse */}
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.1, 0.3] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute w-48 h-48 rounded-full bg-[#6B8F71]/10"
        />
        
        {/* Main breathing circle */}
        <motion.div
          animate={{ scale: currentScale }}
          transition={{ duration: 1, ease: 'linear' }}
          className="w-48 h-48 rounded-full bg-gradient-to-br from-[#6B8F71] to-[#5A7D60] flex flex-col items-center justify-center text-white shadow-xl z-10"
        >
          <span className="text-5xl font-serif tabular-nums">{timeLeft}</span>
          <span className="text-xs uppercase tracking-widest font-medium opacity-70 mt-1">seconds</span>
        </motion.div>
      </div>

      <div className="text-center space-y-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={instruction}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="h-12 flex items-center justify-center"
          >
            <h4 className="text-2xl font-serif text-[#2C2A26] px-4">{instruction}</h4>
          </motion.div>
        </AnimatePresence>
        
        <div className="flex gap-2 justify-center">
          <div className={`w-2 h-2 rounded-full transition-all duration-500 ${phase === 'inhale' ? 'bg-[#6B8F71] scale-125' : 'bg-[#E8E4DE]'}`} />
          <div className={`w-2 h-2 rounded-full transition-all duration-500 ${phase === 'hold' ? 'bg-[#6B8F71] scale-125' : 'bg-[#E8E4DE]'}`} />
          <div className={`w-2 h-2 rounded-full transition-all duration-500 ${phase === 'exhale' ? 'bg-[#6B8F71] scale-125' : 'bg-[#E8E4DE]'}`} />
        </div>
      </div>
    </div>
  );
};
