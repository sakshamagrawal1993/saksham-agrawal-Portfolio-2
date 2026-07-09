import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

const VERTEX_SHADER = `
uniform float uTime;
uniform vec2 uMouse;
uniform float uAmplitude;

attribute float aScale;
attribute vec3 aColor;

varying vec3 vColor;
varying float vDepth;
varying float vElevation;

// Simple 3D Simplex noise approximation
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+10.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

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
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                dot(p2,x2), dot(p3,x3) ) );
}

void main() {
  vColor = aColor;
  vec3 pos = position;

  float t = uTime * 0.95;
  
  // Sleeker, smaller height harmonic waves
  float wave1 = sin(pos.x * 0.45 + t) * cos(pos.z * 0.4 + t * 0.85);
  float wave2 = cos(pos.x * 0.7 - t * 1.1) * sin(pos.z * 0.6 + t * 0.95) * 0.5;
  float noiseVal = snoise(vec3(pos.x * 0.18, pos.z * 0.18, t * 0.35)) * 0.45;

  // Mouse ripple
  float distToMouse = distance(pos.xz, uMouse * 18.0);
  float mouseRipple = exp(-distToMouse * 0.18) * sin(distToMouse * 2.5 - t * 3.5) * 0.7;

  // Smaller amplitude so vertical height is tight and controlled
  pos.y += (wave1 + wave2 + noiseVal + mouseRipple) * uAmplitude;
  vElevation = pos.y;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  vDepth = -mvPosition.z;

  // Prominent, crisp dot size
  gl_PointSize = (aScale * 46.0) / vDepth;
}
`;

const FRAGMENT_SHADER = `
varying vec3 vColor;
varying float vDepth;
varying float vElevation;

void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  if (dist > 0.5) discard;

  // Sharp, prominent anti-aliased dot
  float alpha = smoothstep(0.5, 0.04, dist);
  float core = smoothstep(0.24, 0.0, dist);

  // Vibrant medical blue palette
  vec3 baseColor = vColor;
  vec3 crestColor = vec3(0.01, 0.42, 0.94); // Vivid Cerulean
  vec3 troughColor = vec3(0.12, 0.28, 0.68); // Deep Cobalt Sapphire

  vec3 finalColor = mix(troughColor, crestColor, clamp((vElevation + 1.2) * 0.5, 0.0, 1.0));
  finalColor = mix(finalColor, baseColor, 0.5) - (core * 0.14);

  // Prominent alpha visibility across the field
  float depthAlpha = clamp(1.0 - (vDepth - 5.0) / 34.0, 0.2, 0.96);

  gl_FragColor = vec4(finalColor, alpha * depthAlpha);
}
`;

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

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 4.0, 15);
    camera.lookAt(0, -0.8, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // High-density 3D Point Cloud Wave: 240 x 70 = 16,800 dots
    const cols = 240;
    const rows = 70;
    const totalParticles = cols * rows;

    const positions = new Float32Array(totalParticles * 3);
    const colors = new Float32Array(totalParticles * 3);
    const scales = new Float32Array(totalParticles);

    const width = 42;
    const depth = 16;

    const bluePalette = [
      new THREE.Color('#1E3A8A'), // Deep Sapphire
      new THREE.Color('#1D4ED8'), // Royal Cobalt
      new THREE.Color('#2563EB'), // Vibrant Blue
      new THREE.Color('#0284C7'), // Cerulean
      new THREE.Color('#0EA5E9'), // Vivid Sky Blue
    ];

    let idx = 0;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const u = i / (cols - 1);
        const v = j / (rows - 1);

        const x = (u - 0.5) * width;
        const z = (v - 0.5) * depth;
        const y = 0;

        positions[idx * 3] = x;
        positions[idx * 3 + 1] = y;
        positions[idx * 3 + 2] = z;

        const colorFactor = (Math.sin(u * Math.PI * 2) + Math.cos(v * Math.PI * 1.5) + 2) / 4;
        const chosenColor = bluePalette[Math.floor(colorFactor * (bluePalette.length - 1))];
        colors[idx * 3] = chosenColor.r;
        colors[idx * 3 + 1] = chosenColor.g;
        colors[idx * 3 + 2] = chosenColor.b;

        scales[idx] = 1.15 + Math.sin(i * 0.3) * 0.3 + Math.cos(j * 0.4) * 0.25;

        idx++;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));

    const uniforms = {
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uAmplitude: { value: 0.7 }, // Sleeker, smaller wave height
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    const pointCloud = new THREE.Points(geometry, material);
    scene.add(pointCloud);

    const handlePointerMove = (event: MouseEvent) => {
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = -(event.clientY / window.innerHeight) * 2 + 1;
      targetMouseRef.current.set(x, y);
    };

    window.addEventListener('mousemove', handlePointerMove);

    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });
    resizeObserver.observe(container);

    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const elapsedTime = clock.getElapsedTime();
      uniforms.uTime.value = elapsedTime;

      mouseRef.current.lerp(targetMouseRef.current, 0.08);
      uniforms.uMouse.value.copy(mouseRef.current);

      camera.position.x += (mouseRef.current.x * 2.0 - camera.position.x) * 0.04;
      camera.position.z += (15 + mouseRef.current.y * 1.2 - camera.position.z) * 0.04;
      camera.lookAt(0, -0.8, 0);

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      window.removeEventListener('mousemove', handlePointerMove);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      className={`absolute inset-x-0 -bottom-48 sm:-bottom-60 h-[360px] sm:h-[450px] w-full pointer-events-none select-none overflow-visible -z-10 ${className}`}
      aria-hidden="true"
    >
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
