import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface BreathingGuideProps {
  instruction: string;
  duration: number;
  timeLeft: number;
  phase: 'inhale' | 'exhale' | 'hold';
  isPlaying: boolean;
  /** Smaller circle for in-chat / narrow layouts */
  compact?: boolean;
}

export const BreathingGuide: React.FC<BreathingGuideProps> = ({
  instruction,
  duration,
  timeLeft,
  phase,
  isPlaying,
  compact = false,
}) => {
  // Determine start/end scales for the current phase
  // Inhale: 1.0 -> 1.5
  // Exhale: 1.5 -> 1.0
  // Hold: stays at 1.5 (or 1.0 if empty)
  const isHoldEmpty = instruction.toLowerCase().includes('empty') || instruction.toLowerCase().includes('out');
  
  const startScale = phase === 'inhale' ? 1.0 : phase === 'exhale' ? 1.5 : (isHoldEmpty ? 1.0 : 1.5);
  const endScale = phase === 'inhale' ? 1.5 : phase === 'exhale' ? 1.0 : (isHoldEmpty ? 1.0 : 1.5);

  const circlePx = compact ? 120 : 180;
  const pulseCls = compact ? 'w-28 h-28' : 'w-40 h-40';
  const timerCls = compact ? 'text-4xl' : 'text-6xl';
  const haloMargin = compact ? '-m-2' : '-m-4';

  return (
    <div className={`flex flex-col items-center justify-center w-full ${compact ? 'space-y-5 py-2' : 'space-y-8 py-4'}`}>
      <div className="relative flex items-center justify-center shrink-0" style={{ width: circlePx + 32, height: circlePx + 32 }}>
        {/* Outer pulse - organic soft shadow */}
        <AnimatePresence>
          {isPlaying && (
            <motion.div
              initial={{ scale: 1, opacity: 0 }}
              animate={{ 
                scale: [1, 1.1, 1], 
                opacity: [0.2, 0.05, 0.2] 
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              className={`absolute rounded-full bg-[#6B8F71]/20 blur-xl ${pulseCls}`}
            />
          )}
        </AnimatePresence>
        
        {/* Main breathing circle */}
        <motion.div
          key={instruction} // Reset animation when instruction changes
          initial={{ scale: startScale }}
          animate={{ scale: isPlaying ? endScale : startScale }}
          transition={{ 
            duration: isPlaying ? duration : 0, 
            ease: "easeInOut" 
          }}
          className="relative rounded-full flex flex-col items-center justify-center text-white shadow-2xl z-30 border-2 sm:border-4 border-white/40"
          style={{
            width: circlePx,
            height: circlePx,
            background: 'linear-gradient(135deg, #6B8F71 0%, #4A6D50 100%)',
            backgroundColor: '#6B8F71',
            boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
          }}
        >
          <motion.span 
            initial={{ opacity: 0.5, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`${timerCls} font-serif tabular-nums font-medium`}
            style={{ color: '#FFFFFF', textShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
          >
            {timeLeft}
          </motion.span>
          <span className="text-[10px] uppercase font-bold tracking-[0.2em] opacity-60 mt-1">
            {phase}
          </span>
        </motion.div>

        {/* Dynamic Halo - Visual feedback of phase */}
        <motion.div
          animate={{ 
            rotate: isPlaying ? 360 : 0,
            scale: isPlaying ? [1, 1.05, 1] : 1
          }}
          transition={{ 
            rotate: { duration: 10, repeat: Infinity, ease: "linear" },
            scale: { duration: 2, repeat: Infinity, ease: "easeInOut" }
          }}
          className={`absolute inset-0 rounded-full border border-[#6B8F71]/10 ${haloMargin}`}
        />
      </div>

      <div className={`text-center w-full px-2 sm:px-4 ${compact ? 'space-y-3' : 'space-y-4'}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={instruction}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className={`flex items-center justify-center ${compact ? 'min-h-0 py-1' : 'h-12'}`}
          >
            <h4 className={`font-serif text-[#2C2A26] leading-snug ${compact ? 'text-base sm:text-lg' : 'text-xl leading-tight'}`}>
              {instruction}
            </h4>
          </motion.div>
        </AnimatePresence>

        {/* Phase Indicators */}
        <div className="flex gap-3 justify-center">
          <div className={`h-1.5 rounded-full transition-all duration-500 ${phase === 'inhale' ? 'w-8 bg-[#6B8F71]' : 'w-2 bg-[#E8E4DE]'}`} />
          <div className={`h-1.5 rounded-full transition-all duration-500 ${phase === 'hold' ? 'w-8 bg-[#6B8F71]' : 'w-2 bg-[#E8E4DE]'}`} />
          <div className={`h-1.5 rounded-full transition-all duration-500 ${phase === 'exhale' ? 'w-8 bg-[#6B8F71]' : 'w-2 bg-[#E8E4DE]'}`} />
        </div>
      </div>
    </div>
  );
};
