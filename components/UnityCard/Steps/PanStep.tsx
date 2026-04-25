import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, User, Calendar, ShieldCheck } from 'lucide-react';
import { useUnityCardStore } from '../../../store/unityCardStore';
import StepIllustration from '../StepIllustration';

export default function PanStep({ onNext }: { onNext: () => void }) {
  const { setPanDetails } = useUnityCardStore();
  const [pan, setPan] = useState('');
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pan.length > 5 && name && dob) {
      setPanDetails(pan, name, dob);
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
        icon={<FileText className="w-12 h-12 text-[#0070F3]" />}
        badge={<ShieldCheck className="w-5 h-5 text-[#50E3C2]" />}
      />

      <div className="flex justify-between items-start mb-8 text-center flex-col items-center">
        <h2 className="text-2xl font-bold mb-1 text-[#2C2A26] font-serif">Basic Details</h2>
        <p className="text-gray-500 font-medium text-sm">Let's check your eligibility.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">PAN Number</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <FileText className="h-5 w-5 text-gray-400" />
            </div>
            <input 
              type="text" 
              required
              placeholder="ABCDE1234F"
              className="block w-full pl-10 pr-4 py-3.5 border border-[#E5E0D8] rounded-xl bg-[#F8F6F0] text-[#2C2A26] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0070F3]/20 focus:border-[#0070F3] uppercase transition-all font-medium text-base"
              value={pan}
              onChange={(e) => setPan(e.target.value.toUpperCase())}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">Name as per PAN</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <User className="h-5 w-5 text-gray-400" />
            </div>
            <input 
              type="text" 
              required
              placeholder="Rohit Sharma"
              className="block w-full pl-10 pr-4 py-3.5 border border-[#E5E0D8] rounded-xl bg-[#F8F6F0] text-[#2C2A26] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0070F3]/20 focus:border-[#0070F3] transition-all font-medium text-base"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">Date of Birth</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Calendar className="h-5 w-5 text-gray-400" />
            </div>
            <input 
              type="date" 
              required
              className="block w-full pl-10 pr-4 py-3.5 border border-[#E5E0D8] rounded-xl bg-[#F8F6F0] text-[#2C2A26] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0070F3]/20 focus:border-[#0070F3] transition-all font-medium text-base"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
            />
          </div>
        </div>

        <button 
          type="submit"
          className="w-full bg-[#2C2A26] text-white font-semibold py-4 rounded-xl hover:bg-black transition-all mt-6 shadow-sm"
        >
          Check Eligibility
        </button>
      </form>
    </motion.div>
  );
}
