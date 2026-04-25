import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Fingerprint, ShieldCheck } from 'lucide-react';
import { useUnityCardStore } from '../../../store/unityCardStore';
import StepIllustration from '../StepIllustration';

export default function AadhaarStep({ onNext }: { onNext: () => void }) {
  const { setAadhaar } = useUnityCardStore();
  const [localAadhaar, setLocalAadhaar] = useState('');

  const [verifying, setVerifying] = useState(false);

  const handleVerify = (val: string) => {
    if (val.length === 12) {
      setVerifying(true);
      setTimeout(() => {
        setAadhaar(val);
        onNext();
      }, 800); // Simulate API call
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
        icon={<Fingerprint className="w-12 h-12 text-[#50E3C2]" />}
        badge={<ShieldCheck className="w-5 h-5 text-[#0070F3]" />}
      />
      <div className="flex justify-between items-start mb-8 text-center flex-col items-center">
        <h2 className="text-2xl font-bold mb-1 text-[#2C2A26] font-serif">KYC Verification</h2>
        <p className="text-gray-500 font-medium text-sm">Enter your Aadhaar details.</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5 text-center">Aadhaar Number</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Fingerprint className="h-5 w-5 text-gray-400" />
            </div>
            <input 
              type="text" 
              maxLength={12}
              required
              autoFocus
              placeholder="1234 5678 9012"
              className="block w-full pl-10 pr-4 py-3.5 border border-[#E5E0D8] rounded-xl bg-[#F8F6F0] text-[#2C2A26] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0070F3]/20 focus:border-[#0070F3] transition-all tracking-[0.2em] text-center text-lg font-bold"
              value={localAadhaar}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '');
                setLocalAadhaar(val);
                if (val.length === 12) handleVerify(val);
              }}
            />
          </div>
        </div>

        <button 
          disabled
          className={`w-full font-semibold py-4 rounded-xl transition-all mt-6 shadow-sm ${verifying ? 'bg-[#50E3C2] text-[#2C2A26]' : 'bg-[#E5E0D8] text-gray-500'}`}
        >
          {verifying ? 'Verifying Aadhaar...' : 'Waiting for 12 digits...'}
        </button>
      </div>
    </motion.div>
  );
}
