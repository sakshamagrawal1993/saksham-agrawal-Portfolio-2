import React from 'react';
import LibertyMDMedicalCrossLogo from './LibertyMDMedicalCrossLogo';

interface LibertyMDPremiumLogoProps {
  scrollY?: number;
  className?: string;
}

const portraitClass =
  'absolute overflow-hidden rounded-full border-[5px] border-[#FBFCF8] bg-white shadow-[0_18px_45px_rgba(15,23,42,0.18)]';

export default function LibertyMDPremiumLogo({ scrollY = 0, className = '' }: LibertyMDPremiumLogoProps) {
  const isCompact = typeof window !== 'undefined' && window.innerWidth < 640;

  // Floating logo travels smoothly on scroll, while solid pedestal remains anchored on the ground
  const travel = Math.min(scrollY * (isCompact ? 0.85 : 1.25), isCompact ? 360 : 780);
  const scale = Math.max(isCompact ? 0.6 : 0.45, 1 - scrollY / (isCompact ? 950 : 750));
  const rotate = Math.min(scrollY / 90, 8);

  return (
    <div
      className={`relative mx-auto h-[310px] w-[260px] sm:h-[420px] sm:w-[360px] select-none ${className}`}
      style={{ transformStyle: 'preserve-3d' }}
      aria-hidden="true"
    >
      <style>
        {`
          @keyframes libertymd-premium-logo-float {
            0%, 100% { transform: translate3d(0, -6px, 20px); }
            50% { transform: translate3d(0, 10px, 20px); }
          }
        `}
      </style>

      {/* 1. SOLID ARCHITECTURAL 3D CYLINDER PEDESTAL (Anchored firmly on the ground - DOES NOT MOVE WITH SCROLL) */}
      <div className="absolute left-1/2 bottom-0 w-[220px] sm:w-[300px] -translate-x-1/2 pointer-events-none z-0">
        {/* Ambient Floor Shadow under Pedestal */}
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 h-8 w-[90%] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(30,58,138,0.32)_0%,rgba(15,23,42,0.15)_50%,transparent_80%)] blur-md" />

        {/* Photorealistic Vector Solid 3D Cylinder (Freehand.ai solid architectural style) */}
        <svg
          viewBox="0 0 300 120"
          className="w-full h-auto drop-shadow-[0_14px_28px_rgba(15,23,42,0.18)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Cylindrical Wall Shading (Brushed satin studio reflection) */}
            <linearGradient id="cylinderWall" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#64748B" />
              <stop offset="12%" stopColor="#CBD5E1" />
              <stop offset="30%" stopColor="#F8FAFC" />
              <stop offset="52%" stopColor="#FFFFFF" />
              <stop offset="78%" stopColor="#E2E8F0" />
              <stop offset="94%" stopColor="#94A3B8" />
              <stop offset="100%" stopColor="#475569" />
            </linearGradient>

            {/* Bottom Ellipse Rim Shading */}
            <linearGradient id="bottomRim" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#475569" />
              <stop offset="50%" stopColor="#CBD5E1" />
              <stop offset="100%" stopColor="#334155" />
            </linearGradient>

            {/* Top Surface Satin Disc */}
            <radialGradient id="topSurface" cx="50%" cy="45%" r="55%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="45%" stopColor="#F8FAFC" />
              <stop offset="85%" stopColor="#E2E8F0" />
              <stop offset="100%" stopColor="#CBD5E1" />
            </radialGradient>

            {/* Blue Center Glow cast by Floating Logo */}
            <radialGradient id="logoReflect" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(37, 99, 235, 0.18)" />
              <stop offset="60%" stopColor="rgba(37, 99, 235, 0.04)" />
              <stop offset="100%" stopColor="rgba(37, 99, 235, 0)" />
            </radialGradient>
          </defs>

          {/* Bottom Ellipse Base Face */}
          <ellipse cx="150" cy="88" rx="136" ry="26" fill="url(#bottomRim)" />

          {/* Solid Cylindrical Body Extrusion */}
          <path
            d="M 14,34 L 14,88 A 136 26 0 0 0 286,88 L 286,34 A 136 26 0 0 1 14,34 Z"
            fill="url(#cylinderWall)"
          />

          {/* Top Ellipse Cap Rim Shadow */}
          <ellipse cx="150" cy="34" rx="136" ry="26" fill="#94A3B8" />

          {/* Top Ellipse Main Solid Surface */}
          <ellipse
            cx="150"
            cy="33"
            rx="134"
            ry="25"
            fill="url(#topSurface)"
            stroke="#FFFFFF"
            strokeWidth="1.5"
          />

          {/* Blue Reflection Glow on Pedestal Top */}
          <ellipse cx="150" cy="33" rx="110" ry="20" fill="url(#logoReflect)" />

          {/* Inner Precision Engraved Ring */}
          <ellipse
            cx="150"
            cy="33"
            rx="94"
            ry="17"
            fill="none"
            stroke="#94A3B8"
            strokeWidth="0.8"
            strokeOpacity="0.45"
          />
          <ellipse
            cx="150"
            cy="33"
            rx="56"
            ry="10"
            fill="none"
            stroke="#3B82F6"
            strokeWidth="0.8"
            strokeOpacity="0.35"
          />
        </svg>
      </div>

      {/* 2. FLOATING LOGO & ORBITING PORTRAITS (Moves & Floats independently above the solid cylinder pedestal) */}
      <div
        className="absolute inset-x-0 top-0 h-[240px] sm:h-[330px] z-10"
        style={{
          transform: `translate3d(0, ${travel}px, 0) scale(${scale}) rotateX(${rotate}deg)`,
          transition: 'transform 180ms ease-out',
          transformStyle: 'preserve-3d',
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            animation: 'libertymd-premium-logo-float 5.6s ease-in-out infinite',
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Ambient Blue Halo Behind Logo */}
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_45%_35%,rgba(255,255,255,0.98),rgba(219,234,254,0.65)_38%,rgba(37,99,235,0.14)_64%,transparent_78%)] opacity-95 blur-xl pointer-events-none" />

          {/* Center 3D Medical Cross Logo */}
          <div className="absolute inset-[14px] sm:inset-[18px]">
            <LibertyMDMedicalCrossLogo
              size={300}
              colorTheme="blue"
              className="drop-shadow-[0_26px_40px_rgba(37,99,235,0.22)]"
            />
          </div>

          {/* Left Orbiting Patient Portrait */}
          <div
            className={`${portraitClass} left-[14px] top-[34px] h-[86px] w-[86px] sm:left-[20px] sm:top-[42px] sm:h-[108px] sm:w-[108px]`}
          >
            <img
              src="https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=320&q=80"
              alt=""
              className="h-full w-full object-cover"
              loading="eager"
            />
          </div>

          {/* Right Orbiting Doctor Portrait */}
          <div
            className={`${portraitClass} bottom-[42px] right-[14px] h-[68px] w-[68px] sm:bottom-[50px] sm:right-[20px] sm:h-[84px] sm:w-[84px]`}
          >
            <img
              src="https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=260&q=80"
              alt=""
              className="h-full w-full object-cover"
              loading="eager"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
