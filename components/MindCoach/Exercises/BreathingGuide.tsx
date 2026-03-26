import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

interface BreathingGuideProps {
  isActive: boolean;
  instruction: string;
  duration: number;
  timeLeft: number;
}

export const BreathingGuide: React.FC<BreathingGuideProps> = ({ 
  isActive, 
  instruction, 
  duration, 
}) => {
  // Determine if we are expanding, holding, or contracting
  const phase = useMemo(() => {
    const text = instruction.toLowerCase();
    if (text.includes('in')) return 'expand';
    if (text.includes('out')) return 'contract';
    return 'hold';
  }, [instruction]);

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Background Pulse */}
      <motion.div
        className="absolute w-full h-full rounded-full bg-[#6B8F71]/10"
        animate={isActive ? {
          scale: phase === 'expand' ? [1, 1.4] : phase === 'contract' ? [1.4, 1] : 1.4,
          opacity: [0.1, 0.2, 0.1],
        } : { scale: 1, opacity: 0.1 }}
        transition={{ duration: duration, ease: "easeInOut" }}
      />

      {/* Main Circle */}
      <motion.div
        className="relative w-32 h-32 rounded-full bg-white border-2 border-[#6B8F71] shadow-xl flex items-center justify-center z-10"
        animate={isActive ? {
          scale: phase === 'expand' ? [1, 1.4] : phase === 'contract' ? [1.4, 1] : 1.4,
        } : { scale: 1 }}
        transition={{ duration: duration, ease: "easeInOut" }}
      >
        <span className="text-sm font-bold text-[#6B8F71] uppercase tracking-wider">
          {phase === 'expand' ? 'Breathe In' : phase === 'contract' ? 'Breathe Out' : 'Hold'}
        </span>
      </motion.div>

      {/* Particle Effect (Subtle) */}
      {isActive && phase === 'expand' && (
        <motion.div
          className="absolute inset-0 z-0"
          initial={{ rotate: 0 }}
          animate={{ rotate: 360 }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
        >
          <div className="absolute top-0 left-1/2 w-1.5 h-1.5 rounded-full bg-[#6B8F71]/30 -translate-x-1/2" />
          <div className="absolute bottom-0 left-1/2 w-1.5 h-1.5 rounded-full bg-[#6B8F71]/30 -translate-x-1/2" />
        </motion.div>
      )}
    </div>
  );
};
