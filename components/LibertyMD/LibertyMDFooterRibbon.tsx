import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

const VERTEX_SHADER = `
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
uniform vec3 uMouse;
uniform float uInteraction;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying float vLocalElevation;
varying float vAlphaFade;

vec3 getPosition(vec3 p) {
  vec3 pos = p;
  float noiseScale = 0.08;
  float timeScale = uTime * 0.15;
  float elevation = snoise(vec3(p.x * noiseScale - timeScale, p.y * noiseScale * 1.5, uTime * 0.1)) * 1.8;
  elevation += snoise(vec3(p.x * 0.2 + uTime * 0.2, p.y * 0.2, uTime * 0.2)) * 0.4;
  float distToMouse = distance(p.xy, uMouse.xy * 30.0);
  float mouseInfluence = smoothstep(15.0, 0.0, distToMouse) * 4.0 * uInteraction;
  elevation -= mouseInfluence;
  pos.z += elevation;
  vLocalElevation = elevation;
  float twistPhase = uTime * 0.2;
  float twistAmount = sin(p.x * 0.04 + twistPhase) * 1.5;
  float c = cos(twistAmount);
  float s = sin(twistAmount);
  float tempY = pos.y * c - pos.z * s;
  float tempZ = pos.y * s + pos.z * c;
  pos.y = tempY;
  pos.z = tempZ;
  float windPhase = uTime * 0.3;
  pos.y += sin(p.x * 0.06 + windPhase) * 5.0;
  pos.z += cos(p.x * 0.04 - windPhase * 0.8) * 4.0;
  pos.y += cos(p.x * 0.1 + uTime * 0.5) * 1.0;
  return pos;
}

void main() {
  vUv = uv;
  vec3 pos = getPosition(position);
  float eps = 0.05;
  vec3 pX = getPosition(position + vec3(eps, 0.0, 0.0));
  vec3 pY = getPosition(position + vec3(0.0, eps, 0.0));
  vec3 tangentX = normalize(pX - pos);
  vec3 tangentY = normalize(pY - pos);
  vNormal = normalize(cross(tangentX, tangentY));
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  vViewPosition = -mvPosition.xyz;
  float edgeFadeX = smoothstep(0.0, 0.1, uv.x) * smoothstep(1.0, 0.9, uv.x);
  float edgeFadeY = smoothstep(0.0, 0.15, uv.y) * smoothstep(1.0, 0.85, uv.y);
  vAlphaFade = edgeFadeX * edgeFadeY;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAGMENT_SHADER = `
uniform float uTime;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying float vLocalElevation;
varying float vAlphaFade;

float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec3 adjustSat(vec3 c, float s) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(l), c, s);
}

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewPosition);
  vec3 lightDir = normalize(vec3(10.0, 20.0, 15.0));
  float diff = max(0.0, dot(normal, lightDir));
  float ambient = 0.360;
  float lighting = diff * 0.630 + ambient;
  lighting = max(lighting, 0.890);
  float fresnel = 1.0 - max(dot(viewDir, normal), 0.0);
  fresnel = pow(fresnel, 2.0);
  vec3 colLow  = vec3(0.120, 0.380, 0.890); // Deep Cobalt Blue
  vec3 colMid  = vec3(0.280, 0.640, 0.980); // Electric Azure Blue
  vec3 colHigh = vec3(0.930, 0.965, 1.000); // Ice Blue Pearl Shimmer
  float heightMap = (vLocalElevation + 1.8) / 3.6;
  heightMap = clamp(heightMap, 0.0, 1.0);
  vec3 albedo;
  if (heightMap < 0.4) {
    float t = smoothstep(0.0, 0.4, heightMap);
    albedo = mix(colLow, colMid, t);
  } else {
    float t = smoothstep(0.4, 1.0, heightMap);
    albedo = mix(colMid, colHigh, t);
  }
  albedo = adjustSat(albedo, 0.980);
  albedo *= 0.990;
  vec3 finalColor = albedo * lighting;
  finalColor += colHigh * fresnel * 0.430;
  float noiseVal = random(vUv * vec2(2000.0, 300.0) + uTime * 0.1);
  float grain = (noiseVal - 0.5) * 0.200;
  finalColor += grain;
  float alpha = vAlphaFade;
  alpha *= clamp(0.8 + fresnel * 0.5, 0.0, 1.0);
  gl_FragColor = vec4(finalColor, alpha);
}
`;

export default function LibertyMDFooterRibbon() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let width = container.clientWidth;
    let height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xeff6ff, 0.015);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 200);
    camera.position.set(0, 0, 30);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    const geometry = new THREE.PlaneGeometry(120, 12, 240, 24);
    const uniforms = {
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector3(0, 0, 0) },
      uInteraction: { value: 0 },
      uResolution: { value: new THREE.Vector2(width, height) }
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.z = -0.15;
    mesh.rotation.x = 0.1;
    scene.add(mesh);

    // Interactive Raycasting plane
    const planeGeo = new THREE.PlaneGeometry(200, 200);
    const planeMat = new THREE.MeshBasicMaterial({ visible: false });
    const rayPlane = new THREE.Mesh(planeGeo, planeMat);
    scene.add(rayPlane);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let targetInteraction = 0;
    let currentInteraction = 0;

    const handlePointerMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(rayPlane);
      if (intersects.length > 0) {
        targetInteraction = 1;
        uniforms.uMouse.value.copy(intersects[0].point);
      } else {
        targetInteraction = 0;
      }
    };

    const handlePointerLeave = () => {
      targetInteraction = 0;
    };

    window.addEventListener('mousemove', handlePointerMove);
    container.addEventListener('mouseleave', handlePointerLeave);

    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth;
      height = container.clientHeight;
      if (width === 0 || height === 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      uniforms.uResolution.value.set(width, height);
    };

    window.addEventListener('resize', handleResize);

    let animationFrameId: number;
    const startTime = performance.now();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = (performance.now() - startTime) / 1000;
      uniforms.uTime.value = elapsedTime;

      currentInteraction += (targetInteraction - currentInteraction) * 0.1;
      uniforms.uInteraction.value = currentInteraction;

      mesh.position.y = 1.5 * Math.sin(0.1 * elapsedTime);
      mesh.rotation.y = 0.1 * Math.sin(0.05 * elapsedTime);

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handlePointerMove);
      container?.removeEventListener('mouseleave', handlePointerLeave);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full overflow-hidden pointer-events-auto z-0">
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}
