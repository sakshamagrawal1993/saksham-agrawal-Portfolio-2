import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

const WAVE_VERTEX_SHADER = `
uniform float uTime;
uniform vec2 uMouse;
uniform float uAmplitude;

attribute float aScale;
attribute vec3 aColor;

varying vec3 vColor;
varying float vDepth;
varying float vElevation;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
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
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m *= m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

void main() {
  vColor = aColor;
  vec3 pos = position;
  float t = uTime * 0.95;
  float wave1 = sin(pos.x * 0.45 + t) * cos(pos.z * 0.4 + t * 0.85);
  float wave2 = cos(pos.x * 0.7 - t * 1.1) * sin(pos.z * 0.6 + t * 0.95) * 0.5;
  float noiseVal = snoise(vec3(pos.x * 0.18, pos.z * 0.18, t * 0.35)) * 0.45;
  float distToMouse = distance(pos.xz, uMouse * 18.0);
  float mouseRipple = exp(-distToMouse * 0.18) * sin(distToMouse * 2.5 - t * 3.5) * 0.7;

  pos.y += (wave1 + wave2 + noiseVal + mouseRipple) * uAmplitude;
  vElevation = pos.y;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vDepth = -mvPosition.z;
  gl_PointSize = (aScale * 46.0) / vDepth;
}
`;

const WAVE_FRAGMENT_SHADER = `
uniform float uOpacity;

varying vec3 vColor;
varying float vDepth;
varying float vElevation;

void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  if (dist > 0.5) discard;

  float alpha = smoothstep(0.5, 0.04, dist);
  float core = smoothstep(0.24, 0.0, dist);
  vec3 crestColor = vec3(0.01, 0.42, 0.94);
  vec3 troughColor = vec3(0.12, 0.28, 0.68);
  vec3 finalColor = mix(troughColor, crestColor, clamp((vElevation + 1.2) * 0.5, 0.0, 1.0));
  finalColor = mix(finalColor, vColor, 0.5) - (core * 0.14);
  float depthAlpha = clamp(1.0 - (vDepth - 5.0) / 34.0, 0.2, 0.96);

  gl_FragColor = vec4(finalColor, alpha * depthAlpha * uOpacity);
}
`;

const createHeroGrainTexture = () => {
  let seed = 127;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const marks = Array.from({ length: 360 }, () => {
    const x = (random() * 128).toFixed(2);
    const y = (random() * 128).toFixed(2);
    const radius = (0.18 + random() * 0.52).toFixed(2);
    const opacity = (0.18 + random() * 0.5).toFixed(2);
    const color = random() > 0.72 ? '#0284C7' : '#1D4ED8';
    return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}" opacity="${opacity}" />`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">${marks}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};

const HERO_GRAIN_TEXTURE = createHeroGrainTexture();

interface LibertyMDParticleWaveSeparatorProps {
  className?: string;
}

export default function LibertyMDParticleWaveSeparator({
  className = '',
}: LibertyMDParticleWaveSeparatorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2(0, 0));
  const targetMouseRef = useRef<THREE.Vector2>(new THREE.Vector2(0, 0));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const compact = window.innerWidth < 640;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const waveScene = new THREE.Scene();
    const waveCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);

    waveCamera.position.set(0, 4, 15);
    waveCamera.lookAt(0, -0.8, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, compact ? 1 : 1.5));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const cols = compact ? 192 : 224;
    const rows = compact ? 60 : 72;
    const totalParticles = cols * rows;
    const positions = new Float32Array(totalParticles * 3);
    const colors = new Float32Array(totalParticles * 3);
    const scales = new Float32Array(totalParticles);
    const width = 42;
    const depth = 16;
    const bluePalette = [
      new THREE.Color('#1E3A8A'),
      new THREE.Color('#1D4ED8'),
      new THREE.Color('#2563EB'),
      new THREE.Color('#0284C7'),
      new THREE.Color('#0EA5E9'),
    ];

    let index = 0;
    for (let i = 0; i < cols; i += 1) {
      for (let j = 0; j < rows; j += 1) {
        const u = i / (cols - 1);
        const v = j / (rows - 1);
        positions[index * 3] = (u - 0.5) * width;
        positions[index * 3 + 1] = 0;
        positions[index * 3 + 2] = (v - 0.5) * depth;

        const colorFactor = (Math.sin(u * Math.PI * 2) + Math.cos(v * Math.PI * 1.5) + 2) / 4;
        const color = bluePalette[Math.floor(colorFactor * (bluePalette.length - 1))];
        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;
        scales[index] = 1.15 + Math.sin(i * 0.3) * 0.3 + Math.cos(j * 0.4) * 0.25;
        index += 1;
      }
    }

    const waveGeometry = new THREE.BufferGeometry();
    waveGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    waveGeometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    waveGeometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    const waveUniforms = {
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uAmplitude: { value: 0.7 },
      uOpacity: { value: compact ? 0.22 : 0.34 },
    };
    const waveMaterial = new THREE.ShaderMaterial({
      vertexShader: WAVE_VERTEX_SHADER,
      fragmentShader: WAVE_FRAGMENT_SHADER,
      uniforms: waveUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    waveScene.add(new THREE.Points(waveGeometry, waveMaterial));

    const handlePointerMove = (event: MouseEvent) => {
      targetMouseRef.current.set(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1,
      );
    };
    if (!prefersReducedMotion) window.addEventListener('mousemove', handlePointerMove);

    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height);
      waveCamera.aspect = width / height;
      waveCamera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const render = () => renderer.render(waveScene, waveCamera);

    let animationFrameId: number | undefined;
    const clock = new THREE.Clock();
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();
      mouseRef.current.lerp(targetMouseRef.current, 0.06);
      waveUniforms.uTime.value = elapsedTime;
      waveUniforms.uMouse.value.copy(mouseRef.current);
      waveCamera.position.x += (mouseRef.current.x * 2 - waveCamera.position.x) * 0.04;
      waveCamera.position.z += (15 + mouseRef.current.y * 1.2 - waveCamera.position.z) * 0.04;
      waveCamera.lookAt(0, -0.8, 0);
      render();
    };

    if (prefersReducedMotion) render();
    else animate();

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      if (!prefersReducedMotion) window.removeEventListener('mousemove', handlePointerMove);
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      waveGeometry.dispose();
      waveMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 top-0 -bottom-28 -z-10 w-full select-none overflow-hidden sm:-bottom-36 ${className}`}
      aria-hidden="true"
    >
      <style>{`
        @keyframes libertymd-hero-grain-drift {
          0%, 100% { background-position: 0 0; }
          50% { background-position: 9px -7px; }
        }

        .libertymd-hero-grain {
          animation: libertymd-hero-grain-drift 24s steps(2, end) infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .libertymd-hero-grain { animation: none; }
        }
      `}</style>
      <div
        className="libertymd-hero-grain absolute inset-0 opacity-[0.19] sm:opacity-[0.23]"
        style={{
          backgroundImage: HERO_GRAIN_TEXTURE,
          backgroundRepeat: 'repeat',
          backgroundSize: '128px 128px',
          maskImage: 'linear-gradient(to right, #000 0%, rgba(0,0,0,0.72) 18%, transparent 38%, transparent 62%, rgba(0,0,0,0.72) 82%, #000 100%)',
          WebkitMaskImage: 'linear-gradient(to right, #000 0%, rgba(0,0,0,0.72) 18%, transparent 38%, transparent 62%, rgba(0,0,0,0.72) 82%, #000 100%)',
        }}
      />
      <div ref={containerRef} className="absolute inset-x-0 bottom-0 h-[260px] w-full sm:h-[320px]" />
    </div>
  );
}
