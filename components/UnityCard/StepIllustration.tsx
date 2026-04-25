import React from 'react';

interface StepIllustrationProps {
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  imageSrc?: string;
}

export default function StepIllustration({ icon, badge, imageSrc }: StepIllustrationProps) {
  return (
    <div className="relative w-32 h-32 mx-auto mb-10 flex items-center justify-center">
      {/* Main Icon Container */}
      <div className="w-24 h-24 bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] flex items-center justify-center relative z-10 overflow-hidden">
        {imageSrc ? (
          <img src={imageSrc} alt="Step Illustration" className="w-full h-full object-cover" />
        ) : (
          icon
        )}
        {!imageSrc && <div className="absolute bottom-3 w-8 h-1 bg-[#F5F2EB] rounded-full" />}
      </div>

      {/* Optional Badge */}
      {badge && (
        <div className="absolute bottom-2 -right-2 bg-white w-10 h-10 rounded-full shadow-[0_4px_15px_rgb(0,0,0,0.08)] flex items-center justify-center z-20 border border-[#F5F2EB]">
          {badge}
        </div>
      )}
    </div>
  );
}
