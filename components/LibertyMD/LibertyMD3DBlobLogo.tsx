import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

const BLOB_VERTEX_SHADER = `
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
  
  // Create multi-frequency organic morphing surface wave
  float noise1 = snoise(position * 1.8 + vec3(uTime * 0.45));
  float noise2 = snoise(position * 3.4 - vec3(uTime * 0.3));
  float combinedNoise = (noise1 * 0.65 + noise2 * 0.35);
  vNoise = combinedNoise;

  vec3 newPosition = position + normal * (combinedNoise * 0.22);
  vPosition = newPosition;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
`;

const BLOB_FRAGMENT_SHADER = `
uniform float uTime;
varying vec3 vNormal;
varying vec3 vPosition;
varying float vNoise;

void main() {
  // Fresnel lighting rim
  vec3 viewDir = normalize(vec3(0.0, 0.0, 3.5) - vPosition);
  float fresnel = pow(1.0 - max(0.0, dot(viewDir, vNormal)), 2.2);

  // Vibrant Doctronic medical color palette (cyan, royal blue, emerald accents)
  vec3 colorA = vec3(0.145, 0.388, 0.922); // #2563EB Royal Blue
  vec3 colorB = vec3(0.220, 0.741, 0.973); // #38BDF8 Bright Cyan
  vec3 colorC = vec3(0.063, 0.725, 0.506); // #10B981 Emerald Medical

  // Mix based on organic noise & normal Y orientation
  float mixFactor = smoothstep(-0.3, 0.3, vNoise);
  vec3 baseColor = mix(colorA, colorB, mixFactor);
  baseColor = mix(baseColor, colorC, smoothstep(0.1, 0.4, vNoise * vNormal.y));

  // Add specular highlights & luminous rim Fresnel
  vec3 finalColor = baseColor + (vec3(0.8, 0.95, 1.0) * fresnel * 0.85);

  gl_FragColor = vec4(finalColor, 0.94);
}
`;

interface LibertyMD3DBlobLogoProps {
  className?: string;
  size?: number;
}

export default function LibertyMD3DBlobLogo({
  className = '',
  size = 280
}: LibertyMD3DBlobLogoProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = size;
    const height = size;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 3.6;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Sphere geometry with high polygon resolution for smooth organic morphing
    const geometry = new THREE.SphereGeometry(1.05, 96, 96);
    const material = new THREE.ShaderMaterial({
      vertexShader: BLOB_VERTEX_SHADER,
      fragmentShader: BLOB_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 }
      },
      transparent: true
    });

    const blobMesh = new THREE.Mesh(geometry, material);
    scene.add(blobMesh);

    let animationFrameId: number;
    let startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = (currentTime - startTime) * 0.001;
      material.uniforms.uTime.value = elapsed;

      blobMesh.rotation.y = elapsed * 0.22;
      blobMesh.rotation.z = Math.sin(elapsed * 0.4) * 0.12;

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
  }, [size]);

  const radius = 104;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      className={`relative flex items-center justify-center select-none ${className}`}
      style={{ width: `${size}px`, height: `${size}px` }}
      data-test-id="hero-certification-badge-no-bg"
    >
      {/* Outer ambient glow */}
      <div className="absolute -inset-6 rounded-full bg-gradient-to-tr from-[#2563EB]/40 via-[#38BDF8]/30 to-[#10B981]/35 blur-3xl opacity-80 animate-pulse pointer-events-none" />

      {/* Rotating Circular Certification Badge Ring SVG */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <svg
          className="w-full h-full animate-[spin_28s_linear_infinite]"
          viewBox="0 0 260 260"
        >
          <defs>
            <path
              id="libertymd-cert-ring"
              d="M 130,130 m -104,0 a 104,104 0 1,1 208,0 a 104,104 0 1,1 -208,0"
            />
          </defs>
          <text
            className="text-[11px] font-bold tracking-[0.16em] uppercase fill-[#93C5FD]"
            style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
          >
            <textPath
              href="#libertymd-cert-ring"
              textLength={circumference * 0.98}
            >
              ★ LIBERTY MD ★ BOARD-CERTIFIED AI PHYSICIAN • AVAILABLE IN ALL 50 STATES + EU GDPR VAULT •
            </textPath>
          </text>
        </svg>
      </div>

      {/* Center 3D Organic Morphing Medical Blob Canvas */}
      <canvas
        ref={canvasRef}
        data-engine="three.js r184"
        width={size}
        height={size}
        className="relative z-10 w-full h-full drop-shadow-2xl"
      />
    </div>
  );
}
