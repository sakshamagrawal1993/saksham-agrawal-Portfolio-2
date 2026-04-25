import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Type, Palette, Sparkles } from 'lucide-react';
import { useUnityCardStore } from '../../../store/unityCardStore';
import StepIllustration from '../StepIllustration';

export default function CustomizationStep({ onNext }: { onNext: () => void }) {
  const { setCustomization, fullName } = useUnityCardStore();
  const [nameOnCard, setNameOnCard] = useState(fullName || '');
  const [pepDeclaration, setPepDeclaration] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameOnCard && pepDeclaration) {
      setCustomization(nameOnCard, pepDeclaration);
      onNext();
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="w-full max-w-sm mx-auto"
    >
      <StepIllustration 
        icon={<Palette className="w-12 h-12 text-[#F5A623]" />}
        badge={<Sparkles className="w-5 h-5 text-[#0070F3]" />}
      />
      <div className="flex justify-between items-start mb-8 text-center flex-col items-center">
        <h2 className="text-2xl font-bold mb-1 text-[#2C2A26] font-serif">Final Touches</h2>
        <p className="text-gray-500 font-medium text-sm">Customize your card.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">Name to be printed on Card</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Type className="h-5 w-5 text-gray-400" />
            </div>
            <input 
              type="text" 
              required
              maxLength={20}
              className="block w-full pl-10 pr-4 py-3.5 border border-[#E5E0D8] rounded-xl bg-[#F8F6F0] text-[#2C2A26] focus:outline-none focus:ring-2 focus:ring-[#0070F3]/20 focus:border-[#0070F3] transition-all uppercase font-medium text-base tracking-wider"
              value={nameOnCard}
              onChange={(e) => setNameOnCard(e.target.value.toUpperCase())}
            />
          </div>
        </div>

        <div className="bg-[#F8F6F0] p-4 rounded-xl border border-[#E5E0D8]">
          <label className="flex items-start gap-3 cursor-pointer">
            <input 
              type="checkbox" 
              required
              className="mt-0.5 accent-[#0070F3] w-4 h-4 flex-shrink-0"
              checked={pepDeclaration}
              onChange={(e) => setPepDeclaration(e.target.checked)}
            />
            <span className="text-xs text-gray-500 font-medium leading-relaxed">
              I declare that I am an Indian citizen, resident of India, and NOT a Politically Exposed Person (PEP) or related to a PEP.
            </span>
          </label>
        </div>

        <button 
          type="submit"
          className="w-full bg-[#2C2A26] text-white font-semibold py-4 rounded-xl hover:bg-black transition-all mt-6 shadow-sm disabled:opacity-50"
          disabled={!nameOnCard || !pepDeclaration}
        >
          Submit Application
        </button>
      </form>
    </motion.div>
  );
}
