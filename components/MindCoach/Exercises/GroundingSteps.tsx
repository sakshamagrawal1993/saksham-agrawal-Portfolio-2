import React from 'react';
import { motion } from 'framer-motion';
import { Eye, Hand, Ear, Sun, Utensils } from 'lucide-react';

interface GroundingStepsProps {
  step: { instruction: string; duration: number };
  index: number;
  total: number;
}

export const GroundingSteps: React.FC<GroundingStepsProps> = ({ 
  step, 
  index, 
  total 
}) => {
  // Map icons for common 5-4-3-2-1 steps
  const getIcon = (instruction: string) => {
    const text = instruction.toLowerCase();
    if (text.includes('see')) return <Eye className="text-[#6B8F71]" size={40} />;
    if (text.includes('touch') || text.includes('feel')) return <Hand className="text-[#6B8F71]" size={40} />;
    if (text.includes('hear')) return <Ear className="text-[#6B8F71]" size={40} />;
    if (text.includes('smell')) return <Sun className="text-[#6B8F71]" size={40} />;
    if (text.includes('taste')) return <Utensils className="text-[#6B8F71]" size={40} />;
    return <Eye className="text-[#6B8F71]" size={40} />;
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center space-y-6">
      {/* Decorative Ring */}
      <div className="absolute inset-0 rounded-full border-2 border-[#6B8F71]/10 flex items-center justify-center">
        <div className="w-[85%] h-[85%] rounded-full border border-[#6B8F71]/5" />
      </div>

      {/* Main Icon */}
      <motion.div
        key={index}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 100 }}
        className="relative w-24 h-24 rounded-full bg-[#6B8F71]/5 border border-[#6B8F71]/10 flex items-center justify-center z-10 shadow-sm"
      >
        {getIcon(step.instruction)}
      </motion.div>

      {/* Step Indicators */}
      <div className="flex gap-2 z-10">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === index 
                ? 'w-6 bg-[#6B8F71]' 
                : i < index 
                  ? 'w-1.5 bg-[#6B8F71]/40' 
                  : 'w-1.5 bg-[#E8E4DE]'
            }`}
          />
        ))}
      </div>
    </div>
  );
};
