import React from 'react';

interface PhoneFrameProps {
  children: React.ReactNode;
}

export const PhoneFrame: React.FC<PhoneFrameProps> = ({ children }) => {
  return (
    <div className="w-full h-[100dvh] min-h-[100dvh] overflow-hidden bg-white md:max-w-[560px] md:mx-auto md:border-x md:border-[#E8E4DE] md:shadow-[0_10px_30px_rgba(44,42,38,0.06)]">
      {children}
    </div>
  );
};
