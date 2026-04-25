import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, MessageSquare } from 'lucide-react';
import { useUnityCardStore } from '../../../store/unityCardStore';
import StepIllustration from '../StepIllustration';

export default function PhoneStep({ onNext }: { onNext: () => void }) {
  const { setPhone } = useUnityCardStore();
  const [localPhone, setLocalPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (localPhone.length === 10) setOtpSent(true);
  };

  const handleVerify = (code: string) => {
    if (code.length === 6) {
      setVerifying(true);
      setTimeout(() => {
        setPhone(localPhone);
        onNext();
      }, 600); // Small delay to feel realistic
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
        imageSrc="/images/students.jpg"
        badge={<MessageSquare className="w-5 h-5 text-[#50E3C2]" />}
      />

      <div className="flex justify-between items-start mb-8 text-center flex-col items-center">
        <h2 className="text-2xl font-bold mb-1 text-[#2C2A26] font-serif">Get Started</h2>
        <p className="text-gray-500 font-medium text-sm">Enter your mobile number to check eligibility.</p>
      </div>

      {!otpSent ? (
        <form onSubmit={handleSendOtp} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1.5">Mobile Number</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <span className="text-gray-400 font-medium">+91</span>
              </div>
              <input 
                type="tel" 
                maxLength={10}
                required
                placeholder="98765 43210"
                className="block w-full pl-12 pr-4 py-3.5 border border-[#E5E0D8] rounded-xl bg-[#F8F6F0] text-[#2C2A26] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0070F3]/20 focus:border-[#0070F3] transition-all font-medium text-base"
                value={localPhone}
                onChange={(e) => setLocalPhone(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div className="mt-4 flex items-start gap-3 bg-[#F8F6F0] p-4 rounded-xl border border-[#E5E0D8]">
              <input type="checkbox" required className="mt-0.5 accent-[#0070F3] w-4 h-4" />
              <span className="text-xs text-gray-500 font-medium leading-relaxed">I authorize BharatPe and its lending partners to fetch my credit bureau report and contact me regarding this application.</span>
            </div>
          </div>
          <button 
            type="submit"
            className="w-full bg-[#2C2A26] text-white font-semibold py-4 rounded-xl hover:bg-black transition-all mt-6 shadow-sm disabled:opacity-50"
            disabled={localPhone.length !== 10}
          >
            Get OTP
          </button>
        </form>
      ) : (
        <motion.div 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1.5 text-center">Enter 6-digit OTP sent to {localPhone}</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Check className="h-5 w-5 text-gray-400" />
              </div>
              <input 
                type="text" 
                maxLength={6}
                required
                autoFocus
                placeholder="123456"
                className="block w-full pl-10 pr-4 py-3.5 border border-[#E5E0D8] rounded-xl bg-[#F8F6F0] text-[#2C2A26] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0070F3]/20 focus:border-[#0070F3] transition-all tracking-[0.5em] text-center text-lg font-bold"
                value={otp}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setOtp(val);
                  if (val.length === 6) handleVerify(val);
                }}
              />
            </div>
          </div>
          <button 
            disabled
            className={`w-full font-semibold py-4 rounded-xl transition-all ${verifying ? 'bg-[#0070F3] text-white shadow-md' : 'bg-[#E5E0D8] text-gray-500'}`}
          >
            {verifying ? 'Verifying...' : 'Waiting for auto-verify...'}
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}
