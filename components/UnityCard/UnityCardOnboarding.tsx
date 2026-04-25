import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PhoneStep from './Steps/PhoneStep';
import PanStep from './Steps/PanStep';
import OfferStep from './Steps/OfferStep';
import EmploymentStep from './Steps/EmploymentStep';
import BillingStep from './Steps/BillingStep';
import AadhaarStep from './Steps/AadhaarStep';
import AddressStep from './Steps/AddressStep';
import VideoKycStep from './Steps/VideoKycStep';
import CustomizationStep from './Steps/CustomizationStep';
import ProcessingStep from './Steps/ProcessingStep';

export default function UnityCardOnboarding() {
  const [step, setStep] = useState(1);

  const renderStep = () => {
    switch (step) {
      case 1: return <PhoneStep onNext={() => setStep(2)} />;
      case 2: return <PanStep onNext={() => setStep(3)} />;
      case 3: return <OfferStep onNext={() => setStep(4)} />;
      case 4: return <EmploymentStep onNext={() => setStep(5)} />;
      case 5: return <BillingStep onNext={() => setStep(6)} />;
      case 6: return <AadhaarStep onNext={() => setStep(7)} />;
      case 7: return <AddressStep onNext={() => setStep(8)} />;
      case 8: return <VideoKycStep onNext={() => setStep(9)} />;
      case 9: return <CustomizationStep onNext={() => setStep(10)} />;
      case 10: return <ProcessingStep />;
      default: return <PhoneStep onNext={() => setStep(2)} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F6F0] text-[#2C2A26] selection:bg-[#0070F3]/20 font-sans flex flex-col relative overflow-hidden">
      
      {/* Top Progress Pills */}
      <div className="w-full max-w-2xl mx-auto px-6 py-8 flex gap-2 relative z-20">
        {Array.from({ length: 10 }).map((_, i) => (
          <motion.div
            key={i}
            className={`flex-1 h-1.5 rounded-full ${i + 1 <= step ? 'bg-[#2C2A26]' : 'bg-[#E5E0D8]'}`}
            initial={false}
            animate={{ backgroundColor: i + 1 <= step ? '#2C2A26' : '#E5E0D8' }}
            transition={{ duration: 0.3 }}
          />
        ))}
      </div>

      <div className="flex-grow flex flex-col items-center p-6 relative z-10 pt-4">
        <div className="w-full max-w-lg bg-white p-8 md:p-12 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div 
              key={step} 
              className="relative z-10"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
