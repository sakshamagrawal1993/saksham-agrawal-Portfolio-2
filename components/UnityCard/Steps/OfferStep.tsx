import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, Gift } from 'lucide-react';
import StepIllustration from '../StepIllustration';

export default function OfferStep({ onNext }: { onNext: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      className="w-full max-w-sm mx-auto text-center py-4 relative"
    >
      <StepIllustration 
        icon={<Gift className="w-12 h-12 text-[#FF0080]" />}
        badge={<Sparkles className="w-5 h-5 text-[#F5A623]" />}
      />
      
      <h2 className="text-3xl font-bold mb-4 text-[#2C2A26] tracking-tight relative z-10 font-serif">
        Flex your finances <br/>
        <span className="text-[#0070F3]">like a pro.</span>
      </h2>
      
      <p className="text-gray-500 mb-8 relative z-10 font-medium">
        Enjoy limit up to <strong className="text-[#2C2A26] text-xl ml-1 font-bold">₹3,00,000</strong>
      </p>

      <div className="bg-[#F8F6F0] border border-[#E5E0D8] rounded-2xl p-3 mb-8 inline-block shadow-sm relative z-10">
        <span className="font-semibold text-[#0070F3] tracking-wider uppercase text-xs">Lifetime Free</span>
      </div>

      <button 
        onClick={onNext}
        className="w-full bg-[#2C2A26] text-white font-semibold py-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 relative z-10 hover:bg-black"
      >
        Apply Now <ArrowRight className="w-5 h-5" />
      </button>
    </motion.div>
  );
}
