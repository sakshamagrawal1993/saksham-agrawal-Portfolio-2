import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export type LibertyMDCareOrbState = 'idle' | 'thinking' | 'alert' | 'report';

interface LibertyMDCareOrbProps {
  state?: LibertyMDCareOrbState;
  size?: 'sm' | 'lg';
  animated?: boolean;
  waiting?: boolean;
}

interface OrbPalette {
  colors: [string, string, string, string];
  speed: number;
  waveStrength: number;
}

const ORB_PALETTES: Record<LibertyMDCareOrbState, OrbPalette> = {
  idle: {
    colors: ['#8174DF', '#9CCBFF', '#F3ACD7', '#FFD3B8'],
    speed: 1.18,
    waveStrength: 1,
  },
  thinking: {
    colors: ['#7768DD', '#91C7FF', '#F4A8D8', '#FFD0B3'],
    speed: 1.34,
    waveStrength: 1,
  },
  alert: {
    colors: ['#8C3150', '#D95F7D', '#F79B81', '#FFD4A9'],
    speed: 0.88,
    waveStrength: 0.88,
  },
  report: {
    colors: ['#326E85', '#72B8CC', '#8ED7CC', '#D7F7E7'],
    speed: 0.56,
    waveStrength: 0.58,
  },
};

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  uniform float uTime;
  uniform float uWaveStrength;
  uniform float uOpacity;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform vec3 uColor4;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 rotation = mat2(0.8, -0.6, 0.6, 0.8);

    for (int i = 0; i < 5; i++) {
      value += amplitude * noise2D(p);
      p = rotation * p * 2.02 + 9.17;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float radius = length(p);
    float time = uTime;

    // Broad Cartesian domain warping keeps the surface liquid and avoids
    // the radial convergence that creates a pinwheel at small sizes.
    vec2 firstWarp = vec2(
      fbm(p * 1.28 + vec2(time * 0.28, -time * 0.2)),
      fbm(p * 1.24 + vec2(-time * 0.22, time * 0.25) + 6.3)
    ) - 0.5;
    vec2 q = p + firstWarp * 0.78;
    vec2 secondWarp = vec2(
      fbm(q * 1.54 + vec2(-time * 0.16, time * 0.19) + 12.4),
      fbm(q * 1.47 + vec2(time * 0.18, time * 0.13) + 18.7)
    ) - 0.5;
    vec2 r = q + secondWarp * 0.34;

    float fieldOne = fbm(r * 1.08 + vec2(time * 0.14, -time * 0.11));
    float fieldTwo = fbm(r * 1.2 + vec2(-time * 0.13, time * 0.16) + 4.6);
    float fieldThree = fbm(r * 1.34 + vec2(time * 0.11, time * 0.09) + 10.8);

    vec3 color = mix(uColor1, uColor2, smoothstep(0.2, 0.8, fieldOne + r.x * 0.12));
    color = mix(color, uColor3, smoothstep(0.35, 0.82, fieldTwo - r.y * 0.13));
    color = mix(color, uColor4, smoothstep(0.6, 0.91, fieldThree + r.y * 0.08) * 0.72);

    // Two wide, softly focused light ribbons travel across the sphere.
    float displacement = (fieldOne - 0.5) * 1.15 + (fieldTwo - 0.5) * 0.55;
    float ribbonAxis = r.x * 0.74 + r.y * 0.48 + displacement;
    float waveOne = sin(ribbonAxis * 3.7 - time * 2.65);
    float waveTwo = sin((r.x * -0.42 + r.y * 0.88 + displacement * 0.72) * 3.15 + time * 1.8);
    float ribbonOne = pow(max(0.0, 1.0 - abs(waveOne)), 2.5);
    float ribbonTwo = pow(max(0.0, 1.0 - abs(waveTwo)), 3.2);
    float ribbonLight = (ribbonOne * 0.29 + ribbonTwo * 0.17) * uWaveStrength;
    color = mix(color, vec3(0.94, 0.96, 1.0), ribbonLight);

    // A paired satin sweep makes the motion legible at consultation-avatar
    // scale: a cool wave leads and a bright highlight follows it.
    float sweepCenter = sin(time * 2.05) * 1.16;
    float sweepAxis = r.x + r.y * 0.34 + displacement * 0.18;
    float coolSweep = exp(-pow((sweepAxis - sweepCenter + 0.24) * 2.8, 2.0));
    float lightSweep = exp(-pow((sweepAxis - sweepCenter - 0.14) * 3.55, 2.0));
    color = mix(color, uColor1, coolSweep * 0.3 * uWaveStrength);
    color = mix(color, vec3(1.0, 0.965, 0.995), lightSweep * 0.48 * uWaveStrength);

    // Volumetric sphere lighting: a cool rim, soft studio highlight and depth.
    float edgeShade = smoothstep(0.48, 1.0, radius);
    color *= 1.0 - edgeShade * 0.09;
    float studioGlow = 1.0 - smoothstep(0.05, 0.92, length(p - vec2(-0.25, 0.28)));
    color += vec3(0.08, 0.075, 0.11) * studioGlow;
    float lowerBounce = 1.0 - smoothstep(0.0, 0.82, length(p - vec2(0.28, -0.48)));
    color += uColor4 * lowerBounce * 0.065;

    float grain = hash21(vUv * vec2(691.7, 947.3) + fract(time * 0.017)) - 0.5;
    color += grain * 0.065;
    color = mix(color, vec3(0.94, 0.93, 0.99), 0.055);

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), uOpacity);
  }
`;

function OrbSurface({ palette }: { palette: OrbPalette }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: new THREE.Uniform(0.85),
      uWaveStrength: new THREE.Uniform(palette.waveStrength),
      uOpacity: new THREE.Uniform(0),
      uColor1: new THREE.Uniform(new THREE.Color(palette.colors[0])),
      uColor2: new THREE.Uniform(new THREE.Color(palette.colors[1])),
      uColor3: new THREE.Uniform(new THREE.Color(palette.colors[2])),
      uColor4: new THREE.Uniform(new THREE.Color(palette.colors[3])),
    }),
    [palette],
  );

  useFrame((_, delta) => {
    if (!materialRef.current) return;
    const frameDelta = Math.min(delta, 0.05);
    materialRef.current.uniforms.uTime.value += frameDelta * palette.speed;
    materialRef.current.uniforms.uOpacity.value = Math.min(
      0.82,
      materialRef.current.uniforms.uOpacity.value + frameDelta * 4,
    );
  });

  return (
    <mesh>
      <circleGeometry args={[3.5, 96]} />
      <shaderMaterial
        ref={materialRef}
        fragmentShader={fragmentShader}
        vertexShader={vertexShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

export function LibertyMDCareOrb({
  state = 'idle',
  size = 'sm',
  animated = true,
  waiting = false,
}: LibertyMDCareOrbProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const palette = ORB_PALETTES[state];

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReduceMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);
    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  if (!animated || reduceMotion) {
    return (
      <span
        aria-hidden="true"
        className={`libertymd-care-orb libertymd-care-orb--${state} libertymd-care-orb--${size}`}
      >
        <span className="libertymd-care-orb__fallback" />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`libertymd-care-orb libertymd-care-orb--animated${waiting ? ' libertymd-care-orb--waiting' : ''} libertymd-care-orb--${state} libertymd-care-orb--${size}`}
    >
      <Canvas
        className="libertymd-care-orb__canvas"
        resize={{ debounce: 100 }}
        dpr={[1.5, 2]}
        gl={{ alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'low-power' }}
        fallback={<span className="libertymd-care-orb__fallback" />}
      >
        <OrbSurface palette={palette} />
      </Canvas>
    </span>
  );
}
