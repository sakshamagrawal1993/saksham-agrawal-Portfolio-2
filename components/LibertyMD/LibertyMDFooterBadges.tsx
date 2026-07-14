import React from 'react';

export function CarinAccreditedBadge({ className = "w-20 h-20" }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center select-none ${className}`} title="CARIN Alliance Code of Conduct Accredited">
      <svg viewBox="0 0 120 120" className="w-full h-full drop-shadow-md">
        {/* Outer Circular Ring */}
        <circle cx="60" cy="60" r="56" fill="#FFFFFF" stroke="#1E40AF" strokeWidth="4" />
        <circle cx="60" cy="60" r="50" fill="none" stroke="#3B82F6" strokeWidth="1.5" strokeDasharray="3 3" />

        {/* Center Green/Blue Shield & Cross */}
        <path
          d="M60 22 C42 22 34 30 34 46 C34 72 60 92 60 92 C60 92 86 72 86 46 C86 30 78 22 60 22 Z"
          fill="url(#carinGrad)"
        />
        <defs>
          <linearGradient id="carinGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1E40AF" />
            <stop offset="100%" stopColor="#2563EB" />
          </linearGradient>
        </defs>

        {/* Medical Cross in Shield */}
        <path
          d="M56 40 H64 V48 H72 V56 H64 V64 H56 V56 H48 V48 H56 Z"
          fill="#FFFFFF"
        />

        {/* Top & Bottom Curved Text */}
        <path id="carinTopPath" d="M 22 60 A 38 38 0 0 1 98 60" fill="none" />
        <text fontSize="7.5" fontWeight="800" fill="#1E3A8A" letterSpacing="0.8">
          <textPath href="#carinTopPath" startOffset="50%" textAnchor="middle">
            CARIN ALLIANCE
          </textPath>
        </text>

        <text x="60" y="80" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#FFFFFF" letterSpacing="0.5">
          ACCREDITED
        </text>
        <text x="60" y="105" textAnchor="middle" fontSize="6" fontWeight="700" fill="#1E40AF" letterSpacing="0.4">
          CODE OF CONDUCT
        </text>
      </svg>
    </div>
  );
}

export function HipaaCompliantBadge({ className = "w-20 h-20" }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center select-none ${className}`} title="HIPAA Compliant Verified Security Seal">
      <svg viewBox="0 0 120 120" className="w-full h-full drop-shadow-md">
        {/* Outer Ring */}
        <circle cx="60" cy="60" r="56" fill="#FFFFFF" stroke="#1D4ED8" strokeWidth="4" />
        <circle cx="60" cy="60" r="51" fill="#EFF6FF" stroke="#60A5FA" strokeWidth="1" />

        {/* Center Shield */}
        <path
          d="M60 26 L84 34 V56 C84 76 60 94 60 94 C60 94 36 76 36 56 V34 Z"
          fill="#1E40AF"
        />
        <path
          d="M60 30 L80 37 V56 C80 73 60 88 60 88 C60 88 40 73 40 56 V37 Z"
          fill="#2563EB"
        />

        {/* Checkmark / Caduceus Icon inside Shield */}
        <path
          d="M51 58 L58 65 L71 49"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Badge Text */}
        <text x="60" y="18" textAnchor="middle" fontSize="8" fontWeight="800" fill="#1E3A8A" letterSpacing="1">
          VERIFIED SEAL
        </text>
        <text x="60" y="106" textAnchor="middle" fontSize="8.5" fontWeight="900" fill="#1D4ED8" letterSpacing="0.5">
          HIPAA COMPLIANT
        </text>
      </svg>
    </div>
  );
}

export function LegitScriptBadge({ className = "w-20 h-20" }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center select-none ${className}`} title="LegitScript Certified Healthcare Merchant">
      <svg viewBox="0 0 120 120" className="w-full h-full drop-shadow-md">
        {/* Hexagon/Rounded Square Outer Frame */}
        <rect x="8" y="8" width="104" height="104" rx="22" fill="#0F172A" stroke="#334155" strokeWidth="3" />
        <rect x="14" y="14" width="92" height="92" rx="18" fill="none" stroke="#1E293B" strokeWidth="1.5" />

        {/* Center Green/Blue Certified Check Seal */}
        <circle cx="60" cy="46" r="20" fill="#2563EB" />
        <path
          d="M52 46 L58 52 L69 39"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* LegitScript Brand Text */}
        <text x="60" y="80" textAnchor="middle" fontSize="12" fontWeight="900" fill="#FFFFFF" letterSpacing="0.3">
          LegitScript
        </text>
        <text x="60" y="94" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#60A5FA" letterSpacing="1.2">
          CERTIFIED
        </text>
      </svg>
    </div>
  );
}

export function PatientOathEmblem({ className = "w-48 h-48" }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center select-none group ${className}`}>
      {/* Outer Ambient Glow Ring */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#2563EB]/30 via-[#3B82F6]/20 to-[#60A5FA]/30 blur-xl opacity-75 group-hover:opacity-100 transition-opacity duration-500" />

      {/* Rotating Circular Badge Text Track */}
      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 w-full h-full animate-[spin_24s_linear_infinite] drop-shadow-md"
      >
        <defs>
          <path
            id="bottomLogoCirclePath"
            d="M 100, 15 A 85, 85 0 1, 1 99.99, 15"
            fill="none"
          />
        </defs>
        <text fontSize="8.3" fontWeight="800" fill="#1E3A8A">
          <textPath
            href="#bottomLogoCirclePath"
            startOffset="0%"
            textLength="534"
            lengthAdjust="spacing"
          >
            {"★\u00A0\u00A0LIBERTY MD\u00A0\u00A0★\u00A0\u00A0SOVEREIGN CLINICAL CARE\u00A0\u00A0•\u00A0\u00A0AI PRIMARY PHYSICIAN\u00A0\u00A0•\u00A0\u00A0"}
          </textPath>
        </text>
      </svg>

      {/* Decorative Outer Dashed Orbit Ring (Outside the white seal so zero text overlap!) */}
      <div className="absolute w-32 h-32 rounded-full border border-dashed border-[#3B82F6]/50 animate-[spin_40s_linear_infinite_reverse]" />

      {/* Center Pristine Glassmorphic Seal Crest */}
      <div className="relative z-10 w-28 h-28 rounded-full bg-white/95 backdrop-blur-md border-2 border-[#3B82F6]/50 shadow-2xl flex flex-col items-center justify-center p-3 group-hover:scale-105 transition-transform duration-300">
        <img
          src="/images/libertymd-logo-mark.svg"
          alt=""
          aria-hidden="true"
          className="h-12 w-12 object-contain drop-shadow-md transition-transform duration-300 group-hover:rotate-3 group-hover:scale-105"
        />
        <span className="text-[8px] font-black tracking-widest text-[#1E3A8A] uppercase mt-2.5 select-none">
          PATIENT OATH
        </span>
      </div>
    </div>
  );
}
