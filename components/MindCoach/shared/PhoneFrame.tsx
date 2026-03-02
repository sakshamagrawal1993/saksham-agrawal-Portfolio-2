import React from 'react';

interface PhoneFrameProps {
  children: React.ReactNode;
}

export const PhoneFrame: React.FC<PhoneFrameProps> = ({ children }) => {
  return (
    <div className="relative w-full max-w-[430px] h-[calc(100vh-2rem)] max-h-[932px] rounded-[2.5rem] overflow-hidden shadow-2xl border border-[#D6D1C7]/50 bg-white">
      {/* Status bar notch area */}
      <div className="h-12 bg-[#FAFAF7] flex items-end justify-center pb-1">
        <div className="w-28 h-[5px] bg-[#2C2A26]/15 rounded-full" />
      </div>
      {/* Content */}
      <div className="h-[calc(100%-3rem)] overflow-hidden">
        {children}
      </div>
    </div>
  );
};
