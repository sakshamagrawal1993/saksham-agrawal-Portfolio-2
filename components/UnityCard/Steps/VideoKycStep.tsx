import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Video, CheckCircle2, Loader2, Wifi, FileText, UserCheck } from 'lucide-react';
import StepIllustration from '../StepIllustration';

export default function VideoKycStep({ onNext }: { onNext: () => void }) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'success'>('idle');

  const startVideoKyc = () => {
    setStatus('connecting');
    setTimeout(() => {
      setStatus('success');
      setTimeout(() => onNext(), 1500);
    }, 3000);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="w-full max-w-sm mx-auto"
    >
      {status === 'idle' && (
        <StepIllustration 
          icon={<Video className="w-12 h-12 text-[#0070F3]" />}
          badge={<UserCheck className="w-5 h-5 text-[#50E3C2]" />}
        />
      )}
      
      <div className="flex justify-between items-start mb-8 text-center flex-col items-center">
        <h2 className="text-2xl font-bold mb-1 text-[#2C2A26] font-serif">Video KYC</h2>
        <p className="text-gray-500 font-medium text-sm">Complete your in-person verification.</p>
      </div>

      {status === 'idle' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="bg-[#F8F6F0] p-5 rounded-xl border border-[#E5E0D8]">
            <h3 className="font-semibold text-[#2C2A26] mb-3 text-center text-sm">Preparation Checklist</h3>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-sm font-medium text-gray-600">
                <FileText className="w-4 h-4 text-[#0070F3]" /> Keep original PAN Card handy
              </li>
              <li className="flex items-center gap-3 text-sm font-medium text-gray-600">
                <Wifi className="w-4 h-4 text-[#50E3C2]" /> Ensure stable internet connection
              </li>
              <li className="flex items-center gap-3 text-sm font-medium text-gray-600">
                <Video className="w-4 h-4 text-[#FF0080]" /> Well-lit, quiet room
              </li>
            </ul>
          </div>
          <button 
            onClick={startVideoKyc}
            className="w-full bg-[#2C2A26] text-white font-semibold py-4 rounded-xl hover:bg-black transition-all shadow-sm flex items-center justify-center gap-2 mt-6"
          >
            <Video className="w-4 h-4" /> Start Video KYC
          </button>
        </motion.div>
      )}

      {status === 'connecting' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-12">
          <div className="relative mb-6">
            <Loader2 className="w-12 h-12 text-[#0070F3] animate-spin relative z-10" />
          </div>
          <p className="font-bold text-[#2C2A26] text-lg mb-1">Connecting to Agent...</p>
          <p className="text-sm font-medium text-gray-500">Please allow camera and microphone access.</p>
        </motion.div>
      )}

      {status === 'success' && (
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-12">
          <div className="relative mb-6">
            <CheckCircle2 className="w-16 h-16 text-[#50E3C2] relative z-10" />
          </div>
          <p className="font-bold text-[#2C2A26] text-xl mb-1">Verification Complete!</p>
          <p className="text-sm font-medium text-gray-500">Your documents are verified.</p>
        </motion.div>
      )}
    </motion.div>
  );
}
