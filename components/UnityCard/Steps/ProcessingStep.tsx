import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useUnityCardStore } from '../../../store/unityCardStore';
import { CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ProcessingStep() {
  const { setCreditLimit, creditLimit } = useUnityCardStore();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'analyzing' | 'approving' | 'ready'>('analyzing');

  useEffect(() => {
    // Simulate complex underwriting process
    const timer1 = setTimeout(() => setStatus('approving'), 2000);
    const timer2 = setTimeout(() => {
      setStatus('ready');
      // Set a mock dynamic credit limit
      setCreditLimit(Math.floor(Math.random() * (200000 - 100000 + 1)) + 100000);
    }, 4000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [setCreditLimit]);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-sm mx-auto text-center"
    >
      <div className="py-8">
        {status !== 'ready' ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center relative z-10"
          >
            <div className="relative mb-10">
              <Loader2 className="w-16 h-16 text-[#0070F3] animate-spin relative z-10" />
            </div>
            <motion.h2 
              key={status}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="text-2xl font-bold mb-2 text-[#2C2A26] font-serif"
            >
              {status === 'analyzing' ? 'Analyzing Profile...' : 'Generating Limit...'}
            </motion.h2>
            <p className="text-gray-500 font-medium text-sm">Please wait while we set up your account</p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center relative z-10"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 10 }}
              className="relative mb-8"
            >
              <CheckCircle2 className="w-20 h-20 text-[#50E3C2] relative z-10" />
            </motion.div>
            
            <h2 className="text-3xl font-bold mb-3 text-[#2C2A26] font-serif">Your Card is Ready!</h2>
            <p className="text-gray-500 mb-8 text-base font-medium">We've generated a customized limit for you.</p>
            
            {creditLimit && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 150, delay: 0.2 }}
                className="bg-[#F8F6F0] border border-[#E5E0D8] px-8 py-6 rounded-2xl mb-10 relative overflow-hidden w-full shadow-sm"
              >
                <div className="text-xs text-[#0070F3] mb-2 uppercase tracking-wider font-semibold relative z-10 flex items-center justify-center gap-1">
                  <Sparkles className="w-3 h-3" /> Approved Limit
                </div>
                <div className="text-4xl font-bold text-[#2C2A26] relative z-10 tracking-tight">
                  {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(creditLimit)}
                </div>
              </motion.div>
            )}
            
            <button 
              onClick={() => navigate('/unity-card/dashboard')}
              className="w-full bg-[#2C2A26] text-white font-semibold py-4 rounded-xl hover:bg-black transition-all shadow-sm"
            >
              Go to Dashboard
            </button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
