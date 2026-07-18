import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

const CROSS_VERTEX_SHADER = `
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

uniform float uTime;
uniform float uTheme;
varying vec3 vNormal;
varying vec3 vPosition;
varying float vNoise;

void main() {
  vNormal = normalize(normalMatrix * normal);
  
  // Slow, low-amplitude refraction inside a sculpted sapphire-glass surface.
  float noise1 = snoise(vec3(position.xy * 3.2, uTime * 0.12));
  float noise2 = snoise(vec3(position.yx * 6.4, uTime * 0.09));
  float noise3 = snoise(vec3(position.xy * 12.0, uTime * 0.06));
  float combinedNoise = (noise1 * 0.56 + noise2 * 0.28 + noise3 * 0.12);
  vNoise = combinedNoise;

  vec3 newPosition = position + vec3(0.0, 0.0, combinedNoise * 0.16);
  vPosition = newPosition;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
`;

const CROSS_FRAGMENT_SHADER = `
uniform float uTime;
uniform float uTheme;
varying vec3 vNormal;
varying vec3 vPosition;
varying float vNoise;

void main() {
  vec3 deepSapphire = vec3(0.012, 0.065, 0.22);
  vec3 cobaltGlass = vec3(0.035, 0.24, 0.66);
  vec3 iceCaustic = vec3(0.46, 0.76, 0.98);

  vec3 deepEmerald = vec3(0.035, 0.18, 0.13);
  vec3 emeraldGlass = vec3(0.12, 0.46, 0.34);
  vec3 mintCaustic = vec3(0.52, 0.82, 0.70);

  vec3 darkColor = mix(deepEmerald, deepSapphire, uTheme);
  vec3 glassColor = mix(emeraldGlass, cobaltGlass, uTheme);
  vec3 causticColor = mix(mintCaustic, iceCaustic, uTheme);

  float glassDepth = smoothstep(-0.72, 0.52, vNoise);
  vec3 baseColor = mix(darkColor, glassColor, glassDepth * 0.76);

  // Restrained internal caustics and one slow studio-light pass.
  float caustic = pow(smoothstep(0.04, 0.58, vNoise), 2.4);
  float sweepCenter = fract(uTime * 0.035) * 3.4 - 1.7;
  float sweepDistance = vPosition.x + vPosition.y * 0.28 - sweepCenter;
  float lightSweep = exp(-pow(sweepDistance * 4.2, 2.0));
  float upperGlaze = smoothstep(-1.1, 1.15, vPosition.y);

  vec3 finalColor = baseColor;
  finalColor += causticColor * caustic * 0.42;
  finalColor += vec3(0.86, 0.94, 1.0) * lightSweep * 0.22;
  finalColor += causticColor * upperGlaze * 0.055;

  gl_FragColor = vec4(finalColor, 1.0);
}
`;

interface LibertyMDMedicalCrossLogoProps {
  className?: string;
  size?: number;
  colorTheme?: 'emerald' | 'blue';
}

export default function LibertyMDMedicalCrossLogo({
  className = '',
  size = 350,
  colorTheme = 'blue',
}: LibertyMDMedicalCrossLogoProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = size;
    const height = size;

    let animationFrameId: number;
    let renderer: THREE.WebGLRenderer | null = null;
    let geometry: THREE.PlaneGeometry | null = null;
    let material: THREE.ShaderMaterial | null = null;
    let isInViewport = true;
    let observer: IntersectionObserver | null = null;

    try {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
      camera.position.z = 2.4;

      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true
      });
      renderer.setSize(width, height);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const isMobile = window.innerWidth < 640;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.25 : 1.75));

      const geometrySegments = isMobile ? 72 : 112;
      geometry = new THREE.PlaneGeometry(2.4, 2.4, geometrySegments, geometrySegments);
      material = new THREE.ShaderMaterial({
        vertexShader: CROSS_VERTEX_SHADER,
        fragmentShader: CROSS_FRAGMENT_SHADER,
        uniforms: {
          uTime: { value: 0 },
          uTheme: { value: colorTheme === 'blue' ? 1.0 : 0.0 },
        },
        transparent: true,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

      const startTime = performance.now();
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if ('IntersectionObserver' in window) {
        observer = new IntersectionObserver(
          ([entry]) => {
            isInViewport = entry?.isIntersecting ?? true;
          },
          { threshold: 0.05 },
        );
        observer.observe(canvas);
      }

      const animate = (currentTime: number) => {
        if (!material || !renderer) return;
        if (isInViewport && !document.hidden) {
          const elapsed = (currentTime - startTime) * 0.001;
          material.uniforms.uTime.value = elapsed;
          renderer.render(scene, camera);
        }
        animationFrameId = requestAnimationFrame(animate);
      };

      if (prefersReducedMotion) {
        renderer.render(scene, camera);
      } else {
        animationFrameId = requestAnimationFrame(animate);
      }
    } catch (err) {
      console.warn('WebGL initialization warning:', err);
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      observer?.disconnect();
      if (geometry) geometry.dispose();
      if (material) material.dispose();
      if (renderer) renderer.dispose();
    };
  }, [size, colorTheme]);

  return (
    <div
      className={`relative flex items-center justify-center select-none transition-transform duration-500 hover:scale-[1.015] ${className}`}
      style={{
        width: '100%',
        height: '100%',
        maxWidth: `${size}px`,
        maxHeight: `${size}px`,
        aspectRatio: '1 / 1'
      }}
      data-test-id="medical-cross-doctronic-logo"
    >
      {/* Restrained sapphire aura around the glass object. */}
      <div className="pointer-events-none absolute inset-5 rounded-full bg-[#1D4ED8]/20 opacity-60 blur-3xl" />

      {/* SVG Clip Path defining the exact Organic Concave-Filleted Swiss Medical Cross Shape */}
      <svg width="0" height="0" className="absolute">
        <defs>
          <clipPath id="doctronic-medical-cross-clip" clipPathUnits="objectBoundingBox">
            <path d="M 0.34 0.12 C 0.34 0.04, 0.40 0.0, 0.50 0.0 C 0.60 0.0, 0.66 0.04, 0.66 0.12 L 0.66 0.28 C 0.66 0.31, 0.69 0.34, 0.72 0.34 L 0.88 0.34 C 0.96 0.34, 1.0 0.40, 1.0 0.50 C 1.0 0.60, 0.96 0.66, 0.88 0.66 L 0.72 0.66 C 0.69 0.66, 0.66 0.69, 0.66 0.72 L 0.66 0.88 C 0.66 0.96, 0.60 1.0, 0.50 1.0 C 0.40 1.0, 0.34 0.96, 0.34 0.88 L 0.34 0.72 C 0.34 0.69, 0.31 0.66, 0.28 0.66 L 0.12 0.66 C 0.04 0.66, 0.0 0.60, 0.0 0.50 C 0.0 0.40, 0.04 0.34, 0.12 0.34 L 0.28 0.34 C 0.31 0.34, 0.34 0.31, 0.34 0.28 Z" />
          </clipPath>
        </defs>
      </svg>

      {/* A complete, center-aligned platinum cross sits behind the sapphire cross. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible"
        fill="none"
      >
        <defs>
          <linearGradient id="libertymd-platinum-rim" x1="12" y1="4" x2="90" y2="98" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#64748B" />
            <stop offset="0.2" stopColor="#CBD5E1" />
            <stop offset="0.42" stopColor="#F8FAFC" />
            <stop offset="0.62" stopColor="#94A3B8" />
            <stop offset="0.82" stopColor="#E2E8F0" />
            <stop offset="1" stopColor="#475569" />
          </linearGradient>
        </defs>
        <path
          d="M34 12C34 4 40 0 50 0C60 0 66 4 66 12V28C66 31 69 34 72 34H88C96 34 100 40 100 50C100 60 96 66 88 66H72C69 66 66 69 66 72V88C66 96 60 100 50 100C40 100 34 96 34 88V72C34 69 31 66 28 66H12C4 66 0 60 0 50C0 40 4 34 12 34H28C31 34 34 31 34 28V12Z"
          fill="url(#libertymd-platinum-rim)"
          transform="matrix(1.065 0 0 1.065 -3.25 -3.25)"
          style={{ filter: 'drop-shadow(0 0.65px 0.8px rgba(15, 23, 42, 0.3))' }}
        />
      </svg>

      {/* Sapphire glass surface, clipped to the LibertyMD medical cross. */}
      <div
        className="relative z-10 h-full w-full"
        style={{ clipPath: 'url(#doctronic-medical-cross-clip)' }}
      >
        <canvas
          ref={canvasRef}
          data-engine="three.js r184"
          width={size}
          height={size}
          className="block h-full w-full max-w-full"
          style={{ maxWidth: '100%' }}
        />
      </div>

    </div>
  );
}
