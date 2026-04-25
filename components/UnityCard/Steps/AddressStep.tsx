import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Truck } from 'lucide-react';
import { useUnityCardStore } from '../../../store/unityCardStore';
import StepIllustration from '../StepIllustration';

export default function AddressStep({ onNext }: { onNext: () => void }) {
  const { setAddress } = useUnityCardStore();
  const [localAddress, setLocalAddress] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (localAddress.length > 5) {
      setAddress(localAddress);
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
        icon={<MapPin className="w-12 h-12 text-[#FF0080]" />}
        badge={<Truck className="w-5 h-5 text-[#0070F3]" />}
      />
      <div className="flex justify-between items-start mb-8 text-center flex-col items-center">
        <h2 className="text-2xl font-bold mb-1 text-[#2C2A26] font-serif">Delivery Details</h2>
        <p className="text-gray-500 font-medium text-sm">Where should we send your card?</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">Full Address</label>
          <div className="relative">
            <div className="absolute top-3.5 left-0 pl-3.5 flex items-start pointer-events-none">
              <MapPin className="h-5 w-5 text-gray-400" />
            </div>
            <textarea 
              required
              rows={4}
              placeholder="Flat / House No, Building, Area, Pincode"
              className="block w-full pl-10 pr-4 py-3.5 border border-[#E5E0D8] rounded-xl bg-[#F8F6F0] text-[#2C2A26] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0070F3]/20 focus:border-[#0070F3] transition-all resize-none font-medium text-base"
              value={localAddress}
              onChange={(e) => setLocalAddress(e.target.value)}
            />
          </div>
        </div>

        <button 
          type="submit"
          className="w-full bg-[#2C2A26] text-white font-semibold py-4 rounded-xl hover:bg-black transition-all mt-6 shadow-sm"
        >
          Confirm Address
        </button>
      </form>
    </motion.div>
  );
}
