import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Send } from 'lucide-react';
import { useUnityCardStore } from '../../../store/unityCardStore';
import StepIllustration from '../StepIllustration';

export default function BillingStep({ onNext }: { onNext: () => void }) {
  const { setEmail } = useUnityCardStore();
  const [localEmail, setLocalEmail] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (localEmail.includes('@')) {
      setEmail(localEmail);
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
        icon={<Mail className="w-12 h-12 text-[#0070F3]" />}
        badge={<Send className="w-5 h-5 text-[#50E3C2]" />}
      />
      <div className="flex justify-between items-start mb-8 text-center flex-col items-center">
        <h2 className="text-2xl font-bold mb-1 text-[#2C2A26] font-serif">Billing Email</h2>
        <p className="text-gray-500 font-medium text-sm">Where should we send statements?</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">Email Address</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Mail className="h-5 w-5 text-gray-400" />
            </div>
            <input 
              type="email" 
              required
              placeholder="you@example.com"
              className="block w-full pl-10 pr-4 py-3.5 border border-[#E5E0D8] rounded-xl bg-[#F8F6F0] text-[#2C2A26] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0070F3]/20 focus:border-[#0070F3] transition-all font-medium text-base"
              value={localEmail}
              onChange={(e) => setLocalEmail(e.target.value)}
            />
          </div>
        </div>

        <button 
          type="submit"
          className="w-full bg-[#2C2A26] text-white font-semibold py-4 rounded-xl hover:bg-black transition-all mt-6 shadow-sm"
        >
          Continue
        </button>
      </form>
    </motion.div>
  );
}
