import { useState } from 'react';
import { motion } from 'framer-motion';
import { Briefcase, IndianRupee, PieChart } from 'lucide-react';
import { useUnityCardStore } from '../../../store/unityCardStore';
import StepIllustration from '../StepIllustration';

export default function EmploymentStep({ onNext }: { onNext: () => void }) {
  const { setEmploymentDetails } = useUnityCardStore();
  const [empType, setEmpType] = useState('salaried');
  const [income, setIncome] = useState('');

  const handleIncomeSelect = (val: string) => {
    setIncome(val);
    setTimeout(() => {
      setEmploymentDetails(empType, val);
      onNext();
    }, 400); // Quick momentum delay
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="w-full max-w-sm mx-auto"
    >
      <StepIllustration 
        icon={<Briefcase className="w-12 h-12 text-[#F5A623]" />}
        badge={<PieChart className="w-5 h-5 text-[#0070F3]" />}
      />
      <div className="flex justify-between items-start mb-8 text-center flex-col items-center">
        <h2 className="text-2xl font-bold mb-1 text-[#2C2A26] font-serif">Employment</h2>
        <p className="text-gray-500 font-medium text-sm">Tell us about your work.</p>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">Employment Type</label>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setEmpType('salaried')}
              className={`py-3 px-4 rounded-xl border flex items-center justify-center gap-2 transition-all font-semibold text-sm ${empType === 'salaried' ? 'bg-[#0070F3]/5 text-[#0070F3] border-[#0070F3]' : 'bg-[#F8F6F0] text-gray-500 border-[#E5E0D8] hover:border-[#0070F3]/30'}`}
            >
              <Briefcase className="w-4 h-4" /> Salaried
            </button>
            <button
              type="button"
              onClick={() => setEmpType('self_employed')}
              className={`py-3 px-4 rounded-xl border flex items-center justify-center gap-2 transition-all font-semibold text-sm ${empType === 'self_employed' ? 'bg-[#0070F3]/5 text-[#0070F3] border-[#0070F3]' : 'bg-[#F8F6F0] text-gray-500 border-[#E5E0D8] hover:border-[#0070F3]/30'}`}
            >
              <Briefcase className="w-4 h-4" /> Self Employed
            </button>
          </div>
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">Annual Income</label>
          <div className="grid grid-cols-1 gap-2.5">
            {[
              { id: '0-3L', label: 'Up to ₹3,00,000' },
              { id: '3L-6L', label: '₹3,00,000 - ₹6,00,000' },
              { id: '6L-12L', label: '₹6,00,000 - ₹12,00,000' },
              { id: '12L+', label: '₹12,00,000+' }
            ].map((bracket) => (
              <button
                key={bracket.id}
                type="button"
                onClick={() => handleIncomeSelect(bracket.id)}
                className={`py-3.5 px-4 rounded-xl border text-left flex items-center transition-all font-semibold text-base ${income === bracket.id ? 'bg-[#2C2A26] text-white border-[#2C2A26] shadow-sm' : 'bg-[#F8F6F0] text-[#2C2A26] border-[#E5E0D8] hover:border-[#0070F3]/30'}`}
              >
                <IndianRupee className={`w-4 h-4 mr-3 ${income === bracket.id ? 'text-white' : 'text-gray-400'}`} />
                {bracket.label}
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
