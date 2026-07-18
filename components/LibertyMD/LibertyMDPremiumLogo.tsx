import React from 'react';
import LibertyMDMedicalCrossLogo from './LibertyMDMedicalCrossLogo';

interface LibertyMDPremiumLogoProps {
  /** Whether the hero scroll-scrub animation is active (true during the initial phase). */
  active?: boolean;
  className?: string;
  dockHeadlineRef?: React.RefObject<HTMLElement | null>;
}

const portraitClass =
  'absolute overflow-hidden rounded-full border-2 border-[#E7ECF3] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.16)] ring-1 ring-[#94A3B8]/50';

const libertyMDPortraitBase = `${String((import.meta as any).env.VITE_SUPABASE_URL || '').replace(/\/$/, '')}/storage/v1/object/public/libertymd-assets/portraits`;

export default function LibertyMDPremiumLogo({
  active = true,
  className = '',
  dockHeadlineRef,
}: LibertyMDPremiumLogoProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const movingLogoRef = React.useRef<HTMLDivElement | null>(null);
  const pedestalRef = React.useRef<HTMLDivElement | null>(null);

  // Scroll-scrubbed hero choreography, driven imperatively via a continuous rAF loop that
  // EASES each transform value toward its scroll target every frame (critically-damped
  // follow, the same idea Lenis/GSAP use). Writing straight to the DOM node means scrolling
  // never re-renders React — the per-frame re-render of LibertyMDApp was the real stutter —
  // and the per-frame damping smooths over any coarse scroll input for a premium glide.
  React.useEffect(() => {
    const moving = movingLogoRef.current;
    const root = rootRef.current;
    if (!moving || !root) return;

    const resetToRest = () => {
      moving.style.transform = 'translate3d(0, 0px, 0) scale(1) rotateX(0deg)';
      if (pedestalRef.current) pedestalRef.current.style.opacity = '1';
    };

    if (!active) {
      resetToRest();
      return;
    }

    type Frame = { travel: number; scale: number; rotate: number; ped: number; progress: number };

    // The scroll-driven TARGET at the current scroll position.
    const computeTarget = (): Frame => {
      const scrollY = window.scrollY;
      const isCompact = window.innerWidth < 640;
      const viewportHeight = window.innerHeight;
      // Match Freehand's three phases: natural scroll, accelerated transfer, then rest.
      const rootDocumentTop = root.getBoundingClientRect().top + scrollY;
      const headlineDocumentTop = dockHeadlineRef?.current
        ? dockHeadlineRef.current.getBoundingClientRect().top + scrollY
        : Number.POSITIVE_INFINITY;
      const triggerScroll = rootDocumentTop;
      const landingScroll = Number.isFinite(headlineDocumentTop)
        ? Math.max(triggerScroll + 1, headlineDocumentTop - viewportHeight * 0.8)
        : triggerScroll + (isCompact ? 300 : 360);
      const rawProgress = Number.isFinite(triggerScroll)
        ? Math.min(1, Math.max(0, (scrollY - triggerScroll) / (landingScroll - triggerScroll)))
        : 0;
      const easedProgress = rawProgress ** 3 * (rawProgress * (rawProgress * 6 - 15) + 10);
      const transferProgress = Math.min(1, rawProgress + Math.sin(Math.PI * rawProgress) * 0.24);
      const finalScale = isCompact ? 0.6 : 0.45;
      const movingLogoHeight = moving.offsetHeight || (isCompact ? 240 : 330);
      const targetBottom = Number.isFinite(headlineDocumentTop)
        ? headlineDocumentTop - (isCompact ? 56 : 64)
        : rootDocumentTop + (isCompact ? 920 : 1040);
      const scaledBottomFromRoot = movingLogoHeight * (1 + finalScale) * 0.5;
      const finalTravel = Number.isFinite(rootDocumentTop)
        ? Math.max(0, targetBottom - rootDocumentTop - scaledBottomFromRoot)
        : 0;
      return {
        travel: finalTravel * transferProgress,
        scale: 1 - (1 - finalScale) * easedProgress,
        rotate: 8 * easedProgress,
        ped: Math.max(0, 1 - rawProgress / 0.08),
        progress: rawProgress,
      };
    };

    const applyStyles = (v: Frame) => {
      moving.style.transform = `translate3d(0, ${v.travel}px, 0) scale(${v.scale}) rotateX(${v.rotate}deg)`;
      if (pedestalRef.current) pedestalRef.current.style.opacity = String(v.ped);
      root.dataset.scrollProgress = v.progress.toFixed(3);
      root.dataset.scrollPhase =
        v.progress <= 0 ? 'waiting' : v.progress >= 1 ? 'docked' : 'travelling';
    };

    // Reduced motion: snap to target, no animation loop.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      applyStyles(computeTarget());
      return;
    }

    // DAMP: fraction of the remaining distance covered per frame.
    // Higher = snappier/tighter tracking, lower = floatier glide. 0.18 feels premium.
    const DAMP = 0.18;
    let cur = computeTarget();
    applyStyles(cur);

    let rafId = 0;
    const tick = () => {
      const t = computeTarget();
      cur = {
        travel: cur.travel + (t.travel - cur.travel) * DAMP,
        scale: cur.scale + (t.scale - cur.scale) * DAMP,
        rotate: cur.rotate + (t.rotate - cur.rotate) * DAMP,
        ped: cur.ped + (t.ped - cur.ped) * DAMP,
        progress: t.progress,
      };
      applyStyles(cur);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active, dockHeadlineRef]);

  return (
    <div
      ref={rootRef}
      className={`libertymd-premium-logo-stage relative isolate mx-auto select-none ${className}`}
      style={{ transformStyle: 'preserve-3d' }}
      data-testid="libertymd-premium-logo"
      aria-hidden="true"
    >
      {/* 1. SOLID ARCHITECTURAL 3D CYLINDER PEDESTAL (Anchored firmly on the ground - DOES NOT MOVE WITH SCROLL) */}
      <div
        ref={pedestalRef}
        className="libertymd-premium-logo-pedestal pointer-events-none absolute bottom-0 left-1/2 z-0 -translate-x-1/2"
        style={{ opacity: 1, willChange: 'opacity' }}
      >
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
        ref={movingLogoRef}
        className="libertymd-premium-logo-moving absolute inset-x-0 top-0 z-30"
        style={{
          // Initial resting transform; the rAF effect above drives this imperatively on scroll.
          transform: 'translate3d(0, 0px, 0) scale(1) rotateX(0deg)',
          transition: 'none',
          transformStyle: 'preserve-3d',
          willChange: 'transform',
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Ambient Blue Halo Behind Logo */}
          <div className="pointer-events-none absolute inset-1 rounded-full bg-[radial-gradient(circle_at_45%_35%,rgba(255,255,255,0.82),rgba(219,234,254,0.3)_38%,rgba(29,78,216,0.08)_64%,transparent_78%)] opacity-55 blur-xl" />

          {/* Center 3D Medical Cross Logo */}
          <div className="absolute inset-[14px] sm:inset-[18px]">
            <LibertyMDMedicalCrossLogo
              size={300}
              colorTheme="blue"
              className="drop-shadow-[0_26px_38px_rgba(15,47,112,0.24)]"
            />
          </div>

          {/* Left Orbiting Patient Portrait */}
          <div
            className={`${portraitClass} left-[22px] top-[40px] h-[74px] w-[74px] sm:left-[26px] sm:top-[48px] sm:h-[92px] sm:w-[92px]`}
          >
            <img
              src={`${libertyMDPortraitBase}/patient-portrait.jpg`}
              alt=""
              className="h-full w-full object-cover"
              loading="eager"
            />
          </div>

          {/* Right Orbiting Doctor Portrait */}
          <div
            className={`${portraitClass} bottom-[50px] right-[20px] h-[58px] w-[58px] sm:bottom-[58px] sm:right-[24px] sm:h-[72px] sm:w-[72px]`}
          >
            <img
              src={`${libertyMDPortraitBase}/doctor-portrait.jpg`}
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
