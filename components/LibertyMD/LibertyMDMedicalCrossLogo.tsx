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
varying vec3 vNormal;
varying vec3 vPosition;
varying float vNoise;

void main() {
  vNormal = normalize(normalMatrix * normal);
  
  // High density satin silk fabric folds inside the cross
  float noise1 = snoise(vec3(position.xy * 3.8, uTime * 0.40));
  float noise2 = snoise(vec3(position.yx * 6.5, uTime * 0.30));
  float noise3 = snoise(vec3(position.xy * 12.0, uTime * 0.20));
  float combinedNoise = (noise1 * 0.55 + noise2 * 0.30 + noise3 * 0.15);
  vNoise = combinedNoise;

  vec3 newPosition = position + vec3(0.0, 0.0, combinedNoise * 0.34);
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
  // Emerald / Sage Green metallic silk palette (matching reference screenshot)
  vec3 darkEmerald = vec3(0.16, 0.38, 0.30);
  vec3 midSage     = vec3(0.34, 0.62, 0.49);
  vec3 lightMint   = vec3(0.62, 0.84, 0.72);

  // Royal & Cerulean Blue metallic silk palette
  vec3 darkBlue    = vec3(0.07, 0.20, 0.58);
  vec3 midBlue     = vec3(0.14, 0.45, 0.90);
  vec3 lightSilk   = vec3(0.50, 0.80, 0.98);

  vec3 darkColor  = mix(darkEmerald, darkBlue, uTheme);
  vec3 midColor   = mix(midSage, midBlue, uTheme);
  vec3 lightColor = mix(lightMint, lightSilk, uTheme);

  vec3 lightDir = normalize(vec3(0.8, 1.2, 2.0));
  float diff = max(dot(vNormal, lightDir), 0.0);
  
  float mix1 = smoothstep(-0.4, 0.2, vNoise);
  vec3 baseColor = mix(darkColor, midColor, mix1);
  baseColor = mix(baseColor, lightColor, smoothstep(0.15, 0.5, vNoise * diff));

  // Velvet/silk sheen lighting along ripple crests
  float sheen = pow(max(dot(vNormal, lightDir), 0.0), 3.0);
  vec3 sheenColor = mix(vec3(0.20, 0.45, 0.35), vec3(0.25, 0.50, 0.95), uTheme);
  vec3 finalColor = baseColor + sheenColor * sheen * 0.85;

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
  size = 340,
  colorTheme = 'emerald'
}: LibertyMDMedicalCrossLogoProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = size;
    const height = size;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 2.4;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const geometry = new THREE.PlaneGeometry(2.4, 2.4, 150, 150);
    const material = new THREE.ShaderMaterial({
      vertexShader: CROSS_VERTEX_SHADER,
      fragmentShader: CROSS_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uTheme: { value: colorTheme === 'blue' ? 1.0 : 0.0 }
      }
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    let animationFrameId: number;
    let startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = (currentTime - startTime) * 0.001;
      material.uniforms.uTime.value = elapsed;
      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [size, colorTheme]);

  return (
    <div
      className={`relative flex items-center justify-center select-none ${className}`}
      style={{ width: `${size}px`, height: `${size}px` }}
      data-test-id="medical-cross-doctronic-logo"
    >
      {/* Soft blue aura behind cross */}
      <div className="absolute inset-4 rounded-full bg-[#2563EB]/25 blur-3xl opacity-80 animate-pulse pointer-events-none" />

      {/* SVG Clip Path matching the exact Organic Concave-Filleted Medical Cross Shape */}
      <svg width="0" height="0" className="absolute">
        <defs>
          <clipPath id="doctronic-medical-cross-clip" clipPathUnits="objectBoundingBox">
            <path d="M 0.34 0.12 C 0.34 0.04, 0.40 0.0, 0.50 0.0 C 0.60 0.0, 0.66 0.04, 0.66 0.12 L 0.66 0.28 C 0.66 0.31, 0.69 0.34, 0.72 0.34 L 0.88 0.34 C 0.96 0.34, 1.0 0.40, 1.0 0.50 C 1.0 0.60, 0.96 0.66, 0.88 0.66 L 0.72 0.66 C 0.69 0.66, 0.66 0.69, 0.66 0.72 L 0.66 0.88 C 0.66 0.96, 0.60 1.0, 0.50 1.0 C 0.40 1.0, 0.34 0.96, 0.34 0.88 L 0.34 0.72 C 0.34 0.69, 0.31 0.66, 0.28 0.66 L 0.12 0.66 C 0.04 0.66, 0.0 0.60, 0.0 0.50 C 0.0 0.40, 0.04 0.34, 0.12 0.34 L 0.28 0.34 C 0.31 0.34, 0.34 0.31, 0.34 0.28 Z" />
          </clipPath>
        </defs>
      </svg>

      {/* Blue Satin Silk Wave Three.js Canvas Clipped to Cross Shape */}
      <div
        className="relative w-full h-full shadow-2xl transition-transform duration-500 hover:scale-105"
        style={{ clipPath: 'url(#doctronic-medical-cross-clip)' }}
      >
        <canvas
          ref={canvasRef}
          data-engine="three.js r184"
          width={size}
          height={size}
          className="w-full h-full"
        />
      </div>

      {/* Overlapping Top-Left Circular Physician Portrait Avatar matching exact screenshot placement */}
      <div className="absolute top-[12%] left-[17%] w-[44%] h-[44%] rounded-full border-[3px] border-white/95 shadow-2xl overflow-hidden z-20 transition-transform duration-300 hover:scale-105 bg-[#1E293B]">
        <img
          src="https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=400&q=85"
          alt="Board-certified Physician"
          className="w-full h-full object-cover object-top"
        />
      </div>

      {/* Overlapping Bottom-Right Circular Physician Portrait Avatar matching exact screenshot placement */}
      <div className="absolute bottom-[17%] right-[17%] w-[28%] h-[28%] rounded-full border-[3px] border-white/95 shadow-2xl overflow-hidden z-20 transition-transform duration-300 hover:scale-105 bg-[#1E293B]">
        <img
          src="https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&w=300&q=85"
          alt="Board-certified Physician"
          className="w-full h-full object-cover object-top"
        />
      </div>
    </div>
  );
}
